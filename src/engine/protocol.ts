/** Messages exchanged between the page (EngineClient) and the engine worker. */
import type { SpreadsheetFormat } from "@/lib/file-validation";
import type { SerializedEngineError } from "./errors.ts";
import type { ProgressEvent, WorkbookSummary } from "./types.ts";
import type { RowPage, RowQuery } from "./query/query.ts";
import type { ScanOptions, ScanResult } from "./scan/scan.ts";
import type { CellInfo, EditResult, FixAllPreview, FixPreviewResult } from "./core.ts";
import type { FixId, FixOptions } from "./fix/fixes.ts";
import type { HistoryItem, HistorySummary } from "./edit/session.ts";

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
  /** Stage 4: work out what a fix would change (cancellable with abortScans). */
  | { id: number; type: "previewFix"; sheet: string; fixId: FixId; options: FixOptions }
  | { id: number; type: "previewFixAll"; sheet: string; options: { headerRow: boolean } }
  /** Apply exactly the previewed fix(es). */
  | { id: number; type: "applyFix"; sheet: string; token: string }
  | { id: number; type: "cellInfo"; sheet: string; row: number; col: number }
  /** Manual edit of one cell; a formula cell needs replaceFormula (the user saw the warning). */
  | { id: number; type: "editCell"; sheet: string; row: number; col: number; text: string; replaceFormula: boolean }
  | { id: number; type: "undo"; sheet: string }
  | { id: number; type: "redo"; sheet: string }
  | { id: number; type: "history"; sheet: string }
  | { id: number; type: "historyDetails"; sheet: string; entry: number; offset: number; limit: number }
  | { id: number; type: "close" };

export interface EngineResults {
  open: WorkbookSummary;
  loadSheet: WorkbookSummary;
  getRows: RowPage;
  scan: ScanResult;
  abortScans: null;
  previewFix: FixPreviewResult;
  previewFixAll: FixAllPreview;
  applyFix: EditResult;
  cellInfo: CellInfo;
  editCell: EditResult;
  undo: EditResult;
  redo: EditResult;
  history: HistorySummary[];
  historyDetails: { total: number; items: HistoryItem[] };
  close: null;
}

export type EngineResponse =
  | { id: number; type: "progress"; progress: ProgressEvent }
  | { id: number; type: "result"; result: unknown }
  | { id: number; type: "error"; error: SerializedEngineError };
