# Stage 10 plan: Split a column and Combine columns

**Status:** plan prepared on 26 November 2026. **The owner approved it with decisions A for all (1A–5A) and said “Start Stage 10”.** Progress is recorded under “Progress” below.

## Why

Search data (Ahrefs free generator, US bands): "how to split a cell in excel" and "how to combine two columns in excel" are both above 1,000 searches a month and rated Easy. They are the strongest keyword finds so far, and both tools match them directly.

## What will be built

1. **Split a column** (tool page `/split-column`): splits one column into two or more, at a separator the user chooses (space, comma, semicolon, dash, tab, or a custom text), or at a fixed number of characters.
   - Example: "Asha Patil" → "Asha" | "Patil"; "Pune, Maharashtra" → "Pune" | "Maharashtra".
   - Options: how many parts to keep, split on the first or every separator, trim spaces around the parts.
   - Preview of every changed cell, with the new columns named (for example "name (1)", "name (2)").
2. **Combine columns** (tool page `/combine-columns`): joins two or more columns into a new column, in the order the user chooses, with a separator between values (space, comma, dash, none, or custom text).
   - Example: "Asha" + "Patil" → "Asha Patil"; "Pune" + "Maharashtra" → "Pune, Maharashtra".
   - Options: keep or remove the original columns; skip empty parts without adding extra separators.
   - Preview of the first rows, with the new column named by the user.
3. **Shared behaviour:** both tools show a preview, Apply, Undo/Redo, download as CSV or Excel, and a plain-language note of what changed. Both keep the original file unchanged.
4. **Content:** each tool page has a short intro, the example, and a guide (1,000–1,500 words, simple language) published on the daily schedule after the existing guides.

No new dependencies. Files stay in the browser.

## Technical notes

- **Split and combine change the number of columns**, which the current fixes don't do (they only change or remove cells). The engine needs a column insert/remove path that keeps the Excel workbook valid and warns about formulas that refer to shifted columns, following the references check already used for "remove columns".
- **Formulas:** cells that contain formulas are never changed. If removing an original column would break a formula elsewhere, the original is kept and the user is told.
- **.xls files:** columns cannot be inserted safely in the old format, so these tools work on CSV and .xlsx only, stated on the page (the same rule as removing rows in .xls).
- **Excel limits:** combine results longer than 32,767 characters, or outputs that would exceed 16,384 columns, are refused with the reason.
- **Memory:** both tools use the same memory budget and 150 MB limit as the other tools.

## Decisions for the owner

1. **Where the tools live**
   - **A (recommended):** two separate tool pages (`/split-column`, `/combine-columns`), because each keyword matches a page of its own.
   - B: inside the Spreadsheet Cleaner, like Change case (no separate page for the keyword).
2. **Split options**
   - **A (recommended):** separator (space, comma, semicolon, dash, tab, custom) plus "split at first separator only" or "every separator".
   - B: separator only.
3. **Combine: original columns**
   - **A (recommended):** keep the original columns by default; the user can tick "remove the originals".
   - B: always remove the originals.
4. **Separator between combined values**
   - **A (recommended):** a space by default, with a choice of comma, dash, none, or custom text.
   - B: space only.
5. **Guides**
   - **A (recommended):** one guide per tool, published on the daily schedule after guide 16 (from 6 December), so the two guides join the queue in order.
   - B: one guide covering both tools.

## Steps (each tested, committed and reported)

1. **Engine:** the column insert/remove path with formula and reference checks, and the split and combine plans, with unit tests (names, addresses, empty parts, separators inside quotes, formulas, Excel limits).
2. **Split a column:** tool page, preview, apply, undo, download; browser tests.
3. **Combine columns:** tool page, preview, apply, undo, download; browser tests.
4. **Guides and related links:** one guide per tool, related-tool links, sitemap and link preview checks.
5. **Testing and report:** all earlier suites, accessibility (keyboard, axe-core, light and dark), phone layout, large-file check, completion report.

## Known limits (to be stated on the pages)

- Splitting on a separator that also appears inside a value (for example "Lee, Jr, Ahmed") can give unexpected parts; the preview shows this before anything changes.
- .xls files are not supported for these tools.
- Combined values that contain the separator are not quoted automatically in CSV output beyond what CSV already requires.

## Progress

- **Step 1 (engine): done, 26 November 2026.**
  - Added columns in the edit session: they sit after the kept original columns, count in the view, CSV download, stats and history, and Undo/Redo removes and restores them. Cells in added columns can't be edited or removed.
  - Excel (.xlsx) downloads write the added columns into the original file as new cells; the sheet range is widened. Old .xls files are refused for these tools.
  - Split and combine plans: split keeps the original column by default (removing it is an option) and keeps values without the separator, and numbers, as the first part, so removing the original never loses data. Combine keeps the originals by default. Formula cells are never split. Refused with a reason past 16,384 columns; combined values over 32,767 characters are left empty and counted.
  - Removing originals from an .xlsx runs the existing reference check; if it would break a filter, name or formula, the originals are kept and the preview says why.
  - Engine API: `previewSplit` and `previewCombine`, applied with `applyFix`.
  - Tests: 450 unit tests pass (45 new); browser fix suite 126/126 (Excel downloads re-read with openpyxl).
