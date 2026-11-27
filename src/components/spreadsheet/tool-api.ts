import type { ProgressEvent, WorkbookSummary } from "@/engine/types";
import type { ScanIssue, ScanOptions, ScanResult } from "@/engine/scan/scan";
import type { SpreadsheetFormat } from "@/lib/file-validation";
import type { ConvertResult, CsvDownloadOptions, WorkbookZipResult, EditResult, ExportResult, FixAllPreview, FixPreviewResult, SplitCombinePreview, DuplicatesPreview, JsonExportResult, JsonPreview } from "@/engine/core";
import type { JsonLayout } from "@/engine/json/write";
import type { DuplicateOptions } from "@/engine/fix/duplicates";
import type { CombinePlanInput, SplitPlanInput } from "@/engine/fix/split-combine-plans";

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
  /** The open file (e.g. to hand it to another tool page; never uploaded). */
  file: File;
  /** Stage 6: every worksheet as a verified CSV, in one ZIP (stop with abortScans). */
  exportWorkbookZip(options: CsvDownloadOptions, onProgress?: (p: ProgressEvent) => void): Promise<WorkbookZipResult>;
  /** Stage 6: CSV → new Excel workbook, checked before it is returned (stop with abortScans). */
  convertToXlsx(onProgress?: (p: ProgressEvent) => void): Promise<ConvertResult>;
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
  /** Stage 10: preview Split a column / Combine columns (header setting comes from the table). Apply with applyFix. */
  previewSplit(input: Omit<SplitPlanInput, "sheet" | "headerRow">): Promise<SplitCombinePreview>;
  previewCombine(input: Omit<CombinePlanInput, "sheet" | "headerRow">): Promise<SplitCombinePreview>;
  /** Stage 11: preview the Remove Duplicates page (header setting comes from the table). Apply with applyFix. */
  previewDuplicates(input: { options: DuplicateOptions; clearInstead?: boolean }): Promise<DuplicatesPreview>;
  /** Stage 10: the current columns: name (header or letter) and the first non-empty value as an example. */
  columns(): Promise<{ index: number; name: string; example: string }[]>;
  /** Stage 12: CSV / Excel → JSON (header setting comes from the table; stop the export with abortScans). */
  previewJson(options: { detect: boolean; layout: JsonLayout }): Promise<JsonPreview>;
  exportJson(options: { detect: boolean; layout: JsonLayout }, onProgress?: (p: ProgressEvent) => void): Promise<JsonExportResult>;
  /** Stage 12: open the same file again with other options (e.g. another list of a JSON file). */
  reopen(options: { jsonPath?: string; xmlPath?: string }): void;
  /** Apply a previewed fix; the workspace re-checks and refreshes the table. */
  applyFix(token: string): Promise<EditResult>;
  /** Create the corrected CSV and check it cell by cell (Step 6). */
  exportCsv(onProgress?: (p: ProgressEvent) => void, options?: CsvDownloadOptions): Promise<ExportResult>;
  /** CSV Validator: the download dialog offers separator, line endings and BOM (decision 3). */
  csvDownloadOptions: boolean;
  /** Create the corrected Excel file and check it cell by cell (Step 7). */
  exportXlsx(onProgress?: (p: ProgressEvent) => void): Promise<ExportResult>;
  /** A verified download of this version was offered (no "unsaved changes" warning until the next change). */
  markDownloaded(version: number): void;
  undo(): Promise<EditResult>;
  redo(): Promise<EditResult>;
  history(): Promise<HistorySummary[]>;
  historyDetails(entry: number, offset: number, limit: number): Promise<{ total: number; items: HistoryItem[] }>;
}
