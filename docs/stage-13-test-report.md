# Stage 13 completion report: TSV to CSV

**Date:** 27 November 2026

**Status:** draft. The 150 MB low-memory case is still running.

The owner approved the plan (`docs/stage-13-plan.md`) on 27 November 2026 with decisions **A for all**: one page that also makes TSV from CSV (1A); comma by default with semicolon and tab, line endings and BOM under “More options” (2A); an Excel download (3A); a structure check with a link to the CSV Validator (4A); one guide on 21 December (5A).

## Changes

| Part | Change |
|---|---|
| Tool page | `/tsv-to-csv` for .tsv, .txt, .tab and .csv files: shows the separator found (tabs, commas, semicolons or pipes; changeable above the table), runs the CSV Validator's structure check with a link that opens the same file in the Validator, and downloads CSV with a comma (default), semicolon or tab, Windows (default) or Mac/Linux line endings and an optional UTF-8 BOM (on by default), or an Excel workbook (codes keep their zeros, numbers become numbers). Every download is read back and checked before it is offered. Help content: how it works, example, never, limits, FAQs. In the tools registry; related tools CSV Validator, CSV to Excel, Excel to CSV. |
| Download name | TSV, TXT and TAB files turned into CSV are named after the file (export.txt → export.csv); other downloads keep their names. |
| Guide | Guide 32 “How to convert a TSV file to CSV (and open TSV files in Excel)”, 21 December 2026 at 12:30 pm India time (about 1,000 words). |

No new dependencies; the existing reader, verified CSV writer and CSV to Excel conversion are reused. Files stay in the browser.

## Tests (final run)

| Suite | Result |
|---|---|
| Type check, lint | ✅ pass, 0 warnings |
| Unit tests (`npm test`) | ✅ 519 / 519 (Stage 13 adds 9): tabs detected; commas, quotes, zeros and empty fields kept; CSV quoting; line endings, BOM and semicolon; a missing final line break and mixed line endings; quoted TSV with a tab inside a value; download names for .tsv, .txt, .tab and .csv; the structure check on a ragged TSV; TSV to Excel; guide 32's date |
| TSV to CSV in the browser (`test:tsv`, new) | ✅ 21 / 21: separator found, structure check (with the quote warning, and clean), default download (comma, Windows line endings, BOM, quoting), semicolon/Mac/no BOM, Excel download read back, CSV → TSV, .txt and .tab files, a broken file reported and opened in the CSV Validator, keyboard, axe-core light and dark, phone 390 px |
| Earlier suites (same build) | ✅ smoke 124, seo 48, a11y 71, json 25, csv-json 19, duplicates 31, split 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62 |
| Guide (clock set to 21 December, 1 pm) | ✅ live and in the sitemap; SEO 72 / 72; link preview complete, image loads; links to /tsv-to-csv and the tool page lists it; axe-core clean in light and dark; no sideways scrolling at 390 px. With today's date it is hidden. |
| Large files (`test:tsv-perf`, new) | ✅ all ok; exact line counts; values with commas and quotes quoted correctly; originals unchanged (SHA-256). See below. |

### Large files

| File | Open | Downloads (create + check) | Peak extra memory | Result |
|---|---|---|---|---|
| TSV 50 MB (1,012,917 rows) | 1.9 s | CSV 3.7 s, Excel 26.2 s | 678 MB | CSV exactly 1,012,918 lines, quoted correctly; Excel 28.7 MB, checked cell by cell |
| TSV 100 MB (2,025,814 rows) | 3.4 s | CSV 7.2 s | 710 MB | CSV exactly 2,025,815 lines, quoted correctly |
| TSV 150 MB (3,038,659 rows) | 4.9 s | CSV 11.3 s | 969 MB | CSV exactly 3,038,660 lines, quoted correctly |

**Low-memory run (JS heap capped at 512 MB):** 50 MB ✅ ok (CSV 4.3 s, Excel 27 s, peak 541 MB); 100 MB ✅ ok (CSV 7.3 s, peak 536 MB); 150 MB _pending_.

**Found during Stage 13 and fixed:** no product bugs. Test corrections: the structure check rightly gives one warning for a quote inside an unquoted value (`says "hi"`), so the test now expects it and checks a clean file separately; a test called the download with its options in the wrong position; `Blob.text()` drops a leading BOM, so the BOM is checked in the bytes.

## Remaining limitations

- A value with a tab inside it can't be told apart from two values unless it is quoted; the structure check points out rows that don't line up.
- When converting to Excel, the CSV to Excel rules apply (only year-month-day dates become dates; other dates stay text).
- The quick site-wide check (`test:smoke`) finds a slightly different number of links from run to run, because some guide links load after the page opens; nothing fails in any run.

## Approval

Waiting for the owner's approval.
