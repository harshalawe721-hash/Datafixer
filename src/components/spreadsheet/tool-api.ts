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
import type { FixOptions } from "@/engine/fix/fixes";
import type { AnyFixId } from "@/engine/fix/fix-ids";
import type { ValidationResult } from "@/engine/validate/validate";

/** What a tool panel (e.g. the Error Detector) can use from the shared workspace. */
export interface ToolApi {
  summary: WorkbookSummary;
  format: SpreadsheetFormat;
  /** Changes whenever a different file, sheet or separator is shown. */
  viewKey: string;
  /** True when the active sheet's cells are loaded and can be checked. */
  sheetReady: boolean;
  headerRow: boolean;
  /** Change "First row contains column names" (the table below follows). */
  setHeaderRow(headerRow: boolean): void;
  scan(options: ScanOptions, onProgress?: (p: ProgressEvent) => void): Promise<ScanResult>;
  abortScans(): void;
  /** Stage 5: check the CSV file's structure (stop with abortScans). */
  validate(options: { headerRow: boolean }, onProgress?: (p: ProgressEvent) => void): Promise<ValidationResult>;
  /** Filter the preview to an issue's affected rows (null shows all rows). */
  viewIssue(issue: ScanIssue | null): void;
  activeIssueId: string | null;

  // ---- Stage 4: fixing (changes stay on this device; the original file is never changed)
  /** Current changes; `version` changes after every change, undo and redo. */
  edits: EditStats;
  lastChange: LastChange | null;
  previewFix(fixId: AnyFixId, options: Omit<FixOptions, "headerRow">, onProgress?: (p: ProgressEvent) => void): Promise<FixPreviewResult>;
  /** `set`: "validator" for the CSV Validator's safe repairs. */
  previewFixAll(onProgress?: (p: ProgressEvent) => void, set?: "detector" | "validator"): Promise<FixAllPreview>;
  /** Apply a previewed fix; the workspace re-checks and refreshes the table. */
  applyFix(token: string): Promise<EditResult>;
  /** Create the corrected CSV and check it cell by cell (Step 6). */
  exportCsv(onProgress?: (p: ProgressEvent) => void): Promise<ExportResult>;
  /** Create the corrected Excel file and check it cell by cell (Step 7). */
  exportXlsx(onProgress?: (p: ProgressEvent) => void): Promise<ExportResult>;
  /** A verified download of this version was offered (no "unsaved changes" warning until the next change). */
  markDownloaded(version: number): void;
  undo(): Promise<EditResult>;
  redo(): Promise<EditResult>;
  history(): Promise<HistorySummary[]>;
  historyDetails(entry: number, offset: number, limit: number): Promise<{ total: number; items: HistoryItem[] }>;
}
