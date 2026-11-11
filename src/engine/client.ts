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
