# Stage 12 plan: JSON to CSV and CSV to JSON

**Status:** plan prepared on 27 November 2026, waiting for the owner's decisions. Nothing is built until the owner approves.

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
