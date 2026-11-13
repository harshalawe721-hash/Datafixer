# Stage 5 test report: CSV Validator

**Date:** 13 November 2026

**Status:** ⏳ **Awaiting the owner's tablet tests and approval.** All automated tests below pass. Stage 5 is not complete until the owner approves it.

## Scope

Stage 5 builds the CSV Validator, following the approved plan and the five owner decisions (`docs/stage-5-plan.md`).

| Step | What | Status |
|---|---|---|
| 1 | Validation engine: checks A–I, exact counts on a planted test pack | ✅ |
| 2 | The line as written in the file, with its line number, in the examples | ✅ |
| 3 | Validator page: verdict, checklist, problem cards, view affected rows, text-encoding selector | ✅ (tablet-tested by the owner) |
| 4 | Repairs with preview, Undo/Redo, history; editing and download on the page | ✅ |
| 5 | Download options: separator, line endings, UTF-8 with or without BOM | ✅ |
| 6 | Large-file tests, phone and tablet layouts, test pack, this report | ✅ |

## Test environment

Node 22 (unit tests), Chromium headless through Playwright (browser and large-file tests), Python 3.13 with the `csv` module (independent check of downloaded files). Same container as Stages 2–4.

## Owner decisions: how each was met and tested

| Decision | How | Tested by |
|---|---|---|
| **1. Short rows** are errors; “Add empty cells” with a before/after preview; never in Fix all; the preview explains shifted data | Uneven rows are always errors. The repair shows each row's fields before and after, with a warning that short rows can mean values shifted into the wrong columns. The Validator's Fix all contains only empty extra fields, spaces around names and blank lines | `repairs.test.ts` (padding, warning, Fix all contents); browser test (warning shown, before/after, Apply, Undo); large-file test |
| **2. Column names:** empty → “Column C”, duplicates → “email (2)”; every change previewed; cell data never overwritten; no new duplicates | Only header cells change. The next free number is used (“email (3)”, “Column E (2)”). The empty last column caused by trailing separators is not named | `repairs.test.ts` (renames, next free number, data rows unchanged); browser test (preview, Apply); large-file test (`email (2)` in the downloaded header) |
| **3. Download options:** comma / semicolon / tab; CRLF / LF; UTF-8 with BOM by default plus “UTF-8 without BOM (for databases)”; values preserved exactly | Options shown before every Validator download, and “Download a copy” without changes. Values with the separator, quotes or line breaks are quoted. Verified by reading the file back with the chosen settings before it is offered | `download-options.test.ts`: all 12 combinations, byte-by-byte checks and Python's `csv` module; browser test (semicolon/LF/no-BOM download read by Python, identical to the original values); large-file test |
| **4. Text encoding selector:** UTF-8, Windows-1252, ISO-8859-1; explains what it does; never replaces unreadable characters silently | Beside the separator, with an explanation. ISO-8859-1 is decoded exactly (browsers treat it as Windows-1252). Warnings: a UTF-8 file read as a single-byte encoding; an automatically guessed Windows-1252; � characters (error, with rows); U+0080–U+009F codes | `validate.test.ts` (each case); browser test (selector, warning card, mis-decoded text visible, encoding kept when the separator changes) |
| **5. Strictness:** uneven rows always errors; header problems only when “First row contains column names” is ticked | The setting is in the results card and follows the table's setting. Unticked: the header check shows “Not checked”, and the first row is never reported as names | `validate.test.ts`; browser test; owner's tablet (Step 3) |

## Checks A–I

| Check | Reports | Severity |
|---|---|---|
| A Encoding | unreadable characters (�), a UTF-8 file read as Windows-1252/ISO-8859-1, a guessed encoding | error / warning / note |
| B Separator | a file read as one column (with the likely separator), an uncertain separator while rows disagree, an Excel `sep=` line | warning / note |
| C Row lengths | rows with too few or too many fields, with the distribution | error |
| D Column names | empty and duplicate names (errors), spaces at the edges, first row looks like data (warnings), very long names (note) | error / warning / note |
| E Quotes | a quote that never closes (error), stray quotes (warning), line breaks inside values (note) | |
| F Line endings | mixed or old-Mac line endings, blank lines (warnings), no final line break (note) | |
| G Characters | NUL and other control characters (error), values that start like formulas (warning) | |
| H Import limits | more rows or columns than Excel allows, cells over 32,767 characters | warning |
| I Trailing separators | every line ends with a separator (empty last column) | note |

## Reader fixes found during Stage 5 (they also affect Stages 2–4)

1. **Mixed line endings were mis-read.** In a file mixing CRLF, LF and CR, Papa Parse used only one type, so rows were merged or values kept a stray CR. Line breaks outside quoted values are now normalised before parsing; line breaks inside values are kept exactly. Confirmed on the owner's tablet (5-line-endings.csv read as 23 rows in the Error Detector).
2. **Stray quotes** in unquoted values were accepted silently; they are now reported.
3. **Line endings inside quoted values** no longer make a file count as “mixed”.

## Automated tests (all run on the final Stage 5 code)

| Suite | Result |
|---|---|
| Type check (`tsc --noEmit`) | ✅ pass |
| Lint (`eslint`) | ✅ pass, 0 warnings |
| Production build (`next build`) | ✅ pass |
| Unit tests (`npm test`) | ✅ **357 / 357** (Stage 5 adds `validate.test.ts` 49, `repairs.test.ts` 15, `download-options.test.ts` 5) |
| **CSV Validator browser test** (`npm run test:validator`) | ✅ **103 / 103** |
| Fixing browser test (`npm run test:fix`), Stage 4 | ✅ 126 / 126 |
| Error Detector browser test (`npm run test:detector`), Stage 3 | ✅ 33 / 33 |
| Engine browser test (`npm run test:engine`), Stage 2 | ✅ 62 / 62 |
| Smoke test (`npm run test:smoke`), Stages 1–2 | ✅ 114 / 114 |
| 150 MB limit test (`npm run test:large`), Stage 2 | ✅ 64 / 64 |
| **Validator large-file workflow** (`npm run test:validator-perf`), normal memory and 512 MB heap | ✅ 0 problems (tables below) |
| Stage 4 large-file workflow at 150 MB (`npm run test:export-perf`), re-run after the reader change | ✅ ok: open 3.9 s, check 8.4 s, Fix all 32 s, re-check 11.4 s, download 6.8 s (Stage 4 audit: Fix all 38.7 s, download 7.7 s) |

**Failed:** none.

The Validator browser test covers every problem type in the pack, decisions 1–5, the separator and encoding selectors, refusals (binary data, Excel files), Cancel and Check again on a 50 MB file, every repair with Undo and history, a real repaired download and a semicolon / LF / no-BOM download both read by Python's `csv` module, .tsv files, phone (412 px) and tablet (712 px) widths for 8 test files with no sideways scrolling, no uploads or off-site requests, and no console or page errors.

Two checks that the tests can fail: breaking the duplicate-name rule makes 2 repair tests fail, and breaking the separator quoting makes 2 download tests fail (both restored).

### The Stage 5 test pack (`tests/fixtures/validate/`, made by `scripts/fixtures/make_validate_pack.py`)

The expected results in `expected.json` are written from what was planted, not from DataFixer's output. The reader is also compared with Python's `csv` module on 8 of the files.

| File | Expected result | Repair on the page |
|---|---|---|
| 0-clean.csv | Valid CSV file, 9 checks passed | — |
| 1-uneven.csv | Not valid: 5 rows with the wrong number of fields (rows 6, 13, 20, 27, 33) | Add empty cells → 2 rows left (data in the extra fields: never automatic) |
| 2-header.csv | Not valid: 1 column without a name, 1 duplicate name; 2 names with spaces; 1 very long name | Fix column names, then Fix all → Valid CSV file |
| 3-quotes.csv | Valid with a warning: stray quotes on rows 6 and 17 (line 19); 3 values with line breaks | — |
| 3b-unclosed.csv | Not valid: a quote that never closes on row 11 | Never automatic |
| 4-encoding.csv | Not valid: 2 cells with unreadable characters on row 1,945 | Never automatic (choose the encoding) |
| 5-line-endings.csv | Valid with warnings: mixed line endings, 3 blank lines; no final line break | Remove blank lines; the download fixes line endings |
| 5b-cr.csv | Valid with a warning: old Mac line endings | The download fixes it |
| 6-control.csv | Not valid: 3 cells with hidden characters; 4 formula-like values | Remove hidden characters |
| 7-trailing.csv | Valid, 1 note: every line ends with a separator | — |
| 8-sep.csv | Valid, 1 note: Excel `sep=` line | — |
| 9-long-cells.csv | Valid with a warning: 2 values over 32,767 characters | — |
| 10-semicolon.csv (read with comma) | Valid with a warning: the file reads as one column, probably semicolon | Choose the separator |
| 11-extra-fields.csv | Not valid: 2 rows with empty extra fields; 1 blank line; separator uncertain | Fix all → Valid CSV file |

## Large files (Chromium, desktop, the whole workflow through the website)

A CSV with problems planted at known rows (a duplicate column name, short rows, rows with empty extra fields, blank lines, NUL characters), through the website: open → validate (exact counts compared) → Fix all safe problems → Add empty cells → Fix column names → Remove hidden characters (each followed by an automatic re-check) → download as semicolon / LF / UTF-8 without BOM. Python's `csv` module then reads every row of the downloaded file. The original file is compared by SHA-256.

**Normal memory**

| File | Outcome | Open | Validate | Planted problems found | 4 repairs incl. re-checks | Final verdict | Download (create + verify) | Peak extra memory | Downloaded file (Python, every row) | Original unchanged |
|---|---|---|---|---|---|---|---|---|---|---|
| CSV 50 MB (604,689 rows) | ✅ ok | 1.3 s | 1.1 s | exact: uneven 29, blank 7, NUL 4, duplicate 1 | 4.5 s | Valid CSV file | 2.1 s | 526 MB | 604,682 rows, all 7 fields, no NUL, no BOM, no CR | yes |
| CSV 100 MB (1,198,591 rows) | ✅ ok | 2.3 s | 1.6 s | exact: uneven 54, blank 12, NUL 6, duplicate 1, over Excel 150,015 | 7.9 s | Valid CSV, with 1 warning (too many rows for Excel) | 4.0 s | 701 MB | 1,198,579 rows, all 7 fields, no NUL, no BOM, no CR | yes |
| CSV 150 MB (1,779,455 rows) | ✅ ok | 3.4 s | 1.7 s | exact: uneven 81, blank 18, NUL 9, duplicate 1, over Excel 730,879 | 10.4 s | Valid CSV, with 1 warning (too many rows for Excel) | 6.0 s | 872 MB | 1,779,437 rows, all 7 fields, no NUL, no BOM, no CR | yes |

**JavaScript heap capped at 512 MB (imitating a low-memory phone or tablet)**

| File | Outcome | Open | Validate | Planted problems found | 4 repairs | Final verdict | Download | Peak extra memory | Downloaded file | Original unchanged |
|---|---|---|---|---|---|---|---|---|---|---|
| CSV 50 MB | ✅ ok | 1.4 s | 1.1 s | exact | 4.4 s | Valid CSV file | 2.2 s | 385 MB | correct (as above) | yes |
| CSV 100 MB | ✅ ok | 2.3 s | 1.6 s | exact | 7.8 s | Valid CSV, with 1 warning | 3.8 s | 475 MB | correct (as above) | yes |
| CSV 150 MB | ✅ stopped safely when opening: “too large to open safely in this browser on this device” (the Stage 2 limit for this memory) | — | — | — | — | — | — | 369 MB | — | yes |

No crashes. The plan's target (validation within the Stage 3 scan times) is met on desktop: validation takes 1.1–1.7 s. These are desktop measurements; the owner's tablet will be slower.

## Real Android device testing (owner)

- **Step 3 (12 November 2026), on the owner's tablet:** 0-clean valid; 1-uneven and 2-header not valid; 3-quotes and 5-line-endings valid with warnings; 6-control (NUL bytes) accepted and not valid. Unticking “First row contains column names” on 2-header gave “Valid CSV file”; “View affected data” on 1-uneven showed only rows 6, 13, 20, 27 and 33.
- **Step 4 (13 November 2026), on the owner's tablet; downloaded files checked here:**
  - 11-extra-fields: empty extra fields and the blank line removed; the downloaded file is valid with no issues. ✅
  - 1-uneven: rows 6, 13 and 27 got one empty cell; the 2 rows with data in the extra fields were left unchanged. ✅
  - 2-header: header became `id,name,Column C,Email,email (2),phone,…`; every data row unchanged; valid. ✅
  - 6-control: NUL and bell characters removed (`Ben`, `Leeds`, `Gus`); valid. ✅
  - All downloads start with the BOM and use CRLF (the defaults).
  - The owner also edited cells by hand to clear warnings (formula-like values in 6-control, stray quotes in 3-quotes); confirmed by the owner. DataFixer kept those edits exactly; with no edits, the same downloads keep the original values (checked here).
- **Not yet tested on the tablet:** the download options (Step 5) and the new “Add apostrophes” repair.

## Added after the owner's tablet test: “Add apostrophes” (owner approved, 13 November 2026)

- An optional repair on the “Values that start like formulas” card: puts `'` in front of values starting with =, +, - or @ (not plain numbers such as -5, not column names), so spreadsheet apps treat them as text. Preview first, Undo, history; never in Fix all.
- The preview warns that the apostrophe is saved as part of each value (some apps show it; databases and scripts see it) and that phone numbers such as “+44 …” also start with +.
- Tests: 2 unit tests (exactly the 4 flagged cells change in 6-control; -5 and the header untouched; undo restores; not in Fix all) and 3 browser checks (warning, preview, valid afterwards; the downloaded file read by Python has `'=1+1` and `-5`).

## Known limitations

- Repairs are for CSV files only (the Validator accepts .csv, .tsv and .txt).
- Never repaired automatically, because the right result can't be known: extra fields that contain data, quotes that never close, characters that couldn't be read.
- “Add empty cells” adds cells at the end of a row; it can't move values that shifted in the middle of a row (the preview says so).
- The file lines in the examples are shown only while the data is unchanged; after a change, examples show cell values. Finding the lines needs a second read of the file: free when the examples are near the top, up to about 5 s extra on desktop for a 100 MB file with examples spread through it.
- UTF-16 files without a byte-order mark can't be detected (they look binary and are refused). Encodings other than UTF-8, UTF-16, Windows-1252 and ISO-8859-1 are not offered.
- Without a BOM, Excel may show accented letters wrongly when the file is double-clicked (the summary says so).
- Header (column-name) cells can't be tapped to edit (as in Stage 4); use “Fix column names”, or untick the setting and edit row 1.
- The validator's check for “first row looks like data” is a rule of thumb (at least half the names are numbers, dates or email addresses).
- Not tested: Android phones, iOS/Safari and Firefox; very large files on the owner's tablet.

## Remaining tablet tests (download options and the new repair)

| File | Do | Expected |
|---|---|---|
| 1-uneven.csv | Add empty cells → Apply | Warning about shifted data; before/after rows; then 2 rows left |
| 2-header.csv | Fix column names → Apply, then Fix all safe problems → Apply | “Column C”, “email (2)”; then “Valid CSV file” |
| 6-control.csv | Remove hidden characters → Apply, then Add apostrophes → Apply | “Ben␀ → Ben”; then “'=1+1”, warning about the apostrophe; “Valid CSV file” |
| 11-extra-fields.csv | Fix all safe problems → Apply | “2 rows will be shortened”, 1 blank line removed; “Valid CSV file” |
| 3-quotes.csv | Download a copy → Semicolon, LF, UTF-8 without BOM → Create and download | Summary: “Semicolon (;) · LF (Unix, Mac) · UTF-8 without BOM” |

## Approval

Stage 5 will be marked complete only after the owner's tablet tests and approval.
