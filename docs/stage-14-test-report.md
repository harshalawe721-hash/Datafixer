# Stage 14 completion report: XML to CSV

**Date:** 27 November 2026

**Status:** ✅ **COMPLETE.** Approved by the owner on 27 November 2026.

The owner approved the plan (`docs/stage-14-plan.md`) on 27 November 2026 with decisions **A for all**: one page with CSV and Excel downloads (1A); records found automatically, with a choice (2A); repeated children joined with “; ” (3A); attribute columns named after the attribute, @name only on a clash (4A); up to 150 MB, read in pieces (5A); one guide on 22 December (6A).

## Changes

| Part | Change |
|---|---|
| XML reader | `src/engine/xml/parse.ts`: a streaming reader written for the tool (the browser's own XML reader isn't available in the worker). It checks that the document is well formed and explains the first mistake with line and column. For safety it never loads external files and refuses documents that declare their own entities (protecting against “billion laughs” and file-reading tricks); only the five standard entities and character codes are understood; nesting over 1,000 levels is refused. |
| XML → table | `src/engine/xml/table.ts`: pass 1 finds repeating elements and suggests the records (elements with fields first, most numerous first; the root as one row when nothing repeats); pass 2 builds the rows: child elements and attributes as columns, nested elements as dotted columns, repeated children joined with “; ”, @name only on a clash, namespace prefixes kept (g:price), namespace declarations ignored, data outside the records noted. |
| Opening XML | .xml accepted at upload; the encoding is taken from a BOM or the XML declaration (UTF-8, UTF-16, ISO-8859-1, Windows-1252 …; unknown ones refused); both passes stream the file in pieces with a safe memory stop; the result is a text table, so the verified CSV download (named after the file) and the CSV to Excel rules apply. |
| Tool page | `/xml-to-csv`: record choice, notes on joined values, data left out and the encoding used, CSV (comma, Windows line endings, BOM) and Excel downloads checked before they are offered, help content. In the tools registry; related tools JSON to CSV, CSV to Excel, TSV to CSV. |
| Guide | Guide 33 “How to convert XML to CSV or Excel”, 22 December 2026 at 12:30 pm India time (about 1,090 words). |

No new dependencies. Files stay in the browser.

## Tests (final run)

| Suite | Result |
|---|---|
| Type check, lint | ✅ pass, 0 warnings |
| Unit tests (`npm test`) | ✅ 541 / 541 (Stage 14 adds 22): reader events identical when fed in pieces of 1–13 characters, entity declarations refused, 13 kinds of mistake with line and column, deep nesting; a product feed with g: fields, customers with nested address and an attribute clash, repeated phones, a sitemap, simple values, mixed content, an accounting-style export, a file where nothing repeats; ISO-8859-1 and UTF-16 files, 50,000 records across piece boundaries, the memory stop, downloads, the upload check; guide 33's date |
| XML to CSV in the browser (`test:xml`, new) | ✅ 23 / 23: product feed (summary, data left out, g: prefixes, leading zeros, entities), axe-core light and dark, CSV and Excel downloads read back, record choice (products before tags), joined values, keyboard, an ISO-8859-1 file, invalid XML with line and column, entity declarations refused, phone 390 px |
| Earlier suites (same build) | ✅ smoke 122, seo 50, a11y 71, tsv 21, json 25, csv-json 19, duplicates 31, split 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62 |
| Guide (clock set to 22 December, 1 pm) | ✅ live and in the sitemap; SEO 75 / 75; link preview complete; links to /xml-to-csv and the tool page lists it; axe-core clean in light and dark; no sideways scrolling at 390 px. With today's date it is hidden. |
| Large files (`test:xml-perf`, new) | ✅ all ok; exact line counts; columns and joined values right; originals unchanged (SHA-256). See below. |

### Large files

Records with an attribute, nested fields, two repeated tags and an entity each.

| File | Open (two passes) | Downloads (create + check) | Peak extra memory | Result |
|---|---|---|---|---|
| XML 50 MB (266,000 records) | 4.4 s | CSV 1.0 s, Excel 10.3 s | 554 MB | CSV exactly 266,001 lines; Excel 10.4 MB, checked cell by cell |
| XML 100 MB (532,000 records) | 8.4 s | CSV 1.7 s | 612 MB | CSV exactly 532,001 lines |
| XML 150 MB (798,000 records) | 11.5 s | CSV 2.5 s | 837 MB | CSV exactly 798,001 lines |

**Low-memory run (JS heap capped at 512 MB):** 50 MB ✅ ok (466 MB); 100 MB ✅ ok (496 MB); 150 MB stopped safely while being read (“too large to open safely… Nothing was changed”). No crashes; originals unchanged.

**Found during Stage 14 and fixed (each re-tested):**
- The reader reported a mistake when a piece of text ended right after “<!” (it couldn't yet see whether a comment, CDATA or DOCTYPE followed); it now waits for more text. Found by the test that feeds the file in pieces of every size.
- “The most repeated element” chose repeated fields (several `<phone>` or `<LEDGER>`) over the records; elements with fields of their own now come first.
- Namespace declarations (`xmlns`) on the root element counted as data left out; they are now ignored.
- The guide's first draft was 980 words; a worked example brought it over the 1,000-word minimum.

## Remaining limitations

- Repeated elements inside one record, and text mixed with child elements, are joined in one cell.
- Documents that define their own entities in a `<!DOCTYPE>` are refused for safety.
- XML that isn't a list of similar records gives a table that may not be useful.
- When the memory stop triggers, its message gives the device's memory budget as the amount needed (“roughly 285 MB or more”); the real need can be higher.

## Approval

The owner approved Stage 14 on 27 November 2026 (“Approve”).
