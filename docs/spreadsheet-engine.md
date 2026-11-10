# Spreadsheet engine

The engine reads spreadsheet files for all five DataFixer tools. It runs entirely in the browser, inside a Web Worker. It makes no network requests, and the user's file is only ever read, never modified.

## Architecture

```
Page (React)                                    Web Worker
────────────                                    ──────────
useSpreadsheetEngine ──► EngineClient ─postMessage─► engine.worker.ts ──► EngineCore
  progress bar + Cancel    lazy worker,                                   ├─ csv/      Papa Parse, chunked
  FileSummary              cancel = terminate()                           ├─ xlsx/     safety inspection (fflate)
  SpreadsheetPreview       crash → clear error                            │            Excel cell reader (pending SheetJS)
                           memory budget                                  ├─ grid.ts   compact cell storage
                                                                          └─ query/    paging, search, sort
```

| File | Role |
|---|---|
| `src/engine/types.ts` | Shared model: `SheetModel`, `WorkbookSummary`, `FeatureInventory`, cell keys |
| `src/engine/grid.ts` | `CellGrid` interface; `CompactTextGrid` (CSV) and `ArrayGrid` (small data/XLSX) |
| `src/engine/csv/` | Encoding detection, delimiter detection, chunked CSV parsing |
| `src/engine/xlsx/inspect.ts` | Streaming ZIP inspection: limits, unsafe content, sheet list, features |
| `src/engine/xlsx/read-workbook.ts` | Excel cell reader. **Not implemented yet** (waiting for the vendored SheetJS package) |
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
| XLSX | ⚠️ Partly | Safety check, sheet names, visibility, declared sizes and feature list work. **Reading cell data is not available yet**: it needs the official SheetJS package (see `vendor/README.md`). |
| XLS (Excel 97–2003) | ❌ Not yet | Needs SheetJS. Accepted files currently get a clear "not available yet" message. |
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

- **Excel cell data can't be read yet** (SheetJS not yet vendored).
- **Large single-sheet XLSX files.** A worksheet whose XML is larger than about 500 MB can't be turned into one JavaScript string, which the SheetJS parser needs. In the generated test files, 100 MB of XLSX held 544 MB of sheet XML. So single-sheet XLSX files much above about 90 MB are refused with a clear explanation. Multi-sheet files with smaller sheets are fine as far as inspection is concerned. A streaming XLSX reader would lift this limit; it is not built (as agreed: measure first).
- **Heavily compressed XLSX files** that expand to more than 2 GB are refused.
- XLSX progress during the SheetJS parse step can't show a percentage, only stages. Cancel always works.
- A full-text search of about 2M rows takes 1–2 s, and sorting a text column takes about 1–2 s. The page stays responsive throughout, because both run in the worker.
- Reading UTF-16 files without a BOM, or encodings other than UTF-8, UTF-16 and Windows-1252, is not detected automatically.
- Real-device testing (Android, iOS, Safari, Firefox) has **not** been done. Use `/diagnostics` on each device.

## Workbook features and preservation

The engine reads cell data. **Nothing is written yet**, so nothing is lost yet. For each XLSX file, the inspection lists the features that a future writer would need to keep. Stage 4 must decide how to write files before any download that rewrites an XLSX is offered.

| Feature | Detected now | SheetJS (free edition) can write it |
|---|---|---|
| Formulas | Planned (SheetJS) | ✅ |
| Multiple worksheets | ✅ | ✅ |
| Merged cells, hyperlinks | Planned (SheetJS) | ✅ |
| Column widths, row heights, hidden rows and columns | Planned (SheetJS) | ✅ |
| Hidden sheets | ✅ | ✅ |
| Cell styles (fonts, fills, borders) | — | ❌ |
| Charts, images | ✅ | ❌ |
| Data validation, conditional formatting | ✅ | ❌ |
| Pivot tables, comments, tables | ✅ | ❌ / partly |

The recommendation for Stage 4 is to patch only the edited cells inside the original XLSX package, so that everything else stays byte-for-byte identical. This needs a separate proposal and approval.
