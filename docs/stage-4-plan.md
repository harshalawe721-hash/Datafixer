# Stage 4 development plan: automatic fixing, editing and clean downloads

**Status:** plan **approved** by the project owner on 11 November 2026, together with the four owner decisions and five additional safeguards.
**Implementation: authorized** by the owner ("Start Stage 4", 11 November 2026). Progress is tracked in the table below. Each step is reported to the owner before the next one starts.

Stages 1–3 are complete (see `README.md`, `docs/stage-2-test-report.md`, `docs/stage-3-test-report.md`).

## Goal

Turn DataFixer from "find problems" into "find **and fix** problems":

> Upload → see the problems explained → preview the fixes → apply → check, undo or redo → download a new, clean file → see a verified summary

Fixing appears directly on the Error Detector's problem cards, and the Spreadsheet Cleaner page uses the same engine for people who go straight to it.

## Owner decisions (approved, unchanged)

| # | Topic | Decision |
|---|---|---|
| 1 | Duplicate rows | Keep the **first** copy; remove later exact duplicates. |
| 2 | Capitalization | Use the **most common spelling** in the column. **If there is a tie, ask the user** which spelling to use. Never guess. |
| 3 | CSV download | **UTF-8 with BOM**, for better Microsoft Excel compatibility. |
| 4 | Excel download | **Modify only the edited cells** and keep the original workbook's formatting, formulas, charts and other features wherever technically supported. |

## Owner requirements (approved)

1. **Preview before applying** any automatic correction.
2. **The original uploaded file is never changed.** Fixes go into a new download.
3. **Undo and Redo.**
4. **No silent ambiguous corrections.** When a fix has more than one reasonable answer, the user chooses.
5. **No silent loss of Excel features.** If a feature can't be kept, the user is told exactly what and why before downloading, and can choose another option.
6. **Exported files are tested by reopening them** and verifying their contents.
7. **Privacy:** files are processed locally on the device. Nothing is uploaded.
8. **The editor is responsive** and usable on Android tablets and phones.

## Additional safeguards (approved)

### S1. Formula protection

- **Automatic fixes never change formula cells.** Formula cells are skipped by every automatic fix (spaces, capitalization, numbers stored as text, dates, phone layouts), even when their saved result looks like a problem. The preview shows how many formula cells were skipped and why.
- **Manually editing a formula cell** shows a warning first: the formula (shown in full) will be replaced with the typed value, and other cells that use this cell will be recalculated by Excel when the file is opened. The user must confirm.
- **Formulas in all unaffected cells are preserved exactly** (the original XML is kept).
- **Before deleting rows or columns,** formula dependencies are checked (see S2).

### S2. Complete Excel reference protection

Before any row or column deletion in an Excel file, DataFixer inspects the **whole workbook**, not just the open sheet:

| Checked | Where it's found |
|---|---|
| Formulas on the current worksheet | Sheet XML `<f>` (including shared and array formulas) |
| Formulas on other worksheets that refer to this sheet | Other sheets' XML |
| Merged cells | `<mergeCells>` |
| Conditional formatting | `<conditionalFormatting sqref>` and formulas inside rules, including the newer `x14` extension format |
| Data validation | `<dataValidation sqref>` and list/formula sources, including `x14` |
| Charts and chart references | Chart XML `<c:f>` series and label ranges |
| Tables | Table parts (`ref`, and structured references in formulas) |
| Named ranges | `workbook.xml` `<definedName>` (including print areas and filter ranges) |
| Also checked (added for completeness) | AutoFilter, pivot table sources, hyperlinks and comments anchored to cells, sparklines, external links |

**Rule:** if a deletion could shift or break any reference, DataFixer **does not delete**. It lists the affected features (for example "2 formulas on sheet Summary refer to rows 10–500", "1 chart uses B2:B500") and offers safe alternatives:

1. **Clear the rows instead of deleting them.** Positions stay the same, so no reference can break.
2. **Download as CSV** (values only; the user is told that formatting and formulas aren't part of CSV).
3. **Cancel.**

References that can't be checked statically are treated as **possibly affected**, never as safe: `INDIRECT`, `OFFSET`, references built from text, external workbook links, and any part DataFixer doesn't recognise.

Rewriting references automatically (as Excel does when you delete rows) is **not** part of Stage 4. It would be a separate, later proposal.

### S3. Download verification summary

After an export, DataFixer shows a summary **only once the export and its verification have both passed**:

- Export successful
- Original file name and downloaded file name
- Cells edited
- Rows removed
- Columns removed
- Duplicates removed
- Automatic corrections applied
- Features that could not be preserved (or "none")
- Warnings the user should know about (for example "formulas will recalculate when opened", "cleared rows remain as empty rows")

If verification fails, there is **no** success message and **no** download. The user gets a clear error and the editing history is kept.

### S4. Recoverable large-file exports (50, 100 and 150 MB)

- The original uploaded file is never changed.
- The editing history is kept if an export fails or is cancelled. The user can retry straight away.
- **No partial or corrupted downloads:** the download is only offered after the complete file has been built and verified. An unfinished file is never handed to the browser.
- Memory is checked against the **existing memory budget** before an export starts and while it runs. If there isn't enough, the export stops with a clear message instead of crashing the tab.
- **Safer retry options:** for example, exporting as CSV instead of Excel, or exporting without in-memory verification steps that need extra memory, which then switch to a slower, lower-memory chunked check. A file is never reported as verified without a check.
- Exports can be cancelled at any time without losing edits.

### S5. Complete change history

A detailed, scrollable history (paged, so it stays fast with very many changes):

| Information | Example |
|---|---|
| Cell | B4 |
| Original value | "·john·" (spaces made visible) |
| New value | "john" |
| Operation | Remove extra spaces |
| Status | Applied / Undone |

- **Row and column operations** list which rows or columns were removed (or cleared) and **why** (for example "Row 28: exact copy of row 3").
- Undo and Redo update the history: undone entries are marked **Undone**, and redone entries become **Applied** again.
- Bulk operations appear as one history group (for example "Remove extra spaces: 439 cells"). Opening the group shows every cell.

## Development rules (approved)

1. Keep all original Stage 4 owner decisions unchanged.
2. Keep processing local on the user's device. Never upload spreadsheets to external servers.
3. Keep the editor lightweight and responsive on low-end Android devices.
4. Avoid unnecessary dependencies.
5. Do not break Stages 1, 2 or 3.
6. No fake buttons or incomplete functionality.
7. Test every feature before reporting it as complete.
8. Verify exported files using DataFixer's reader and an independent reader, as set out in **Export verification (Option A)** below.
9. Document known limitations honestly.
10. Commit and report each completed development step before moving to the next.

## Export verification (Option A, approved by the owner on 11 November 2026)

| # | Requirement |
|---|---|
| V1 | **In the website,** every exported file is read back from its **actual generated bytes** using DataFixer's own reader. It is never checked against the in-memory data it was built from. |
| V2 | The reopened file is compared **cell by cell** against the expected edited data **before** "Export successful" is shown. If any cell differs, or the check can't finish, there is no success message and no download (S3, S4). |
| V3 | **In automated development tests,** CSV exports are independently verified with **Python's `csv` module**. |
| V4 | XLSX exports are independently verified with **openpyxl**. |
| V5 | Untouched XLSX package parts are checked to be **byte-identical** wherever the export design promises this (every part except the edited worksheet and, when the recalculation flag is set, `workbook.xml`). |
| V6 | **Formulas, formatting, merged cells, charts and the other protected features** (S2 table) are verified as kept. |
| V7 | **No extra spreadsheet-reading library** is added to the production website for verification. Python, the `csv` module and openpyxl are used only in development tests and are never shipped to users. |
| V8 | The lightweight, Android-first architecture is preserved. The in-website check runs in the worker, in chunks, within the existing memory budget. |

## What each fix does

| Problem | Fix | Ambiguous? How it's handled |
|---|---|---|
| Extra spaces | Remove leading/trailing spaces, tabs and non-breaking spaces | No |
| Duplicate rows | Delete later exact copies, keep the first | No (decision 1). Excel: reference check first (S2) |
| Empty rows | Delete | No. Excel: reference check first (S2) |
| Empty columns | Delete | No. Named empty columns are listed in the preview so the user can untick them. Excel: reference check first (S2) |
| Numbers stored as text | Convert to real numbers. Values with leading zeros (IDs, postcodes) are never converted | No |
| Inconsistent capitalization | Most common spelling per group | **Ties: the user picks** (decision 2) |
| Inconsistent dates | Convert to one format the **user chooses** | **Ambiguous dates** (e.g. 03/04/2024) are never converted until the user says whether the column is day-first or month-first |
| Phone layouts | Convert to one layout the user chooses | Numbers that can't be reformatted safely are left alone and listed |
| Invalid emails, impossible dates, missing cells, unusual values, formula errors | **No automatic fix.** The user edits the cells | The correct value can't be known, so DataFixer never invents data |

Formula cells are skipped by every automatic fix (S1).

## How it works

### Preview, apply, undo, redo

- Every fix first shows a **preview**: how many cells or rows change, old → new examples, and anything skipped (formula cells, ties, ambiguous dates). Nothing changes until the user taps **Apply**.
- Every applied fix or manual edit becomes one entry in the history (S5). **Undo** and **Redo** step through it.
- After each change the file is **checked again automatically**, so the cards always reflect the current data.

### Memory (low-end Android)

The original data is never copied. Changes are kept as a small **change layer** on top of it, in the worker:

- cell edits (cell key → new value). Original values are read from the unchanged original data, so they aren't stored twice;
- deleted or cleared rows (1 byte per row) and deleted columns;
- the history, with each entry storing only its own changes (for undo, redo and the history view).

The rest of DataFixer (preview, search, sort, scan, export) reads the data through this layer as an "edited view". Before a large fix or an export runs, its memory cost is checked against the existing memory budget.

### CSV download

- UTF-8 **with BOM** (decision 3), the original separator, and correct quoting.
- Built in chunks inside the worker, so a 150 MB file doesn't need one giant string.
- File name: `<original name>-cleaned.csv`.
- Cells starting with `=`, `+`, `-` or `@` are kept exactly as they are (the data isn't changed), and the existing warning still applies.

### Excel download (XLSX)

The download is the **original workbook package** with only the necessary parts changed (decision 4):

- Only the edited worksheet's XML is rewritten, and only the edited cells inside it. Each edited cell keeps its original style. Styles, charts, images, comments, other sheets, defined names and so on are copied byte for byte.
- Edited text cells are written as inline strings, so the shared-strings table doesn't need rebuilding.
- If any formula might use an edited cell, `workbook.xml` is marked to **recalculate when opened**, so no stale results are shown. That small change is listed in the summary.
- Formula cells: see S1. Row and column deletions: see S2.
- **XLS (Excel 97–2003)** files can't be patched in place. The download is a new XLSX, and the user is told first, feature by feature, what won't carry over (S3, requirement 5).
- Password-protected and macro files are already refused when opened.

## Build steps

Each step is tested, committed and reported before the next one starts (rule 10).

| Step | Work | Done when |
|---|---|---|
| 1 | Change layer and edited view, history with **Undo/Redo** and history data (S5) | Unit tests: edits, deletions, clears, undo/redo, history entries, and scan, preview, search and sort over edited data |
| 2 | Safe fixes with preview: spaces, duplicates, empty rows/columns, numbers stored as text. Formula cells skipped (S1) | Exact before/after counts on the test pack. Formula cells untouched |
| 3 | Capitalization (tie → ask), dates (format choice, ambiguity → ask), phone layouts | Ties and ambiguous dates are never changed without a choice |
| 4 | UI: **Fix** on cards, **Fix all safe problems**, preview sheet, Undo/Redo, **change history panel** (S5), automatic re-check. Phone and tablet layouts | Browser tests at phone, tablet and desktop sizes |
| 5 | Manual cell editing (tap a cell, edit, save, undo), with the **formula warning** (S1) | Browser tests, including touch |
| 6 | **CSV download** (UTF-8 BOM), with **in-website verification** (V1, V2), **summary** (S3) and **recoverable export** (S4) | Website: exported bytes reopened by DataFixer's reader and compared cell by cell. Tests: also verified with Python's `csv` module (V3). Failure and cancel keep the history |
| 7 | **Workbook reference scanner** (S2), then **XLSX download** by patching the original package, plus clear-instead-of-delete and feature warnings | Reference tests for every feature in the S2 table. Website: exported bytes reopened by DataFixer's reader (V1, V2). Tests: verified with openpyxl (V4), unedited parts byte-identical (V5), protected features kept (V6) |
| 8 | Cleaner page, 50/100/150 MB export performance and memory tests (including a low-memory heap), test pack with expected results, Stage 4 test report | All tests pass, then the owner tests on the Android tablet and approves |

## Progress

| Step | Status | Commit summary |
|---|---|---|
| 1 | ✅ Done: change layer, edited view, Undo/Redo, history data. 21 new unit tests. Stages 1–3 tests still pass | `src/engine/edit/`, `EngineCore` editing methods |
| 2 | ✅ Done: five safe fixes with preview (spaces, duplicates, empty rows, empty columns, numbers stored as text). Formula cells skipped. 24 new unit tests. On the 25 MB and 50 MB test-pack files every preview count matched the detector exactly (439/3,950 and 873/7,850) | `src/engine/fix/fixes.ts`, `EngineCore.previewFix` / `applyFix` |
| 3–8 | Not started | — |

### Decisions made while building (for owner review)

- **Number conversion** converts only values with one clear meaning: plain numbers, `'45`, `1,234.56` (unless the column also uses decimal commas), and a leading currency sign (`$12` → 12). Percentages, accounting brackets, trailing minus signs, space separators, decimal commas and numbers with more than 15 digits are skipped and listed in the preview with the reason.
- **CSV files have no cell types,** so converted values are written as plain number text (`1250`). Excel files get real numbers and keep each cell's style.
- **Converting a text number can reveal a new "unusual value".** For example, "1,250" in the test pack was hidden as text and is far above its column's usual range. This is correct, and the re-check shows it.
- **Rows or columns in Excel files:** a preview that removes rows or columns from an Excel file is marked `deletesFromExcel`. The workbook reference check (S2) is built in Step 7. Until then, the website (Step 4) will not offer row or column removal for Excel files, so no Excel reference can be broken.

## Testing

- Unit tests for every fix: exact counts, the cases where no change must happen, formula cells skipped, ties and ambiguity, undo and redo, history contents.
- **Round-trip tests (Option A):** every export is reopened from its generated bytes by DataFixer's reader (as the website does), **and** by an independent reader: Python's `csv` module for CSV, openpyxl for XLSX. Both are compared cell by cell. XLSX exports are also checked for byte-identical untouched parts (V5), and for kept styles, formulas, merges, conditional formatting, data validation, charts, tables and named ranges (V6).
- Reference-protection tests: one fixture per feature in the S2 table, confirming that a deletion is blocked and that the explanation names the right feature.
- Failure tests: low memory, cancel during export and a forced verification failure. Each must give no download, no success message, an intact history, and a working retry.
- Browser tests at phone, tablet and desktop sizes.
- Performance and memory tests at 50, 100 and 150 MB, including a low-memory heap.
- A Stage 4 test pack with expected results for the owner's tablet testing.

## Known limitations and open technical risks

R4 is resolved. The others must be resolved, or accepted by the owner, during implementation. None of them conflicts with the approved decisions.

| # | Risk | Plan |
|---|---|---|
| R1 | **Patching XLSX worksheets without loading them whole.** The editor needs a cell-level XML rewriter that streams the sheet (big sheets can't become one string). This is the largest piece of new engineering. | Build it in Step 7 as a streaming rewriter on top of the existing fflate inspection code, with no new dependency. Test it against Excel-, LibreOffice- and openpyxl-made files. |
| R2 | **Shared and array formulas.** In XLSX, one "master" cell can hold a formula used by a whole range. Editing the master or a member needs special care, otherwise other cells lose their formula. | Detect these. Editing such a cell either expands the shared formula safely for the other cells, or is blocked with an explanation. Never break the other cells silently. |
| R3 | **References that can't be checked statically** (`INDIRECT`, `OFFSET`, text-built references, external links, unknown parts). | Treated as "possibly affected" (S2). The safe alternatives are offered instead of deleting. |
| R4 | **In-browser verification uses DataFixer's own reader.** An independent reader such as openpyxl can't run in the browser without a large dependency (rules 3 and 4). | **Resolved: Option A, approved by the owner on 11 November 2026** (V1–V8). Website: every export is reopened from its generated bytes with DataFixer's reader and compared cell by cell before success is shown. Development tests: independent verification with Python's `csv` module (CSV) and openpyxl (XLSX), byte-identical checks for untouched XLSX parts, and checks that protected features are kept. No extra reading library ships in the website. **Accepted limitation:** a single download in the website is checked by DataFixer's reader only. Independence comes from the development tests. |
| R5 | **Verification time and memory on large files.** Re-reading a 150 MB export takes about as long as opening it (about 10–20 s on the tablet, estimated from the Stage 2/3 timings) and needs memory. | Chunked verification that compares row by row without a second full copy. If memory is short, the export stops cleanly (S4). Exact timings will be measured. |
| R6 | **Size of the change history** when a fix touches millions of cells (for example spaces in a 150 MB file). | Store only new values (originals come from the unchanged data), in compact arrays. Page the history view. Budget-check before applying. |
| R7 | **"Export successful" can only cover what DataFixer controls.** DataFixer can build and verify the file, but saving to disk is done by the browser (Android Chrome has no API to confirm the save). | The summary says the file was created and verified. If the browser's download is blocked, the user can tap download again without re-exporting. |
| R8 | **XLS input** can't keep everything. | Exported as XLSX, with a feature-by-feature list of what won't carry over, shown before download (requirement 5, S3). |
| R9 | **Large XLSX files** above about 90 MB (one sheet) can't be opened today (a Stage 2 limit), so they can't be exported either. | No change. This limit is already documented, and the export limit follows the open limit. |
