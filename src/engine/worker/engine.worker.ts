/// <reference lib="webworker" />
/**
 * Engine Web Worker. All parsing, inspection and querying happens here so the
 * page stays responsive. Makes no network requests.
 *
 * Cancellation: the page terminates this worker (instant, frees all memory);
 * the cooperative token below additionally stops work between chunks.
 */
import { EngineCore } from "../core.ts";
import { toSerializedError } from "../errors.ts";
import type { EngineRequest, EngineResponse } from "../protocol.ts";
import type { ProgressEvent } from "../types.ts";

declare const self: DedicatedWorkerGlobalScope;

const core = new EngineCore();
const token = { cancelled: false };
/** One cancel token per running scan, so a scan can be stopped without losing the open file. */
const scanTokens = new Set<{ cancelled: boolean }>();

function post(msg: EngineResponse) {
  self.postMessage(msg);
}

// Assigned after imports so nothing a library installed can handle our messages.
self.onmessage = async (event: MessageEvent<EngineRequest>) => {
  const req = event.data;
  // Throttle progress messages to ~10 per second.
  let lastProgress = 0;
  const onProgress = (progress: ProgressEvent) => {
    const now = Date.now();
    if (now - lastProgress < 100 && progress.loaded !== progress.total) return;
    lastProgress = now;
    post({ id: req.id, type: "progress", progress });
  };
  try {
    let result: unknown;
    switch (req.type) {
      case "open":
        result = await core.open(req.file, req.format, req.options ?? {}, onProgress, token);
        break;
      case "loadSheet":
        result = await core.loadSheet(req.sheet, onProgress, token);
        break;
      case "scan": {
        const scanToken = { cancelled: false };
        scanTokens.add(scanToken);
        try {
          result = await core.scan(req.sheet, req.options, onProgress, scanToken);
        } finally {
          scanTokens.delete(scanToken);
        }
        break;
      }
      case "validate": {
        const t = { cancelled: false };
        scanTokens.add(t);
        try {
          result = await core.validate(req.sheet, req.options, onProgress, t);
        } finally {
          scanTokens.delete(t);
        }
        break;
      }
      case "exportWorkbookZip": {
        const t = { cancelled: false };
        scanTokens.add(t);
        try {
          result = await core.exportWorkbookZip(req.options, onProgress, t);
        } finally {
          scanTokens.delete(t);
        }
        break;
      }
      case "convertToXlsx": {
        const t = { cancelled: false };
        scanTokens.add(t);
        try {
          result = await core.convertCsvToXlsx(req.sheet, req.options, onProgress, t);
        } finally {
          scanTokens.delete(t);
        }
        break;
      }
      case "exportCsv":
      case "exportXlsx": {
        const t = { cancelled: false };
        scanTokens.add(t);
        try {
          result = req.type === "exportCsv" ? await core.exportCsv(req.sheet, onProgress, t, req.options) : await core.exportXlsx(req.sheet, onProgress, t);
        } finally {
          scanTokens.delete(t);
        }
        break;
      }
      case "previewFix":
      case "previewFixAll": {
        // Previews read the whole sheet: cancellable like a scan, without losing the open file.
        const t = { cancelled: false };
        scanTokens.add(t);
        try {
          result =
            req.type === "previewFix"
              ? await core.previewFix(req.sheet, req.fixId, req.options, onProgress, t)
              : await core.previewFixAll(req.sheet, req.options, onProgress, t);
        } finally {
          scanTokens.delete(t);
        }
        break;
      }
      case "applyFix":
        result = core.applyFix(req.sheet, req.token);
        break;
      case "cellInfo":
        result = core.cellInfo(req.sheet, req.row, req.col);
        break;
      case "editCell":
        result = core.editCell(req.sheet, req.row, req.col, req.text, { replaceFormula: req.replaceFormula });
        break;
      case "undo":
        result = core.undo(req.sheet);
        break;
      case "redo":
        result = core.redo(req.sheet);
        break;
      case "history":
        result = core.history(req.sheet);
        break;
      case "historyDetails":
        result = core.historyDetails(req.sheet, req.entry, req.offset, req.limit);
        break;
      case "abortScans":
        for (const t of scanTokens) t.cancelled = true;
        result = null;
        break;
      case "getRows":
        result = core.getRows(req.sheet, req.query);
        break;
      case "close":
        core.close();
        result = null;
        break;
    }
    post({ id: req.id, type: "result", result });
  } catch (err) {
    post({ id: req.id, type: "error", error: toSerializedError(err) });
  }
};
