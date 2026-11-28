# Stage 16 completion report: Split File

**Date:** 28 November 2026

**Status:** all four steps done and tested. **Waiting for the owner's approval.**

The owner approved the plan (`docs/stage-16-plan.md`) on 28 November 2026 with decisions **A for all** (1A–6A):
- three ways to split (rows per part, equal parts, one part per column value);
- all parts as one .zip plus each part on its own;
- CSV, TSV, TXT and Excel files, with parts in the same format and the option to switch;
- up to 150 MB and 2–1,000 parts;
- at most 200 values by column, with “(empty)” last;
- one guide on 24 December.

## Changes

| Part | Change |
|---|---|
| Splitting | `src/engine/split/split-file.ts`: works out the parts without copying any data. Three ways: rows per part; a number of equal parts (sizes differ by at most one row); one part per value of a column (values exact as shown, in order of first appearance, empty values last as “(empty)”, at most 200). 2–1,000 parts. With column names, the header row is repeated at the top of every part, and rows keep their original order. Part names are `name-part-01`… or `name-Value`, with characters that file names can't hold replaced, at most 60 characters, and same names told apart with “(2)”. A choice that can't make 2–1,000 parts is explained in plain words. |
| Creating parts | CSV parts keep the original separator and line endings (Excel files: comma and Windows line endings), UTF-8 with BOM; TSV files give .tsv parts. Each part is read back cell by cell before it is offered. Excel parts use the values the table shows, converted as in CSV to Excel (codes keep their leading zeros), and each new workbook is read back. A part with more rows than one Excel sheet holds continues on more sheets. |
| The .zip | Holds every checked part. After it is made, each file is unzipped again, and its size and CRC-32 must match the checked part, before the .zip is offered. Parts are added one at a time and only their compressed bytes are kept. |
| Tool page | `/split-file`. You choose how to split (with a suggested number of rows per part), the column (with an example value), and CSV or Excel parts (Excel for Excel files). The list shows each part's name, its rows and which rows of the file it holds, each with its own download button. “Download all parts (.zip)” has progress and Cancel. The page also links to Merge Files. The table's existing “First row contains column names” setting decides whether names are repeated. In the tools registry; related tools are Merge Files, CSV to Excel and Excel to CSV. |
| Guide | Guide 35 “How to split a large CSV or Excel file into smaller files”, 24 December 2026 at 12:30 pm India time (about 1,250 words). |

No new dependencies (the existing ZIP code and fflate library are reused). Files stay in the browser, and the original file is never changed.

## Tests (final run, same build)

| Suite | Result |
|---|---|
| Type check, lint | ✅ pass, 0 warnings |
| Unit tests (`npm test`) | ✅ 570 / 570 (Stage 16 adds 14). Covers each way of splitting, refusals (one part, too many parts or values, the same value everywhere), separators and quotes, TSV, CSV and Excel parts from CSV and Excel files, the .zip matching single downloads byte for byte, every row covered exactly once, the memory stop, file names and guide 35's date |
| Split File in the browser (`test:split-file`, new) | ✅ 34 / 34, three runs in a row. Covers rows per part, the .zip unzipped and every row checked once and in order, a single part, equal parts, a choice that can't be split, column names off, one part per city with “(empty)” last, Excel parts opened in openpyxl (codes as text), an Excel file (parts as .xlsx and as CSV), keyboard, axe-core light and dark, and phone 390 px with 44 px buttons |
| Earlier suites | ✅ smoke 129, SEO 54, a11y 71, merge 27, xml 23, tsv 21, json 25, csv-json 19, duplicates 31, split column 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62 |
| Guide (clock set to 24 December, 1 pm) | ✅ live and in the sitemap; SEO 81 / 81; link preview complete; links to /split-file and the tool page lists it; axe-core clean in light and dark; no sideways scrolling at 390 px. With today's date it is hidden. |
| Large files (`test:split-file-perf`, new) | ✅ all ok. After download, every part was unzipped and read, with every row found exactly once and the column names at the top of every part; the original was unchanged (SHA-256). See below. |

### Large files

| File and choice | Open | All parts (create, check, .zip) | .zip | Peak extra memory |
|---|---|---|---|---|
| CSV 150 MB (4,935,108 rows), 1,000,000 rows per part → 5 parts | 5.4 s | 20.6 s | 38 MB | 1,031 MB |
| Same file, 4,936 rows per part → 1,000 parts | 4.9 s | 30.8 s | 38 MB | 1,044 MB |
| Same file, one part per city → 60 parts | 4.9 s | 18.6 s | 22 MB | 954 MB |
| CSV 64 MB (2,100,000 rows) → 2 Excel parts of 1,050,000 rows (each continues on a second sheet) | 2.4 s | 44.8 s | 23 MB | 694 MB |

**Low-memory run (JS heap capped at 512 MB):**
- The 64 MB file still split into two Excel parts correctly (599 MB).
- The 150 MB file stopped safely when it was opened (“too large to open safely in this browser on this device”), before any split.
- No crashes; the original files were unchanged.

**Found during Stage 16 and fixed (each re-tested):**
- A first draft of the .zip check was incomplete. It was replaced before anything was committed: each file is now unzipped again and its size and CRC-32 compared.
- The page had its own “First row contains column names” box, which duplicated the one above the table. It was removed, and the table's setting is used.
- The column list's label also included the chosen option's text, so the column list couldn't be found by its name. It is now labelled “Column”.
- The page's search title (78 characters) and description (163) were over the site's limits (75 and 160). Both were shortened.
- Three unit test expectations and one browser check were wrong (a city, a date, a BOM and JSON spacing). The tests were corrected; the tool's output was right.

## Remaining limitations

- One sheet of an Excel workbook is split at a time. Excel parts keep values as shown, not formulas or formatting.
- By column value, values must match exactly: “Pune” and “pune” become two parts (the page points to Change case in the Spreadsheet Cleaner).
- Columns beyond the first 200 aren't offered in the column list. This is the same limit as the table preview.
- Splitting 150 MB needs about 1 GB of browser memory. On phones and low-memory devices, files that large stop safely when opened.
- The part list doesn't show sizes before the parts are made. Sizes are shown after download.

## Approval

Waiting for the owner's approval.
