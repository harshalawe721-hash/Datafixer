# Stage 4 development plan: automatic fixing, editing and clean downloads

**Status:** plan approved by the project owner on 11 November 2026. **Implementation has not started.** It starts only when the owner says so.

Stages 1–3 are complete (see `README.md`, `docs/stage-2-test-report.md`, `docs/stage-3-test-report.md`).

## Goal

Turn DataFixer from "find problems" into "find **and fix** problems":

> Upload → see the problems explained → preview the fixes → apply → check, undo or redo → download a new, clean file

Fixing appears directly on the Error Detector's problem cards, and the Spreadsheet Cleaner page uses the same engine for people who go straight to it.

## Owner decisions (approved)

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
9. Carried over from earlier stages: lightweight on low-end Android, no unnecessary dependencies, don't break Stages 1–3, test every feature before calling it complete, no fake or non-working buttons.

## What each fix does

| Problem | Fix | Ambiguous? How it's handled |
|---|---|---|
| Extra spaces | Remove leading/trailing spaces, tabs and non-breaking spaces | No |
| Duplicate rows | Delete later exact copies, keep the first | No (decision 1) |
| Empty rows | Delete | No |
| Empty columns | Delete | No. Named empty columns are listed in the preview so the user can untick them |
| Numbers stored as text | Convert to real numbers. Values with leading zeros (IDs, postcodes) are never converted | No |
| Inconsistent capitalization | Most common spelling per group | **Ties: the user picks** (decision 2) |
| Inconsistent dates | Convert to one format the **user chooses** | **Ambiguous dates** (e.g. 03/04/2024) are never converted until the user says whether the column is day-first or month-first |
| Phone layouts | Convert to one layout the user chooses | Numbers that can't be reformatted safely are left alone and listed |
| Invalid emails, impossible dates, missing cells, unusual values, formula errors | **No automatic fix.** The user edits the cells | The correct value can't be known, so DataFixer never invents data |

## How it works

### Preview, apply, undo, redo

- Every fix first shows a **preview**: how many cells or rows change, plus old → new examples. Nothing changes until the user taps **Apply**.
- Every applied fix or manual edit becomes one entry in a history. **Undo** and **Redo** step through it. A change counter shows how many edits are pending.
- After each change the file is **checked again automatically**, so the cards always reflect the current data.

### Memory (low-end Android)

The original data is never copied. Changes are kept as a small **change layer** on top of it, in the worker:

- cell edits (cell key → new value),
- deleted rows (1 byte per row) and deleted columns,
- the history, with each entry storing only its own changes (for undo and redo).

The rest of DataFixer (preview, search, sort, scan) reads the data through this layer as an "edited view". Before a large fix is applied, its memory cost is checked against the existing memory budget, and the user gets a clear message instead of a crash.

### CSV download

- UTF-8 **with BOM** (decision 3), the original separator, and correct quoting.
- Built in chunks inside the worker, so a 150 MB file doesn't need one giant string.
- File name: `<original name>-cleaned.csv`.
- Cells starting with `=`, `+`, `-` or `@` are kept exactly as they are (the data isn't changed), and the existing warning still applies.

### Excel download (XLSX)

The download is the **original workbook package** with only the necessary parts changed (decision 4):

- Only the edited worksheet's XML is rewritten, and only the edited cells inside it. Styles, charts, images, comments, other sheets, defined names and so on are copied byte for byte.
- Edited text cells are written as inline strings, so the shared-strings table doesn't need rebuilding.
- If formulas elsewhere might depend on edited cells, the workbook is marked to **recalculate when opened**, so no stale results are shown.
- **Editing a cell that contains a formula** replaces the formula with the typed value. The editor warns about this first.

**Limits, stated honestly and shown to the user before download (requirement 5):**

- **Deleting rows or columns in Excel files** (duplicates, empty rows, empty columns) moves everything below or to the right. Formulas, merged cells, conditional formatting, data validation, charts, tables and named ranges may refer to those positions. The plan:
  - If the sheet has none of these features in or after the affected area, rows and columns are deleted normally.
  - If it does, DataFixer explains exactly which features are affected, and the user chooses: **clear** the rows instead of deleting them (positions stay the same, so nothing breaks), download as **CSV**, or cancel. References are never silently broken.
- **XLS (Excel 97–2003)** files can't be patched in place. The download is a new XLSX, and the user is first told which features won't carry over.
- Password-protected and macro files are already refused when opened.

## Build steps

Each step is tested, committed and reported before the next one starts.

| Step | Work | Done when |
|---|---|---|
| 1 | Change layer and edited view, history with **Undo/Redo** | Unit tests: edits, deletions, undo/redo, and scan, preview, search and sort over edited data |
| 2 | Safe fixes with preview: spaces, duplicates, empty rows/columns, numbers stored as text | Exact before/after counts on the test pack |
| 3 | Capitalization (tie → ask), dates (format choice, ambiguity → ask), phone layouts | Ties and ambiguous dates are never changed without a choice |
| 4 | UI: **Fix** on cards, **Fix all safe problems**, preview sheet, Undo/Redo bar, automatic re-check. Phone and tablet layouts | Browser tests, including phone and tablet sizes |
| 5 | Manual cell editing (tap a cell, edit, save, with undo) | Browser tests, including touch |
| 6 | **CSV download** (UTF-8 BOM) | Exported files **reopened** by DataFixer's reader and an independent reader, contents verified cell by cell |
| 7 | **XLSX download** by patching the original package, plus the feature warnings | Reopened by DataFixer and an independent reader (openpyxl). Unedited package parts are **byte-identical**. Formatting, formulas, charts and merges are verified as kept |
| 8 | Cleaner page, 150 MB performance and memory tests, test pack with expected results, Stage 4 test report | All tests pass, then the owner tests on the Android tablet and approves |

## Testing (requirement 6)

- Unit tests for every fix: exact counts, the cases where no change must happen, ties and ambiguity, undo and redo.
- **Round-trip tests:** every export is reopened and compared with the expected data, cell by cell. XLSX exports are also checked for byte-identical untouched parts, and for kept styles, formulas, merges and charts.
- Browser tests at phone, tablet and desktop sizes, including Cancel during long operations.
- Performance and memory tests at 50, 100 and 150 MB, including a low-memory heap.
- A Stage 4 test pack with expected results for the owner's tablet testing.
- No feature is reported as working until its tests pass.
