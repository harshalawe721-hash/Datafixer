# Large-file processing design

DataFixer accepts files up to **150 MB (157,286,400 bytes)**. That is the most we accept. It does not promise that every 150 MB spreadsheet can be processed on every device, because all processing happens in the visitor's browser and depends on that device's memory and CPU.

This document describes how parsing, scanning, cleaning and export (Stages 2 to 6) must be built so that large files don't freeze the page or use more memory than needed.

## What is implemented today

| Area | Status |
| --- | --- |
| Size limit (inclusive: 157,286,400 bytes accepted, 157,286,401 rejected) | Done, in `src/config/site.ts` |
| One validation path for drag-and-drop and the file picker | Done, in `FileDropzone.handleFiles` |
| Validation reads only the first 8 KB of the file (`Blob.slice`), never the whole file | Done |
| Clear rejection message that states the 150 MB limit (exact bytes shown when just over) | Done |
| Large-file advisory for accepted files over 50 MB | Done |
| Unit tests at the boundaries (`npm test`) and a real-browser test at 50/100/149/150/150+1/151 MB (`npm run test:large`) | Done |
| Parsing, scanning, cleaning, export | **Not built yet.** Its performance at 150 MB has **not** been measured. |

## Rules for the processing stages

1. **Off the main thread.** Parsing, scanning, cleaning and file generation run in a dedicated Web Worker. The UI thread only renders state and progress, so the page stays responsive even when a job takes seconds.
2. **Never copy the file needlessly.**
   - Pass the `File` object to the worker. It is a handle and is cheap to send, so the file's bytes are not copied.
   - When an `ArrayBuffer` must cross the worker boundary, *transfer* it (`postMessage(msg, [buffer])`) rather than cloning it.
   - Never read the file into a JavaScript string unless the format requires it.
3. **CSV: streaming.** Use Papa Parse inside the worker with a `File` input and the `chunk` callback. The file is read in chunks (Papa Parse's default for local files is about 10 MB), so the raw text is never held in memory all at once. Rows go straight into compact storage and progress is reported per chunk.
4. **XLSX/XLS: whole-file parse, kept lean.** XLSX is a ZIP archive and XLS is a binary compound file, so SheetJS must read the whole file and cannot stream it. To limit memory:
   - first read only the sheet list (`bookSheets: true`), then parse just the selected sheet;
   - use `dense: true` storage, and turn off `cellStyles`, `cellHTML` and similar options unless a feature needs them;
   - use `sheetRows` when only a preview is needed.

   A heavily compressed 150 MB XLSX can expand to many times its size in memory. Of all the cases, this is the one most likely to fail on low-memory devices.
5. **Compact in-memory model.** Store cells as plain values (string, number, boolean or null) in arrays per sheet, not as objects per cell. Scans record affected row and column indexes, not copies of the data.
6. **Incremental work and progress.** Long loops (scans, cleaning operations) report progress every N rows. The UI shows a progress bar and a **Cancel** button that calls `worker.terminate()`, which immediately frees the worker's memory.
7. **Preview never renders everything.** The preview table uses pagination or virtualised rows, so only visible rows exist in the DOM.
8. **Undo without copying the dataset.** Undo records what each operation changed (diffs or row-index lists) rather than a full copy of the sheet per step.
9. **Fail gracefully.**
   - Catch `RangeError` and out-of-memory errors in the worker, and detect a crashed worker (`onerror`, or the worker exits without a message).
   - Show a plain message, for example: "This file is too large for the memory available in this browser. Try a desktop browser, close other tabs, or split the file." Never fail silently.
10. **Original file untouched.** The browser only ever *reads* the user's file. Results are new `Blob`s offered as downloads with a new name (`<name>-datafixer-cleaned.xlsx`). Each object URL is revoked once its download has started.
11. **Release memory.** After a job, terminate the worker or clear its state, drop references to parsed data when the user loads another file or leaves the tool, and revoke object URLs.

## Testing before claiming support

Before the site claims that files of a given size are supported, each processing stage must be measured on real files:

- CSV and XLSX at 50, 100 and 150 MB, including wide sheets (many columns) and long sheets (close to Excel's 1,048,576-row limit);
- desktop Chrome, Edge, Firefox and Safari, plus a mid-range Android phone and an iPhone;
- record parse time, scan time, the longest main-thread block (target under 200 ms) and peak memory.

If a combination fails, the UI must say so honestly (for example, a device-specific warning). The limit itself should be lowered only if desktop browsers can't cope.
