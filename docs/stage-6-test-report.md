# Stage 6 test report: Excel ↔ CSV converters

**Date:** 14 November 2026

**Status:** ✅ **COMPLETE.** Approved by the project owner on 14 November 2026 (“They are working, start next stage”). All automated tests below pass.

## Scope

Stage 6 builds the two converter pages, following the approved plan (`docs/stage-6-plan.md`) and the owner's six decisions (option A for all, 13 November 2026).

| Step | What | Status |
|---|---|---|
| 1 | New XLSX writer (new workbooks from scratch), with a streaming check of every new file | ✅ |
| 2 | CSV → Excel value rules (decision 1) and the split past Excel's row limit (decision 2) | ✅ |
| 3 | CSV to Excel page | ✅ (owner tried it on the tablet) |
| 4 | Excel to CSV page: one sheet or all sheets as a ZIP, values as shown or plain | ✅ |
| 5 | Large files, phone and tablet layouts, test pack, this report | ✅ |

## Test environment

Node 22 (unit tests), Chromium headless through Playwright (browser and large-file tests), Python 3.13 with openpyxl 3.1.5 and the `csv` and `zipfile` modules (independent checks of every kind of download). Same container as Stages 2–5.

## Owner decisions: how each was met and tested

| Decision (option A) | How | Tested by |
|---|---|---|
| **1. CSV → Excel values:** only clear numbers and ISO dates convert; everything risky stays text | A value becomes a number only if Excel will show exactly the same text (`1.50` gets the `0.00` format; 12–15 digit numbers the `0` format). ISO dates from 1 March 1900 become real dates shown `yyyy-mm-dd`. Kept as text, with the reason counted: leading zeros, more than 15 digits, separators / signs / % / currency / exponents (`+5`, `-0`, `1e5`), other date layouts, impossible dates, values that start like formulas, numbers with spaces around them. Never formulas | `convert.test.ts`: 34 planted values; openpyxl reads every type and format; a round trip where every cell shows exactly the CSV's text; exact counts and reasons on a realistic file. Browser test: types per column in the downloaded file |
| **2. More than 1,048,576 rows:** continue on more sheets, header repeated | “Name (2)”, “Name (3)”…; with column names 1,048,575 data rows per sheet plus the header; without, 1,048,576 rows per sheet. The summary explains the split; no row is left out | `convert.test.ts` (1,048,580 rows, with and without column names, read by openpyxl); browser test; large-file test (100 and 150 MB split into 2 sheets, rows counted by Python) |
| **3. Excel → CSV, several sheets:** one sheet, plus “All sheets (ZIP)” | Each worksheet is read in turn, written, checked cell by cell and added; the ZIP is read back and compared byte by byte. Hidden and very hidden sheets are included and marked; real chart sheets are left out and listed | `excel-to-csv.test.ts` (ZIPs opened by Python's zipfile, every CSV read by its csv module; options; Unicode names; .xlsx and .xls; a real chart sheet). Browser test; large-file test (3 × 200,000 rows) |
| **4. Excel → CSV values:** “As shown in Excel” by default, plus “Plain values (for databases)” | Plain: dates `yyyy-mm-dd` (with `hh:mm:ss` when there is a time), both date systems, numbers in full precision without formatting, TRUE/FALSE, error results as shown | `excel-to-csv.test.ts`: plain values equal openpyxl's values cell by cell (.xlsx and .xls), 1904 dates, date conversion cases; browser test; large-file test |
| **5. Hidden rows/columns, merged cells** | Hidden rows and columns are included; a merged value is written once, in its first cell; both listed under “What a CSV file can't keep” | `excel-to-csv.test.ts`; browser test |
| **6. Workbook look** | Bold header, frozen top row, filter on the header, estimated column widths — only with “First row contains column names” | `xlsx-writer.test.ts` and browser test (openpyxl reads freeze pane, filter, bold and widths; none of them when unticked) |

## How every new file is checked before it is offered

- **New Excel workbooks** (CSV to Excel): a streaming check unzips the produced bytes and parses every row of every sheet back, comparing each cell's type, value and number format with what was meant to be written. (Reading a full-size workbook back with SheetJS would need over 1 GB.) The tests show it catches a changed value, a wrong format, a number written as text, a missing row and a wrong sheet name.
- **CSV files** (Excel to CSV): read back by DataFixer's CSV reader with the chosen separator and compared cell by cell, as in Stages 4–5.
- **ZIP files:** every CSV checked as above, then the ZIP read back and each file compared byte by byte.

## Independent readers: what each one confirmed

| Reader | Confirms | Known limit of that reader (not of the files) |
|---|---|---|
| openpyxl | values, types, number formats, frozen header, filter, bold header, widths, sheet names | doesn't decode Excel's `_xHHHH_` escape for control characters in inline strings (Excel and SheetJS do) |
| SheetJS (DataFixer's Stage 2 reader) | every value of a new workbook, dates as dates | turns CR LF inside any cell into LF |
| Python `csv` / `zipfile` | every downloaded CSV and ZIP | — |

## Automated tests (all run on the final Stage 6 code)

| Suite | Result |
|---|---|
| Type check (`tsc --noEmit`) | ✅ pass |
| Lint (`eslint`) | ✅ pass, 0 warnings |
| Production build (`next build`) | ✅ pass |
| Unit tests (`npm test`) | ✅ **382 / 382** (Stage 6 adds `xlsx-writer.test.ts` 7, `convert.test.ts` 8, `excel-to-csv.test.ts` 10) |
| **Converter pages browser test** (`npm run test:converter`) | ✅ **45 / 45** |
| CSV Validator browser test (`npm run test:validator`), Stage 5 | ✅ 106 / 106 |
| Fixing browser test (`npm run test:fix`), Stage 4 | ✅ 126 / 126 |
| Error Detector browser test (`npm run test:detector`), Stage 3 | ✅ 33 / 33 |
| Engine browser test (`npm run test:engine`), Stage 2 | ✅ 62 / 62 |
| Smoke test (`npm run test:smoke`), Stages 1–2 | ✅ 114 / 114 |
| 150 MB limit test (`npm run test:large`), Stage 2 | ✅ 64 / 64 |
| **Converter large-file test** (`npm run test:converter-perf`), normal memory and 512 MB heap | ✅ 0 problems (tables below) |

**Failed:** none.

Checks that the tests can fail: breaking the leading-zero rule fails a conversion test (and a second guard still keeps `007` as text); the writer's check catches a changed value, a wrong format, a number written as text, a missing row and a wrong sheet name.

## Large files (Chromium, desktop, through the website)

**CSV to Excel:** a CSV with known contents (id, name, phone with a leading zero, amount like 12.50, ISO date, code, an occasional note), so the page's counts must be exact. Python counts every row of every sheet in the downloaded workbook and openpyxl reads the first data row's types. **Excel to CSV:** a 600,000-row workbook (one sheet, as shown and as plain values) and a 3-sheet workbook as a ZIP; Python reads every downloaded file. Originals compared by SHA-256.

**Normal memory**

| Test | Outcome | Open | Convert + check + download | Peak extra memory | Downloaded file (Python) | Original unchanged |
|---|---|---|---|---|---|---|
| CSV → Excel, 50 MB (937,874 rows) | ✅ ok | 1.4 s | 22.9 s | 637 MB | counts exact; 1 sheet, every row present; types number, text, text, number, date, text; 33 MB | yes |
| CSV → Excel, 100 MB (1,857,876 rows) | ✅ ok | 2.4 s | 46.7 s | 746 MB | counts exact; **2 sheets** (1,048,576 + 809,301 rows incl. header); types as above; 65 MB | yes |
| CSV → Excel, 150 MB (2,776,764 rows) | ✅ ok | 3.8 s | 69.1 s | 987 MB | counts exact; **3 sheets** (1,048,576 + 1,048,576 + 679,614); types as above; 96 MB | yes |
| Excel → CSV, 17 MB xlsx (600,000 rows), as shown then plain | ✅ ok | 8.4 s | 5.2 s (both) | 897 MB | 600,001 rows each; shown `0.00`, plain `0`; plain last amount `14998.5` | yes |
| Excel → CSV, 17 MB xlsx (3 × 200,000 rows), all sheets as ZIP | ✅ ok | 4.9 s | 10.5 s | 669 MB | ZIP valid; 3 CSVs of 200,001 rows | yes |

(The ZIP cases were run again after the low-memory change below: 600,000 rows ok in 5.3 s, ZIP ok in 10.7 s.)

**JavaScript heap capped at 512 MB (imitating a low-memory phone or tablet)**

| Test | Outcome | Convert + check + download | Peak extra memory | Downloaded file | Original unchanged |
|---|---|---|---|---|---|
| CSV → Excel, 50 MB | ✅ ok | 24 s | 542 MB | counts exact; 1 sheet | yes |
| CSV → Excel, 100 MB | ✅ ok | 47.2 s | 615 MB | counts exact; 2 sheets | yes |
| CSV → Excel, 150 MB | ✅ stopped safely when opening (“too large… on this device”, the Stage 2 limit) | — | 371 MB | — | yes |
| Excel → CSV, 600,000-row workbook | ✅ stopped safely when opening (needs about 690 MB; the Stage 2 limit, as in the Stage 4 audit) | — | 300 MB | — | yes |
| Excel → CSV, 3 × 50,000 rows, all sheets as ZIP | ✅ ok | 3 s | 238 MB | ZIP valid; 3 CSVs of 50,001 rows | yes |

No crashes. **Found and fixed during these runs:** (1) at 512 MB a 3 × 200,000-row workbook's sheets are each too large to read (Stage 2 estimate); the ZIP stopped safely but said “not enough memory to create the ZIP”, and the panel said “This sheet has no cells” — now the ZIP names the sheet that couldn't be read and why, and the panel says the sheet couldn't be opened on this device (“no cells” is kept for real chart sheets); (2) the ZIP now sets the open sheet aside when memory is tight (it is read again afterwards), so the sheets don't have to share memory with it; (3) the test script itself crashed once on a download wait left open after a safe stop (fixed in the script). These are desktop measurements; the owner's tablet will be slower.

## The Stage 6 test pack

| File | Page | Expected |
|---|---|---|
| `tests/fixtures/convert/2-customers.csv` | CSV to Excel | Numbers 80, Dates 30, Text 174, Empty 36; 87 kept as text for leading zeros, 13 for formatted numbers (+44 phones), 10 for other date layouts. In Excel: bold, frozen header with a filter; `00037` and `07700900001` keep their zeros |
| `tests/fixtures/convert/1-values.csv` | CSV to Excel | Each of the 34 values in column B gets the type listed in `tests/fixtures/convert/expected.json`; `1.50` shows as 1.50, `2024-03-15` is a date, `007`, `1,250`, `03/04/2024`, `=1+1` stay text |
| `tests/fixtures/excel/lo-features.xlsx` | Excel to CSV | As shown: `Ann,10.50,2024-01-31,…`; plain: `Ann,10.5,2024-01-31,TRUE,21`; ZIP: Data, Summary, Archive (hidden), Secret (hidden), Chart1 |
| `tests/fixtures/excel/openpyxl-features.xlsx` | Excel to CSV | The real chart sheet “Chart1”: “This sheet has no cells to convert”; the ZIP has 4 files and lists Chart1 as left out |
| `tests/fixtures/excel/lo-multisheet.xls` | Excel to CSV | ZIP with January.csv, Février.csv, 三月.csv (101 rows each) |

## Real Android device testing (owner)

- **Step 3 (14 November 2026):** the owner opened 1-values.csv on the CSV to Excel page (verdict “Valid CSV, with 1 warning”, the formula-like values) and used **Check and repair in the CSV Validator**, which opened the file on the Validator; “Add apostrophes” there gave “Valid CSV file”. The corrected 2-customers.csv downloaded from the Validator was checked here: exactly the 13 `+44` phone numbers gained an apostrophe; every other value identical.
- **Step 5 (14 November 2026):** after receiving the five test files, the owner reported that the converters work on the tablet and approved the stage. No screenshots or downloaded files were sent for this round, so the results in the table below were not checked here.

## Known limitations

- Only values travel between formats: a CSV can't hold formatting, formulas, charts or several sheets; a workbook made from a CSV has no formulas.
- CSV to Excel: date-times (`2024-03-15 10:30`), other date layouts and formatted numbers stay text by design (decision 1). Dates before 1 March 1900 stay text (Excel's 1900 leap-year bug).
- A cell over 32,767 characters, a row over 16,384 values, or a sheet name problem is refused before anything is created (with the reason); the CSV Validator lists long cells.
- Excel to CSV reads workbooks as in Stage 2: very large workbooks may be refused on low-memory devices before work starts; `.xls` charts and some features are not read.
- In the ZIP, sheets are read one at a time; when memory is tight the open sheet is set aside and read again afterwards. A sheet too large for the device stops the ZIP with the sheet's name (nothing is downloaded).
- Not tested: Microsoft Excel itself opening the new workbooks (openpyxl and SheetJS were used as independent readers), Android phones, iOS/Safari and Firefox.

## Suggested tablet tests

| File | Page | Do | Expected |
|---|---|---|---|
| 2-customers.csv | CSV to Excel | Convert to Excel (.xlsx), then open the file in Excel or Google Sheets | Counts 80 / 30 / 174 / 36; bold frozen header with a filter; `00037` keeps its zeros; `joined` dates are real dates |
| 1-values.csv | CSV to Excel | Convert, open the file | `1.50` shows 1.50; `2024-03-15` is a date; `007`, `1,250`, `03/04/2024`, `=1+1` stay text |
| lo-features.xlsx | Excel to CSV | Download this sheet as CSV; then Plain values + Semicolon + LF + no BOM | `lo-features - Data.csv` with `10.50`; then `10.5`, `TRUE`, and the format line in the summary |
| lo-features.xlsx | Excel to CSV | All 5 sheets (ZIP) | 5 CSV files; Archive and Secret marked “(hidden sheet)” |
| openpyxl-features.xlsx | Excel to CSV | Tap “Chart1” | “This sheet has no cells to convert”; only the ZIP button |

## Approval

**Stage 6 approved by the project owner on 14 November 2026.**
