# Stage 11 plan: Remove Duplicates tool page

**Status:** plan prepared on 27 November 2026. **The owner approved it with decisions A for all (1A–6A) and said “Start Stage 11”.** Progress is recorded under “Progress” below.

## Why

“How to remove duplicates in Excel” is one of the most searched spreadsheet tasks; the owner's Semrush data showed keyword difficulty 28 for it, which a focused page can compete for. MyDataFixer already removes exact duplicate rows inside the Spreadsheet Cleaner and the Error Detector, but there is no page made for that search, and the current fix has no options (whole rows only, exact match only, first copy kept).

## What exists today (reused)

- Finding duplicates: every row is fingerprinted and every match is confirmed cell by cell, so different rows are never treated as copies. Tested up to 150 MB files (Stage 4).
- Removing them: the first copy is kept, rows with formulas are never removed automatically, and Undo, history and download (CSV or Excel) work as for every fix.
- Excel safety: before rows are removed from an .xlsx file, the workbook is checked for anything that refers to them (formulas, charts, names, filters); if something would break, the rows can be cleared instead. Rows are never removed from old .xls files.
- From Stage 10: columns can be added safely (used for “Mark duplicates” below).

## What will be built

1. **Remove Duplicates** tool page (`/remove-duplicates`) with:
   - **Compare by:** all columns (the default), or only the columns you choose, for example “email” only, so two rows with the same email count as duplicates even when other columns differ.
   - **Matching:** exact (the default), with options to ignore capital letters (“Paris” = “PARIS”) and to ignore extra spaces (“Asha Patil ” = “Asha Patil”).
   - **Which copy to keep:** the first (the default) or the last, for example the most recent entry in a list that grows at the bottom.
   - **What to do:** remove the duplicate rows, or **mark** them: add a column “Duplicate of row N” and remove nothing, so the user can check them first or filter them in Excel.
   - **Preview:** how many rows will be removed or marked, and groups of matching rows (“rows 5 and 9 are copies of row 2”), before anything changes. Apply, Undo, Redo, history and download, as on the other tool pages.
2. **Engine:** duplicate finding with chosen columns and the two matching options (the current exact whole-row check stays the default and keeps its tests), keep last, and the mark option, with unit tests.
3. **Content:** the tool page's help (how it works, example, never, limits, FAQs), and the guides as decided below.

No new dependencies. Files stay in the browser.

## Safety rules (unchanged from earlier stages)

- The original file is never changed; downloads are new files, checked before they are offered.
- Rows with formulas are never removed automatically (they are listed in the preview).
- .xlsx: rows aren't removed if anything in the workbook refers to them; the user is offered “clear instead” or “mark instead”.
- .xls: rows are never removed; “mark” and “clear” work.
- Two rows count as duplicates only when every compared cell matches under the chosen rules. Ignoring capitals or spaces affects only the comparison, never the values that are kept.

## Decisions for the owner

1. **Where the tool lives**
   - **A (recommended):** its own page, `/remove-duplicates`, matching the search; the Cleaner and Error Detector keep their one-tap fix.
   - B: options added to the Cleaner's existing fix only (no new page).
2. **Compare by**
   - **A (recommended):** all columns by default, or chosen columns.
   - B: whole rows only, as today.
3. **Matching**
   - **A (recommended):** exact by default, with “ignore capital letters” and “ignore extra spaces” options.
   - B: exact only.
4. **Which copy to keep**
   - **A (recommended):** the first by default, with “keep the last” as an option.
   - B: the first only.
5. **Mark instead of remove**
   - **A (recommended):** offer “Mark duplicates” (adds a “Duplicate of row N” column, removes nothing), also useful for .xls files and protected workbooks.
   - B: remove only.
6. **Guides**
   - **A (recommended):** update the existing guide “How to find and remove duplicate rows in Excel and CSV files” (live since 21 November) to point to the new tool and its options, instead of writing a second guide that would compete with it in search; plus one new guide on a different search, “How to find and highlight duplicates in Excel (without deleting them)”, published on the daily schedule after the guides already queued (from 18 December).
   - B: update the existing guide only.

## Steps (each tested, committed and reported)

1. **Engine:** chosen columns, ignore capitals, ignore extra spaces, keep first or last, mark duplicates; unit tests (including that the current exact check gives the same results as before).
2. **Tool page:** `/remove-duplicates` with the options, preview of the groups, apply, undo, download; browser tests (CSV and Excel, .xls mark-only, references blocking removal, keyboard, axe-core light and dark, phone).
3. **Content:** tool help, the existing guide updated, the new guide (if 6A), related-tool links, sitemap and link preview checks.
4. **Testing and report:** all earlier suites, large files (50/100/150 MB and a 600,000-row .xlsx, including the low-memory run), completion report.

## Known limits (to be stated on the page)

- Only rows that match exactly under the chosen rules are found. Near-duplicates such as “Asha Patil” and “A. Patil”, or different spellings of an address, are not.
- When comparing chosen columns, the kept row keeps its own values in the other columns; values from the removed rows are not merged into it.
- Very large files need a computer or a device with enough memory, as for the other tools.

## Progress

- **Step 1 (engine): done, 27 November 2026.**
  - `src/engine/fix/duplicates.ts`: compare all columns or chosen columns; exact, ignore capital letters, ignore extra spaces (for the comparison only; kept values never change); keep the first or the last copy; remove, or mark in a new “Duplicate” column (“Duplicate of row N”). Rows are fingerprinted and every match is confirmed cell by cell; rows whose compared cells are all empty are never duplicates; a number and the same digits as text are different values; rows with formulas are never removed (and if every duplicate has one, the user is pointed to Mark).
  - `previewDuplicates` in the engine: removing rows from an .xlsx runs the workbook reference check first, and from an .xls is never allowed; in both cases the preview says why and offers clearing the rows instead (or Mark). Marked .xls files can now be downloaded as Excel (the rebuild writes the new column; the download is still checked cell by cell).
  - Tests: 15 new (469 in total), including that the default finds the same rows as the Cleaner's duplicate fix, and CSV, .xlsx and .xls round trips. Speed: about 0.6–1.5 s per million rows, depending on the options.
- **Step 2 (tool page): done, 27 November 2026.**
  - New page `/remove-duplicates` (in the tools registry: menu, footer, homepage list, sitemap; related tools Cleaner, Error Detector, Combine Columns). Accepts .xlsx, .xls, CSV, TSV and TXT.
  - The preview runs as soon as the file is open, with the defaults (all columns, exact, keep the first, remove), and again after every choice; it lists the largest groups of matching rows (kept row, copies, values) and is tied to the exact choices. Options: compare all or chosen columns, ignore capital letters, ignore extra spaces, keep the first or last, remove or mark.
  - When removal is blocked (.xlsx with something referring to the rows, or any .xls), the preview says why and offers “Clear these rows instead” or “Mark them in a new column instead”.
  - Help content (how it works, example, never, limits, FAQs) describes only tested behaviour.
  - Tests: new browser suite `npm run test:duplicates`, 31/31 (options, keep last, remove, undo/redo, CSV download, mark, Excel with a filter: blocked → clear, or mark and download with the filter and bold header kept; .xls marked and downloaded as .xlsx; keyboard; axe-core light and dark; phone 390 px). All other suites pass: smoke 121, SEO 41, a11y 71, split 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62. The smoke and SEO checks were updated for the eighth tool (menu 8 tools, sitemap 13 fixed pages).
- **Step 3 (content and related links): done, 27 November 2026.**
  - Updated the live guide “How to find and remove duplicate rows in Excel and CSV files”: its main tool is now Remove Duplicates; the MyDataFixer steps describe the new options (chosen columns, ignore capitals and spaces, keep first or last, mark); “Rows that almost match” and three FAQs updated; updated date 27 November 2026.
  - New guide 29 “How to find and highlight duplicates in Excel (without deleting them)” (`/guides/find-duplicates-in-excel`, about 1,140 words) on 18 December 2026 at 12:30 pm India time, after the guides already queued: conditional formatting, COUNTIF with a growing range, COUNTIFS for several columns, UNIQUE, Google Sheets, and MyDataFixer's Mark option. The two guides link to each other.
  - Checked with the guide clock at 18 December 1 pm: both guides 200 and in the sitemap; SEO 63/63; link previews complete and images load; both guides link to /remove-duplicates and the tool page lists both; axe-core clean in light and dark; no horizontal scroll at 390 px. With today's date the new guide is 404 and absent from the sitemap, and the updated guide is live with the new link; smoke 118, SEO 41, a11y 71, duplicates 31 pass. Unit 470 (schedule test updated for guide 29).
- **Step 4 (testing and report): done, 27 November 2026.** All suites pass on the final build (unit 470; duplicates 31, smoke 122, seo 41, a11y 71, split 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62, large 64). New large-file test `test:duplicates-perf`: 50/100/150 MB CSV and a 600,000-row .xlsx all ok, exactly the planted duplicates removed, originals unchanged; low-memory (512 MB): 50 and 100 MB ok, 150 MB stopped safely when opening. The Excel run found an Apply bug (a second preview replacing the first one's token), fixed on all three column/row tool pages. Report: `docs/stage-11-test-report.md`.
