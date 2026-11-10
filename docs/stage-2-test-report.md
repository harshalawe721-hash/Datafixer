# Stage 2 test report: spreadsheet engine

**Date:** 10 November 2026

**Status:** implemented. All automated tests that can run in the development environment pass. Two items need the project owner and are **not** done: an independent checksum comparison for SheetJS, and real-device testing (see the end of this report).

## Test environment (important)

All browser numbers come from **headless Chromium on a Linux cloud machine** (4 CPU threads, JavaScript heap limit about 4 GB). The only browser installed here is Chromium. **No** real Android phone, iPhone, Mac, Windows PC, tablet, Safari or Firefox has been tested, and no device or browser compatibility is claimed. Use `/diagnostics` on each target device to collect real numbers.

Test workbooks were produced by **openpyxl and LibreOffice**, which are independent of SheetJS, and the encrypted workbook by msoffcrypto-tool. No workbook saved by Microsoft Excel itself was available in this environment.

## Automated tests

| Suite | Command | Result |
|---|---|---|
| Unit tests | `npm test` | **123 / 123 pass** |
| Engine end-to-end in the browser (real UI, worker, production CSP) | `npm run test:engine` | **62 / 62 pass** |
| Site smoke test (pages, SEO, navigation, theme, upload, mobile) | `npm run test:smoke` | **114 / 114 pass** |
| 150 MB upload limit (picker and drag-and-drop, boundaries, SHA-256) | `npm run test:large` | **64 / 64 pass** |
| `/diagnostics` at 1280 and 390 px (run, cancel, `noindex`, no POST, no errors) | manual Playwright script | pass |
| Lint, type check, production build | `npm run lint`, `npm run typecheck`, `npm run build` | clean |

### What the Excel tests check (`tests/engine/excel.test.ts`, 22 tests, plus e2e)

| Area | XLSX | XLS | Notes |
|---|---|---|---|
| Text including Unicode and emoji, numbers, booleans | ✅ | ✅ | |
| Number formats shown as Excel shows them (`10.50`, `1,234.57`, `2024-01-31`); raw values kept | ✅ | ✅ | |
| 1904 date system | ✅ | — | |
| Error values (`#DIV/0!`, `#N/A`) recorded and highlighted | ✅ | ✅ | |
| Formulas kept as text, with saved results; cross-sheet formulas | ✅ | ✅ | Never calculated |
| Formulas without a saved result (openpyxl) kept and reported | ✅ | — | |
| Hyperlinks, merged cells | ✅ | ✅ | |
| Hidden rows and columns, row heights, column widths | ✅ | ✅ | XLSX: read by the safety inspection |
| Hidden, very hidden and chart sheets | ✅ | ✅ | LibreOffice saves "very hidden" as hidden |
| Sheet switching; only one sheet kept in memory | ✅ | ✅ | |
| Unicode sheet names | ✅ | ✅ | |
| Empty workbooks | ✅ | ✅ | |
| Password-protected | ✅ clear message | — | |
| Damaged or truncated | ✅ | ✅ | |
| Memory budget refusal | ✅ (file info kept) | ✅ | |
| Emoji stored as numeric references (SheetJS bug) restored; ambiguous cases warned | ✅ | n/a | |
| Prototype-pollution names (CVE-2023-30533 class) | ✅ no pollution | | regression guard |
| Pathological XML (CVE-2024-22363 class) | ✅ under 5 s | | regression guard |
| Formula text that looks like code is never evaluated | ✅ | | |

## Problems found and fixed during Stage 2

| Problem (verified) | Fix |
|---|---|
| Papa Parse's file reader corrupted characters split across slices ("Café" became "Caf�") | Own streaming `TextDecoder`, then Papa Parse on decoded text |
| Papa Parse's separator guess failed on tiny files (`a;b⏎1;2⏎` read as one column) | Own separator detection |
| One string per CSV cell used 5.1–7.9 × the file size | `CompactTextGrid`: 1.7–2.2 × |
| Running out of worker memory **crashes the whole tab** in Chromium | Memory budget: stops first with a clear message |
| Text sort of 2.1M rows took 8.7 s | Precomputed sort keys: about 3 s |
| **SheetJS styles option made parsing 9–11 × slower** (800k cells: 24 s) | XLSX layout read by our own inspection; SheetJS styles off for XLSX (800k cells: 2.2 s) |
| Without styles, **SheetJS dropped formulas that have no saved result** | `sheetStubs: true` keeps them |
| **SheetJS 0.20.3 corrupts characters above U+FFFF written as numeric references** (emoji in openpyxl or pandas files became U+F600) | Detected during inspection; restored when unambiguous, warned otherwise. The package is not modified. |
| SheetJS decompresses all parts of an XLSX, and parses **all** sheets of an XLS, regardless of the sheet requested | Memory estimates calibrated to that: XLSX ≈ file + 2 × all XML + 100 B per cell; XLS ≈ 42 × file |
| Encrypted XLSX reported as "damaged" by the engine | Specific "password-protected" message |
| Diagnostics page never started its test | Fixed |

## Memory measurements in V8 (Node 22, same engine as Chrome)

Peak = maximum of heap plus typed-array memory while reading. Retained = what stays after reading.

| File | Data | Time | Peak | Retained | Estimate before reading |
|---|---|---|---|---|---|
| CSV 100 MB, 6 columns (1.5M rows) | 9.0M cells | 2.3 s | 397 MB | 220 MB | — |
| CSV 50 MB, 40 columns | 13.8M cells | 1.8 s | 368 MB | 88 MB | — |
| XLSX 7 MB (37 MB of XML) | 0.8M cells | 2.4 s | 186 MB | 42 MB | 206 MB |
| XLSX 47 MB (254 MB of XML) | 5.3M cells | 15.3 s | 1,028 MB | 221 MB | 1,404 MB |
| XLSX 47 MB with formulas | 4.9M cells | 15.2 s | 1,052 MB | 289 MB | 1,362 MB |
| XLSX 147 MB, 6 sheets (first sheet: 119 MB of XML) | 2.5M cells | 13.5 s | 1,857 MB | 58 MB | 2,132 MB |
| XLS 50 MB, 6 sheets | 3.1M cells in all sheets | 10.3 s | 2,022 MB (40 × file) | — | 2,121 MB |

The estimates are 9–37% above the measured peak, so they refuse a file before it can exhaust memory without being needlessly strict.

## Performance in the browser: default Chromium (heap limit about 4 GB, budget about 1.8 GB)

Peak renderer RSS includes the page itself (baseline about 118 MB). "Max frame gap" is the longest pause between screen updates during processing; 17 ms is one frame at 60 Hz.

| Case | File size | Outcome | Time | Peak renderer RSS | Max frame gap | Sort | Search | SHA-256 unchanged |
|---|---|---|---|---|---|---|---|---|
| CSV, 6 columns | 50 MB | Opened | 1.8 s | 388 MB | 17 ms | 1.0 s | 0.5 s | ✅ |
| CSV, 6 columns | 100 MB | Opened | 2.3 s | 561 MB | 17 ms | 1.8 s | 1.0 s | ✅ |
| CSV, 6 columns | 150 MB | Opened | 3.3 s | 649 MB | 17 ms | 3.2 s | 2.0 s | ✅ |
| CSV, 40 columns | 150 MB | Opened | 4.9 s | 818 MB | 50 ms | 0.6 s | 2.1 s | ✅ |
| CSV, Unicode and quotes | 100 MB | Opened | 2.8 s | 624 MB | 33 ms | 3.3 s | 1.5 s | ✅ |
| XLSX, 1 sheet | 47 MB (254 MB of XML, 5.3M cells) | **Opened** | 17.9 s | 1,209 MB | 17 ms | 0.3 s | 1.0 s | ✅ |
| XLSX with formulas | 47 MB (4.9M cells) | **Opened** | 17.4 s | 1,187 MB | 17 ms | 0.3 s | 1.0 s | ✅ |
| XLSX, 1 sheet | 97 MB (528 MB of XML) | Refused: the sheet expands to more than 500 MB | 9.4 s | 406 MB | 17 ms | — | — | ✅ |
| XLSX, 1 sheet | 147 MB (804 MB of XML) | Refused (same reason) | 9.4 s | 569 MB | 17 ms | — | — | ✅ |
| XLSX, 6 sheets | 147 MB (792 MB of XML) | File info shown; sheet refused by the memory budget (needs about 2.1 GB) | 14.9 s | 418 MB | 17 ms | — | — | ✅ |
| XLSX, heavily compressed | 47 MB (588 MB of XML) | Refused: the sheet expands to more than 500 MB | 6.9 s | 894 MB | 17 ms | — | — | ✅ |
| XLS, 3 sheets | 20 MB | **Opened** | 2.8 s | 681 MB | 17 ms | 0.1 s | 0.5 s | ✅ |
| XLS | 51 MB | Refused before reading: "save as .xlsx" advice (needs about 2.1 GB) | 0.1 s | — | 17 ms | — | — | ✅ |
| XLS | 101 MB | Refused before reading (same) | 0.1 s | — | 17 ms | — | — | ✅ |

### Cancellation

| Case | Cancelled at | Time until stopped | Memory 2 s later (above baseline) | SHA-256 unchanged |
|---|---|---|---|---|
| CSV 150 MB | 40 % | 57 ms | 149 MB | ✅ |
| XLSX 147 MB, 6 sheets | 30 % (during inspection) | 44 ms | 87 MB | ✅ |

Cancel terminates the worker, which frees its heap. Remaining RSS is memory the browser keeps for reuse.

## Low-memory environment (JavaScript heap capped at 512 MB; budget about 280 MB)

This approximates a device with little memory. Real phones also have slower CPUs, and the operating system can close tabs, so real-device numbers are still needed.

| Case | Outcome | Time | Peak renderer RSS |
|---|---|---|---|
| CSV 50 MB | Opened | 1.8 s | 341 MB |
| CSV 100 MB | Opened | 2.3 s | 399 MB |
| CSV 100 MB, Unicode | Opened | 2.8 s | 515 MB |
| CSV 150 MB (6 and 40 columns) | Stopped safely after 2.8 s with "too large to open safely … needs roughly 320 / 440 MB" | 2.8 s | 492–531 MB |
| XLS 5 MB | **Opened** | 1.3 s | 341 MB |
| XLSX 10 MB | Sheet refused by the budget (estimate about 310 MB); file info shown | 1.3 s | 305 MB |
| XLSX 47 MB (normal and formulas) | Sheet refused by the budget; file info shown | 4.8 s | about 490 MB |
| XLS 20 / 51 MB | Refused before reading, with "save as .xlsx" advice | 0.1 s | — |

**No tab crashed in any test.** With a 256 MB cap, a 100 MB CSV was stopped after 1.8 s and a small file opened afterwards in the same tab. Before the memory budget existed, that test crashed the tab.

## Conclusions

1. **CSV up to 150 MB works in desktop Chromium**: 2–5 s with no frozen screen. Smaller devices get a clear refusal, never a crash.
2. **XLSX works up to about 50 MB of compressed single-sheet data** in desktop Chromium: about 18 s for 5M cells, with a responsive screen. Larger single-sheet files hit the browser's maximum string length (about 500 MB of sheet XML) and are refused with an explanation. Large multi-sheet files depend on available memory, because SheetJS decompresses the whole workbook.
3. **XLS works for smaller files.** About 20 MB opens on desktop. Above about 40 MB the file is refused, because SheetJS parses every sheet (about 40 × the file size in memory), and the message advises saving as XLSX.
4. **On low-memory devices** the conservative budget refuses medium Excel files (10 MB XLSX and up at a 512 MB heap). That is safe but strict. Real-device measurements from `/diagnostics` will show whether it can be relaxed.
5. Supporting single-sheet XLSX files larger than about 90 MB, or opening big XLSX files on phones, would require a **streaming XLSX reader**. That would be a separate decision with accuracy trade-offs; it was not built (as agreed: measure first).

## Open items that need the project owner

| Item | Why it can't be done here | How to close it |
|---|---|---|
| Compare the SheetJS package's SHA-256 with an independent official download | SheetJS publishes no checksums, and its servers are blocked from this environment | Download `xlsx-0.20.3.tgz` again from `cdn.sheetjs.com` on any normal connection and check that its SHA-256 is `8dc73fc3b00203e72d176e85b50938627c7b086e607c682e8d3c22c02bb99fe8` |
| Real-device and browser testing (Android, iPhone, tablets, Mac, Windows; Chrome, Firefox, Safari, Edge) | Only headless Chromium is available | Open `/diagnostics` on each device, run 25 / 50 / 100 MB tests, and send the copied results |
| Files saved by Microsoft Excel itself | Not available here | Optionally, open a few real Excel files on the Error Detector page and check they look right |
