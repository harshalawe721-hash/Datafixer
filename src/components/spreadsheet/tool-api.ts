import type { ProgressEvent, WorkbookSummary } from "@/engine/types";
import type { ScanIssue, ScanOptions, ScanResult } from "@/engine/scan/scan";
import type { SpreadsheetFormat } from "@/lib/file-validation";
import type { EditResult, ExportResult, FixAllPreview, FixPreviewResult } from "@/engine/core";

/** The latest change, undo or redo, for the "Done" message. */
export interface LastChange {
  action: "applied" | "undone" | "redone";
  entries: HistorySummary[];
  /** Changes with every new message (so the same text can be announced again). */
  seq: number;
}
import type { EditStats, HistoryItem, HistorySummary } from "@/engine/edit/session";
import type { FixId, FixOptions } from "@/engine/fix/fixes";

/** What a tool panel (e.g. the Error Detector) can use from the shared workspace. */
export interface ToolApi {
  summary: WorkbookSummary;
  format: SpreadsheetFormat;
  /** Changes whenever a different file, sheet or separator is shown. */
  viewKey: string;
  /** True when the active sheet's cells are loaded and can be checked. */
  sheetReady: boolean;
  headerRow: boolean;
  scan(options: ScanOptions, onProgress?: (p: ProgressEvent) => void): Promise<ScanResult>;
  abortScans(): void;
  /** Filter the preview to an issue's affected rows (null shows all rows). */
  viewIssue(issue: ScanIssue | null): void;
  activeIssueId: string | null;

  // ---- Stage 4: fixing (changes stay on this device; the original file is never changed)
  /** Current changes; `version` changes after every change, undo and redo. */
  edits: EditStats;
  lastChange: LastChange | null;
  previewFix(fixId: FixId, options: Omit<FixOptions, "headerRow">, onProgress?: (p: ProgressEvent) => void): Promise<FixPreviewResult>;
  previewFixAll(onProgress?: (p: ProgressEvent) => void): Promise<FixAllPreview>;
  /** Apply a previewed fix; the workspace re-checks and refreshes the table. */
  applyFix(token: string): Promise<EditResult>;
  /** Create the corrected CSV and check it cell by cell (Step 6). */
  exportCsv(onProgress?: (p: ProgressEvent) => void): Promise<ExportResult>;
  /** Create the corrected Excel file and check it cell by cell (Step 7). */
  exportXlsx(onProgress?: (p: ProgressEvent) => void): Promise<ExportResult>;
  undo(): Promise<EditResult>;
  redo(): Promise<EditResult>;
  history(): Promise<HistorySummary[]>;
  historyDetails(entry: number, offset: number, limit: number): Promise<{ total: number; items: HistoryItem[] }>;
}
