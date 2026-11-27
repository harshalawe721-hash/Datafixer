# Stage 13 plan: TSV to CSV

**Status:** plan prepared on 27 November 2026. **The owner approved it with decisions A for all (1A–5A) and said “Start Stage 13”.** Progress is recorded under “Progress” below.

## Why

TSV (tab-separated values) files come from databases, Google Sheets (“Download → Tab-separated values”), analytics and research tools, and many exports named .txt. Many programs only accept CSV, and double-clicking a TSV often puts everything in one column. “tsv to csv” is a common conversion search; no search volumes have been checked yet, so the owner can add Ahrefs or Semrush numbers before deciding.

## What exists today (reused)

- Reading: the CSV reader already detects tab, comma, semicolon and pipe separators and the text encoding, and keeps every value exactly as written (leading zeros, long numbers). Tested up to 150 MB.
- Writing: the verified CSV download already supports a chosen separator (comma, semicolon or tab), line endings (Windows or Mac/Linux) and a UTF-8 BOM, and reads the new file back cell by cell before offering it (CSV Validator, Stage 5).
- Excel: the CSV to Excel conversion (codes keep their zeros, numbers and year-month-day dates become real values) works for any file the CSV reader opens.
- Structure check: the CSV Validator's checks (rows with a different number of fields, broken quotes, encoding) can run on a TSV file too.

So this stage is mostly a page made for the search, with the right defaults, plus a guide; the engine changes are small.

## What will be built

1. **TSV to CSV page** (`/tsv-to-csv`): open a .tsv or .txt file (or a .csv that really uses tabs).
   - The separator found is shown (“Tabs”), and can be changed if the guess is wrong (tab, pipe, semicolon, comma).
   - A short structure check, as on the CSV to Excel page: if rows have a different number of fields or quotes are broken, the page says so and links to the CSV Validator with the same file.
   - Download options: separator (comma by default), line endings and BOM, as decided below. Values that contain the new separator, quotes or line breaks are quoted correctly, so they stay in one cell.
   - Excel download, if decided.
   - The usual table preview, and the help content (how it works, example, never, limits, FAQs).
2. **Guide**, as decided below.

No new dependencies. Files stay in the browser.

## Technical notes

- The upload box accepts .tsv and .txt as text files already; `.tab` is added (some tools use it for TSV).
- TSV has no standard for quotes: most TSV files never quote values, but some do. The reader already handles both; values with tabs or line breaks inside them are reported by the structure check instead of being silently split.
- Downloads are read back cell by cell before they are offered, as for every other download.

## Decisions for the owner

1. **Pages**
   - **A (recommended):** one page, `/tsv-to-csv`, whose download can also be tab-separated, so CSV → TSV is covered on the same page (mentioned in its text and FAQ).
   - B: two pages, `/tsv-to-csv` and `/csv-to-tsv`.
2. **Download options**
   - **A (recommended):** comma by default, with semicolon (for countries that use a decimal comma) and tab; line endings and BOM under “More options” (Windows line endings and a BOM by default, which Excel reads correctly).
   - B: comma only, fixed settings.
3. **Excel download**
   - **A (recommended):** also offer “Download Excel (.xlsx)”, using the CSV to Excel rules (codes keep their zeros, numbers and dates become real values).
   - B: CSV only.
4. **Structure check**
   - **A (recommended):** run the quick check on open and show problems with a link to the CSV Validator (no repairs on this page).
   - B: no check.
5. **Guide**
   - **A (recommended):** one guide, “How to convert a TSV file to CSV (and open TSV files in Excel)”, 1,000–1,500 words, published on the daily schedule after guide 31 (21 December 2026).
   - B: no guide.

## Steps (each tested, committed and reported)

1. **Page:** `/tsv-to-csv` with separator detection and choice, structure check, download options, Excel download; `.tab` accepted; engine tests for TSV edge cases (values with commas and quotes, empty fields, a missing final line break, quoted TSV, mixed line endings); browser tests (downloads read back, options, keyboard, axe-core light and dark, phone).
2. **Guide and related links:** the guide, related tools (CSV Validator, CSV to Excel, Excel to CSV), sitemap and link preview checks.
3. **Testing and report:** all earlier suites, large files (50/100/150 MB TSV, including the low-memory run), completion report.

## Known limits (to be stated on the page)

- A value with a tab inside it can't be told apart from two values unless it is quoted; the structure check points such rows out.
- Very large files need a computer or a device with enough memory, as for the other tools.

## Progress

- **Step 1 (page): done, 27 November 2026.** New page `/tsv-to-csv` for .tsv, .txt, .tab and .csv files (in the tools registry; related tools CSV Validator, CSV to Excel, Excel to CSV). It shows the separator found (changeable above the table), runs the CSV Validator's structure check with a link that opens the same file in the Validator, and downloads CSV with a comma (default), semicolon or tab, Windows (default) or Mac/Linux line endings and an optional BOM (on by default), or an Excel workbook. TSV, TXT and TAB files turned into CSV are named after the file (export.txt → export.csv). Tests: 8 engine tests for TSV edge cases (518 unit tests in total); new browser suite `npm run test:tsv`, 21/21; all other suites pass (smoke 124, SEO 48, a11y 71, json 25, csv-json 19, duplicates 31, split 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62); the smoke and SEO checks were updated for the eleventh tool.
- **Step 2 (guide and related links): done, 27 November 2026.** Guide 32 “How to convert a TSV file to CSV (and open TSV files in Excel)” (`/guides/convert-tsv-to-csv`, about 1,000 words) on 21 December 2026 at 12:30 pm India time. Checked with the guide clock at 21 December 1 pm: 200 and in the sitemap; SEO 72/72; link preview complete; links to /tsv-to-csv and the tool page lists it; axe-core clean in light and dark; no horizontal scroll at 390 px. With today's date it is 404 and absent from the sitemap. Unit 519.
- **Step 3 (testing and report): done, 27 November 2026.** New large-file test `test:tsv-perf`: TSV 50/100/150 MB to CSV (and Excel at 50 MB) all ok, exact line counts, values with commas and quotes quoted correctly, originals unchanged; low-memory (512 MB): 50 and 100 MB ok, 150 MB stopped safely when opening. No product bugs found. Report: `docs/stage-13-test-report.md`.
