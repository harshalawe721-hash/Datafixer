# Stage 2 test report: spreadsheet engine

**Date:** 10 November 2026 (real Android CSV and Excel results added 11 November 2026)

**Status:** implemented and **ready for review**; not yet marked complete. All automated tests that can run in the development environment pass. On a real Android tablet, CSV testing and Excel (XLSX/XLS) testing have **passed** (see "Real Android Device Testing"). The on-device Cancel check has also passed. Still open: the independent SheetJS checksum comparison (see the end of this report).

## Scope of Stage 2

Stage 2 covers **reading** spreadsheets: upload, file safety checks, the CSV/XLSX/XLS reading engine, preview (search, sort, pages), progress, cancellation and memory protection.

**Future development, not implemented and not tested in this report:**

| Feature | Planned stage |
|---|---|
| Automatic error detection (duplicates, missing cells, extra spaces, inconsistent dates, invalid emails and phone numbers, numbers stored as text, outliers, formula errors) | Stage 3: Spreadsheet Error Detector |
| Fixing and cleaning (remove duplicates, trim spaces, standardize text and dates, find and replace, split and merge columns, undo, download a cleaned file) | Stage 4: Spreadsheet Cleaner |
| CSV structure validation and repair | Stage 5: CSV Validator |
| Excel ↔ CSV conversion and downloads | Stage 6: converters |

The engine only flags things it notices while reading (for example error cells, formula-like CSV cells, decoding problems), so the user is informed. It does not scan for data problems, and it never changes data.

## Test environment (important)

This report has two kinds of results, which should not be compared as if they were equivalent:

- **Desktop Chromium benchmarks** (all sections except "Real Android Device Testing") come from automated tests on a cloud machine.
- **Real-device results** ("Real Android Device Testing") were collected by the project owner on a physical Android tablet.

The desktop Chromium benchmarks come from **headless Chromium on a Linux cloud machine** (4 CPU threads, JavaScript heap limit about 4 GB). The only browser installed there is Chromium. Apart from the Android tablet below, **no** real phone, iPhone, Mac, Windows PC, Safari or Firefox has been tested, and no compatibility is claimed for them.

Test workbooks were produced by **openpyxl and LibreOffice**, which are independent of SheetJS, and the encrypted workbook by msoffcrypto-tool. No workbook saved by Microsoft Excel itself was available in this environment.

## Automated tests

| Suite | Command | Result |
|---|---|---|
| Unit tests | `npm test` | **123 / 123 pass** |
| Engine end-to-end in the browser (real UI, worker, production CSP) | `npm run test:engine` | **62 / 62 pass** |
| Site smoke test (pages, SEO, navigation, theme, upload, mobile) | `npm run test:smoke` | **114 / 114 pass** |
| 150 MB upload limit (picker and drag-and-drop, boundaries, SHA-256) | `npm run test:large` | **64 / 64 pass** |
| `/diagnostics` at 1280 and 390 px (run, cancel, `noindex`, no POST, no errors) | manual Playwright script | pass |
| Lint, type check, production build | `npm run lint`, `npm run typecheck`, `npm run build` | clean |

### What the Excel tests check (`tests/engine/excel.test.ts`, 22 tests, plus e2e)

| Area | XLSX | XLS | Notes |
|---|---|---|---|
| Text including Unicode and emoji, numbers, booleans | ✅ | ✅ | |
| Number formats shown as Excel shows them (`10.50`, `1,234.57`, `2024-01-31`); raw values kept | ✅ | ✅ | |
| 1904 date system | ✅ | — | |
| Error values (`#DIV/0!`, `#N/A`) recorded and highlighted | ✅ | ✅ | |
| Formulas kept as text, with saved results; cross-sheet formulas | ✅ | ✅ | Never calculated |
| Formulas without a saved result (openpyxl) kept and reported | ✅ | — | |
| Hyperlinks, merged cells | ✅ | ✅ | |
| Hidden rows and columns, row heights, column widths | ✅ | ✅ | XLSX: read by the safety inspection |
| Hidden, very hidden and chart sheets | ✅ | ✅ | LibreOffice saves "very hidden" as hidden |
| Sheet switching; only one sheet kept in memory | ✅ | ✅ | |
| Unicode sheet names | ✅ | ✅ | |
| Empty workbooks | ✅ | ✅ | |
| Password-protected | ✅ clear message | — | |
| Damaged or truncated | ✅ | ✅ | |
| Memory budget refusal | ✅ (file info kept) | ✅ | |
| Emoji stored as numeric references (SheetJS bug) restored; ambiguous cases warned | ✅ | n/a | |
| Prototype-pollution names (CVE-2023-30533 class) | ✅ no pollution | | regression guard |
| Pathological XML (CVE-2024-22363 class) | ✅ under 5 s | | regression guard |
| Formula text that looks like code is never evaluated | ✅ | | |

## Problems found and fixed during Stage 2

| Problem (verified) | Fix |
|---|---|
| Papa Parse's file reader corrupted characters split across slices ("Café" became "Caf�") | Own streaming `TextDecoder`, then Papa Parse on decoded text |
| Papa Parse's separator guess failed on tiny files (`a;b⏎1;2⏎` read as one column) | Own separator detection |
| One string per CSV cell used 5.1–7.9 × the file size | `CompactTextGrid`: 1.7–2.2 × |
| Running out of worker memory **crashes the whole tab** in Chromium | Memory budget: stops first with a clear message |
| Text sort of 2.1M rows took 8.7 s | Precomputed sort keys: about 3 s |
| **SheetJS styles option made parsing 9–11 × slower** (800k cells: 24 s) | XLSX layout read by our own inspection; SheetJS styles off for XLSX (800k cells: 2.2 s) |
| Without styles, **SheetJS dropped formulas that have no saved result** | `sheetStubs: true` keeps them |
| **SheetJS 0.20.3 corrupts characters above U+FFFF written as numeric references** (emoji in openpyxl or pandas files became U+F600) | Detected during inspection; restored when unambiguous, warned otherwise. The package is not modified. |
| SheetJS decompresses all parts of an XLSX, and parses **all** sheets of an XLS, regardless of the sheet requested | Memory estimates calibrated to that: XLSX ≈ file + 2 × all XML + 100 B per cell; XLS ≈ 42 × file |
| Encrypted XLSX reported as "damaged" by the engine | Specific "password-protected" message |
| Diagnostics page never started its test | Fixed |

## Memory measurements in V8 (Node 22, same engine as Chrome)

Peak = maximum of heap plus typed-array memory while reading. Retained = what stays after reading.

| File | Data | Time | Peak | Retained | Estimate before reading |
|---|---|---|---|---|---|
| CSV 100 MB, 6 columns (1.5M rows) | 9.0M cells | 2.3 s | 397 MB | 220 MB | — |
| CSV 50 MB, 40 columns | 13.8M cells | 1.8 s | 368 MB | 88 MB | — |
| XLSX 7 MB (37 MB of XML) | 0.8M cells | 2.4 s | 186 MB | 42 MB | 206 MB |
| XLSX 47 MB (254 MB of XML) | 5.3M cells | 15.3 s | 1,028 MB | 221 MB | 1,404 MB |
| XLSX 47 MB with formulas | 4.9M cells | 15.2 s | 1,052 MB | 289 MB | 1,362 MB |
| XLSX 147 MB, 6 sheets (first sheet: 119 MB of XML) | 2.5M cells | 13.5 s | 1,857 MB | 58 MB | 2,132 MB |
| XLS 50 MB, 6 sheets | 3.1M cells in all sheets | 10.3 s | 2,022 MB (40 × file) | — | 2,121 MB |

The estimates are 9–37% above the measured peak, so they refuse a file before it can exhaust memory without being needlessly strict.

## Performance in the browser: default Chromium (heap limit about 4 GB, budget about 1.8 GB)

Peak renderer RSS includes the page itself (baseline about 118 MB). "Max frame gap" is the longest pause between screen updates during processing; 17 ms is one frame at 60 Hz.

| Case | File size | Outcome | Time | Peak renderer RSS | Max frame gap | Sort | Search | SHA-256 unchanged |
|---|---|---|---|---|---|---|---|---|
| CSV, 6 columns | 50 MB | Opened | 1.8 s | 388 MB | 17 ms | 1.0 s | 0.5 s | ✅ |
| CSV, 6 columns | 100 MB | Opened | 2.3 s | 561 MB | 17 ms | 1.8 s | 1.0 s | ✅ |
| CSV, 6 columns | 150 MB | Opened | 3.3 s | 649 MB | 17 ms | 3.2 s | 2.0 s | ✅ |
| CSV, 40 columns | 150 MB | Opened | 4.9 s | 818 MB | 50 ms | 0.6 s | 2.1 s | ✅ |
| CSV, Unicode and quotes | 100 MB | Opened | 2.8 s | 624 MB | 33 ms | 3.3 s | 1.5 s | ✅ |
| XLSX, 1 sheet | 47 MB (254 MB of XML, 5.3M cells) | **Opened** | 17.9 s | 1,209 MB | 17 ms | 0.3 s | 1.0 s | ✅ |
| XLSX with formulas | 47 MB (4.9M cells) | **Opened** | 17.4 s | 1,187 MB | 17 ms | 0.3 s | 1.0 s | ✅ |
| XLSX, 1 sheet | 97 MB (528 MB of XML) | Refused: the sheet expands to more than 500 MB | 9.4 s | 406 MB | 17 ms | — | — | ✅ |
| XLSX, 1 sheet | 147 MB (804 MB of XML) | Refused (same reason) | 9.4 s | 569 MB | 17 ms | — | — | ✅ |
| XLSX, 6 sheets | 147 MB (792 MB of XML) | File info shown; sheet refused by the memory budget (needs about 2.1 GB) | 14.9 s | 418 MB | 17 ms | — | — | ✅ |
| XLSX, heavily compressed | 47 MB (588 MB of XML) | Refused: the sheet expands to more than 500 MB | 6.9 s | 894 MB | 17 ms | — | — | ✅ |
| XLS, 3 sheets | 20 MB | **Opened** | 2.8 s | 681 MB | 17 ms | 0.1 s | 0.5 s | ✅ |
| XLS | 51 MB | Refused before reading: "save as .xlsx" advice (needs about 2.1 GB) | 0.1 s | — | 17 ms | — | — | ✅ |
| XLS | 101 MB | Refused before reading (same) | 0.1 s | — | 17 ms | — | — | ✅ |

### Cancellation

| Case | Cancelled at | Time until stopped | Memory 2 s later (above baseline) | SHA-256 unchanged |
|---|---|---|---|---|
| CSV 150 MB | 40 % | 57 ms | 149 MB | ✅ |
| XLSX 147 MB, 6 sheets | 30 % (during inspection) | 44 ms | 87 MB | ✅ |

Cancel terminates the worker, which frees its heap. Remaining RSS is memory the browser keeps for reuse.

## Low-memory environment (JavaScript heap capped at 512 MB; budget about 280 MB)

This approximates a device with little memory. Real phones also have slower CPUs, and the operating system can close tabs, so real-device numbers are still needed.

| Case | Outcome | Time | Peak renderer RSS |
|---|---|---|---|
| CSV 50 MB | Opened | 1.8 s | 341 MB |
| CSV 100 MB | Opened | 2.3 s | 399 MB |
| CSV 100 MB, Unicode | Opened | 2.8 s | 515 MB |
| CSV 150 MB (6 and 40 columns) | Stopped safely after 2.8 s with "too large to open safely … needs roughly 320 / 440 MB" | 2.8 s | 492–531 MB |
| XLS 5 MB | **Opened** | 1.3 s | 341 MB |
| XLSX 10 MB | Sheet refused by the budget (estimate about 310 MB); file info shown | 1.3 s | 305 MB |
| XLSX 47 MB (normal and formulas) | Sheet refused by the budget; file info shown | 4.8 s | about 490 MB |
| XLS 20 / 51 MB | Refused before reading, with "save as .xlsx" advice | 0.1 s | — |

**No tab crashed in any test.** With a 256 MB cap, a 100 MB CSV was stopped after 1.8 s and a small file opened afterwards in the same tab. Before the memory budget existed, that test crashed the tab.

## Real Android Device Testing

> **Real device, not a benchmark machine.** These results were collected by the project owner on a physical **Android tablet** on 11 November 2026. They are separate from, and not directly comparable with, the desktop Chromium benchmarks elsewhere in this report.

| | |
|---|---|
| Device | Android tablet. The model, Android version and browser were not recorded. |
| What was tested | Opening CSV files, then Excel files (below) |
| Processing | Entirely local, in the browser. Nothing was uploaded to the server. |
| Not measured | Peak memory and main-thread timings (the page can't read the worker's memory on Android) |

### CSV files

| File size | Opening time | Rows | Columns | Result |
|---|---|---|---|---|
| 25 MB | 3.1 s | 198,653 | 6 | ✅ PASS |
| 50 MB | 5.4 s | 394,813 | 6 | ✅ PASS |
| 100 MB | 10.5 s | 787,133 | 6 | ✅ PASS |

Observations reported by the tester:

- No noticeable lag.
- No noticeable heating.
- No crashes or freezes.
- All files opened successfully.
- UTF-8 encoding was detected correctly.

**Android CSV opening and performance testing: PASSED** (25, 50 and 100 MB).

What this does **not** cover:

- **150 MB CSV files have not been tested on a real device.** The 150 MB upload limit stays in place. Whether a 150 MB file opens depends on the device's memory: DataFixer's memory budget either opens it or stops it with a clear message before the browser runs out of memory. Files over 50 MB still show the large-file notice that processing happens on the device and may be slow or need a lot of memory.
- Other devices and browsers (phones, iPhone/iPad, Safari, Firefox, Samsung Internet, desktop browsers) have not been tested on real hardware.

### Excel files (XLSX and XLS) on the same Android tablet

> **Real device.** Collected by the project owner on 11 November 2026 on the deployed site (a Vercel preview deployment) in the tablet's browser, using the 8-file Excel test pack. The evidence is screenshots of each result. The times are the "Opened on your device in …" figures DataFixer shows; for refused files, that is the time until the refusal appeared.

**Data accuracy and safety**

| File | Expected | Result on the tablet | Verdict |
|---|---|---|---|
| 1-features.xlsx (18 KB; made with openpyxl and LibreOffice) | 5 sheets, 5 rows, 9 columns; exact values, date and number formats, formula markers, error cells, hidden sheets, feature notice | Opened in 0.3 s. All values exactly as expected: `Ann · 10.50 · 2024-01-31 · fx TRUE · fx 21 · Example`, `Zoë 東京 😀`, `fx #DIV/0!` and `fx #N/A` in red. Archive and Secret marked hidden. Notice listed 2 charts, 1 image, data validation, conditional formatting and comments | ✅ PASS |
| 2-features.xls (12 KB; LibreOffice, Excel 97–2003) | Same values, format XLS | Opened in 2.2 s with identical values and hidden-sheet badges | ✅ PASS |
| 3-password-protected.xlsx | Clear "password-protected" message, nothing opened | The message appeared under the upload box | ✅ PASS |

**Large files** (PASS means the file opens with the correct counts, or is refused with a clear message, with no crash or freeze)

| File | Result on the tablet | Rows × columns | Verdict |
|---|---|---|---|
| 7-large-5mb.xls | **Opened** in 1.6 s, header row detected | 38,462 × 8 (correct) | ✅ PASS |
| 4-large-10mb.xlsx | **Opened** in 7.5 s, paging through 1,440 pages | 144,000 × 8 (correct; first row matches) | ✅ PASS |
| 8-large-20mb.xls | **Refused safely**: "needs roughly 860 MB … save it as .xlsx", with Try again and Choose a different file | — | ✅ PASS |
| 5-large-25mb.xlsx | **Refused safely** after 4.3 s: "too large to open safely … roughly 750 MB". File details still shown | — | ✅ PASS |
| 6-large-50mb.xlsx | Large-file notice, then **refused safely** after 8.0 s: "roughly 1,500 MB" | — | ✅ PASS |

No crashes, freezes or page reloads were seen.

**Android Excel (XLSX/XLS) opening, accuracy and safe-refusal testing: PASSED.**

What these results show about this tablet:

- **Largest files that opened:** XLSX up to 10 MB (144,000 rows) and XLS up to 5 MB.
- **Refused safely:** XLSX from 25 MB and XLS from 20 MB, so DataFixer's memory budget on this tablet is somewhere between about 310 MB and 750 MB. The exact budget (shown on `/diagnostics`) was not recorded.
- **The memory estimate is deliberately conservative.** Some refused files might actually have opened, but refusing is the safe choice: running out of memory would crash the tab. Relaxing it would need measurements on more devices.
- **Cancel on the tablet: ✅ PASS.** The project owner confirmed that Cancel works on the tablet (reported 11 November 2026; no timing recorded). In desktop Chromium, Cancel stopped processing in 44–57 ms.
- **Not reported:** switching to the Summary sheet on the tablet (verified by the automated tests).

### Context

For context only: on the desktop Chromium benchmark machine, a 100 MB CSV with a different (synthetic) column layout opened in 2.3 s. The tablet took 10.5 s for its 100 MB file, roughly 4–5 times longer, which is expected for a tablet processor. The files differ (about 133 bytes per row on the tablet, about 70 on the benchmark machine), so this is not a like-for-like comparison.

## Conclusions

1. **CSV up to 150 MB works in desktop Chromium**: 2–5 s with no frozen screen. **On a real Android tablet, CSV files of 25, 50 and 100 MB opened in 3.1–10.5 s** with no lag, crashes or freezes. 150 MB has not been tried on a real device. Devices with less memory get a clear refusal, never a crash.
2. **XLSX works up to about 50 MB of compressed single-sheet data** in desktop Chromium: about 18 s for 5M cells, with a responsive screen. **On the Android tablet, a 10 MB XLSX (144,000 rows) opened in 7.5 s; 25 and 50 MB files were refused safely.** Larger single-sheet files hit the browser's maximum string length (about 500 MB of sheet XML) and are refused with an explanation. Large multi-sheet files depend on available memory, because SheetJS decompresses the whole workbook.
3. **XLS works for smaller files.** About 20 MB opens on desktop; on the Android tablet a 5 MB XLS opened in 1.6 s and a 20 MB XLS was refused safely. Above about 40 MB the file is refused, because SheetJS parses every sheet (about 40 × the file size in memory), and the message advises saving as XLSX.
4. **On low-memory devices** the conservative budget refuses medium Excel files (10 MB XLSX and up at a 512 MB heap). That is safe but strict. Real-device Excel tests will show whether it can be relaxed.
5. Supporting single-sheet XLSX files larger than about 90 MB, or opening big XLSX files on phones, would require a **streaming XLSX reader**. That would be a separate decision with accuracy trade-offs; it was not built (as agreed: measure first).

## Open items that need the project owner

| Item | Why it can't be done here | How to close it |
|---|---|---|
| Compare the SheetJS package's SHA-256 with an independent official download | SheetJS publishes no checksums, and its servers are blocked from this environment | Download `xlsx-0.20.3.tgz` again from `cdn.sheetjs.com` on any normal connection and check that its SHA-256 is `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` |
| ~~Real-device CSV testing on Android~~ | — | ✅ **PASSED** on an Android tablet: 25, 50 and 100 MB (see "Real Android Device Testing") |
| ~~Real-device XLSX and XLS testing on Android~~ | — | ✅ **PASSED**: all 8 Excel test files behaved correctly (see "Real Android Device Testing") |
| ~~On-device Cancel check~~ | — | ✅ **PASSED** (confirmed by the project owner on the Android tablet) |
| Other devices and browsers (iPhone/iPad, Safari, Firefox, desktop browsers) | Not available here | Optional: repeat the CSV and Excel tests on any other device you can reach |
| 150 MB CSV on a real device | Not tested | Optional: if you try one, report whether it opened or showed the "too large" message |
| Files saved by Microsoft Excel itself | Not available here | Optionally, open a few real Excel files on the Error Detector page and check they look right |
