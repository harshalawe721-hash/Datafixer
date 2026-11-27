# Stage 15 plan: Merge CSV / Excel files

**Status:** plan prepared on 27 November 2026. **The owner approved it with decisions A for all (1A–6A) and said to start Stage 15.** Progress is recorded under “Progress” below.

## Why

People often have the same kind of data in several files: monthly exports, one file per shop or branch, reports from different people. Combining them by hand (copy, paste, check the columns line up) is slow and error-prone. “merge csv files” and “combine excel files into one” are common searches; no search volumes have been checked yet, so the owner can add Ahrefs or Semrush numbers before deciding.

## What exists today (reused)

- The readers for CSV, TSV, TXT, .xlsx and .xls (separator and encoding detection, values kept exactly as written), tested up to 150 MB.
- Exact duplicate-row detection (Remove Duplicates, Stage 11).
- The verified CSV download and the CSV to Excel conversion; the table preview; the memory budget and safe stops.

New: the upload box and the engine work with one file at a time today, so this stage adds choosing several files and combining them into one table.

## What will be built

1. **Merge Files page** (`/merge-files`): choose or drop several files at once (and add more), see the list with each file's rows and columns, merge, preview the result, download CSV or Excel.
   - **Columns** are matched as decided below; the result shows which columns came from which files, and a note when a column exists in only some files (those cells are empty for the other files).
   - **Source column**, as decided below: the name of the file each row came from.
   - **Duplicates**, as decided below.
   - Files can be removed from the list or reordered before merging; the rows keep the files' order.
2. **Guide**, as decided below.

No new dependencies. Files stay in the browser.

## Technical notes

- Files are read one at a time and added to the merged table, so memory holds the result, not every file twice; the usual memory check stops safely if the merged table would be too large for the device.
- Each CSV file's separator and encoding are detected separately (a semicolon file and a comma file can be merged).
- Excel workbooks contribute their first visible sheet (stated on the page).
- The header row of each file is detected as on the other pages; files without a header row are matched by position.

## Decisions for the owner

1. **Matching columns**
   - **A (recommended):** by column name (ignoring capital letters and spaces around names), so files with the same columns in a different order line up; columns found in only some files are added at the end. Files without column names are matched by position.
   - B: by position only.
2. **Source file column**
   - **A (recommended):** add a “Source file” column (on by default; can be turned off).
   - B: no source column.
3. **File types**
   - **A (recommended):** CSV, TSV, TXT and Excel (.xlsx, .xls) together in one merge; Excel files use their first visible sheet.
   - B: CSV only.
4. **Duplicates**
   - **A (recommended):** an option “Remove rows that appear more than once” (exact whole-row copies, ignoring the Source file column; the first copy is kept), off by default. For more control, a link opens the merged result in Remove Duplicates.
   - B: no duplicate option.
5. **Limits**
   - **A (recommended):** up to 50 files and 150 MB in total, with the usual memory check.
   - B: up to 10 files.
6. **Guide**
   - **A (recommended):** one guide, “How to merge CSV or Excel files into one”, 1,000–1,500 words, published on the daily schedule after guide 33 (23 December 2026).
   - B: no guide.

## Steps (each tested, committed and reported)

1. **Engine:** merging tables (column matching by name and position, the source column, duplicates, mixed separators and encodings, Excel first sheets), with unit tests.
2. **Page:** choosing several files, the file list (remove, reorder), the merge preview and notes, CSV and Excel downloads, the hand-off to Remove Duplicates; browser tests (keyboard, axe-core light and dark, phone).
3. **Guide and related links.**
4. **Testing and report:** all earlier suites, large merges (many files and 150 MB in total, including the low-memory run), completion report.

## Known limits (to be stated on the page)

- Only the first visible sheet of each Excel workbook is used.
- Columns are matched by their names; differently named columns that mean the same thing (“Email” and “E-mail”) stay separate unless renamed first.
- Very large merges need a computer or a device with enough memory, as for the other tools.

## Progress

- **Step 1 (engine): done, 27 November 2026.**
  - `src/engine/merge/merge.ts`: tables are added one at a time; columns are matched by name ignoring capital letters and spaces around names (the first spelling is kept), columns found in only some files go at the end, files without column names are matched by position, a repeated name inside one file stays a separate column; optional “Source file” column (first); optional removal of exact duplicate rows across files (ignoring the source column; the first copy is kept); empty rows between files are skipped.
  - `openMerge` in the engine: 2–50 files, up to 150 MB together; each file is read one at a time with the existing readers (each CSV's separator and encoding detected separately; Excel: the first visible sheet, values as shown) and released after merging; the usual memory stop; a problem in one file names the file; the result is a text table, so the verified CSV download (`merged.csv`) and the CSV to Excel rules (`merged.xlsx`, codes keep their zeros) apply.
  - Tests: 14 new (555 unit tests in total), including a comma CSV, a semicolon CSV and an Excel file in one merge, a workbook whose first sheet is hidden, duplicates across files, a file without column names, downloads, limits and the memory stop.
