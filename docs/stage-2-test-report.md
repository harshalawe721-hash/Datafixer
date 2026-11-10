# Stage 2 test report: spreadsheet engine

**Date:** 10 November 2026 · **Status: Stage 2 is not complete.** The CSV path is finished and tested. XLSX/XLS cell reading is waiting for the official SheetJS package (see `vendor/README.md`), so the XLSX figures below cover the safety inspection only, not reading cell data.

## Test environment (important)

All browser numbers come from **headless Chromium on a Linux cloud machine**. **No** real Android phone, iPhone, Mac, Windows PC, tablet, Safari or Firefox has been tested. The only browser installed here is Chromium. Real-device results must be collected with the `/diagnostics` page on each device. Until then, no device or browser compatibility is claimed.

## Automated tests

| Suite | Command | Result |
|---|---|---|
| Unit tests (file validation, CSV reader, XLSX inspection, compact grid, query layer, engine core, memory-budget helpers) | `npm test` | **100 / 100 pass** |
| Engine end-to-end in the browser (real UI, worker, production CSP) | `npm run test:engine` | **42 / 42 pass** |
| Site smoke test (pages, SEO, navigation, theme, upload, mobile) | `npm run test:smoke` | **114 / 114 pass** |
| 150 MB upload-limit boundaries (picker and drag-and-drop) | `npm run test:large` | see "Regression checks" below |
| Lint / type check / production build | `npm run lint`, `npm run typecheck`, `npm run build` | clean |

What the end-to-end test covers: CSV summary counts; search; numeric sort; pagination; header toggle; separator override; multi-byte text; XLSX sheet list, hidden sheets, declared sizes, chart and macro notices, the honest "not available yet" for cell data; XLS message; DOCTYPE workbook rejected; truncated workbook shows a "damaged" message; recovery after an error; Cancel and retry on a 60 MB CSV; homepage handoff; no page-level horizontal scroll on a phone-width screen; **no requests to other hosts and no POST/PUT requests**; no console errors; SHA-256 of the source file unchanged.

## Problems found and fixed during Stage 2

| Problem (verified) | Fix |
|---|---|
| Papa Parse's own file reader decodes each byte slice separately, so characters split across slices were corrupted ("Café" became "Caf�") | DataFixer reads slices itself with a streaming `TextDecoder` and passes decoded text to Papa Parse. Tested with 7-byte slices. |
| Papa Parse's separator guess fails on tiny files and silently falls back to a comma (`a;b⏎1;2⏎` was read as one column) | DataFixer detects the separator itself from the start of the file, choosing the most consistent column count |
| One string per cell used 5.1–7.9 × the file size in memory | `CompactTextGrid` uses 1.7–2.2 × |
| A worker running out of memory **crashes the whole tab** in Chromium, with no catchable error | A memory budget stops parsing with a clear message first. Verified with a 256 MB heap cap: clear error, no crash, the next file opens. |
| Sorting a text column of 2.1M rows took 8.7 s | Precomputed sort keys: 3.1 s for the 150 MB CSV (1M rows: about 1.2 s in Node) |

## Performance: default Chromium (heap limit about 4 GB)

Peak renderer RSS includes the page itself (baseline about 118 MB) and memory the browser had not yet given back. "Max frame gap" is the longest pause between screen updates while the file was processed; 17 ms is one frame at 60 Hz, so the page never froze.

| Case | File size | Outcome | Time | Peak renderer RSS | Max frame gap | Sort (2nd column) | Search (full scan) | SHA-256 unchanged |
|---|---|---|---|---|---|---|---|---|
| CSV, 6 columns | 50 MB | Opened | 1.8 s | 421 MB | 17 ms | 2.7 s* | 0.5 s | ✅ |
| CSV, 6 columns | 100 MB | Opened | 2.3 s | 547 MB | 17 ms | 5.2 s* | 1.5 s | ✅ |
| CSV, 6 columns | 150 MB | Opened | 3.3 s | 712 MB | 17 ms | **3.1 s** | 1.5 s | ✅ |
| CSV, 40 numeric columns | 150 MB | Opened | 4.4 s | 769 MB | 50 ms | 0.4 s | 1.6 s | ✅ |
| CSV, Unicode, quoted fields | 100 MB | Opened | 2.8 s | 592 MB | 17 ms | 6.9 s* | 1.5 s | ✅ |
| XLSX, 1 sheet | 47 MB (254 MB of XML) | Structure and safety check OK; cells: "not available yet" | 4.9 s | 568 MB | 17 ms | — | — | ✅ |
| XLSX, 1 sheet | 97 MB (528 MB of XML) | **Refused:** the sheet expands to more than 500 MB | 8.9 s | 526 MB | 17 ms | — | — | ✅ |
| XLSX, 1 sheet | 147 MB (804 MB of XML) | **Refused:** the sheet expands to more than 500 MB | 9.4 s | 571 MB | 17 ms | — | — | ✅ |
| XLSX, 6 sheets | 147 MB (792 MB of XML) | Structure and safety check OK; cells: "not available yet" | 13.4 s | 432 MB | 17 ms | — | — | ✅ |
| XLSX with formulas | 47 MB | Structure and safety check OK; cells: "not available yet" | 4.3 s | 558 MB | 17 ms | — | — | ✅ |
| XLSX, heavily compressed | 47 MB (588 MB of XML) | **Refused:** the sheet expands to more than 500 MB | 5.8 s | 842 MB | 17 ms | — | — | ✅ |

\* Measured before the sort-key change; the 150 MB rows were re-measured after it.

### Cancellation

| Case | Cancelled at | Time until stopped | Renderer memory 2 s later | SHA-256 unchanged |
|---|---|---|---|---|
| CSV 150 MB | 40 % | **46 ms** | 149 MB above baseline | ✅ |
| XLSX 147 MB, 6 sheets | 30 % | **43 ms** | 88 MB above baseline | ✅ |

Cancel terminates the worker, which frees its heap. The remaining RSS above baseline is memory the browser keeps for reuse; it is not held by DataFixer.

## Low-memory environment

Chromium with its JavaScript heap capped at 512 MB (`HEAP_MB=512`; the reported limit is about 630 MB), to imitate a device with little memory. DataFixer's memory budget is then about 280 MB.

| Case | File size | Outcome | Time | Peak renderer RSS | Max frame gap | SHA-256 unchanged |
|---|---|---|---|---|---|---|
| CSV, 6 columns | 50 MB | Opened | 1.8 s | 341 MB | 17 ms | ✅ |
| CSV, 6 columns | 100 MB | Opened | 2.3 s | 399 MB | 17 ms | ✅ |
| CSV, 6 columns | 150 MB | **Stopped safely:** "too large to open safely … needs roughly 320 MB" | 2.8 s | 492 MB | 17 ms | ✅ |
| CSV, 40 columns | 150 MB | **Stopped safely:** "needs roughly 440 MB" | 2.8 s | 531 MB | 17 ms | ✅ |
| CSV, Unicode | 100 MB | Opened | 2.8 s | 515 MB | 17 ms | ✅ |
| XLSX, 1 sheet | 47 MB | Structure and safety check OK; cells: "not available yet" | 4.3 s | 492 MB | 17 ms | ✅ |
| XLSX, 6 sheets | 147 MB | Structure and safety check OK; cells: "not available yet" | 12.9 s | 492 MB | 17 ms | ✅ |

**No tab crashed.** With a 256 MB cap (tested earlier), a 100 MB CSV was stopped after 1.8 s with the clear message, and a small file opened afterwards in the same tab. Before the memory budget existed, that same test crashed the tab.

A capped heap in desktop Chromium is only an approximation of a phone. Real phones also have slower CPUs, and the operating system can kill a browser tab that uses too much memory overall. Real-device numbers are still needed (see `/diagnostics`).

## Conclusions

1. **CSV up to 150 MB works in desktop Chromium**: 3–4.5 s with no frozen screen and about 0.6 GB of peak memory. On devices with less memory, the memory budget stops parsing with a clear message instead of crashing the tab.
2. **Single-sheet XLSX files above about 90 MB can't be read by a SheetJS-based reader in a browser.** Their sheet XML exceeds the maximum length of a JavaScript string (about 536 million characters in Chromium). They are refused up front with a clear explanation. Multi-sheet workbooks whose individual sheets are smaller pass inspection. Whether SheetJS can then parse them within memory can only be measured once the package is installed. Supporting large single-sheet XLSX files would need a streaming XLSX reader, which would be a separate decision.
3. **Inspection costs time:** a 147 MB XLSX takes 9–13 s just for the safety check. That is the price of verifying actual decompressed sizes and scanning for unsafe XML before parsing.
4. **Not yet measured:** XLSX/XLS cell parsing (SheetJS not installed), and any real device or non-Chromium browser.

## Regression checks

Run after all Stage 2 changes:

| Suite | Result |
|---|---|
| `npm test` | 100 / 100 pass |
| `npm run test:smoke` | 114 / 114 pass |
| `npm run test:engine` | 42 / 42 pass |
| `npm run test:large` (50/100/149/150 MB accepted, 150 MB + 1 byte and 151 MB rejected; picker and drag-and-drop; SHA-256 unchanged) | 64 / 64 pass |
| `/diagnostics` at 1280 px and 390 px wide: test runs, Cancel works, results shown, `noindex` present, not in the sitemap, no POST requests, no console errors | Pass (manual Playwright script) |
| Lint, type check, production build | Clean |
