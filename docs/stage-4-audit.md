# Stage 4 completion audit

**Date:** 12 November 2026 · **Code audited:** commit `c509ecf` (branch `claude/datafixer-platform-zi4mqv`)

The owner asked for Stage 4 to be audited before it is called production-ready. Every result below comes from a run on the audited code, unless it says otherwise.

## 1. Requirements checked against the code

Every requirement in `docs/stage-4-plan.md` was checked against the implementation. Five gaps were found and fixed in commit `c509ecf`:

| Gap found | Fix | Verified by |
|---|---|---|
| S4: a failed Excel download only offered “Try again”, not the safer CSV option | The error now offers **“Download as CSV instead”** | Browser test: an Excel download refused (shared formula) → CSV fallback downloaded and verified |
| S3: no warning that rows cleared instead of removed **remain as empty rows** | Added to the download summary (Excel and CSV) | Unit test; browser test on the reference workbook |
| S2: the blocked-removal warning didn't mention the CSV alternative | Text added | Visual check in the code (wording only) |
| **Silent data loss:** leaving the page (reload, close, or a link) discarded undownloaded changes without asking | Browser “Leave site?” warning on reload/close; confirmation on links to other pages; no warning after a download | Browser test (link, reload, after download) |
| Plan claimed memory is checked “while the export runs” and a lower-memory Excel check | Plan corrected to what is built (checked before start; CSV streams in bounded pieces; CSV is the lower-memory option) | Documentation |

All other requirements were found implemented as described: owner decisions 1–4, requirements 1–8, S1–S5, V1–V8 and the ten development rules. The table in `docs/stage-4-test-report.md` lists how each one is tested.

## 2. The five decisions in the owner's latest message

These are the **Stage 5 (CSV Validator)** decisions. As the owner asked, they are recorded with their detailed requirements in `docs/stage-5-plan.md` and **not built yet** (no Stage 5 work started). The parts that concern Stage 4's existing CSV export were verified now:

| Requirement | Stage 4 status |
|---|---|
| UTF-8 with BOM as the default | ✅ every CSV download (unit tests check the bytes; browser test checks the real downloaded file; tablet-downloaded files checked) |
| Values preserved exactly, including special characters, quotes and separators | ✅ round trips verified by DataFixer's reader and Python's `csv` module: comma, semicolon and (new in this audit) tab separators; quotes, separators and line breaks inside values; accents, emoji; CRLF and LF |
| Choice of separator, line endings, “UTF-8 without BOM” | Not in Stage 4 (it keeps the original separator and line endings). Planned for Stage 5 |
| Text encoding selector | Not in Stage 4. Planned for Stage 5 |
| Validation strictness (uneven rows, headers) | The CSV Validator itself is Stage 5 |

## 3. Tests run on the audited code

| Suite | Result |
|---|---|
| Type check (`tsc --noEmit`) | ✅ pass |
| Lint (`eslint`) | ✅ pass, 0 warnings |
| Production build (`next build`) | ✅ pass |
| Unit tests (`npm test`) | ✅ **288 / 288** |
| Fixing browser test (`npm run test:fix`) | ✅ **126 / 126** |
| Error Detector browser test (`npm run test:detector`), Stage 3 | ✅ **33 / 33** |
| Engine browser test (`npm run test:engine`), Stage 2 | ✅ **62 / 62** |
| Smoke test (`npm run test:smoke`), Stages 1–2 | ✅ **114 / 114** |
| 150 MB limit test (`npm run test:large`), Stage 2 | ✅ **64 / 64** |
| Large-file workflow, normal memory (`npm run test:export-perf`, `XLSX=1`) | ✅ 4 / 4 (table below) |
| Large-file workflow, 512 MB heap (`HEAP_MB=512`) | ✅ 2 completed, 2 stopped safely, 0 crashes (table below) |

**Failed:** none.

### What these cover

- **Exports:** CSV verified by DataFixer's reader (in the website) and Python's `csv` module (tests). XLSX verified by DataFixer's reader and openpyxl, with byte-identical untouched parts. Formatting, conditional formatting, data validation, charts, comments, images, links, named ranges and hidden sheets confirmed kept. calcChain removed only when a formula is replaced. Shared-formula and array cases refused with a reason. .xls rebuilt with the measured losses listed.
- **Undo/Redo, previews, manual editing:** unit tests for the edit session (25), browser tests for Undo, Redo, history details, the cell editor, and stale-preview refusal.
- **Formula protection:** automatic fixes skip formula cells, and rows/columns containing formulas are never removed. Editing a formula needs an explicit tick. Other formulas are preserved (openpyxl check).
- **Excel feature preservation and the reference check:** removal blocked by a chart and a formula on another sheet; “clear instead” keeps every position (openpyxl check).
- **Export verification and failure recovery:** damaged, truncated and BOM-less files fail verification, so nothing is offered. Cancel and low memory download nothing and keep all changes, and retry works. A failed Excel download offers CSV.
- **Broken buttons and console errors:** the browser tests click every Stage 4 button (Fix, Fix all, Apply, Cancel, Undo, Redo, History, Details, Download, Download again, the CSV fallback, cell editor Save/Cancel, the Cleaner tools) and check for console and page errors: **none**.
- **Privacy:** no uploads or off-site requests during fixing and downloading (browser test).

### Large-file workflow (Chromium, desktop: open → check → Fix all → re-check → download)

| File | Normal memory | 512 MB heap |
|---|---|---|
| CSV 50 MB (822,938 rows) | ✅ fix all 12.2 s, download 2.6 s, peak +442 MB | ✅ fix all 11.6 s, download 2.6 s, peak +348 MB |
| CSV 100 MB (1.62M rows) | ✅ fix all 25.5 s, download 5.5 s, peak +801 MB | ✅ fix all 24.5 s, download 5.1 s, peak +506 MB |
| CSV 150 MB (2.42M rows) | ✅ fix all 38.7 s, download 7.7 s, peak +1,086 MB | Stopped safely when opening (Stage 2 limit for this memory) |
| XLSX 13 MB (600,000 rows) | ✅ fix all 6.1 s, Excel download 17.5 s | Stopped safely when opening (Stage 2 limit) |

Every downloaded CSV started with the BOM, and every original file was unchanged (SHA-256).

## 4. Android results (owner's tablet, 12 November 2026)

All five tablet tests passed; the details are in the test report:
- A: CSV fix and download (file checked here);
- B: Excel download (file checked here: only 2 parts changed);
- C: reference protection, including “Clear the cells instead”;
- D: 50 MB with exact counts and the download confirmed;
- E: the Cleaner page.

The audit fixes from commit `c509ecf` (leave guard, CSV fallback, cleared-rows warning) have **not** been tried on the tablet yet.

## 5. Not yet tested

- **Android phone** (only phone-size screens in Chromium were tested), iOS/Safari and Firefox.
- **Large Excel files on the tablet** (only 7 KB workbooks were tested there).
- **Excel itself and LibreOffice opening the downloaded .xlsx files.** openpyxl was used as the independent reader (the approved Option A), and the owner's tablet opened them in DataFixer. Opening them in Microsoft Excel has not been done.
- **The Stage 2/3 performance harness** (`npm run test:perf`) was not re-run in this audit. Opening and checking large files is covered by the export-perf runs above.

## 6. Known limitations

- “Fix all” is the slowest step on very large files: about 39 s at 150 MB on desktop, and about 1 minute for 50 MB on the tablet.
- Excel downloads re-read the whole new workbook for verification. On low-memory devices, large workbooks may only download as CSV (the page offers it).
- Rows and columns are never removed when anything refers to them. References are not rewritten; clearing is offered instead.
- .xls files: rebuilt as .xlsx without fonts/colours/borders, conditional formatting, data validation, charts or images (listed). Rows are never removed from .xls files.
- A shared formula's first cell, and cells inside multi-cell array formulas, can't be changed in an Excel download (explained; CSV offered).
- Strict Open XML and ZIP64 workbooks: CSV download only.
- Only one Excel sheet is held at a time. Switching sheets asks first if there are undownloaded changes.
- Changes exist only in the open tab until downloaded (there is now a warning before leaving).
- The CSV download keeps the original separator and line endings. Choosing them is Stage 5.
- **Header (column-name) cells can't be tapped to edit.** The workaround is to untick “First row contains column names”, then edit row 1.
- **Cell editing is by touch or mouse only:** table cells can't be reached with the keyboard yet. This is an accessibility gap for Stage 7.

## 7. Remaining bugs and risks

- **No known open bugs.** All gaps found in this audit were fixed and re-tested.
- **Risk:** files from unusual producers (very old Excel versions, other spreadsheet apps) may use XML layouts not covered by the test files. The Excel download is verified before it is offered, so the user gets an error with the CSV option rather than a broken file.
- **Risk:** browser memory limits differ between devices. The memory budget stops work before a crash in every case tested, but phones have not been tested.

## 8. Before launch (not Stage 4 code; owner actions or later stages)

1. Merge this branch into the main branch, or set it as Vercel's production branch.
2. Set `NEXT_PUBLIC_SITE_URL` to the real address (canonical links, sitemap).
3. Add a contact email (`NEXT_PUBLIC_CONTACT_EMAIL`), or keep the Contact page's honest “not published yet” text.
4. Open a few downloaded .xlsx files in Microsoft Excel (and Google Sheets) as a final real-world check.
5. Test on at least one Android phone.
6. The CSV Validator, converters and SEO/accessibility work are Stages 5–7. Those tool pages still say “being built”, with no upload control, as before.
