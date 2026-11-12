/**
 * Shared in-memory spreadsheet model used by every DataFixer tool.
 * All formats (CSV, XLSX, XLS) are converted to this shape inside the worker.
 * Cells are plain values in row arrays; anything extra lives in sparse side
 * tables keyed by `cellKey(row, col)` so the common case stays compact.
 */
import type { SpreadsheetFormat } from "@/lib/file-validation";
import { ArrayGrid, type CellGrid } from "./grid.ts";

export type CellValue = string | number | boolean | null;

/** Excel's maximum column count; used to build unique numeric cell keys. */
export const MAX_COLUMNS = 16384;

export function cellKey(row: number, col: number): number {
  return row * MAX_COLUMNS + col;
}

export function splitCellKey(key: number): { row: number; col: number } {
  return { row: Math.floor(key / MAX_COLUMNS), col: key % MAX_COLUMNS };
}

export interface CellRange {
  /** Zero-based, inclusive. */
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

/** A structural problem noticed while parsing (e.g. a quote that never closes). */
export interface ParseIssue {
  /** Zero-based row index in the sheet, when known. */
  row: number | null;
  code: string;
  message: string;
}

export interface SheetModel {
  name: string;
  /** Cell storage; rows may be shorter than columnCount (missing trailing cells). */
  grid: CellGrid;
  columnCount: number;
  /** Formula text (without leading "=") for cells that contain formulas. */
  formulas: Map<number, string>;
  /** Cells whose value is an Excel error such as "#N/A". */
  errors: Map<number, string>;
  /** Excel number format per cell, where one is set. */
  numberFormats: Map<number, string>;
  /** Target URL/location of hyperlinked cells. */
  hyperlinks: Map<number, string>;
  merges: CellRange[];
  hiddenRows: Set<number>;
  hiddenColumns: Set<number>;
  /** Column widths in characters, where specified. */
  columnWidths: Map<number, number>;
  /** Row heights in points, where specified. */
  rowHeights: Map<number, number>;
  issues: ParseIssue[];
  /** Total issues seen (issues[] is capped to keep memory bounded). */
  issueCount: number;
  /** Excel workbook uses the 1904 date system (dates are serials counted from 1904-01-01). */
  date1904?: boolean;
}

export function createSheet(name: string): SheetModel {
  return {
    name,
    grid: new ArrayGrid([]),
    columnCount: 0,
    formulas: new Map(),
    errors: new Map(),
    numberFormats: new Map(),
    hyperlinks: new Map(),
    merges: [],
    hiddenRows: new Set(),
    hiddenColumns: new Set(),
    columnWidths: new Map(),
    rowHeights: new Map(),
    issues: [],
    issueCount: 0,
  };
}

export const MAX_STORED_ISSUES = 500;

export function addIssue(sheet: SheetModel, issue: ParseIssue): void {
  sheet.issueCount++;
  if (sheet.issues.length < MAX_STORED_ISSUES) sheet.issues.push(issue);
}

/** Workbook features found by inspection. Used to warn before anything could be lost. */
export interface FeatureInventory {
  charts: number;
  images: number;
  pivotTables: number;
  tables: number;
  comments: number;
  externalLinks: number;
  macros: boolean;
  dataValidation: boolean;
  conditionalFormatting: boolean;
  /** Embedded objects (OLE, ActiveX), which DataFixer never runs. */
  embeddedObjects: number;
}

export interface SheetInfo {
  name: string;
  /** "visible" | "hidden" | "veryHidden" */
  state: "visible" | "hidden" | "veryHidden";
  /** Chartsheets/dialog sheets have no cell grid. */
  kind: "worksheet" | "chartsheet" | "other";
  /** Size declared inside the file before parsing (XLSX), if known. */
  declared?: { rows: number; columns: number } | null;
}

export interface CsvMeta {
  encoding: string;
  hadBom: boolean;
  delimiter: string;
  lineEnding: "\n" | "\r\n" | "\r" | "mixed" | "none";
  /** Characters that could not be decoded and were replaced with U+FFFD. */
  replacementChars: number;
  /** Cells starting with = + - @ that spreadsheet apps may run as formulas. */
  formulaLikeCells: number;
  /** The file ends with a line break (Stage 5 validation). */
  finalLineBreak?: boolean;
  /** First row (0-based) ending with each line-ending type, outside quoted values (Stage 5). */
  lineEndingRows?: { crlf?: number; lf?: number; cr?: number };
}

/** Summary sent to the UI after a file is opened (never contains cell data). */
export interface WorkbookSummary {
  fileName: string;
  fileSize: number;
  format: SpreadsheetFormat;
  sheets: SheetInfo[];
  activeSheet: string;
  /** Row/column counts for loaded sheets. */
  sheetStats: Record<string, { rows: number; columns: number }>;
  features: FeatureInventory | null;
  csv: CsvMeta | null;
  /** Plain-language warnings (features not supported, decoding problems…). */
  warnings: string[];
  issueCount: number;
  issues: ParseIssue[];
  /** Set when the active sheet's cells could not be loaded (file info is still valid). */
  sheetError: { code: string; message: string } | null;
  /** Whether the first row looks like column headers. */
  headerGuess: boolean;
  timings: { totalMs: number };
}

export interface ProgressEvent {
  phase: "reading" | "inspecting" | "parsing" | "indexing" | "scanning" | "exporting" | "verifying" | "locating";
  /** Bytes or rows processed; null when the step cannot report a fraction. */
  loaded: number | null;
  total: number | null;
}
