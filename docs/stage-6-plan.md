# Stage 6 plan: Excel ↔ CSV converters

**Status:** plan prepared on 13 November 2026. **The owner chose option A for all six decisions on 13 November 2026** and said “Start Stage 6” the same day. Progress is recorded under “Progress” below.

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
