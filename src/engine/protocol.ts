/** Messages exchanged between the page (EngineClient) and the engine worker. */
import type { SpreadsheetFormat } from "@/lib/file-validation";
import type { SerializedEngineError } from "./errors.ts";
import type { ProgressEvent, WorkbookSummary } from "./types.ts";
import type { RowPage, RowQuery } from "./query/query.ts";
import type { ScanOptions, ScanResult } from "./scan/scan.ts";

export interface OpenOptions {
  delimiter?: string;
  encoding?: string;
  /** Memory budget computed on the main thread (see memory-budget.ts). */
  memoryBudgetBytes?: number;
}

export type EngineRequest =
  | { id: number; type: "open"; file: File; format: SpreadsheetFormat; options?: OpenOptions }
  | { id: number; type: "loadSheet"; sheet: string }
  | { id: number; type: "getRows"; sheet: string; query: RowQuery }
  | { id: number; type: "scan"; sheet: string; options: ScanOptions }
  /** Stop running scans (cooperatively, between batches); the open file is kept. */
  | { id: number; type: "abortScans" }
  | { id: number; type: "close" };

export interface EngineResults {
  open: WorkbookSummary;
  loadSheet: WorkbookSummary;
  getRows: RowPage;
  scan: ScanResult;
  abortScans: null;
  close: null;
}

export type EngineResponse =
  | { id: number; type: "progress"; progress: ProgressEvent }
  | { id: number; type: "result"; result: unknown }
  | { id: number; type: "error"; error: SerializedEngineError };
