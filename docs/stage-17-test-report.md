# Stage 17 completion report: Compare Spreadsheets

**Date:** 28 November 2026

**Status:** all five steps done and tested. **Waiting for the owner's approval.**

The owner approved the plan (`docs/stage-17-plan.md`) on 28 November 2026 with decisions **A for all** (1A–6A):
- rows matched by key columns (suggested automatically), or by whole row when there is no key;
- values exactly as shown, with options to ignore capital letters and spaces at the start and end;
- an Excel report with highlighted changes, plus a CSV report;
- CSV, TSV, TXT and Excel in any combination, with a choice of sheet, up to 150 MB together;
- repeated keys reported and matched in order;
- one guide on 25 December.

## Changes

| Part | Change |
|---|---|
| Comparing | `src/engine/compare/compare.ts`. **Columns** are matched by name, ignoring capital letters and spaces around names; when a file has no column names, by position. Columns in only one file are reported, not counted as changes. **Key suggestion:** the first column in both files whose values are all filled in and all different (id, code, SKU, email first). **Matching:** rows by one or more key columns, or by whole row, using 52-bit hashes in sorted typed arrays, with every match confirmed by comparing the texts. **Values** are compared as shown, with the two options applying to keys too. **Repeated keys** are counted, with examples, and matched in order. Rows with no values are left out. |
| Opening files | `compareFiles`: CSV/TSV/TXT and Excel in any combination; for a workbook, the sheet can be chosen (default: the first visible). Up to 150 MB together, with the memory check. Files already read are kept, so changing the key, an option or a sheet compares again straight away. A problem names the older or newer file. `compareDetails` lists changed rows (old → new per column), added, removed and unchanged rows, with row numbers in both files. |
| Reports | `src/engine/compare/report.ts`, `exportCompareReport`. Every row of the newer file, then the removed rows. Columns: “Change” (Added, Removed, Changed, Unchanged, with “(repeated key)” where it applies), every column (older-only columns last), and “What changed” (“price: 20 → 25; city: Oslo → (empty)”). Unchanged rows can be left out. **Excel:** values converted as in CSV to Excel (codes keep their zeros); the Change label is coloured (Added green, Removed red, Changed yellow), and so are changed cells, including a value that became empty. More rows than one sheet holds continue on more sheets, and the workbook is read back cell by cell, colours included. **CSV:** comma, Windows line endings, UTF-8 with BOM, read back cell by cell. |
| Excel writer | Cell colours (also on empty cells), with the check comparing every cell's colour. The colours were confirmed with openpyxl. Existing workbooks are written exactly as before. |
| Tool page | `/compare-files`. **Choosing files:** “Older file” and “Newer file” boxes, Change and Swap, and Compare with progress and Cancel. **Result:** “Match rows by” (suggested column marked, up to 3 key columns, or whole rows), sheet choices, and the two options, each comparing again at once. **Summary** tiles, with notes on columns in only one file, whole rows, repeated keys and identical data. **Differences:** filter buttons with counts, 50 rows at a time. **Reports:** Excel and CSV, with “Include unchanged rows”. In the tools registry; related tools are Merge Files, Remove Duplicates and CSV Validator. |
| Guide | Guide 36 “How to compare two Excel or CSV files and find the differences”, 25 December 2026 at 12:30 pm India time (about 1,240 words). |

No new dependencies. Files stay in the browser, and neither file is changed.

## Tests (final run, same build)

| Suite | Result |
|---|---|
| Type check, lint | ✅ pass, 0 warnings |
| Unit tests (`npm test`) | ✅ 586 / 586 (Stage 17 adds 16). Covers moved and extra columns, key suggestion, whole rows, chosen and two-column keys, both options, repeated keys, files without column names, a CSV against a chosen Excel sheet, empty lines, 60,000 rows in reverse order, the limits and memory stop, the CSV and Excel reports (contents, colours, repeated keys, no differences), cell colours in the writer and its check, and guide 36's date |
| Compare in the browser (`test:compare`, new) | ✅ 40 / 40, three runs in a row. Covers choosing and swapping, the summary and notes, each filter, the Excel report read with openpyxl (values and colours), the CSV report without unchanged rows, two key columns, whole rows, both options, repeated keys, a CSV against a chosen Excel sheet, files with no columns in common, keyboard, axe-core light and dark, and phone 390 px |
| Earlier suites | ✅ smoke 129, SEO 57, a11y 71, split file 34, merge 27, xml 23, tsv 21, json 25, csv-json 19, duplicates 31, split column 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62 |
| Guide (clock set to 25 December, 1 pm) | ✅ live and in the sitemap; SEO 84 / 84; link preview complete; links to /compare-files and the tool page lists it; axe-core clean in light and dark; no sideways scrolling at 390 px. With today's date it is hidden. |
| Large files (`test:compare-perf`, new) | ✅ all ok: exact counts, both reports read back after download, both files unchanged (SHA-256). See below. |

The smoke test checks every internal link it finds, so its count depends on which guides are listed at the time (130 during Step 3, 129 now). All of them pass.

### Large files

In each newer file the columns are in another order and the rows are in another order (blocks reversed). Every 1,000th row has a changed value, every 200th row is removed, and 10,000 rows are added at the end.

| Files | Compare by key | CSV report (every row) | Excel report (differences only) | Whole rows (files kept) | Peak extra memory |
|---|---|---|---|---|---|
| 66 MB + 66 MB (2.1 million rows each) | 12 s | 8.1 s, 91 MB | 2 s | 9 s | 900 MB |

- **Counts:** exact, both by key (2,126 changed, 10,000 added, 10,628 removed, 2,112,737 unchanged) and by whole rows.
- **CSV report:** exactly 2,135,491 rows, with the right Change labels.
- **Excel report:** 22,754 rows, and every changed value highlighted (checked with openpyxl).

**Low-memory run (JS heap capped at 512 MB):**
- The same 66 MB + 66 MB comparison succeeded (611 MB), with every count and report exact.
- 74 MB + 74 MB (148 MB together, the most allowed) also succeeded (675 MB), exact.
- No crashes; files unchanged.
- The memory stop itself is covered by a unit test.

**Found during Stage 17 and fixed (each re-tested):**
- A changed cell that became empty wouldn't have been coloured, because the Excel writer skipped empty cells. The writer and its check now support coloured empty cells.
- The summary tiles built their colour class names at run time, which the styling tool can't detect; they now use fixed class names.
- Changing an option on the result page gave no feedback while the files were compared again. “Comparing again…” is now shown, and the controls pause.
- The “Change” buttons' screen-reader names didn't include the visible word “Change” (found by axe-core), and the key and row number ran together for screen readers. Both are fixed.
- The test's count lookup matched “Unchanged rows” when it looked for “Changed rows”, and one keyboard check didn't allow for options already ticked. Both tests were corrected; the page was right.

## Remaining limitations

- One sheet of each workbook is compared at a time. Formulas, formatting and comments aren't compared, only values as shown.
- Without a key column, a row with one changed value shows as one removed and one added row (the page says so).
- Header rows are detected automatically; there is no switch to override this on the Compare page.
- The differences list shows 50 rows at a time (“Show more” loads the next 50). The report has every row.
- Comparing about 130 MB needs 600–900 MB of browser memory. Devices with less memory stop safely.

## Approval

Waiting for the owner's approval.
