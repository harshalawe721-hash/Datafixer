# Stage 5 plan: CSV Validator

**Status:** proposal, **awaiting the project owner's approval.** Nothing is built until the owner approves the plan and says to start.

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

## Owner decisions needed (recommendation first)

1. **Short rows:** offer "Add empty cells" as a fix with a preview, but **not** in "Fix all", because a short row can also mean values slid into the wrong columns. *(Recommended.)* Alternative: include it in "Fix all".
2. **Header names:** fill empty names as "Column C" and make duplicates unique as "email (2)", shown in the preview first. *(Recommended.)* Alternative: only report them.
3. **Download options:** let the user choose the separator (comma, semicolon, tab) and line endings (Windows or Unix) when downloading. Keep **UTF-8 with BOM** as the default (decision 3 from Stage 4), and add a clearly labelled "UTF-8 without BOM (for databases and code)" option. *(Recommended.)* Alternative: keep the original separator and line endings, BOM only.
4. **Encoding choice:** add a "Text encoding" selector next to the separator selector, so a user who sees � characters can reopen the file as Windows-1252, UTF-8 and so on. The reader already supports this. *(Recommended.)*
5. **Strictness:** treat rows with a different number of fields as **errors** (they break most imports), and missing/duplicate headers as **errors** only when the "First row contains column names" box is ticked. *(Recommended.)*

## Build steps (each tested, committed and reported before the next)

| Step | Work |
|---|---|
| 1 | Validation engine: checks A–I, with exact counts on a planted test pack (one file per problem, plus a clean file) |
| 2 | Raw-line examples, and the reader additions (final line break, `sep=`, row positions) |
| 3 | Validator page: verdict, checklist, problem cards, view affected rows, encoding selector (decision 4) |
| 4 | Repairs with preview (short rows, empty extra fields, header names, control characters), using the Stage 4 engine |
| 5 | Download options (decision 3), verified as in Stage 4 and independently with Python's `csv` module |
| 6 | Large-file tests (50/100/150 MB, normal and low memory), browser tests at phone/tablet sizes, test pack with expected results, Stage 5 test report |

## Testing

- Unit tests per check with exact counts, including false-alarm guards: quoted separators, quoted line breaks, and ragged rows that are legitimate when there is no header.
- Every repair: exact before/after, undo, and re-validation showing the problem gone.
- Downloads verified by DataFixer's reader (in the website) and by Python's `csv` module (in tests), for every separator, line-ending and BOM option.
- Browser tests at phone, tablet and desktop sizes. Large files in Chromium at normal and low memory. Original files unchanged (SHA-256).
- An owner test pack with expected results for the tablet.

## Rules carried over

Processing stays on the device; no new dependencies; no fake buttons; preview before any change; never silently make ambiguous changes; the original file is never changed; Stages 1–4 must keep working; every feature tested before it is reported as complete; limitations documented honestly.
