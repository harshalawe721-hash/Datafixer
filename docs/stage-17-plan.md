# Stage 17 plan: Compare two spreadsheets

**Status:** plan prepared on 28 November 2026. **Waiting for the owner's decisions.**

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
