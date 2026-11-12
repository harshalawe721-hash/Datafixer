/**
 * Main-thread client for the engine worker.
 *
 * - One worker per client, created lazily.
 * - cancel() terminates the worker immediately (frees its memory) and rejects
 *   pending requests with a "cancelled" error; a fresh worker starts on demand.
 * - If the worker dies (typically out of memory), pending requests reject with
 *   a plain-language "worker-crashed" error and the client recovers.
 */
import type { SpreadsheetFormat } from "@/lib/file-validation";
import { EngineError, type EngineErrorCode, type SerializedEngineError } from "./errors";
import type { EngineRequest, EngineResponse, EngineResults, OpenOptions } from "./protocol";
import type { ProgressEvent, WorkbookSummary } from "./types";
import type { RowPage, RowQuery } from "./query/query";
import { computeMemoryBudget } from "./memory-budget";
import type { ScanOptions, ScanResult } from "./scan/scan";
import type { ValidationResult } from "./validate/validate";
import type { CellInfo, EditResult, ExportResult, FixAllPreview, FixPreviewResult } from "./core";
import type { FixOptions } from "./fix/fixes";
import type { AnyFixId } from "./fix/fix-ids";
import type { HistoryItem, HistorySummary } from "./edit/session";

type Pending = {
  resolve: (v: unknown) => void;
  reject: (e: EngineError) => void;
  onProgress?: (p: ProgressEvent) => void;
};

export const WORKER_CRASH_MESSAGE =
  "The file processor stopped unexpectedly, most likely because this browser ran out of memory. Your file has not been changed. Try closing other tabs, using a desktop computer, or splitting the file into smaller parts.";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

export class EngineClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();

  private ensureWorker(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./worker/engine.worker.ts", import.meta.url), { type: "module", name: "datafixer-engine" });
    worker.onmessage = (e: MessageEvent<EngineResponse>) => {
      const msg = e.data;
      const p = this.pending.get(msg.id);
      if (!p) return;
      if (msg.type === "progress") p.onProgress?.(msg.progress);
      else {
        this.pending.delete(msg.id);
        if (msg.type === "result") p.resolve(msg.result);
        else p.reject(fromSerialized(msg.error));
      }
    };
    worker.onerror = (e) => {
      e.preventDefault();
      this.fail("worker-crashed", WORKER_CRASH_MESSAGE, e.message || "worker error event");
    };
    worker.onmessageerror = () => this.fail("internal", "A message from the file processor could not be read. Please try again.");
    this.worker = worker;
    return worker;
  }

  private fail(code: EngineErrorCode, message: string, detail?: string) {
    this.worker?.terminate();
    this.worker = null;
    const err = new EngineError(code, message, detail);
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private request<T extends EngineRequest["type"]>(
    msg: DistributiveOmit<Extract<EngineRequest, { type: T }>, "id">,
    onProgress?: (p: ProgressEvent) => void,
  ): Promise<EngineResults[T]> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<EngineResults[T]>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      // The File is passed by reference (structured clone of a Blob handle): no copy of its bytes.
      worker.postMessage({ ...msg, id } as EngineRequest);
    });
  }

  open(file: File, format: SpreadsheetFormat, options?: OpenOptions, onProgress?: (p: ProgressEvent) => void): Promise<WorkbookSummary> {
    const memoryBudgetBytes = options?.memoryBudgetBytes ?? computeMemoryBudget().bytes;
    return this.request<"open">({ type: "open", file, format, options: { ...options, memoryBudgetBytes } }, onProgress);
  }

  loadSheet(sheet: string, onProgress?: (p: ProgressEvent) => void): Promise<WorkbookSummary> {
    return this.request<"loadSheet">({ type: "loadSheet", sheet }, onProgress);
  }

  /** Run the Error Detector checks on a loaded sheet (read-only). */
  scan(sheet: string, options: ScanOptions, onProgress?: (p: ProgressEvent) => void): Promise<ScanResult> {
    return this.request<"scan">({ type: "scan", sheet, options }, onProgress);
  }

  /** Stage 5: check a CSV file's structure (read-only; stop with abortScans). */
  validate(sheet: string, options: { headerRow: boolean }, onProgress?: (p: ProgressEvent) => void): Promise<ValidationResult> {
    return this.request<"validate">({ type: "validate", sheet, options }, onProgress);
  }

  /** Stop running scans; the opened file stays loaded (unlike cancel()). */
  abortScans(): Promise<null> {
    return this.request<"abortScans">({ type: "abortScans" });
  }

  // ---- Stage 4: fixing and editing (all on this device, in the worker)

  previewFix(sheet: string, fixId: AnyFixId, options: FixOptions, onProgress?: (p: ProgressEvent) => void): Promise<FixPreviewResult> {
    return this.request<"previewFix">({ type: "previewFix", sheet, fixId, options }, onProgress);
  }

  previewFixAll(sheet: string, options: { headerRow: boolean; set?: "detector" | "validator" }, onProgress?: (p: ProgressEvent) => void): Promise<FixAllPreview> {
    return this.request<"previewFixAll">({ type: "previewFixAll", sheet, options }, onProgress);
  }

  applyFix(sheet: string, token: string): Promise<EditResult> {
    return this.request<"applyFix">({ type: "applyFix", sheet, token });
  }

  cellInfo(sheet: string, row: number, col: number): Promise<CellInfo> {
    return this.request<"cellInfo">({ type: "cellInfo", sheet, row, col });
  }

  editCell(sheet: string, row: number, col: number, text: string, replaceFormula = false): Promise<EditResult> {
    return this.request<"editCell">({ type: "editCell", sheet, row, col, text, replaceFormula });
  }

  /** Create and verify the corrected CSV; the Blob comes back by reference (no copy). */
  exportCsv(sheet: string, onProgress?: (p: ProgressEvent) => void): Promise<ExportResult> {
    return this.request<"exportCsv">({ type: "exportCsv", sheet }, onProgress);
  }

  /** Create and verify the corrected Excel file. */
  exportXlsx(sheet: string, onProgress?: (p: ProgressEvent) => void): Promise<ExportResult> {
    return this.request<"exportXlsx">({ type: "exportXlsx", sheet }, onProgress);
  }

  undo(sheet: string): Promise<EditResult> {
    return this.request<"undo">({ type: "undo", sheet });
  }

  redo(sheet: string): Promise<EditResult> {
    return this.request<"redo">({ type: "redo", sheet });
  }

  history(sheet: string): Promise<HistorySummary[]> {
    return this.request<"history">({ type: "history", sheet });
  }

  historyDetails(sheet: string, entry: number, offset: number, limit: number): Promise<{ total: number; items: HistoryItem[] }> {
    return this.request<"historyDetails">({ type: "historyDetails", sheet, entry, offset, limit });
  }

  getRows(sheet: string, query: RowQuery): Promise<RowPage> {
    return this.request<"getRows">({ type: "getRows", sheet, query });
  }

  /** Stop everything now and release the worker's memory. */
  cancel(): void {
    this.fail("cancelled", "Processing was cancelled. Your file has not been changed.");
  }

  /** Release the open file and the worker. */
  dispose(): void {
    this.fail("cancelled", "Processing was stopped. Your file has not been changed.");
  }

  get busy(): boolean {
    return this.pending.size > 0;
  }
}

function fromSerialized(e: SerializedEngineError): EngineError {
  return new EngineError(e.code, e.message, e.detail);
}
