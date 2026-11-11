# Spreadsheet engine

The engine reads spreadsheet files for all five DataFixer tools. It runs entirely in the browser, inside a Web Worker. It makes no network requests, and the user's file is only ever read, never modified.

## Architecture

```
Page (React)                                    Web Worker
────────────                                    ──────────
useSpreadsheetEngine ──► EngineClient ─postMessage─► engine.worker.ts ──► EngineCore
  progress bar + Cancel    lazy worker,                                   ├─ csv/      Papa Parse, chunked
  FileSummary              cancel = terminate()                           ├─ xlsx/     safety inspection (fflate)
  SpreadsheetPreview       crash → clear error                            │            Excel cell reader (SheetJS 0.20.3)
                           memory budget                                  ├─ grid.ts   compact cell storage
                                                                          └─ query/    paging, search, sort
```

| File | Role |
|---|---|
| `src/engine/types.ts` | Shared model: `SheetModel`, `WorkbookSummary`, `FeatureInventory`, cell keys |
| `src/engine/grid.ts` | `CellGrid` interface; `CompactTextGrid` (CSV), `WorkbookGrid` (Excel: raw values + per-row number-format ids, formatted on display), `ArrayGrid` (tests) |
| `src/engine/csv/` | Encoding detection, delimiter detection, chunked CSV parsing |
| `src/engine/xlsx/inspect.ts` | Streaming ZIP inspection: limits, unsafe content, sheet list, features |
| `src/engine/xlsx/read-workbook.ts` | Excel cell reader (official SheetJS 0.20.3 from `vendor/`), loaded on demand inside the worker |
| `src/engine/query/query.ts` | `SheetQuery`: pages of rows, worker-side search and sort |
| `src/engine/core.ts` | `EngineCore`: holds the open file and answers requests (unit-testable) |
| `src/engine/worker/engine.worker.ts` | Worker entry point (message plumbing only) |
| `src/engine/client.ts` | Main-thread client: requests, progress, cancel, crash recovery |
| `src/engine/memory-budget.ts` | Works out how much memory parsing may use on this device |
| `src/components/spreadsheet/` | `useSpreadsheetEngine`, `SpreadsheetWorkspace`, `FileSummary`, `ProcessingProgress`, `SpreadsheetPreview` |

### Building on it in later stages

Every tool gets the same workflow (upload, progress with Cancel, summary, preview) from `<SpreadsheetWorkspace>`. Tool-specific panels go in as `children`.

Tool logic that needs every cell runs **inside the worker** and reads cells through `SheetModel.grid` (`get(r, c)`, `rowLength(r)`, `rowCount`):

- Stage 3, Error Detector: add a `scan` request with scanner modules over the grid. This includes formula errors, using `SheetModel.errors` and `formulas`.
- Stage 4, Cleaner: add operations that produce a new grid or a change list (for undo), plus an export request.
- Stage 5, CSV Validator: uses the CSV reader's structural issues (`SheetModel.issues`, `CsvMeta`) and the raw row lengths.
- Stage 6, converters: export requests that build the output `Blob` inside the worker.

The preview already takes `highlights` (cell key to tone) for marking affected cells.

## Supported formats

| Format | Status | Notes |
|---|---|---|
| CSV / TSV / semicolon / pipe | ✅ Works | Text encodings: UTF-8 (with or without BOM), UTF-16 LE/BE (with BOM), and Windows-1252 as the fallback. The separator is detected automatically or chosen by the user. |
| XLSX | ✅ Works | Values, number formats (dates, currency, 1904 date system), booleans, error values, formulas (as text, with saved results), hyperlinks, merged cells, hidden rows/columns/sheets, column widths and row heights. Only the selected sheet is converted. |
| XLS (Excel 97–2003) | ✅ Works (smaller files) | Same data as XLSX. SheetJS parses every sheet of an XLS file, which needs about 40 × the file size in memory, so XLS files above roughly 40 MB are refused with advice to save them as XLSX. |
| Password-protected XLSX/XLS | ❌ Refused | Clear message explaining how to remove the password. |
| XLSM, XLSB, ODS | ❌ Not accepted | Rejected by upload validation or inspection with a specific message. |

## Security measures

| Threat | Protection | Tested |
|---|---|---|
| Wrong file type, or a file renamed to look like a spreadsheet | The first bytes are checked (ZIP or OLE2 signature, text check) before anything else | Unit and browser tests |
| Decompression bomb | Limits are enforced on bytes *actually* decompressed: 500 MB per part, 2 GB in total, 10,000 entries | Unit tests |
| XML entity expansion ("billion laughs") | Any `<!DOCTYPE` / `<!ENTITY` is rejected before parsing | Unit and browser tests |
| Path traversal in ZIP entry names | `..` and NUL characters in entry names are rejected | Unit tests |
| Macros, embedded objects, external links | Never executed or fetched. The user is told when they are present. `.xlsm` is not accepted. | Unit tests (detection) |
| Formulas | Kept as text and never evaluated | — |
| CSV formula injection (`=`, `+`, `-`, `@`) | Counted and shown as plain text. The user is warned. | Unit tests |
| Prototype pollution | Cell data lives in strings and typed arrays and is never used as object keys | Unit tests |
| Cross-site scripting through cell content | Cells are rendered only as React text, never as HTML | — |
| Data leaving the device | No network code in the engine. A production CSP sets `connect-src 'self'`. | Browser test (no off-origin or POST requests) |
| Tab crash from running out of memory | A memory budget stops parsing before the limit (see below) | Browser test with a capped heap |
| Damaged or truncated files | Specific plain-language errors | Unit and browser tests |

## Memory

Measured in V8 (Node, the same engine as Chrome):

| Storage | Retained memory for CSV |
|---|---|
| One string per cell in per-row arrays (first version) | 5.1–7.9 × file size |
| `CompactTextGrid` (one string per chunk plus `Uint32Array` offsets) | **1.7–2.2 × file size** |

When a worker runs out of heap, **Chromium crashes the whole tab**. There is no catchable error, and this was verified. So `memory-budget.ts` estimates how much memory parsing may use:

1. Chromium: 45% of `performance.memory.jsHeapSizeLimit`.
2. Otherwise: 15% of `navigator.deviceMemory`.
3. Otherwise: 300 MB on mobile, 1 GB on desktop. Safari and Firefox expose neither number, so they get these conservative defaults.

The CSV reader stops with a clear message when its data would exceed the budget. It refuses files that clearly can't fit before it starts.

## Limitations (honest list)

- **Large single-sheet XLSX files.** A worksheet whose XML is larger than about 500 MB can't be turned into one JavaScript string, which the parser needs. In the generated test files, 100 MB of XLSX held about 530 MB of sheet XML. Single-sheet XLSX files much above about 90 MB are therefore refused with a clear explanation. A streaming XLSX reader would lift this limit; it is not built.
- **XLSX memory.** SheetJS decompresses every part of a workbook, even when only one sheet is requested. Peak memory is therefore about the file size, plus 2 × all XML, plus about 100 bytes per parsed cell. The memory budget refuses workbooks that would exceed it.
- **XLS memory.** About 40 × the file size, because every sheet is parsed. In practice, XLS files above about 40 MB are refused.
- **Heavily compressed XLSX files** that expand to more than 2 GB are refused.
- **Excel parsing can't report a percentage.** During the SheetJS step the progress bar shows a stage, not a percentage. Cancel always works.
- **Very hidden sheets** are shown with a "hidden" badge. Chartsheets are listed but have no cells to show.
- **Formulas are never calculated.** Saved results are shown. Formulas saved without a result (for example by openpyxl or pandas) show as empty, and the user is told.
- **A SheetJS 0.20.3 bug** corrupts characters above U+FFFF when a file stores them as numeric references (files from openpyxl and pandas). DataFixer restores them when that is unambiguous and warns otherwise (see `vendor/README.md`).
- Searching about 2M rows takes 1–2 s, and sorting a text column takes about 1–3 s. The page stays responsive throughout, because both run in the worker.
- UTF-16 CSV files without a BOM, and CSV encodings other than UTF-8, UTF-16 and Windows-1252, are not detected automatically.
- Real-device testing: **CSV files of 25–100 MB passed on an Android tablet** (see the test report). Excel files on real devices, 150 MB files on real devices, and iOS, Safari and Firefox have **not** been tested yet.

## Workbook features and preservation

The engine reads cell data. **Nothing is written yet**, so nothing is lost yet. For each XLSX file, the inspection lists the features that a future writer would need to keep. Stage 4 must decide how to write files before any download that rewrites an XLSX is offered.

| Feature | Detected now | SheetJS (free edition) can write it |
|---|---|---|
| Formulas | ✅ read (text + saved result) | ✅ |
| Multiple worksheets | ✅ | ✅ |
| Merged cells, hyperlinks | ✅ read | ✅ |
| Column widths, row heights, hidden rows and columns | ✅ read (XLSX: from the safety inspection) | ✅ |
| Hidden sheets | ✅ | ✅ |
| Cell styles (fonts, fills, borders) | — | ❌ |
| Charts, images | ✅ | ❌ |
| Data validation, conditional formatting | ✅ | ❌ |
| Pivot tables, comments, tables | ✅ | ❌ / partly |

The recommendation for Stage 4 is to patch only the edited cells inside the original XLSX package, so that everything else stays byte-for-byte identical. This needs a separate proposal and approval.
