# Stage 6 plan: Excel ↔ CSV converters

**Status:** plan prepared on 13 November 2026. **The owner chose option A for all six decisions on 13 November 2026** and said “Start Stage 6” the same day. Progress is recorded under “Progress” below. All five steps are built. **Stage 6 was approved by the project owner on 14 November 2026** (see `docs/stage-6-test-report.md`).

## Goal

Two working converter pages, built on what Stages 2–5 already do and test:

- **Excel to CSV** (`/excel-to-csv`): open an XLSX or XLS workbook, choose a sheet, preview it, and download it as CSV.
- **CSV to Excel** (`/csv-to-excel`): open a CSV (or TSV/TXT) file, preview it, and download a new, clean XLSX workbook.

Same rules as before: everything happens on the device, nothing is uploaded, the original file is never changed, every download is checked before it is offered, no new dependencies.

## What already exists and will be reused

| Piece | From | Used for |
|---|---|---|
| Reading XLSX and XLS (sheets, values, dates, number formats, formulas' last values, safety checks, 150 MB limit) | Stage 2 | Excel to CSV input; checking the new XLSX |
| Reading CSV (encoding and separator detection, mixed line endings fixed) | Stages 2 and 5 | CSV to Excel input |
| Preview table, sheet picker, progress and Cancel, memory budget | Stage 2 | Both pages |
| Verified CSV download with options (separator, line endings, BOM) | Stages 4–5 | Excel to CSV output |
| ZIP reading and writing (fflate, already installed) | Stage 4 | Writing the new XLSX file |
| Text encoding selector, structure check (verdict) | Stage 5 | CSV to Excel input |

**The one new engine piece:** a writer that creates a new XLSX workbook from scratch (Stage 4 only patched existing workbooks). It will be written row by row into the ZIP, so a 150 MB CSV never becomes one huge string, and the new file will be read back with DataFixer's own XLSX reader and compared cell by cell (value and type) before it is offered, like every download so far.

## CSV to Excel

1. Open the CSV. The page shows the file facts (encoding, separator, rows, columns) and a short structure verdict from the Validator (for example “Valid CSV” or “3 rows have the wrong number of fields”), with a link to the CSV Validator to repair problems first.
2. Settings: “First row contains column names”, the separator and text encoding used to read the file (as on the Validator), and how values become cells (decision 1).
3. Download: the new workbook is created, checked, and offered as `name.xlsx`, with a summary (rows, columns, how many cells became numbers, dates or text, and anything that needed a decision).

Workbook layout (decision 6): one sheet named after the file; with column names ticked, a bold header row, the top row frozen and a filter on the header; column widths estimated from the data.

## Excel to CSV

1. Open the workbook. Choose the sheet (hidden sheets are marked, chart sheets can't be converted).
2. Choose how values are written (decision 4): as Excel shows them, or the underlying values.
3. Download with the Stage 5 options (separator, line endings, UTF-8 with or without BOM), verified before it is offered. The summary lists what a CSV can't keep: formatting, formulas (their values are saved), other sheets, charts, images, comments, merged cells (decision 5).
4. Optionally (decision 3): all sheets at once, as a ZIP with one CSV per sheet.

## Owner decisions (option A chosen for all six, 13 November 2026)

**1. CSV to Excel: how values become cells.** A CSV holds only text; Excel cells can be numbers, dates or text.
- **A (recommended):** convert only values that are clearly numbers or dates, and keep everything else as text exactly as written:
  - numbers such as `42`, `-3.5`, `1250` become numbers. A displayed format keeps what you saw, so `1.50` still shows two decimals;
  - kept as text: leading zeros (`007`, phone numbers, ZIP codes), more than 15 digits (card numbers, long IDs, which Excel would round), `1,250` and other formats that can mean different things, percentages, currencies;
  - `2024-03-15` (ISO) becomes a real date, shown the same way. Other date layouts stay text, because `03/04/2024` can mean 3 April or March 4;
  - values that start like formulas (`=1+1`) are always text and never become formulas.
- **B:** keep every value as text (nothing changes, but Excel shows “number stored as text” warnings and can't add numbers up).
- **C:** like A, but with a choice per column before downloading.

**2. CSV to Excel: more rows than Excel allows.** An Excel sheet holds at most 1,048,576 rows.
- **A (recommended):** split into several sheets (“Data”, “Data (2)”…), repeating the header row on each sheet, and say so clearly in the summary.
- **B:** refuse, and explain how to split the file first.

(Rows are never dropped silently.)

**3. Excel to CSV: several sheets.**
- **A (recommended):** one sheet at a time (the chosen sheet), plus an “All sheets (ZIP)” button that downloads one CSV per sheet in a ZIP file.
- **B:** one sheet at a time only.

**4. Excel to CSV: which values are written.**
- **A (recommended):** default “As shown in Excel” (dates and numbers formatted as on screen, e.g. `13/11/2026`, `1,250.00`), plus an option “Plain values (for databases)”: dates as `2026-11-13`, numbers without thousands separators and with full precision, TRUE/FALSE as text.
- **B:** “As shown in Excel” only (what the Stage 4 CSV download does today).

**5. Excel to CSV: hidden rows and columns, and merged cells.**
- **A (recommended):** hidden rows and columns are included (a CSV can't hide them), and a merged cell's value is written once, in its first cell. Both are listed in the summary.
- **B:** leave hidden rows and columns out (an option on the page, off by default).

**6. CSV to Excel: workbook layout.**
- **A (recommended):** with column names ticked: bold header, top row frozen, filter on the header row; estimated column widths. Nothing else (no colours or themes).
- **B:** plain values only, no formatting at all.

## Build steps (each tested, committed and reported before the next)

| Step | Work |
|---|---|
| 1 | New XLSX writer: workbook, styles (bold header, number and date formats), cells written row by row into the ZIP, frozen header and filter, column widths. Verified by DataFixer's reader in the engine and by openpyxl in tests |
| 2 | Value rules (decision 1) and the Excel row limit (decision 2), with a planted test pack and exact counts |
| 3 | CSV to Excel page: settings, structure verdict, preview, download with summary |
| 4 | Excel to CSV page: sheet picker, values as shown or plain (decision 4), download options, all sheets as ZIP (decision 3), summary of what a CSV can't keep (decision 5) |
| 5 | Large files (50/100/150 MB, normal and low memory) in Chromium, phone and tablet layouts, owner test pack with expected results, Stage 6 test report |

## Progress

### Step 1 — New XLSX writer (done, 13 November 2026)

- `src/engine/export/xlsx-writer.ts`: creates a new workbook from scratch: text as inline strings (no large shared-string table in memory), numbers, dates (numbers with a date format), bold header, frozen top row and a filter (decision 6), estimated column widths, several sheets, safe unique sheet names. Rows are written one by one into the ZIP (the Stage 4 ZIP writer and fflate, no new dependency). It never writes formulas.
- Excel's limits are checked first and refused with the reason: more than 1,048,576 rows or 16,384 columns per sheet, more than 32,767 characters in a cell. Nothing is cut off silently.
- **The check before every download:** reading a big new workbook back with SheetJS would need about 100 bytes per cell (over 1 GB for a full sheet), so the new file is checked by a streaming check instead: it unzips the produced bytes, parses every row of every sheet's XML, and compares each cell's type, value and number format (from the written styles) with what was meant to be written. The tests show it catches a changed value, a wrong format, a number written as text, a missing row and a wrong sheet name.
- **Two writing details found by the tests:** a CR inside a value is written as `&#13;` (XML parsers turn a literal CR LF into LF); control characters and a literal `_xHHHH_` use Excel's `_xHHHH_` escape (XML 1.0 can't hold control characters at all).
- **Independent readers:** SheetJS (the Stage 2 reader) reads every value back exactly, except that it turns CR LF inside a cell into LF (it does this for every workbook). openpyxl reads every value, type, number format, the frozen header, the filter, bold header and widths exactly, except that it doesn't decode Excel's `_xHHHH_` escapes in inline strings (only control characters and a literal “_x0041_”-style text are affected; Excel decodes them).
- Note for Step 2: Excel has no negative zero, so the text “-0” must stay text.
- Tests: `tests/engine/xlsx-writer.test.ts` (7). A full-size sheet (1,048,576 rows, 6.4 million cells) in Node: written in 18.9 s, checked in 9.3 s, 36 MB file, about 0.5 GB peak extra memory (browser figures come in Step 5).

### Step 2 — Value rules and the row limit (done, 13 November 2026)

- `src/engine/convert/csv-to-xlsx.ts` (decision 1, option A): plain numbers (`42`, `-3.5`, `0.25`) become numbers; decimals keep their places with a display format (`1.50` → format `0.00`); whole numbers of 12–15 digits get the `0` format (Excel's General format would show `1.23E+11`); ISO dates `yyyy-mm-dd` from 1 March 1900 become real dates shown `yyyy-mm-dd`. A value becomes a number only if Excel will show exactly the same text. Everything else stays text, with the reason counted for the summary: leading zeros, more than 15 digits, separators / signs / % / currency / exponents (including `+5` and `-0`), other date layouts, impossible or pre-March-1900 dates, values that start like formulas, numbers with spaces around them. `TRUE`/`FALSE`, date-times and all other text stay text. The header row is always text.
- Decision 2 (option A): past 1,048,576 rows the data continues on “Name (2)”, “Name (3)”…; with column names the header row is repeated at the top of every sheet (1,048,575 data rows per sheet), without them 1,048,576 rows per sheet.
- Engine: `convertCsvToXlsx` (worker message `convertToXlsx`, cancellable) writes the workbook with the Step 1 writer, checks it, and returns a summary: sheets and rows, cells that became numbers / dates / text, and how many look-alike values stayed text and why.
- Test pack `tests/fixtures/convert/` (made by `scripts/fixtures/make_convert_pack.py`, expected results written from the rules): `1-values.csv` with 34 planted values, `2-customers.csv` (a realistic file with ids, phones, ZIP codes, two date layouts, balances).
- Tests: `tests/engine/convert.test.ts` (8): every planted value; openpyxl reads every converted value with the expected type and format; a round trip where every cell of the new workbook shows exactly the CSV's text; exact counts and reasons on the realistic file; the split at 1,048,580 rows with and without column names (read back by openpyxl); refusals. Letting leading zeros become numbers makes a test fail (and a second guard still keeps `007` as text).

### Step 3 — CSV to Excel page (done, 13 November 2026)

- `/csv-to-excel` now works (`src/components/tools/converter/`): open a CSV, TSV or TXT file; the Validator's verdict is shown first, and for a file with problems or warnings a **Check and repair in the CSV Validator** link opens the same file on the Validator page without choosing it again (the file stays in this tab's memory; nothing is uploaded). Settings: column names, and the separator and text encoding used to read the file (as on the Validator). An expandable list explains which values become numbers and dates and which stay text.
- **Convert to Excel (.xlsx)** creates the workbook in the worker, checks it cell by cell, and only then downloads it as `name.xlsx`. The summary shows the sheets and rows, how many cells became numbers, dates and text, the empty cells, the values kept as text on purpose (with the reasons), and a note when the data continues on more sheets. Download again; change settings and convert again; Cancel works and creates nothing.
- Shared changes: the workspace option for CSV pages is renamed `csvTools` (used by the Validator and the converter); the progress bar can use page-specific step names; the open file is available to tool panels (for the hand-over).
- Browser test: `npm run test:converter`, 25 checks (realistic file: counts, file name, check message; openpyxl: bold header, frozen row, filter, types per column; column names unticked: no header formatting; hand-over to the Validator; every planted value's type in the downloaded file; 1,048,580 rows split into 2 sheets, read by openpyxl; Cancel; phone and tablet widths; no off-site requests or console errors).

### Step 4 — Excel to CSV page (done, 14 November 2026)

- `/excel-to-csv` now works: open an XLSX or XLS workbook, choose a sheet (the Stage 2 sheet list), choose **Values in the new file** — “As shown in Excel” (default) or “Plain values (for databases)” (decision 4) — and the Stage 5 format options (separator, line endings, UTF-8 with or without BOM). **Download this sheet as CSV** (`Book - Sheet.csv`) or **All N sheets (ZIP)** (decision 3, `Book - all sheets.zip`).
- Plain values: dates as `yyyy-mm-dd` (with `hh:mm:ss` when there is a time; a time alone as `hh:mm:ss`), both the 1900 and 1904 date systems, Excel's non-existent 29 February 1900 written as Excel shows it; numbers in full precision without formatting; TRUE/FALSE; error results as shown (`#DIV/0!`).
- All sheets: each worksheet is read in turn (the open sheet is used as it is; the others get the rest of the memory budget and are released after use), written, checked cell by cell, and added to the ZIP; the ZIP is then read back and every file compared byte by byte before it is offered. Hidden and very hidden sheets are included and marked; real chart sheets have no cells and are listed as left out. File names are made safe and unique (`.tsv` for tab).
- Decision 5: hidden rows and columns are included and a merged value is written once (in its first cell); both are listed under “What a CSV file can't keep”, with formulas, formatting, other sheets, charts, images, comments, data validation, conditional formatting and hyperlinks.
- A chart sheet shows “This sheet has no cells to convert” and no single-sheet button (the ZIP of the worksheets is still offered).
- Found while testing: LibreOffice saves a chart sheet as an ordinary worksheet holding the chart, so such a sheet is converted (to an empty CSV); only real chart sheets are left out.
- Tests: `tests/engine/excel-to-csv.test.ts` (8: date conversion; plain values against openpyxl cell by cell for .xlsx and .xls; values as shown and the summary; 1904 dates; ZIPs read by Python's zipfile and csv modules, with options, Unicode sheet names, a real chart sheet). Converter browser test now 45 checks.

### Step 5 — Large files, layouts, test pack, report (done, 14 November 2026)

- `npm run test:converter-perf` (`scripts/converter-perf.ts`): both converters through the website at normal memory and a 512 MB heap; exact counts, every download checked by Python, originals unchanged. Results in `docs/stage-6-test-report.md`.
- Fixed during the runs: the ZIP now names a sheet that can't be read on the device instead of a generic memory message; the Excel to CSV panel says a too-large sheet couldn't be opened (instead of “no cells”, kept for chart sheets); the ZIP sets the open sheet aside when memory is tight and reads it again afterwards (unit tests for both).
- Phone and tablet widths: covered by the converter browser test. Test pack: listed in the test report.
- `docs/stage-6-test-report.md` written. Stage 6 waits for the owner's tablet tests and approval.

## Testing

- Every value rule with exact examples, including the ones that must stay text (`007`, `0044…`, 16+ digit numbers, `1,250`, `03/04/2024`, `=1+1`, `TRUE`, empty cells, line breaks, emoji).
- New XLSX files checked three ways: DataFixer's reader (in the website, before every download), openpyxl (types, values, number formats, frozen pane, filter), and a round trip CSV → Excel → CSV that must give back the same values.
- Excel to CSV checked against openpyxl's values, for both “as shown” and “plain values”, on the existing Stage 2–4 test workbooks (dates, 1904 dates, formulas, errors, hidden sheets, merged cells, .xls).
- Browser tests at phone, tablet and desktop sizes; large files in Chromium at normal and low memory; originals unchanged (SHA-256).
- The earlier stages' test suites keep passing.

## Known limits (expected, to be confirmed by testing)

- Only values travel between formats: a CSV can't hold formatting, formulas, charts or several sheets; a new XLSX from a CSV has no formulas.
- Very large files on low-memory phones may be refused before work starts (the memory budget used since Stage 2), as in Stages 4 and 5.
- Old .xls files are read as in Stage 2 (some features, such as charts, are not read).

## Rules carried over

Processing stays on the device; no new dependencies; no fake buttons; nothing ambiguous is changed silently; the original file is never changed; every download is verified before it is offered; Stages 1–5 must keep working; every feature is tested before it is reported as complete; limitations are documented honestly; a stage is complete only after the owner approves it.
