# Stage 16 plan: Split a large CSV or Excel file

**Status:** plan prepared on 28 November 2026. **The owner approved it with decisions A for all (1A–6A) and said to start Stage 16.** Progress is recorded under “Progress” below.

## Why

People often have a file that is too big for what they need to do with it:
- Excel stops at 1,048,576 rows.
- Email and upload forms limit file size.
- Import tools (CRMs, online shops, mailing tools) accept only so many rows at a time.

Splitting a file by hand means copying blocks of rows and repeating the header each time, which is slow and easy to get wrong. “split csv file”, “split large csv into multiple files” and “split excel file into multiple files” are common searches. No search volumes have been checked yet, so the owner can add Ahrefs or Semrush numbers before deciding.

The site already has **Split Column** (one column into several). This tool splits a whole **file** into several files, so the name and page make that difference clear.

## What exists today (reused)

- The readers for CSV, TSV, TXT, .xlsx and .xls (separator and encoding detection, values kept exactly as written), tested up to 150 MB.
- The verified CSV download and the CSV to Excel conversion (including splitting over sheets at Excel's row limit).
- A ZIP writer, already used for Excel files (`src/engine/xlsx/zip.ts`, with the existing fflate library), so the parts can be downloaded together as one .zip with no new dependency.
- The table preview, the memory budget and safe stops; Merge Files (Stage 15) for joining parts back.

## What will be built

1. **Split File page** (`/split-file`): open one file, choose how to split it, see the list of parts (name, rows, size), then download them.
   - **How to split**, as decided below.
   - **Header row:** when the file has column names, they are repeated at the top of every part.
   - **Downloads**, as decided below. Every part is checked before it is offered: row count, header, and the same values as the original.
   - **Part names:** the original name with a number, padded so the parts sort in order (`customers-part-01.csv`, `customers-part-02.csv` …). For “by column value”, the value is used in the name (`customers-Pune.csv`), with characters that file names can't hold replaced.
   - A link to Merge Files for joining parts back together.
2. **Guide**, as decided below.

No new dependencies. Files stay in the browser, and the original file is never changed.

## Technical notes

- The parts are written one at a time from the opened table, so memory holds the table plus one part, not every part at once. The ZIP is assembled from the finished parts as Blobs.
- CSV parts keep the original file's separator, encoding style and quotes rules where possible, as decided below.
- For “by column value”, the number of parts is capped (decision 5), because a column like “id” would otherwise make one file per row. The page says so before splitting.
- Each Excel part is a new workbook with one sheet. Values are kept as shown, as in CSV to Excel, so codes keep their leading zeros.

## Decisions for the owner

1. **How to split**
   - **A (recommended):** three ways: a number of rows per part (for example 100,000); a number of equal parts (for example 4); or one part per value of a chosen column (for example one file per city or per month).
   - B: rows per part only.
2. **Downloads**
   - **A (recommended):** all parts together as one .zip (one click), plus a button for each part on its own (useful on phones, where .zip files are harder to open).
   - B: one button per part only, with no .zip.
3. **File types**
   - **A (recommended):** open CSV, TSV, TXT and Excel (.xlsx, .xls; Excel: the sheet chosen on the page). Parts are written in the same format as the original (CSV parts for CSV/TSV/TXT, keeping the separator; .xlsx parts for Excel files), with an option to switch to the other (CSV or Excel).
   - B: CSV in, CSV out only.
4. **Limits**
   - **A (recommended):** files up to 150 MB (as for the other tools), the usual memory check, and 2–1,000 parts.
   - B: up to 100 parts.
5. **By column value**
   - **A (recommended):** at most 200 different values, with rows that have no value in that column put in a part of their own (“(empty)”). Values are compared exactly, as written; the order of rows inside each part stays as in the original.
   - B: no limit on values.
6. **Guide**
   - **A (recommended):** one guide, “How to split a large CSV or Excel file into smaller files”, 1,000–1,500 words, published on the daily schedule after guide 34 (24 December 2026).
   - B: no guide.

## Steps (each tested, committed and reported)

1. **Engine:** planning the parts (rows per part, equal parts, by column value), writing each part (CSV and Excel, header repeated, names), checking every part, and the .zip, with unit tests.
2. **Page:** split options, the list of parts, the .zip and single-part downloads, the link to Merge Files; browser tests (keyboard, axe-core light and dark, phone).
3. **Guide and related links.**
4. **Testing and report:** all earlier suites, large files (150 MB into many parts, Excel parts at the row limit, the low-memory run), completion report.

## Known limits (to be stated on the page)

- Only one sheet of an Excel workbook is split at a time.
- Excel parts keep values as shown, not formulas or formatting.
- “By column value” splits on exact values: “Pune” and “pune” become two parts (the page suggests Change Case first).
- Very large files need a computer or a device with enough memory, as for the other tools.

## Progress

- **Step 1 (engine): done, 28 November 2026.**
  - `src/engine/split/split-file.ts`: works out the parts without copying any data. Three ways: rows per part; a number of equal parts (sizes differ by at most one row); or one part per value of a column (exact values as shown, in order of first appearance, with empty values last as “(empty)”, at most 200 values). 2–1,000 parts. Each part is a view on the open table: the header row (when there is one) and its rows, in their original order. Part names: `name-part-01`… or `name-Value`, with characters that file names can't hold replaced, at most 60 characters, and same names told apart with “(2)”.
  - Engine (`previewSplitFile`, `exportSplitPart`, `exportSplitZip`):
    - CSV parts keep the original separator and line endings (Excel files: comma and Windows line endings), UTF-8 with BOM; TSV files give .tsv parts. Each part is read back cell by cell before it is offered.
    - Excel parts use the values the table shows, converted as in CSV to Excel (codes keep their zeros), and each new workbook is read back.
    - The ZIP holds every checked part. Each file is unzipped again and its size and CRC-32 must match the checked part.
    - The usual memory check applies, and a clear message explains why a choice can't be split.
  - Tests: 13 new (569 unit tests in total). They cover each way of splitting, refusals, separators and quotes, TSV, CSV and Excel parts from CSV and Excel files, the ZIP matching single downloads byte for byte, every row covered exactly once, the memory stop and file names.
- **Step 2 (page): done, 28 November 2026.** New page `/split-file`. It is in the tools registry, with related tools Merge Files, CSV to Excel and Excel to CSV.
  - **Choices:** how to split, with a suggested number of rows per part (100,000 for big files, otherwise half the table), a number of equal parts, or a column (with an example value and a note that values must match exactly). Then the format of the parts: CSV/TSV, or Excel, chosen automatically for Excel files.
  - **List of parts:** each part shows its file name, its rows and which rows of the file it holds, with its own download button. A choice that can't be split is explained, and nothing can be downloaded.
  - **Downloads:** “Download all parts (.zip)”, with progress and Cancel. The page confirms the check, and links to Merge Files for joining parts again.
  - **Header setting:** the table's existing “First row contains column names” setting decides whether the names are repeated.
  - **Tests:** new browser suite `npm run test:split-file`, 34/34, three runs in a row. It covers rows per part, the .zip unzipped with every row checked once and in order, a single part, equal parts, a choice that can't be split, column names off, one part per city with “(empty)” last, Excel parts opened in openpyxl (codes as text), an Excel file (parts as .xlsx and as CSV), keyboard, axe-core light and dark, and phone 390 px with 44 px buttons. Smoke 125, SEO 54 and a11y 71 also pass; the smoke and SEO checks were updated for the fourteenth tool and the SEO title and description were shortened to fit.
- **Step 3 (guide and related links): done, 28 November 2026.** Guide 35 “How to split a large CSV or Excel file into smaller files” (`/guides/split-large-csv-excel-file`, about 1,250 words) publishes on 24 December 2026 at 12:30 pm India time. It covers when to split, splitting by size or by value, doing it in Excel by hand (blocks of rows, and filtering one value at a time), the command line and its limits, MyDataFixer's Split File, a worked example and tips.
  - **Checked with the guide clock at 24 December, 1 pm:** 200 and in the sitemap; SEO 81/81; link preview complete; links to /split-file, and the tool page lists it; axe-core clean in light and dark; no horizontal scroll at 390 px.
  - **With today's date:** it is 404.
  - **Unit tests:** 570.
- **Step 4 (testing and report): done, 28 November 2026.** New large-file test `npm run test:split-file-perf`. A 150 MB CSV (4.9 million rows) was split into 5 parts (21 s), 1,000 parts (31 s) and 60 city parts (19 s), and 2.1 million rows became 2 Excel parts that each continue on a second sheet (45 s). In every case each part was unzipped and read after download: every row was there exactly once, and the original was unchanged. With a 512 MB heap, the 64 MB Excel case still works and the 150 MB file stops safely when opened. All suites pass on the same build. One difference from the plan: part sizes are shown after download, not in the list beforehand. Report: `docs/stage-16-test-report.md`. **Waiting for the owner's approval.**
