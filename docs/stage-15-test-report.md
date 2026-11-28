# Stage 15 completion report: Merge Files

**Date:** 27 November 2026

**Status:** ✅ **COMPLETE.** Approved by the owner on 28 November 2026.

The owner approved the plan (`docs/stage-15-plan.md`) on 27 November 2026 with decisions **A for all** (1A–6A): columns matched by name, ignoring capital letters and spaces around names; an optional “Source file” column, on by default; up to 50 files and 150 MB together, CSV/TSV/TXT and Excel mixed; optional removal of exact duplicate rows, off by default; CSV and Excel downloads; one guide on 23 December.

## Changes

| Part | Change |
|---|---|
| Merging | `src/engine/merge/merge.ts`: files are added one at a time. Columns are matched by name, ignoring capital letters and spaces around names (the first spelling is kept). Columns found in only some files go at the end and stay empty for the other files. Files without column names are matched by position. A name repeated in one file stays a separate column. The optional “Source file” column comes first. Optionally, exact duplicate rows across files are removed (ignoring the Source file column; the first copy is kept). Empty rows between files are skipped. Merged rows are stored compactly, like a CSV file, and every row has the full width. |
| Opening files | `openMerge` in the engine: 2–50 files, up to 150 MB together. Each file is read with the existing readers (each CSV's separator and encoding detected on its own; Excel: the first visible sheet, values as shown), one at a time and without a copy. A problem in one file names that file. The usual memory stop applies. The result is a text table, so the verified CSV download (`merged.csv`) and the CSV to Excel rules (`merged.xlsx`, codes keep their leading zeros) apply. |
| Upload box | A several-files mode: each file is checked on its own, and refused files are listed with the reason. |
| Tool page | `/merge-files`: file list with move up, move down and remove; the options; Merge. The merged table shows the files (rows, sheet, files without column names), columns found in only some files and duplicates left out. Changing an option merges again straight away. CSV and Excel downloads are checked before they are offered. “Open in Remove Duplicates” hands the merged table over. “Add or remove files” goes back to the list with the files kept. Single-file controls (separator, encoding, “Try again”) are hidden for a merged table. In the tools registry; related tools are Remove Duplicates, CSV to Excel and Spreadsheet Cleaner. |
| Guide | Guide 34 “How to merge several CSV or Excel files into one”, 23 December 2026 at 12:30 pm India time (about 1,090 words). |

No new dependencies. Files stay in the browser, and the original files are never changed.

## Tests (final run, same build)

| Suite | Result |
|---|---|
| Type check, lint | ✅ pass, 0 warnings |
| Unit tests (`npm test`) | ✅ 556 / 556 (Stage 15 adds 15). Covers: a comma CSV, a semicolon CSV and an Excel file in one merge; a workbook whose first sheet is hidden; columns in a different order; different capital letters and spaces in names; a file without column names; duplicates across files; downloads; limits; the memory stop; guide 34's date |
| Merge Files in the browser (`test:merge`, new) | ✅ 27 / 27. Covers: choosing several files and refused files, reordering and removing, the merged summary and notes, axe-core in light and dark, CSV and Excel downloads read back (consistent field count, leading zeros kept), exact copies only counted as duplicates, options re-merging, handing over to Remove Duplicates, adding more files, keyboard use, phone layout at 390 px |
| Earlier suites | ✅ smoke 123, SEO 52, a11y 71, xml 23, tsv 21, json 25, csv-json 19, duplicates 31, split 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62 |
| Guide (clock set to 23 December, 1 pm) | ✅ live and in the sitemap; SEO 78 / 78; link preview complete; links to /merge-files and the tool page lists it; axe-core clean in light and dark; no sideways scrolling at 390 px. With today's date it is hidden. |
| Large files (`test:merge-perf`, new) | ✅ both ok; exact line counts; header right; originals unchanged (SHA-256). See below. |

The smoke test checks every internal link it finds on the pages, so its count depends on which guides are listed at the time (129 at Step 2, 123 now). All of them pass.

### Large files

Every other file has its columns in a different order, so every merge has to match columns by name.

| Files | Merge | CSV download (create + check) | Peak extra memory | Result |
|---|---|---|---|---|
| 50 CSV files, 145 MB together (4,402,540 rows) | 8 s | 11.7 s | 1,125 MB (2,335 MB before the change below) | exactly 4,402,541 lines, 200 MB |
| 3 CSV files, 144 MB together (4,472,457 rows) | 7.5 s | 11.8 s | 1,240 MB (2,815 MB before) | exactly 4,472,458 lines, 191 MB |

**Low-memory run (JS heap capped at 512 MB):** both 145 MB merges stopped safely before using too much memory (“The merged table would be too large to keep safely in this browser on this device. Nothing was changed.”). Peak memory was 432 MB and 563 MB. No crashes; originals unchanged.

**Found during Stage 15 and fixed (each re-tested):**
- The first version kept every merged row as a separate list of values and copied each file before merging, so 145 MB of files took up to 2.8 GB. Merged rows are now stored compactly and each file is read without a copy, which cuts peak memory by about half (1.1–1.2 GB).
- After that change, rows from files with fewer columns were written with fewer fields in the CSV. Every merged row now has the full width. The browser test caught this.
- The browser test read the file list before every file had been checked, which made it fail now and then. It now waits for the list (three runs in a row pass).
- The duplicate test used rows that weren't exact copies. It now checks that only exact copies count, and it merges a file with an exact copy of itself.
- The guide's first draft was 982 words. A worked example brought it over the 1,000-word minimum.

## Remaining limitations

- Excel workbooks contribute only their first visible sheet (this is stated on the page).
- Names must match apart from capital letters and spaces: “E-mail” and “Email” become two columns (the guide says to rename them first).
- Duplicate removal finds exact copies only; it doesn't find near-matches.
- About 145 MB of files together needs over 1 GB of browser memory. On phones and low-memory devices, large merges stop safely and ask for fewer or smaller files.
- One Excel sheet holds 1,048,576 rows, so in the Excel download a bigger merge is split over several sheets (same rule as CSV to Excel). The CSV download keeps every row in one file. The large-file test checked the CSV download only.

## Approval

The owner approved Stage 15 on 28 November 2026 (“Approve”), and asked for the Stage 16 plan for Split File next.
