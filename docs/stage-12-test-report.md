# Stage 12 completion report: JSON to CSV and CSV to JSON

**Date:** 27 November 2026

**Status:** ✅ **COMPLETE.** Approved by the owner on 27 November 2026.

The owner approved the plan (`docs/stage-12-plan.md`) on 27 November 2026 with decisions **A for all**: two pages (1A); nested objects as dotted columns and lists kept as JSON text (2A); values as text by default with optional detection (3A); JSON Lines both ways (4A); 50 MB for .json and 150 MB for .jsonl (5A); one guide per page, 19 and 20 December (6A).

## Changes

| Part | Change |
|---|---|
| JSON reader | `src/engine/json/parse.ts`: a strict reader written for these tools, because the browser's own reader rounds numbers longer than 15 digits and doesn't reliably say where a mistake is. Long numbers are kept exactly; mistakes are explained in plain language with line and column; nesting over 500 levels is refused safely; a BOM is allowed; `__proto__` is an ordinary key. About 1.5 s for 50 MB. |
| JSON → table | `src/engine/json/table.ts`: one builder, one record at a time. Columns in order of first appearance; nested objects as dotted columns (address.city); lists inside a record as JSON text; lists of lists as rows; plain values in a “value” column; lists inside an object found (3 levels deep) for choosing. |
| Opening JSON | A JSON file is held as a text table (numbers keep their JSON spelling), so the verified CSV download and the CSV to Excel rules apply. .json: refused at upload over 50 MB, and before reading when it would need more than the device's memory (about 10× its size). .jsonl: read line by line, so memory grows with the table, with a safe stop when the table would pass the device's memory budget. Non-UTF-8 text refused. |
| Table → JSON | `src/engine/json/write.ts` and the engine export: unique keys (column_N, name_2); values as shown, or detected numbers, true/false and null (codes with leading zeros, numbers longer than 15 digits, dates and values with spaces around them stay text); pretty, compact, JSON Lines. Written in pieces; every record is read back and compared before the file is offered. |
| Pages | `/json-to-csv` (file or paste, list choice, notes on lists kept as text and long numbers, CSV and Excel downloads) and `/csv-to-json` (CSV, TSV, TXT, .xlsx, .xls; values and layout options; preview of the first 3 records; download with Cancel). Both in the tools registry and related to each other; help content on each. |
| Guides | Guide 30 “How to convert JSON to CSV and open it in Excel” (19 December 2026) and guide 31 “How to convert a CSV or Excel file to JSON” (20 December 2026), 12:30 pm India time, about 1,080 and 1,050 words, linked to their tools and to each other. |

No new dependencies. Files and pasted text stay in the browser.

## Tests (final run)

| Suite | Result |
|---|---|
| Type check, lint | ✅ pass, 0 warnings |
| Unit tests (`npm test`) | ✅ 510 / 510 (Stage 12 adds 40): the reader (same results as JSON.parse on ordinary JSON, long numbers, 14 kinds of mistake with line and column, deep nesting, JSON Lines), JSON → table, table → JSON (keys, detection rules, layouts read back), opening JSON in the engine (lists, JSON Lines read in pieces with a mistake at line 45,001, memory stops, non-UTF-8, upload limits), CSV and Excel → JSON (12,345 records in all layouts, an Excel date), guide dates |
| JSON to CSV in the browser (`test:json`, new) | ✅ 25 / 25 |
| CSV to JSON in the browser (`test:csv-json`, new) | ✅ 19 / 19 |
| Earlier suites (final build) | ✅ smoke 124, seo 46, a11y 71, duplicates 31, split 28, combine 29, change case 27 (10 of 10 runs after the fix below), fix 126, detector 33, validator 106, converter 45, engine 62, large 64 |
| Guides (clock set to 20 December, 1 pm) | ✅ both live and in the sitemap; SEO 69 / 69; link previews complete, images load; links to the tools and each other; axe-core clean in light and dark; no sideways scrolling at 390 px. With today's date both guides are hidden. |
| Large files (`test:json-perf`, new) | ✅ all ok; exact record counts; originals unchanged (SHA-256). See below. |

### Large files

| Case | Open | Downloads (create + check) | Peak extra memory | Result |
|---|---|---|---|---|
| JSON to CSV · .json 49 MB (324,000 records) | 1.9 s | CSV 1.4 s, Excel 11.8 s | 759 MB | CSV exactly 324,001 lines; Excel 13.7 MB, checked cell by cell |
| JSON to CSV · .jsonl 150 MB (988,000 lines) | 4.9 s | CSV 3.7 s | 1,181 MB | CSV exactly 988,001 lines |
| CSV to JSON · CSV 50 MB (857,660 rows) → pretty JSON | 1.9 s | 5.7 s | 644 MB | exactly 857,660 records (codes text, amounts numbers), 129 MB |
| CSV to JSON · CSV 150 MB (2,544,072 rows) → JSON Lines | 4.4 s | 15.6 s | 1,246 MB | exactly 2,544,072 records, 283 MB |

**Low-memory run (JS heap capped at 512 MB):** CSV 50 MB → pretty JSON ✅ ok (562 MB). The 49 MB .json stopped safely before reading (“needs roughly 492 MB”). The 150 MB .jsonl stopped safely while being read (“needs roughly 341 MB… Nothing was changed”), the new line-by-line memory stop. The 150 MB CSV stopped safely when opening, the known limit at this memory. No crashes; originals unchanged.

**Found during Stage 12 and fixed (each re-tested):**
- **JSON Lines read as a whole:** the plan allows .jsonl up to 150 MB because it can be read line by line, but the first version read the whole file into memory before parsing, which could crash a tab on a low-memory device. It now streams line by line with a safe memory stop (shown working in the low-memory run).
- **Long page description:** the JSON to CSV page description was 165 characters (limit 160); shortened to 157 (caught by the SEO check).
- **A wrong unit test line** (a “non-UTF-8” example that was valid UTF-8) removed; the real check uses raw bytes.
- **Test file sizes:** the large-file generator wrote the 150 MB .jsonl slightly over the upload limit; it now stays under it.
- **Intermittent Change case browser test (a test race, not a product bug):** after Change case is applied, the Error Detector re-checks and correctly shows “No problems found”; the test waited for “Spreadsheet analysis complete”, which only passed when it caught the old results first. It now waits for the re-check's own text and keeps diagnostics. 10 of 10 runs pass. This is very likely the intermittent failure recorded in the Stage 9 report.

## Remaining limitations

- .json files over 50 MB can't be opened (use .jsonl); on low-memory devices the limit is lower, and the page says so.
- Lists inside a record stay as JSON text in one cell; very deeply nested data gives many columns.
- CSV to JSON writes flat records; it doesn't build nested JSON from dotted column names. Dates are written as text, as shown.
- Only UTF-8 JSON can be read.
- The quick site-wide check (`test:smoke`) finds a slightly different number of links from run to run (118–126), because some guide links load after the page opens; nothing fails in any run.

## Approval

The owner approved Stage 12 on 27 November 2026 (“Stage 12 approved”).
