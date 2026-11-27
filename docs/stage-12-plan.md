# Stage 12 plan: JSON to CSV and CSV to JSON

**Status:** plan prepared on 27 November 2026. **The owner approved it with decisions A for all (1A–6A) and said “Start Stage 12”.** Progress is recorded under “Progress” below.

## Why

JSON ↔ CSV was put on the build list by the owner earlier. People get JSON from apps, APIs and online services and need it in Excel; developers and online tools ask for JSON made from a spreadsheet. “json to csv” and “csv to json” are separate searches, like split and combine. No search volumes have been checked yet; the owner can add Ahrefs or Semrush numbers before deciding.

## What will be built

1. **JSON to CSV** (`/json-to-csv`): open a .json file (or paste JSON), see it as a table, download CSV or Excel.
   - A list of objects becomes rows; every key becomes a column, in the order keys first appear. Rows missing a key get an empty cell.
   - Nested data, as decided below (for example `address.city` as its own column).
   - A JSON file that is one object with a list inside (for example `{"results": [ … ]}`) is detected, and the user picks the list.
   - JSON Lines (.jsonl, one object per line), if decided.
   - Invalid JSON is refused with the line and column of the mistake, in plain language.
2. **CSV to JSON** (`/csv-to-json`): open a CSV or Excel file, choose options, preview the first records, download .json.
   - The header row gives the key names (duplicate or empty names are made unique: `name`, `name_2`, `column_3`).
   - Values as text, or with numbers, true/false and empty cells detected, as decided below.
   - Pretty (indented) or compact output; JSON Lines output, if decided.
3. **Shared:** the existing upload, table preview, CSV/Excel download and checks (the CSV to Excel rules: leading zeros and long numbers stay text). Every JSON download is read back and compared with the table before it is offered, like the other downloads.
4. **Content:** tool help on each page and guides as decided.

No new dependencies (the browser's own JSON reader is used). Files stay in the browser.

## Technical notes

- The upload box accepts only spreadsheet types today (.xlsx, .xls, .csv); .json and .jsonl are added for these pages only, with their own checks (UTF-8 text, size).
- JSON has to be read as a whole by the browser, which needs several times the file size in memory. A size limit (decision 5) keeps phones safe; JSON Lines can be read line by line.
- Values that Excel would change (leading zeros such as `"00123"`, numbers longer than 15 digits) stay text in the Excel download, as in CSV to Excel. Numbers in JSON that are too long for Excel are kept as text, not rounded.
- Cells starting with `=`, `+`, `-` or `@` are never turned into formulas.

## Decisions for the owner

1. **Pages**
   - **A (recommended):** two pages, `/json-to-csv` and `/csv-to-json`, one per search.
   - B: one page “JSON ↔ CSV Converter”.
2. **Nested data in JSON to CSV**
   - **A (recommended):** nested objects become columns with dotted names (`address.city`, `address.zip`); lists inside a record (for example several phone numbers) are kept as JSON text in one cell, so nothing is lost.
   - B: nested objects and lists both kept as JSON text in one cell.
3. **Values in CSV to JSON**
   - **A (recommended):** text by default (nothing changes), with an option “detect numbers, true/false and empty values”; codes with leading zeros stay text even then.
   - B: always detect.
4. **JSON Lines (.jsonl)**
   - **A (recommended):** supported both ways.
   - B: not supported.
5. **Size limit for JSON files**
   - **A (recommended):** up to 50 MB for .json (read as a whole) and the usual 150 MB for .jsonl (read line by line), stated on the page; larger files are refused with the reason.
   - B: the usual 150 MB for both, with the memory check stopping safely when a device can't cope.
6. **Guides**
   - **A (recommended):** one guide per page (1,000–1,500 words, simple), published on the daily schedule after guide 29 (19 and 20 December 2026).
   - B: one guide covering both.

## Steps (each tested, committed and reported)

1. **Engine:** JSON reader (lists, nested data, finding the list inside an object, JSON Lines, clear error positions), JSON writer (key names, value detection, pretty/compact, JSON Lines) with read-back verification; unit tests including awkward files (empty, deeply nested, mixed types, very long numbers, non-English text, a BOM, invalid JSON).
2. **JSON to CSV page:** upload or paste, list choice, table preview, CSV and Excel downloads; browser tests.
3. **CSV to JSON page:** options, preview of the first records, JSON download; browser tests.
4. **Guides and related links.**
5. **Testing and report:** all earlier suites, accessibility, phone layout, large files (including the size limit and the low-memory run), completion report.

## Known limits (to be stated on the pages)

- Very deeply nested JSON gives many columns; lists inside records stay as JSON text in one cell (decision 2A).
- CSV to JSON can't know which text is really a number or a date unless value detection is on, and dates always stay text.
- JSON files larger than the size limit can't be opened in the browser.

## Progress

- **Step 1 (engine): done, 27 November 2026.**
  - `src/engine/json/parse.ts`: a strict JSON reader written for these tools, because the browser's own reader rounds numbers longer than 15 digits and doesn't reliably say where a mistake is. Numbers with more than 15 significant digits are kept exactly as written; mistakes are reported in plain language with line and column (for example “There is a comma before “}” with nothing after it (line 1, column 9)”); single quotes, unquoted words, unclosed text, leading zeros and line breaks inside text are explained; nesting over 500 levels is refused instead of crashing; a BOM is allowed; `__proto__` is an ordinary key. JSON Lines: one value per line, blank lines skipped, errors name the file line.
  - `src/engine/json/table.ts` (decision 2A): lists of objects become rows with columns in order of first appearance; nested objects become dotted columns (address.city); lists inside a record stay JSON text in one cell; lists of lists become rows; plain values get a “value” column; lists inside an object (for example “results”) are found up to 3 levels deep so the user can choose one.
  - `src/engine/json/write.ts` (decisions 3A, 4A): unique key names (column_N, name_2); values as shown by default; with detection, plain numbers, true/false and empty cells become numbers, booleans and null, while leading-zero codes, numbers longer than 15 digits, dates and values with spaces around them stay text; pretty, compact and JSON Lines layouts.
  - Tests: 18 new (488 in total), including output read back to the same records. Speed: a 50 MB JSON file (339,116 records) is read in about 1.5 s and turned into a table in 0.3 s (the browser's own reader: 0.44 s, but it rounds long numbers).
- **Step 2 (JSON to CSV page): done, 27 November 2026.**
  - New page `/json-to-csv` (in the tools registry: menu, footer, homepage list, sitemap; related tools CSV to Excel, Excel to CSV, CSV Validator). Open a .json or .jsonl file, or paste JSON (with a “one record per line” option).
  - The engine reads the file with the strict reader and holds it as a text table (numbers keep their JSON spelling, true/false become text, null an empty cell), so the verified CSV download and the CSV to Excel rules apply: codes with leading zeros and long numbers stay text in Excel; plain numbers become numbers. The CSV is named after the JSON file.
  - When the file holds several lists, the largest is shown and the others can be chosen; notes say how many cells hold lists as JSON text and how many long numbers were kept exactly; a single object is one row.
  - Invalid JSON is refused with the mistake and its line and column; text that isn't UTF-8 is refused; .json files over 50 MB are refused at upload (pointing to .jsonl), and JSON files too large for the device's memory are refused before reading.
  - Tests: new browser suite `npm run test:json`, 25/25 (table, notes, CSV and Excel downloads checked, list choice, JSON Lines, paste, mistake with line and column, the 50 MB limit, keyboard, axe-core light and dark, phone 390 px); 10 new engine tests (498 unit tests in total). All other suites pass: smoke 119, SEO 43, a11y 71, duplicates 31, split 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62. The SEO check caught a page description of 165 characters (limit 160), shortened to 157. The smoke and SEO checks were updated for the ninth tool.
- **Step 3 (CSV to JSON page): done, 27 November 2026.**
  - New page `/csv-to-json` for CSV, TSV, TXT, .xlsx and .xls (in the tools registry; JSON to CSV and CSV to JSON show each other first under “Related tools”).
  - The header row gives the keys (empty names become column_N, repeated names name_2; without a header row the keys are column_1, column_2 …). Values as text exactly as shown (default), or with numbers, true/false and empty values detected; codes with leading zeros, numbers longer than 15 digits and dates stay text. Layouts: pretty, compact, JSON Lines (.jsonl). Excel values are written as shown in the sheet.
  - The preview shows the first 3 records exactly as they will be written. The file is built in pieces of 5,000 records; every record is read back with the strict reader and compared (keys, order, values) before the download is offered. Cancel stops it.
  - Tests: 8 new engine tests (506 unit tests in total), including 12,345 records in all three layouts; new browser suite `npm run test:csv-json`, 19/19 (preview, text/detected values, layouts, column names off, downloads read back, an Excel date, keyboard, axe-core light and dark, phone 390 px). All other suites pass: smoke 126, SEO 46, a11y 71, json 25, duplicates 31, split 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62. The smoke and SEO checks were updated for the tenth tool.
- **Step 4 (guides and related links): done, 27 November 2026.**
  - Guide 30 “How to convert JSON to CSV and open it in Excel” (`/guides/convert-json-to-csv`, about 1,080 words) on 19 December 2026, and guide 31 “How to convert a CSV or Excel file to JSON” (`/guides/convert-csv-to-json`, about 1,050 words) on 20 December 2026, both at 12:30 pm India time. They cover what JSON looks like, how records become rows (and back), Excel's Power Query (From JSON, To Table, expanding columns), that Excel and Google Sheets can't save JSON, text versus numbers, keeping codes and long numbers as text, layouts, common problems, and the two MyDataFixer tools. Each guide links to its tool and to the other guide; the tool pages list their guide.
  - Checked with the guide clock at 20 December 1 pm: both guides 200 and in the sitemap; SEO 69/69; link previews complete and images load; axe-core clean in light and dark; no horizontal scroll at 390 px. With today's date both guides are 404 and absent from the sitemap. Unit 507 (schedule test updated for guides 30–31).
- **Step 5 (testing and report): done, 27 November 2026.** All suites pass on the final build (unit 510; json 25, csv-json 19, smoke 124, seo 46, a11y 71, duplicates 31, split 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62, large 64). New large-file test `test:json-perf`: 49 MB .json, 150 MB .jsonl, 50/150 MB CSV to JSON all ok with exact record counts; low-memory runs stop safely. Fixed during the step: JSON Lines now read line by line with a safe memory stop, and an intermittent Change case test race. Report: `docs/stage-12-test-report.md`.
