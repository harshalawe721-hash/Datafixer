# Stage 17 plan: Compare two spreadsheets

**Status:** plan prepared on 28 November 2026. **The owner approved it with decisions A for all (1A–6A) and said to start Stage 17.** Progress is recorded under “Progress” below.

## Why

People often have two versions of the same data and need to know what changed:
- this month's price list against last month's;
- a customer export before and after a cleanup;
- a file sent back by a colleague.

Comparing by eye is slow and misses things, and Excel's own comparison tool (Spreadsheet Compare, called Inquire in some versions) is only in some Windows editions of Office. “compare two excel files” and “compare two csv files for differences” are common searches. No search volumes have been checked yet, so the owner can add Ahrefs or Semrush numbers before deciding.

## What exists today (reused)

- The readers for CSV, TSV, TXT, .xlsx and .xls (separator and encoding detection, values kept exactly as written), tested up to 150 MB.
- Reading several files one at a time, with the memory check (Merge Files, Stage 15). Column matching by name, ignoring capital letters and spaces around names (Merge Files).
- The verified CSV download and the new-workbook writer with its check (CSV to Excel). The table preview, the memory budget and safe stops.

## What will be built

1. **Compare page** (`/compare-files`): choose the **older** and the **newer** file (two separate boxes, which can be swapped), choose how rows are matched, then see the result:
   - **Summary:** rows added, removed, changed and unchanged; columns added or removed.
   - **Differences:** a list showing each changed row with its old and new values side by side (“city: Pune → Oslo”), and the added and removed rows. A filter shows only one kind.
   - **Download** a difference report, as decided below.
2. **Guide**, as decided below.

No new dependencies. Files stay in the browser, and neither file is changed.

## Technical notes

- Both files are read one at a time and kept in the compact table storage. Rows are matched with a hash index on the key, so a comparison of millions of rows takes seconds, not minutes; the usual memory check stops safely if the two tables don't fit on the device.
- Columns are matched by name, as in Merge Files, so a column that moved doesn't count as a change. Files without column names are matched by position.
- Values are compared as the table shows them (Excel: as shown, so a date formatted differently in each file still compares by its shown text), with the options decided below.
- Coloured cells in the Excel report need a small addition to MyDataFixer's own Excel writer (fills in the styles); the new-workbook check is extended to cover them.

## Decisions for the owner

1. **How rows are matched**
   - **A (recommended):** by one or more key columns (such as an ID, SKU or email), suggested automatically (the first column whose values are all different, preferring names like “id”, “code”, “email”). Without a suitable key, by whole row: rows that are identical in both files count as unchanged, the others as added or removed (no “changed”).
   - B: by position (row 2 against row 2, and so on).
2. **What counts as a difference**
   - **A (recommended):** values exactly as shown, with two options, both off by default: ignore capital letters, and ignore spaces at the start and end. Columns found in only one file are reported as added or removed columns, not as changes in every row.
   - B: exact values only, no options.
3. **Difference report**
   - **A (recommended):** an Excel report with every row of the newer file plus the removed rows, a first column “Change” (Added, Removed, Changed, Unchanged), changed cells coloured, and a “What changed” column listing each change with its old value (“city: Pune → Oslo”). Also a CSV version (same columns, no colours), and an option to leave out unchanged rows.
   - B: CSV report only.
4. **File types and limits**
   - **A (recommended):** CSV, TSV, TXT and Excel (.xlsx, .xls) in any combination (a CSV against an Excel file works); for a workbook, the sheet can be chosen. Up to 150 MB for both files together, with the usual memory check.
   - B: two files of the same type only.
5. **Repeated keys**
   - **A (recommended):** when a key appears more than once in a file, the page says how many keys are repeated and lists examples. Those rows are matched in order (the first with the first) and marked in the report, so nothing is hidden.
   - B: refuse to compare until the keys are unique.
6. **Guide**
   - **A (recommended):** one guide, “How to compare two Excel or CSV files and find the differences”, 1,000–1,500 words, published on the daily schedule after guide 35 (25 December 2026).
   - B: no guide.

## Steps (each tested, committed and reported)

1. **Engine:** reading both files, matching columns and rows (keys, whole rows, the key suggestion, repeated keys), comparing values (the two options), the summary, with unit tests.
2. **Reports:** the Excel report with coloured cells (writer and check extended), the CSV report, leaving out unchanged rows; unit tests.
3. **Page:** the two file boxes and swap, the match choice, summary, differences list and filter, downloads; browser tests (keyboard, axe-core light and dark, phone).
4. **Guide and related links.**
5. **Testing and report:** all earlier suites, large comparisons (two files of about 75 MB with changes spread through them, including the low-memory run), completion report.

## Known limits (to be stated on the page)

- One sheet of each workbook is compared at a time. Formulas, formatting and comments aren't compared, only the values as shown.
- Rows are matched by key or by whole row; without a key, a row with one changed value shows as one removed and one added row.
- Very large comparisons need a computer or a device with enough memory, as for the other tools.

## Progress

- **Step 1 (engine): done, 28 November 2026.**
  - `src/engine/compare/compare.ts`:
    - **Columns** are matched by name, ignoring capital letters and spaces around names. When a file has no column names, they are matched by position. Columns found in only one file are reported, not counted as changes.
    - **Key suggestion:** the first column in both files whose values are all filled in and all different. Names like id, code, SKU or email are tried first; if none suits, whole rows are compared.
    - **Matching:** rows are matched by one or more key columns, or by whole row, using 52-bit hashes in sorted typed arrays. Every match is confirmed by comparing the texts, so it stays fast and compact with millions of rows.
    - **Comparison:** values as shown, optionally ignoring capital letters and spaces at the start and end (keys too).
    - **Repeated keys** are counted, with examples, and matched in order. Rows with no values are left out.
  - Engine (`compareFiles`, `compareDetails`):
    - CSV, TSV, TXT and Excel files in any combination, with a choice of sheet for workbooks, up to 150 MB together, with the memory check.
    - A file that was already read is kept, so changing the key or an option compares again straight away. A problem names the older or newer file.
    - Details list changed rows (old → new per column), added and removed rows (their values) and unchanged rows, each with its row numbers in both files.
  - Tests: 10 new (580 unit tests in total). They cover moved and extra columns, key suggestion, whole rows, chosen and two-column keys, both options, repeated keys, files without column names, a CSV against a chosen Excel sheet, empty lines, 60,000 rows in reverse order with changes, and the limits and memory stop.
- **Step 2 (reports): done, 28 November 2026.**
  - `src/engine/compare/report.ts` and `exportCompareReport`: every row of the newer file (rows with no values left out), then the removed rows. The columns are:
    - “Change”: Added, Removed, Changed or Unchanged, with “(repeated key)” where it applies;
    - every column, with columns only in the older file last;
    - “What changed”: for example “price: 20 → 25; city: Oslo → (empty)”, kept within one Excel cell with a “… and N more changes” note if needed.
  - Unchanged rows can be left out. The report is computed row by row, and nothing is copied.
  - **Excel report:** values converted as in CSV to Excel (codes keep their zeros, numbers become numbers). The Change label is coloured (Added green, Removed red, Changed yellow), and so are changed cells, including a value that became empty. More rows than one sheet holds continue on more sheets. The new workbook is read back cell by cell, colours included.
  - **CSV report:** the same columns, comma, Windows line endings, UTF-8 with BOM, read back cell by cell.
  - **Excel writer:** now supports cell colours (and coloured empty cells), and its check compares every cell's colour. The existing Excel and CSV to Excel tests still pass. The colours were also confirmed with openpyxl.
  - Tests: 5 new (585 unit tests in total).
- **Step 3 (page): done, 28 November 2026.** New page `/compare-files`. It is in the tools registry, with related tools Merge Files, Remove Duplicates and CSV Validator.
  - **Choosing files:** two boxes, “Older file” and “Newer file”, each with Change and a Swap button. Compare starts once both are chosen, with progress and Cancel.
  - **Result:** the files and sheets compared. “Match rows by” has the suggested column marked, “Whole rows”, and up to 3 key columns. A sheet choice appears for workbooks with several sheets, and the two options are checkboxes. Any change compares again straight away, with “Comparing again…” shown, because the files stay read.
  - **Summary:** tiles for changed (with the number of changed values), added, removed and unchanged rows. Notes cover columns in only one file, whole-row comparisons, repeated keys with examples, and identical data.
  - **Differences:** filter buttons (Changed, Added, Removed, Unchanged, with counts), rows listed 50 at a time with “Show more”. Changed rows show each value as old → new, and added and removed rows show their values, with row numbers in both files.
  - **Report:** Excel and CSV downloads, with “Include unchanged rows”.
  - **Tests:** new browser suite `npm run test:compare`, 40/40, three runs in a row. It covers choosing and swapping, the summary and notes, each filter, the Excel report read with openpyxl (values and colours, including a value that became empty), the CSV report without unchanged rows, two key columns, whole rows, both options, repeated keys, a CSV against a chosen Excel sheet, files with no columns in common, keyboard, axe-core light and dark, and phone 390 px.
  - **Found and fixed:** the “Change” buttons' screen-reader names didn't include their visible word (axe-core), and the key and row number ran together for screen readers.
  - Smoke 130, SEO 57 and a11y 71 also pass; the smoke and SEO checks were updated for the fifteenth tool.
- **Step 4 (guide and related links): done, 28 November 2026.** Guide 36 “How to compare two Excel or CSV files and find the differences” (`/guides/compare-two-excel-csv-files`, about 1,240 words) publishes on 25 December 2026 at 12:30 pm India time. It covers the three kinds of difference and why a key matters, View Side by Side, XLOOKUP/VLOOKUP by key (with formulas), conditional formatting and its limits, Spreadsheet Compare and the command line, MyDataFixer's Compare Spreadsheets, a worked example and tips.
  - **Checked with the guide clock at 25 December, 1 pm:** 200 and in the sitemap; SEO 84/84; link preview complete; links to /compare-files, and the tool page lists it; axe-core clean in light and dark; no horizontal scroll at 390 px.
  - **With today's date:** it is 404.
  - **Unit tests:** 586.
