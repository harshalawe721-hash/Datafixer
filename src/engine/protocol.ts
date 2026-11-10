/** Messages exchanged between the page (EngineClient) and the engine worker. */
import type { SpreadsheetFormat } from "@/lib/file-validation";
import type { SerializedEngineError } from "./errors.ts";
import type { ProgressEvent, WorkbookSummary } from "./types.ts";
import type { RowPage, RowQuery } from "./query/query.ts";

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
  | { id: number; type: "close" };

export interface EngineResults {
  open: WorkbookSummary;
  loadSheet: WorkbookSummary;
  getRows: RowPage;
  close: null;
}

export type EngineResponse =
  | { id: number; type: "progress"; progress: ProgressEvent }
  | { id: number; type: "result"; result: unknown }
  | { id: number; type: "error"; error: SerializedEngineError };
