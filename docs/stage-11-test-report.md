# Stage 11 completion report: Remove Duplicates

**Date:** 27 November 2026

**Status:** ✅ **Steps 1–4 complete; waiting for the owner's approval.**

The owner approved the plan (`docs/stage-11-plan.md`) on 27 November 2026 with decisions **A for all**: its own page (1A); compare all or chosen columns (2A); exact matching with “ignore capital letters” and “ignore extra spaces” (3A); keep the first or the last copy (4A); “Mark duplicates” as well as remove (5A); the existing guide updated and one new guide on finding and highlighting duplicates (6A).

## Changes

| Part | Change |
|---|---|
| Engine | `src/engine/fix/duplicates.ts`: compare all columns or chosen columns; exact, or ignoring capital letters and/or extra spaces (for the comparison only: kept values never change); keep the first or the last copy; remove the other copies or mark them in a new “Duplicate” column (“Duplicate of row N”). Rows are fingerprinted and every match is confirmed cell by cell; rows whose compared cells are all empty never match; a number and the same digits as text never match; rows with formulas are never removed. About 0.6–1.5 s per million rows. |
| Excel safety | Removing rows from an .xlsx runs the existing workbook reference check first (formulas, charts, names, filters); from an .xls it is never allowed. The page then explains why and offers “Clear these rows instead” or “Mark them in a new column instead”. Marked .xls files can now be downloaded as Excel (the rebuild writes the new column, still checked cell by cell). |
| Tool page | `/remove-duplicates` (Excel .xlsx/.xls, CSV, TSV, TXT): the preview runs as soon as the file is open and after every choice, lists the largest groups of matching rows (kept row, copies, values), and is tied to the exact choices; Apply, Undo, Redo, history and download as on the other tools. In the tools registry (menu, footer, homepage list, sitemap); related tools: Cleaner, Error Detector, Combine Columns. Help content: how it works, example, never, limits, FAQs. |
| Guides | The live guide “How to find and remove duplicate rows in Excel and CSV files” now points to Remove Duplicates and describes its options (updated 27 November). New guide 29 “How to find and highlight duplicates in Excel (without deleting them)”, 18 December 2026 at 12:30 pm India time (about 1,140 words). The two guides link to each other. |

No new dependencies. Files are still processed only in the browser, and the original file is never changed. The Cleaner's and Error Detector's one-tap duplicate fix is unchanged.

## Tests (final run)

| Suite | Result |
|---|---|
| Type check, lint | ✅ pass, 0 warnings |
| Unit tests (`npm test`) | ✅ 470 / 470 (Stage 11 adds 16): all/chosen columns, keep first/last, ignore capitals and spaces (kept values unchanged), mark, empty rows, numbers vs text, formula rows, messages, group examples, the default finding exactly the same rows as the Cleaner's fix, CSV, .xlsx (blocked by a filter → clear; without references → removed and read back) and .xls (never removed; marked and downloaded as Excel), and guide 29's date |
| Remove Duplicates in the browser (`test:duplicates`, new) | ✅ 31 / 31: preview on open, options, chosen columns, keep last, remove, Undo/Redo, CSV download, mark, Excel with a filter (blocked → clear; mark and download with the filter and bold header kept, no rows removed), .xls marked and downloaded as .xlsx, keyboard, axe-core light and dark (0 findings), phone 390 px, no browser errors |
| Earlier suites (final build) | ✅ smoke 122, seo 41, a11y 71, split 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62, large 64 |
| Guides (clock set to 18 December, 1 pm) | ✅ both guides live and in the sitemap; SEO 63 / 63; link previews complete, images load; both guides link to /remove-duplicates and the tool page lists both; axe-core clean in light and dark; no sideways scrolling at 390 px. With today's date the new guide is hidden and the updated guide is live with the new link. |
| Large files (`test:duplicates-perf`, new) | ✅ all ok; exactly the planted duplicates removed; originals unchanged (SHA-256). See below. |

### Large files

Chromium, on the Remove Duplicates page: open, the automatic preview (all columns, exact, keep the first, remove), apply, create + verify + download. Every 200th row is a planted exact copy, so the downloaded file must have exactly that many rows fewer.

| File | Open | Preview | Apply | Create + verify + download | Peak extra memory | Downloaded file |
|---|---|---|---|---|---|---|
| CSV 50 MB (843,956 rows) | 2.4 s | 2.4 s | 0.1 s | 4.7 s | 416 MB | exactly 4,219 rows removed |
| CSV 100 MB (1,663,051 rows) | 3.9 s | 3.9 s | 0.1 s | 8.9 s | 701 MB | exactly 8,315 rows removed |
| CSV 150 MB (2,477,303 rows) | 4.5 s | 5.9 s | 0.1 s | 12.0 s | 903 MB | exactly 12,386 rows removed |
| XLSX 12 MB (600,000 rows) | 8.0 s | 1.9 s | 0.1 s | 19.4 s | 1,003 MB | 3,000 rows removed, checked cell by cell |

**Low-memory run (JS heap capped at 512 MB):** 50 MB ✅ ok (312 MB); 100 MB ✅ ok (473 MB; Split and Combine stop safely at this size because they write into every row, removing duplicates doesn't); 150 MB stopped safely when opening (“too large to open safely … needs roughly 320 MB”), the known limit for this memory. No crashes; originals unchanged.

**Found during Stage 11 and fixed (each re-tested):**
- **Apply refused on a large Excel file** (found by the 600,000-row test): loading the column list re-rendered the panel with the same choices and started a second preview after the first had finished; the second replaced the engine's pending token while the first preview's Apply button was shown, so Apply said “The data changed after this preview” (nothing was changed, but the user was stuck). Each panel now sends one request per set of choices. The same pattern existed on the Split and Combine pages and was fixed there too; their browser tests pass.
- Marked .xls files couldn't be downloaded as Excel (a Stage 10 safeguard); the rebuild now writes the new column, and the download is still checked cell by cell.
- A lint warning (unused variable) slipped into the first Step 1 commit; fixed in the next commit.

## Remaining limitations

- Only rows that match under the chosen rules are found; near-duplicates such as “Asha Patil” and “A. Patil” are not.
- When comparing chosen columns, the kept row keeps its own values in the other columns; nothing is merged from the removed rows.
- A number and the same digits stored as text (12 and “12”) count as different values.
- Row numbers in the preview and in “Duplicate of row N” are the rows as they are now; if rows were removed earlier in the same session, they can differ from the row numbers in the table.
- Removal from .xls files is never possible (mark or clear instead); removal from .xlsx is blocked when something in the workbook refers to the rows.
- The quick site-wide check (`test:smoke`) finds a slightly different number of links from run to run (118–122), because some guide links load after the page opens; nothing fails in any run.

## Approval

Waiting for the owner's approval.
