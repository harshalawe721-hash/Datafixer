# Stage 3 test report: Spreadsheet Error Detector

**Date:** 11 November 2026

**Status:** ✅ **COMPLETE.** Approved by the project owner on 11 November 2026. All automated tests pass, and all 5 test-pack files, "View affected data" and Cancel passed on the owner's Android tablet.

## Scope

**In Stage 3:** automatic, read-only detection of 12 kinds of problem, plain-language explanations, "How to fix" guidance, and "View affected data" (preview filtered to the affected rows, with the problem cells highlighted).

**Not in Stage 3 (future development):** automatic fixing of any kind. There are **no fix buttons**; the guidance explains how to fix problems in Excel or Google Sheets. Fixing belongs to the Spreadsheet Cleaner (Stage 4).

## Test environment

Automated and browser results come from **headless Chromium and Node 22 on a Linux cloud machine**. They are not real-device results. Real-device results will be added from the owner's Android tablet tests.

## The checks (decisions approved by the project owner)

| # | Check | Severity | Cautious-mode rules |
|---|---|---|---|
| A | Duplicate rows | warning | Fingerprints are confirmed cell by cell; column position and value type matter; whitespace-only cells count as empty |
| B | Empty rows | warning | Whitespace-only rows count as empty |
| C | Empty columns | warning | Columns under a header merged across columns are skipped |
| D | Missing cells | warning | Only rows and columns that contain data; short CSV rows count |
| E | Extra spaces | warning | Leading and trailing spaces, tabs and non-breaking spaces in text only |
| F | Inconsistent capitalization | warning | Exact case variants only; single letters skipped; columns with more than 20,000 distinct values skipped (memory) |
| G | Numbers stored as text | warning | Only where a column mixes them with real or plain numbers; never leading zeros, identifier columns or digit strings longer than 15 |
| H | Inconsistent / impossible / ambiguous dates | warning / error / note | Date columns only (at least 80% dates); day/month order taken only from evidence in the column; ambiguous dates are never guessed |
| I | Invalid email addresses | warning | Columns detected by name or content (at least 50% contain "@"); generic rules; international addresses allowed |
| J | Invalid phone numbers, plus a note on layouts | warning / note | Generic international rules (7–15 digits), **no library**; plain number columns are never taken for phone numbers |
| K | Unusual values | note | **Cautious:** Tukey 3 × IQR fences; skips columns with under 20 values, IDs, years, sequences and columns with no spread |
| L | Formula errors | error | The formula behind each error is shown; CSV files get a note that formulas aren't available |

## Automated tests

| Suite | Result |
|---|---|
| Unit tests (`npm test`), including 71 for Stage 3: classification, profiles, every check with exact planted counts, false-alarm guards, view/filter, cancel, test pack | **195 / 195 pass** |
| Error Detector in the browser (`npm run test:detector`) | **32 / 32 pass** |
| Site smoke test (`npm run test:smoke`) | **114 / 114 pass** |
| Engine in the browser (`npm run test:engine`) | **62 / 62 pass** |
| Lint, type check, production build | clean |

### Test pack accuracy (planted problems → exact expected counts)

The engine's results were compared with the counts the generator planted, requiring an exact match with no missing and no extra issue types.

| File | Data rows | Result |
|---|---|---|
| 1-problems.csv | 27 | ✅ all 14 expected cards, exact counts |
| 2-problems.xlsx (openpyxl + LibreOffice; real numbers, dates and `=1/0`) | 27 | ✅ all 14 expected cards, exact counts |
| 3-clean.csv | 30 | ✅ "No problems found" |
| 4-large-problems-25mb.csv | 395,000 | ✅ exact match (3,950 duplicates, 1,580 invalid emails, 988 missing cells, 565 capitalization variants, 439 extra spaces, 39 unusual values) |
| 5-large-problems-50mb.csv | 785,000 | ✅ exact match (7,850 / 3,140 / 1,963 / 1,122 / 873 / 78) |

## Performance (headless Chromium, desktop; open plus automatic scan)

| File | Open | Scan | Peak renderer RSS | Max frame gap | Result |
|---|---|---|---|---|---|
| CSV 50 MB | 1.9 s | 2.8 s | 422 MB | 33 ms | no problems (clean data) |
| CSV 100 MB | 2.9 s | 6.9 s | 547 MB | 33 ms | no problems |
| CSV 150 MB | 3.9 s | 10.4 s | 729 MB | 17 ms | no problems |
| CSV 150 MB, 40 numeric columns | 6.4 s | 17.3 s | 843 MB | 117 ms | duplicate rows* |
| CSV 100 MB, Unicode | 3.9 s | 6.4 s | 705 MB | 50 ms | no problems |
| XLSX 10 MB | 5.9 s | 0.8 s | 479 MB | 50 ms | duplicate rows* |
| XLSX 47 MB | 23.5 s | 4.4 s | 1,398 MB | 33 ms | duplicate rows* |
| XLSX 47 MB with formulas | 21.5 s | 3.9 s | 1,365 MB | 50 ms | duplicate rows* |
| XLS 5 MB / 20 MB | 1.9 / 3.4 s | under 0.5 s | 357 / 660 MB | 33–50 ms | no problems |

\* **Genuine duplicates in the synthetic test data, not false alarms.** The random-number generator in the performance script repeats every 10,466 values (JavaScript loses precision in its multiplication), so these generated files really contain identical rows. This was verified by comparing reported rows cell by cell.

**A memory problem found and fixed:** the wide 150 MB CSV first peaked at **1,238 MB** during the scan, because the unusual-values check stored every number. It now keeps a deterministic sample of at most 50,000 values per column for the statistics (exact for smaller columns) and re-reads the column to flag values, so no value outside the limits is missed. The peak fell to **843 MB** and the scan time from 22.5 s to 17.3 s.

In Node (desktop), all 12 checks on 1M rows × 5 columns take about 3.5 s; the cell classification pass alone takes about 1.0 s.

### Low-memory environment (heap capped at 512 MB)

| File | Result |
|---|---|
| CSV 50 MB | Opened 1.9 s, scanned 3.4 s |
| CSV 100 MB | Opened 3.4 s, scanned 6.4 s |
| CSV 100 MB, Unicode | Opened 3.9 s; **scan refused with a clear message** ("too large to check for problems … on this device"), file stays open |
| XLS 5 MB | Opened 1.9 s, scanned instantly |

No crashes. Original files were unchanged (SHA-256) in every run.

## Real Android device testing (owner, 11 Nov 2026)

These results come from the project owner's Android tablet, using the Vercel deployment of this branch (Chrome). They are separate from the headless Chromium figures above. Times are the ones the page itself showed.

| Test file | Expected (expected.json) | Result on the tablet | Verdict |
|---|---|---|---|
| 3-clean.csv | No problems | "No problems found", 30 rows × 6 columns, checklist shown | ✅ PASSED |
| 4-large-problems-25mb.csv (395,000 rows) | Duplicates 3,950; invalid emails 1,580; missing 988; capitalization 565; extra spaces 439; unusual values 39 | **Exact match.** Opened in 3.6 s, checked in **5.4 s** | ✅ PASSED |
| 5-large-problems-50mb.csv (785,000 rows) | 7,850; 3,140; 1,963; 1,122; 873; 78 | **Exact match.** Opened in 6.3 s, checked in **10.5 s** | ✅ PASSED |
| 1-problems.csv | 14 cards: 12 problems, 2 notes | **Exact match**, all 14 counts. Opened in 0.4 s. The new wording was confirmed on the device ("Most numbers here are written like +1 555 0101 0000", "It may be correct") | ✅ PASSED |
| 2-problems.xlsx | 14 cards: 12 problems, 2 notes (inconsistent dates 2) | **Exact match**, all 14 counts. Opened in 0.8 s. Real Excel dates are recognised, and the formula error shows the fx marker | ✅ PASSED |
| "View affected data" and Cancel | Filter to affected rows, then show all rows; stop a running check | Reported by the owner as working correctly (no screenshots) | ✅ PASSED |

Two wording problems seen in the screenshots were fixed afterwards, with tests:
- The phone-layout note now shows a real number in the usual layout (for example "Most numbers here are written like +1 555 0101 0000") instead of "+… … … …".
- The unusual-values explanation now says "their column" when several numbers are in one column, and "It may be correct" for a single number.

A column that looked empty in one screenshot was not a bug: the table had been scrolled sideways, so column A was under the pinned row-number column.

## Known limitations

- Phone numbers are checked with generic international rules, not each country's numbering plan.
- Capitalization isn't checked in columns with more than 20,000 different values.
- For columns with more than 50,000 numbers, unusual-value limits come from a deterministic sample (every value is still checked against them).
- Dates written as text are recognised in 9 common patterns; other layouts are treated as text.
- After scanning a very wide file there can be one screen pause of about 100 ms while the results are drawn.
- Real-device testing so far covers one Android tablet (see below). Phones, iOS, Safari and Firefox have not been tested.

## Approval

All required tests passed, and the project owner approved Stage 3 on 11 November 2026.

Next (Stage 4, plan approved, see `stage-4-plan.md`): automatic fixing of the problems found here, manual cell editing, and downloading a new, clean file. The original file will still never be changed.
