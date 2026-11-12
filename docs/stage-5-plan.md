# Stage 5 plan: CSV Validator

**Status:** the five decisions were **approved by the project owner on 12 November 2026** (with the detailed requirements below). The owner said “Start Stage 5” on 12 November 2026. Progress is recorded under “Progress” below.

Stages 1–4 are complete. Stage 5 builds on the Stage 2 CSV reader, which already detects the encoding, separator, line endings, broken quotes, undecodable characters and formula-like cells. It also builds on the Stage 4 fixing engine: preview, Undo/Redo, change history and verified downloads.

## Goal

Answer one question before a CSV file is imported anywhere: **"Is this file structurally sound, and if not, what exactly is wrong and where?"**

The Error Detector checks the *data* (duplicates, dates, emails…). The Validator checks the *file*: rows, columns, header, quotes, separator, encoding, line endings and import limits. It then repairs what can be repaired safely and explains the rest.

> Upload a CSV → a clear verdict (“Valid CSV” or “N problems”) → each problem explained, with the exact rows (and the raw line where useful) → safe repairs with preview → download a repaired file

## Checks

| # | Check | What is reported | Severity |
|---|---|---|---|
| A | **Encoding** | Detected encoding and BOM. Characters that couldn't be read (shown as �), with their rows. UTF-16 without a BOM can't be detected (noted) | Error if any � |
| B | **Separator** | Detected separator and how sure the detection is. A file that reads as a single column. Many cells containing another likely separator (e.g. a `;` file read as `,`). An Excel `sep=` line at the top | Warning |
| C | **Row lengths** | Rows with fewer or more fields than the header, with the distribution ("812 rows have 5 fields, 3 have 7") and the row numbers | Error |
| D | **Header** | No header row (first row looks like data), empty column names, duplicate names (case-insensitive), names with spaces at the edges, very long names | Error / warning |
| E | **Quoting** | A quote that never closes (and the row where it starts), stray quote characters inside unquoted fields, fields containing line breaks (some programs can't import them) | Error / note |
| F | **Line endings** | Windows (CRLF), Unix (LF), old Mac (CR) or a mix of them; blank lines; no line break at the end of the file | Warning / note |
| G | **Characters** | NUL bytes and other control characters, which break many importers. Cells starting with = + - @ (formula injection risk) | Error / warning |
| H | **Import limits** | More rows than Excel's limit (1,048,576), more columns than 16,384, cells longer than Excel's 32,767-character limit | Warning |
| I | **Trailing separators** | Every row ending with an extra separator, which creates an empty last column | Note |

Each problem gets a card with a plain-language explanation, examples (row numbers, and for quote and length problems the **raw line from the file** so the user can see the actual characters), "How to fix" guidance, and "View affected rows".

A summary at the top shows the verdict and a checklist of every check (passed / failed), plus an **import readiness** line, for example "Ready for Excel and Google Sheets" or "Will not import cleanly: 3 rows have extra fields".

## Repairs (all previewed, undoable, in the change history; Stage 4 rules apply)

| Problem | Repair | When |
|---|---|---|
| Short rows | Add empty cells so every row has as many fields as the header | Offered with a preview (see decision 1) |
| Extra fields that are empty | Remove empty fields beyond the header width | Safe: no data is lost |
| Extra fields that contain data | **Not repaired automatically.** Usually an unquoted separator inside a value, so the right fix can't be known. The raw line is shown, and the user edits the cells or fixes the source | Never automatic |
| Empty column names | Name them after the column ("Column C") | Decision 2 |
| Duplicate column names | Make them unique ("email", "email (2)") | Decision 2 |
| Spaces around column names | Trim | Safe |
| Empty rows | Remove (the existing Stage 4 fix) | Safe |
| Control characters / NUL bytes | Remove them from cells | Offered with a preview |
| Wrong encoding (� characters) | **Not repaired:** the characters are already lost. The user can choose the encoding themselves and reopen the file (decision 4) | — |
| Unclosed quote | **Not repaired automatically:** where the field was meant to end can't be known. The raw line is shown; fix the source file | Never automatic |
| Separator, line endings, encoding of the output | Chosen when downloading (decision 3) | — |

Downloads reuse the verified Stage 4 CSV export: the file is re-read and compared cell by cell before it is offered, with the same summary and the same recoverability.

## How it works

- **Engine:** a new `validate` request in the worker. One pass over the parsed sheet (row lengths, header, control characters, limits, trailing separators) plus facts collected while reading (encoding, line endings, quote errors, final line break, `sep=` line). Most of these are already collected; the reader will also record the final line break, a `sep=` line and per-row raw positions for examples.
- **Raw lines:** for examples, the original text of a row is read back from the file on demand (only for the few rows shown), so nothing extra is held in memory.
- **Large files:** same memory budget and streaming as Stages 2–4. The validation pass is lighter than the Error Detector scan. Target: within the Stage 3 scan times (about 10 s for 785,000 rows on the owner's tablet).
- **Page:** the CSV Validator page gets the shared workspace (upload, progress, preview, cell editing, Undo/Redo, history, download), with a validation report instead of the problem list. It accepts CSV/TSV/TXT only.
- **Wording:** the page's current description ("…then fix them") becomes accurate with the repairs above.

## Owner decisions (approved 12 November 2026, with these requirements)

1. **Short rows**
   - Uneven rows are validation errors.
   - An “Add empty cells” fix is offered with a before/after preview.
   - It is never part of “Fix all”.
   - The preview explains that short rows can mean data has shifted into the wrong columns.
2. **Column names**
   - Empty headers are renamed after their column (“Column C”), and duplicate headers become unique (“email (2)”).
   - Every proposed change is shown in the preview before anything is applied.
   - Cell data is never overwritten. A new name never creates another duplicate: if “email (2)” already exists, the next free number is used.
3. **Download options**
   - Separator: comma, semicolon or tab. Line endings: CRLF or LF.
   - UTF-8 with BOM stays the default. A clearly labelled “UTF-8 without BOM (for databases)” option is added.
   - Values are preserved exactly, including special characters, quotes and separators inside values. This is verified by re-reading in the website and with Python's `csv` module in tests.
4. **Text encoding selector**
   - A “Text encoding” selector sits beside the separator option, with UTF-8, Windows-1252 and ISO-8859-1 where the browser supports them.
   - The page explains that the choice changes how the original file is decoded (the file itself is never changed).
   - Unreadable characters are never replaced silently. When the chosen encoding can't decode the file reliably (for example, � appears, or text that is invalid in that encoding), a clear warning or error says so and shows where.
5. **Validation strictness**
   - Uneven row lengths are always errors.
   - Missing and duplicate headers are errors only when “First row contains column names” is ticked.
   - When it is not ticked, the first row is treated as data and never reported as missing or duplicate headers.

## Build steps (each tested, committed and reported before the next)

| Step | Work |
|---|---|
| 1 | Validation engine: checks A–I, with exact counts on a planted test pack (one file per problem, plus a clean file) |
| 2 | Raw-line examples, and the reader additions (final line break, `sep=`, row positions) |
| 3 | Validator page: verdict, checklist, problem cards, view affected rows, encoding selector (decision 4) |
| 4 | Repairs with preview (short rows, empty extra fields, header names, control characters), using the Stage 4 engine |
| 5 | Download options (decision 3), verified as in Stage 4 and independently with Python's `csv` module |
| 6 | Large-file tests (50/100/150 MB, normal and low memory), browser tests at phone/tablet sizes, test pack with expected results, Stage 5 test report |

## Progress

### Step 1 — Validation engine (done, 12 November 2026)

- `src/engine/validate/validate.ts`: checks A–I, run in the worker on the current (edited) data (`EngineClient.validate`, cancellable like a scan). Results use the Error Detector's issue cards, so “view affected rows” works the same way. Read-only.
- **Reader bug found and fixed:** in a file mixing line-ending types (CRLF, LF, CR), Papa Parse used only one type, so rows were merged (`"2\nc"`) or values kept a stray `\r`. This affected the Error Detector and Cleaner too (Stages 2–4). New `src/engine/csv/line-endings.ts` turns line breaks *outside* quoted values into `\n` first; line breaks inside quoted values are kept exactly. Line-ending types are now counted outside quotes only (a line break inside a value no longer makes a file “mixed”). Reading cost: +2–5% (100 MB: 7.2 → 7.4 s CRLF, 8.1 → 8.6 s LF, Node).
- Stray quotes in the middle of unquoted values (`Ana "x" Ruiz`), which Papa accepts silently, are now reported (one per row).
- The reader records whether the file ends with a line break.
- “First row may be data”: the validator uses its own rule (at least half the names are numbers, dates or email addresses), because the preview's header guess also rejects real headers that have empty or duplicate names.
- Test pack: `tests/fixtures/validate/` (13 files, made by `scripts/fixtures/make_validate_pack.py`). The expected results in `expected.json` are written from what was planted, and the reader is compared with Python's `csv` module on 8 of the files.
- Tests: `tests/engine/validate.test.ts`, 34 tests. Validating 100 MB (1.14 M rows) takes 1.0 s in Node.

### Step 2 — Raw lines and row positions (done, 12 November 2026)

- Examples of quote, row-length, hidden-character, line-ending, separator and column-name problems now carry the **row as written in the file** and the **line number** where it starts. Line numbers count line breaks inside quoted values, so they match what a text editor shows (in `3-quotes.csv`, row 17 is on line 19).
- `src/engine/csv/raw-lines.ts` re-reads the original file with the same encoding and quote rules, keeps at most 300 characters per row, and **stops as soon as the wanted rows are found**. A quote that never closes shows the start of the swallowed text, marked as cut.
- `visibleRaw()` makes invisible characters visible for the page: line break ↵, tab ⇥, NUL ␀ (and the other control characters as their Unicode symbols).
- Mixed line endings: the examples name the first row ending each way (“First line ending with LF”).
- Raw lines are shown only while the data is unchanged. After a change, row numbers no longer match the file, so examples show cell values (`rawLines: "changed"`); undoing every change brings the raw lines back.
- **Cost:** none when the examples are near the top. Worst case measured: examples spread through a 100 MB file → validation 1.0 s → 5.9 s (Node), with progress shown (“Finding the example lines in the file”) and Cancel working.
- Tests: 11 more (45 in `validate.test.ts`), including reading with chunks of 1–11 bytes, BOM and UTF-16 files, and proof that a 20 MB file is only read up to its first 4 MB chunk when the examples are near the top.

### Step 3 — Validator page (done, 12 November 2026)

- `/csv-validator` now works: the verdict (“Valid CSV file” / “Valid CSV, with N warnings” / “Not a valid CSV file: N errors”), the import-readiness line, file facts, the 9-check checklist (links to the cards), problem cards with the lines from the file, “View affected data”, and the table preview. CSV files only. Read-only: nothing is changed yet (repairs are Step 4).
- **“First row contains column names”** is in the results card and stays in step with the table's setting (decision 5). On this page it starts ticked unless the first row looks like data: the preview's usual guess rejects real headers that have empty or duplicate names, which are exactly what the Validator should report.
- **Text encoding** box beside the separator (decision 4): UTF-8, Windows-1252 and ISO-8859-1 (UTF-16 shown when the file uses it), with a sentence explaining that the choice changes how the bytes are read. The file is read again; it is never changed. A chosen encoding is kept when the separator changes.
  - **ISO-8859-1 is decoded exactly.** Browsers treat the label “iso-8859-1” as Windows-1252 (per the WHATWG standard); DataFixer decodes it itself, so bytes 0x80–0x9F become the ISO-8859-1 control codes, which are then reported as hidden characters (shown as ▯).
  - **Never silent:** a UTF-8 file read as Windows-1252/ISO-8859-1 gets a warning (“é” would show as “Ã©”, with no � to notice); an automatically guessed Windows-1252 gets a note; characters that can't be read stay an error.
- **NUL bytes:** the shared upload check refuses any CSV containing a NUL byte as binary (approved Stage 1–2 rule, unchanged for the other tools). The Validator page accepts files with a few NULs (under 1% control bytes in the first 8 KB, the same threshold as other control characters) so it can report them; binary files are still refused.
- File-level problems (mixed line endings, guessed encoding, no final line break, too many rows, separator) have no particular rows, so they have no “View affected data” button.
- Fixed a phone layout bug in the shared issue card: a very long column name made the page wider than the screen (Error Detector and Cleaner use the same card). Long names are also shortened in Validator labels.
- Browser test: `npm run test:validator`, 65 checks (all problem types in the pack, decision 4 and 5 behaviour, separator change, refusals, Cancel/Check again on 50 MB, phone and tablet widths, no off-site requests, no console errors).
- **Owner's Android tablet (12 November 2026, Vercel deployment of commit `7141b14`):** 0-clean valid; 1-uneven and 2-header not valid; 3-quotes and 5-line-endings valid with warnings; 6-control (NUL bytes) accepted and not valid. Unticking “First row contains column names” on 2-header gives “Valid CSV file”; “View affected data” on 1-uneven shows only rows 6, 13, 20, 27 and 33. All as expected.

### Step 4 — Repairs with preview (done, 12 November 2026)

- Repair buttons on the problem cards, each with a preview first, then Undo/Redo and the change history (the Stage 4 engine: preview tokens, stale-preview refusal, all-or-nothing apply). Planned by `src/engine/validate/repairs.ts` with the validator's own layout rule, so they change exactly what the checks report.
  - **Add empty cells** (short rows, decision 1): before/after for each row, a warning that short rows can mean shifted data, never in Fix all. Existing values are not moved.
  - **Remove empty extra fields:** rows longer than the header whose extra fields are all empty are shortened. Rows with data in the extra fields are left alone and counted, with the reason.
  - **Fix column names** (decision 2): empty → “Column C”, duplicates → “email (2)”, next free number when taken (e.g. “email (3)”); only header cells change; every rename in the preview. Not offered when “First row contains column names” is unticked; the empty last column made by trailing separators is not named.
  - **Remove spaces around names**, **Remove blank lines** (exactly the reported blank lines; rows of separators are kept), **Remove hidden characters** (with a warning when U+0080–U+009F codes suggest the wrong encoding).
  - **Fix all safe problems** (Validator): empty extra fields, spaces around names, blank lines only.
  - Never automatic: extra fields with data, unclosed quotes, unreadable characters (the right result can't be known).
- **Edit layer:** new “shorten row” change (`trimRows`), with undo/redo, stats (`rowsShortened`), history details (“Row 2 shortened from 4 fields to 2”) and the download summary (“Rows shortened”).
- The page now has the shared editing tools: tap a cell to edit, Undo/Redo, History and the verified CSV download (the download keeps the original separator and line endings until Step 5). It also accepts .tsv and .txt files.
- “Column separator not certain” is now shown only while rows still disagree on the number of fields (it was a read-time guess that stayed after repairs).
- Tests: `tests/engine/repairs.test.ts` (12, including a check that breaking the duplicate-name rule makes them fail); Validator browser test now 91 checks (repairs, Fix all, Undo, history, a real download read by Python's `csv` module, .tsv). 100 MB (1.85 M rows): validation 1.3 s; shortening every row: preview 0.7 s, apply 4.4 s; download with verification 7.0 s (Node).

### Step 5 — Download options (done, 12 November 2026)

- On the CSV Validator page the download dialog first offers (decision 3): **separator** comma / semicolon / tab, **line endings** CRLF (Windows) / LF (Unix, Mac), and **UTF-8 with BOM** (default, recommended for Excel) / **UTF-8 without BOM (for databases)**. Defaults: the file's own separator when it is comma, semicolon or tab, its own line endings (CRLF unless the file used LF), and the BOM.
- **Download a copy** (when nothing was changed): convert a file to another format without repairing anything. File names: `name-cleaned.csv` after changes, `name-copy.csv` without; `.tsv` when the separator is tab.
- Values are written exactly: values containing the chosen separator, quotes or line breaks are quoted; line breaks inside values are kept as they are. The file is still verified before it is offered: it is read back as UTF-8 with the chosen separator and compared cell by cell, and the BOM must be present or absent as chosen. Without a BOM, a first value that itself starts with an invisible U+FEFF is refused (it would look like a BOM and be removed by other programs) rather than silently changed.
- The summary shows the file format (“Semicolon (;) · LF (Unix, Mac) · UTF-8 without BOM”) and warns when the separator was changed or the BOM left out (Excel may then show accents wrongly on double-click).
- The Error Detector and Cleaner downloads are unchanged (Stage 4 defaults, no options step).
- Tests: `tests/engine/download-options.test.ts` (5): all 12 combinations on values with every separator, quotes, both kinds of line break, accents, emoji, edge spaces, formula-like values and ragged rows, checked byte by byte and read back by Python's `csv` module (breaking the separator quoting makes the tests fail). Validator browser test: 100 checks, including a real semicolon / LF / no-BOM download read by Python and compared with the original values.

## Testing

- Unit tests per check with exact counts, including false-alarm guards: quoted separators, quoted line breaks, and ragged rows that are legitimate when there is no header.
- Every repair: exact before/after, undo, and re-validation showing the problem gone.
- Downloads verified by DataFixer's reader (in the website) and by Python's `csv` module (in tests), for every separator, line-ending and BOM option.
- Browser tests at phone, tablet and desktop sizes. Large files in Chromium at normal and low memory. Original files unchanged (SHA-256).
- An owner test pack with expected results for the tablet.

## Rules carried over

Processing stays on the device; no new dependencies; no fake buttons; preview before any change; never silently make ambiguous changes; the original file is never changed; Stages 1–4 must keep working; every feature tested before it is reported as complete; limitations documented honestly.
