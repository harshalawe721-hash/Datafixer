import type { ProgressEvent, WorkbookSummary } from "@/engine/types";
import type { ScanIssue, ScanOptions, ScanResult } from "@/engine/scan/scan";

/** What a tool panel (e.g. the Error Detector) can use from the shared workspace. */
export interface ToolApi {
  summary: WorkbookSummary;
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
}
