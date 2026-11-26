# Stage 10 completion report: Split a Column and Combine Columns

**Date:** 26 November 2026

**Status:** draft. Step 5 final runs in progress.

The owner approved the plan (`docs/stage-10-plan.md`) on 26 November 2026 with decisions **A for all**: two separate tool pages (1A); split at a chosen separator, first or every (2A); combine keeps the originals by default (3A); a space by default between combined values, with comma, dash, none or custom (4A); one guide per tool after guide 16 (5A).

## Changes

| Part | Change |
|---|---|
| Edit engine | Columns can now be **added**: they sit after the kept original columns, are stored as plain lists by original row, and count in the view, CSV output, stats (“columns added”) and history. Undo removes them and Redo restores them. Cells in added columns can't be edited or removed by hand, and one change can't add columns and edit cells together. |
| Excel downloads | Added columns are written into the original .xlsx as new cells after the original columns, the sheet range is widened, and the result is read back and compared cell by cell before it is offered. Formatting, formulas and other sheets stay as they were. Old .xls files are refused for these tools. |
| Split rules | Separator: space, comma, semicolon, dash, tab or any text; first separator only or every separator; parts to keep (the last part keeps the rest); trim spaces (also around the whole value); don't split inside double quotes. Values without the separator, and numbers, go into the first new column, so removing the original never loses data. Formula cells are never split. Refused with the reason past 16,384 columns. |
| Combine rules | Two or more columns in the chosen order; space (default), comma and space, dash, nothing or any text between values; skip empty values (default) without extra separators; values joined as they appear in the sheet (an Excel date reads 2024-03-15, not 45366). A combined value over 32,767 characters is left empty and counted. |
| Removing originals | Optional for both tools (off by default). For .xlsx files the existing reference check runs first; if a filter, name or formula refers to the columns, they are kept and the preview says why. |
| Tool pages | `/split-column` and `/combine-columns`: controls, a preview of the first rows tied to the exact choices (an older preview can never be applied), Apply, the shared changes bar (Undo, Redo, history, download), help content (how it works, example, never, limits, FAQs) and their guides. Both are in the tools registry, so they appear in the menu, footer, homepage list, sitemap and related tools; they show each other first under “Related tools”. |
| Guides | Guide 17 “How to split a cell in Excel” (6 December 2026) and guide 18 “How to combine two columns in Excel” (7 December 2026), 12:30 pm India time, about 1,350 and 1,100 words. The ten guides that were set for 6–15 December now publish on 8–17 December (none was published yet). |

No new dependencies. Files are still processed only in the browser, and the original file is never changed.

## Tests (final run)

| Suite | Result |
|---|---|
| Type check, lint | ✅ pass, 0 warnings |
| Unit tests (`npm test`) | ✅ 453 / 453 (Stage 10 adds 50): split and combine text rules (15), added columns in the edit session (10), split and combine plans applied through the session (13), EngineCore previews, apply, stale previews, CSV and Excel round trips, reference check, .xls refused, dates joined as shown (9), guide schedule and order (2), plus the stats field in existing tests |
| Split a Column in the browser (`test:split`, new) | ✅ 28 / 28 |
| Combine Columns in the browser (`test:combine`, new) | ✅ 29 / 29 |
| Earlier suites | _Pending: final run in progress._ |
| Guides (clock set to 7 December, 1 pm) | ✅ both guides live and in the sitemap, the 8 December guide still hidden; SEO 50 / 50; link previews (title, description, image, article type, Twitter card; image loads); each tool page lists its guide; axe-core clean in light and dark; no sideways scrolling at 390 px. With today's date both guides are hidden. |
| Large files (`test:split-combine-perf`, new) | ✅ all ok; every row in the downloaded file, originals unchanged (SHA-256). See below. |

### Large files

Chromium, the whole workflow on each tool page: open, preview, apply, create + verify + download.

| File | Tool | Open | Preview | Apply | Create + verify + download | Peak extra memory | Downloaded file |
|---|---|---|---|---|---|---|---|
| CSV 50 MB (846,654 rows) | Split | 1.3 s | 0.8 s | 0.1 s | 2.2 s | 631 MB | all 846,655 lines, header ok |
| | Combine | 1.3 s | 0.3 s | 0.1 s | 2.1 s | 585 MB | all 846,655 lines, header ok |
| CSV 100 MB (1,668,160 rows) | Split | 2.3 s | 1.3 s | 0.1 s | 4.1 s | 932 MB | all 1,668,161 lines, header ok |
| | Combine | 2.3 s | 0.9 s | 0.1 s | 4.5 s | 892 MB | all 1,668,161 lines, header ok |
| CSV 150 MB (2,484,927 rows) | Split | 3.9 s | 1.9 s | 0.2 s | 6.7 s | 1,354 MB | all 2,484,928 lines, header ok |
| | Combine | 3.9 s | 0.9 s | 0.1 s | 7.2 s | 1,380 MB | all 2,484,928 lines, header ok |
| XLSX 12 MB (600,000 rows) | Split | 6.9 s | 0.8 s | 0.1 s | 25.1 s | 1,639 MB | 18.7 MB .xlsx, checked cell by cell |
| | Combine | 6.9 s | 0.4 s | 0.1 s | 19.4 s | 1,429 MB | 17.3 MB .xlsx, checked cell by cell |

**Low-memory run (JS heap capped at 512 MB):** _pending, run in progress._

The first measurement found memory use too high (150 MB split: 1,878 MB; 600,000-row Excel split: 1,922 MB). Two changes brought it down (above): added columns are stored as plain lists instead of one map entry per cell, and the split preview counts the parts first and writes them straight into the new columns. Apply on 150 MB went from 1.4 s to 0.2 s.

**Found during Stage 10 and fixed (each re-tested):**
- A value without the separator (or a number) went into no new column, so “remove the original” would have lost it; it now goes into the first new column.
- Excel downloads couldn't hold added columns at first; the patcher now writes them and widens the sheet range.
- A preview could be applied for older choices while a typed separator was still waiting to refresh; previews are now tied to their exact choices.
- Combining an Excel date gave its serial number (45366); values are now joined as shown.
- With trim on, a value starting with a space gave an empty first part; the whole value is trimmed first.
- Memory use on large files (see above).

## Remaining limitations

- New columns are always added at the right of the sheet, not next to the original column.
- Cells in added columns can't be edited by hand on these pages; Undo removes the whole change.
- Old .xls files are not supported by these tools (save as .xlsx first).
- A separator that also appears inside a value splits it too (the preview shows this; quoted values can be protected).
- The combined column holds text, so sums and date filters don't work on it.
- Peak memory on the largest files is higher than for the Cleaner's “Fix all” (about 1.4 GB extra at 150 MB CSV, 1.6 GB for a 600,000-row Excel download), so very large files need a computer or a recent phone with enough memory.
- The quick site-wide check (`test:smoke`) finds a slightly different number of links from run to run (119–122), because some guide links load after the page opens; nothing fails in any run.

## Approval

Waiting for the owner's approval.
