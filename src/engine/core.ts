/**
 * EngineCore holds the single open spreadsheet and answers requests.
 * It runs inside the Web Worker (see worker/engine.worker.ts) but has no
 * worker-specific code, so it can be unit-tested directly.
 *
 * The user's File is only ever read (Blob.slice), never written. All parsed
 * data stays here; callers receive summaries and pages of rows.
 */
import type { SpreadsheetFormat } from "@/lib/file-validation";
import { EngineError, isOutOfMemory } from "./errors.ts";
import { attachRawLines, namesLookLikeData, validateCsv, type ValidationResult } from "./validate/validate.ts";
import { cellKey } from "./types.ts";
import { throwIfCancelled, type CancelToken } from "./cancel.ts";
import { parseCsv } from "./csv/parse-csv.ts";
import { inspectXlsx, dimensionSize, type InspectionResult } from "./xlsx/inspect.ts";
import { readExcelSheet } from "./xlsx/read-workbook.ts";
import { SheetQuery, guessHeaderRow, type PageView, type RowPage, type RowQuery } from "./query/query.ts";
import type { CsvMeta, FeatureInventory, JsonSummary, MergeSummary, ProgressEvent, SheetInfo, SheetModel, WorkbookSummary, XmlSummary } from "./types.ts";
import { TableMerger, type MergeOptions } from "./merge/merge.ts";
import { XmlReader, XmlSyntaxError } from "./xml/parse.ts";
import { RecordFinder, XmlTableBuilder } from "./xml/table.ts";
import { JsonSyntaxError, parseJson, type JsonValue } from "./json/parse.ts";
import { atPath, findLists, JsonTableBuilder } from "./json/table.ts";
import { jsonFrame, jsonValue, keyNames, recordJson, type JsonLayout, type JsonOut } from "./json/write.ts";
import { ArrayGrid } from "./grid.ts";
import { createSheet } from "./types.ts";
import type { OpenOptions } from "./protocol.ts";
import { runScan, type Finding, type ScanOptions, type ScanResult } from "./scan/scan.ts";
import { ALL_CHECKS } from "./scan/checks/index.ts";
import { EditSession, type ChangeRequest, type EditStats, type HistoryItem, type HistorySummary } from "./edit/session.ts";
import { columnLetter } from "./query/query.ts";
import { planFix, type FixId, type FixOptions, type FixPlan, type FixPreview, type PlanContext } from "./fix/fixes.ts";
import { isRepairId, VALIDATOR_FIX_ALL, type AnyFixId } from "./fix/fix-ids.ts";
import { planRepair } from "./validate/repairs.ts";
import { writeXlsx, verifyNewXlsx, newEntry, XLSX_MAX_ROWS, type OutCell, type SheetSource } from "./export/xlsx-writer.ts";
import { Crc32, PartWriter, writeZip, streamEntry, type OutputEntry } from "./xlsx/zip.ts";
import { countConversion, KEPT_REASON_TEXT, planCsvToXlsx, type KeptReason } from "./convert/csv-to-xlsx.ts";
import { excelSerial, parseTextDate } from "./fix/choice-fixes.ts";
import { classify } from "./scan/classify.ts";
import { buildCsv, cellOutText, verifyCsv } from "./export/csv-export.ts";
import { readZipEntries, type ZipEntry } from "./xlsx/zip.ts";
import { affectedBy, buildReferenceIndex, type ReferenceIndex } from "./xlsx/references.ts";
import { patchXlsx } from "./xlsx/patch.ts";
import { estimateExcelMemory } from "./xlsx/read-workbook.ts";
import { XLS_REBUILD_LOSSES, rebuildXlsAsXlsx } from "./export/xls-export.ts";
import type { CellValue } from "./types.ts";
import { familyOf } from "./scan/checks/dates.ts";
import { planCombineColumns, planSplitColumn, type CombinePlanInput, type SplitCombinePlan, type SplitPlanInput } from "./fix/split-combine-plans.ts";
import { planDuplicates, type DuplicatePlan, type DuplicatePlanInput } from "./fix/duplicates.ts";
import { partSheet, planSplitFile, type SplitFileInput, type SplitFilePlan } from "./split/split-file.ts";
import { CHANGE_COLOURS, CompareReport, ReportGrid } from "./compare/report.ts";
import { convertValue } from "./convert/csv-to-xlsx.ts";
import { compareTables, matchColumns, rowChanges, suggestKey, ADDED, CHANGED, UNCHANGED, type CompareResult, type CompareTable } from "./compare/compare.ts";

interface OpenState {
  file: Blob;
  fileName: string;
  /** JSON and XML files are held as "csv" (see openJson, openXml); WorkbookSummary reports them as "json" or "xml". */
  format: Exclude<SpreadsheetFormat, "json" | "xml">;
  sheets: SheetInfo[];
  loaded: Map<string, LoadedSheet>;
  inspection: InspectionResult | null;
  /** Stage 4 (Excel download): ZIP directory and per-sheet reference indexes, built when first needed. */
  zip?: ZipEntry[];
  refIndex?: Map<string, ReferenceIndex>;
  csv: CsvMeta | null;
  /** Stage 12: a JSON file shown as a text table (it then works like a CSV file inside the engine). */
  json?: JsonSummary & { headerRow: boolean };
  /** Stage 14: an XML file shown as a text table (like a CSV file inside the engine). */
  xml?: XmlSummary;
  /** Stage 15: several files merged into one text table (like a CSV file inside the engine). */
  merge?: MergeSummary & { headerRow: boolean; bytes: number };
  activeSheet: string;
  sheetError: { code: string; message: string } | null;
  /** Warnings produced while reading the active sheet (Excel). */
  sheetWarnings: string[];
  memoryBudgetBytes: number | undefined;
  startedAt: number;
  /** Latest Error Detector scan (kept for "view affected data"). */
  lastScan: {
    sheet: string;
    headerRow: boolean;
    /** Rows in the scanned sheet, and the first data row (after the header). */
    rowCount: number;
    startRow: number;
    findings: Finding[];
    /** Unique per scan (cache keys). */
    seq: number;
    /** Cached row mask for the issue being viewed. */
    view?: { id: string; mask: Uint8Array | undefined };
  } | null;
}

type Progress = (p: ProgressEvent) => void;

/** A loaded sheet: the original data, plus the Stage 4 edit session once something is changed. */
interface LoadedSheet {
  sheet: SheetModel;
  query: SheetQuery;
  session?: EditSession;
  /** Session version the query was built for. */
  queryVersion?: number;
}

/** Result of every Stage 4 change, undo or redo. */
export interface EditResult {
  /** The (last) history entry changed by this call (null when nothing changed). */
  entry: HistorySummary | null;
  /** Every history entry changed by this call ("Fix all" applies several). */
  entries: HistorySummary[];
  stats: EditStats;
}

/** Stage 5 (CSV Validator, decision 3): how the downloaded CSV is written. */
export interface CsvDownloadOptions {
  delimiter?: "," | ";" | "\t";
  lineEnding?: "\r\n" | "\n";
  /** UTF-8 with BOM (default) or without (for databases). */
  bom?: boolean;
  /** Stage 6, Excel sources (decision 4): values as shown in Excel (default) or plain values for databases. */
  values?: "shown" | "plain";
}

/** The three format choices of a CSV download (Stage 5, decision 3). */
export type CsvFormat = Required<Pick<CsvDownloadOptions, "delimiter" | "lineEnding" | "bom">>;

/** Stage 6 (decision 3): every worksheet as its own CSV, in one ZIP file. */
export interface WorkbookZipSummary {
  originalName: string;
  downloadName: string;
  bytes: number;
  csv: { delimiter: string; lineEnding: "\r\n" | "\n"; bom: boolean; values: "shown" | "plain" };
  files: { name: string; sheet: string; hidden: boolean; rows: number; cells: number; bytes: number }[];
  /** Chart sheets (no cells), not included. */
  skipped: string[];
  notPreserved: string[];
  warnings: string[];
}

export interface WorkbookZipResult {
  blob: Blob;
  summary: WorkbookZipSummary;
}

/** Stage 17 (Compare): one of the two files. */
export interface CompareFileInput {
  file: File;
  format: SpreadsheetFormat;
  /** Workbooks: the sheet to compare (default: the first visible sheet). */
  sheet?: string;
}

export interface CompareOptionsInput {
  /** Key column names; null compares whole rows; undefined: suggested automatically. */
  keys?: string[] | null;
  ignoreCase: boolean;
  ignoreSpaces: boolean;
  memoryBudgetBytes?: number;
}

export interface CompareSideSummary {
  name: string;
  /** Workbooks: the sheet compared, and every worksheet to choose from. */
  sheet: string | null;
  sheets: string[];
  rows: number;
  columns: number;
  header: boolean;
}

export interface CompareSummary {
  older: CompareSideSummary;
  newer: CompareSideSummary;
  columns: { name: string; inOlder: boolean; inNewer: boolean }[];
  /** Key columns used; null: whole rows. */
  keys: string[] | null;
  /** The key MyDataFixer suggests (null: no column is suitable). */
  suggestedKey: string | null;
  counts: { added: number; removed: number; changed: number; unchanged: number; changedCells: number };
  repeated: { older: number; newer: number; examples: string[] };
  ignoreCase: boolean;
  ignoreSpaces: boolean;
}

export type CompareKind = "changed" | "added" | "removed" | "unchanged";

export interface CompareItem {
  kind: CompareKind;
  /** Row number in the newer file (1-based, counting every row), or null for a removed row. */
  newerRow: number | null;
  /** Row number in the older file, or null for an added row. */
  olderRow: number | null;
  /** The key values (or the first values, for whole-row comparisons). */
  key: string;
  repeated: boolean;
  /** Changed rows: what changed. */
  changes: { column: string; old: string; new: string }[];
  /** Added and removed rows: the row's values, by column. */
  values: { column: string; value: string }[];
}

export interface CompareReportResult {
  blob: Blob;
  summary: { downloadName: string; bytes: number; format: "csv" | "xlsx"; rows: number; sheets: number; includeUnchanged: boolean; verification: { reader: string; rows: number; cells: number } };
}

/** Stage 16 (Split File): the format of the parts. */
export type SplitOutput = "csv" | "xlsx";

/** Stage 16: the parts a split would make (nothing is created yet). */
export interface SplitFilePreview {
  parts: { name: string; fileName: string; value: string | null; rows: number; firstRow: number; lastRow: number }[];
  headerRow: boolean;
  dataRows: number;
  columnName: string | null;
  output: SplitOutput;
  /** CSV parts: how they are written. */
  csv: { delimiter: string; lineEnding: "\r\n" | "\n"; bom: boolean } | null;
  /** Excel parts: parts with more rows than one sheet holds continue on more sheets. */
  overSheetLimit: number;
}

/** Stage 16: one part, created and checked. */
export interface SplitPartResult {
  blob: Blob;
  fileName: string;
  rows: number;
  verification: { reader: string; rows: number; cells: number };
}

/** Stage 16: every part in one ZIP, each checked, and the ZIP read back. */
export interface SplitZipResult {
  blob: Blob;
  summary: {
    downloadName: string;
    bytes: number;
    output: SplitOutput;
    files: { name: string; rows: number; bytes: number }[];
    verification: { reader: string; rows: number; cells: number };
  };
}

/** Shown after a successful, verified download (safeguard S3). */
export interface ExportSummary {
  originalName: string;
  downloadName: string;
  format: "csv" | "xlsx";
  bytes: number;
  /** Excel download: workbook parts that were rewritten or removed (all others are byte-identical). */
  changedParts?: string[];
  /** Rows and columns in the downloaded file (including the header row). */
  rows: number;
  columns: number;
  cellsEdited: number;
  rowsRemoved: number;
  columnsRemoved: number;
  /** CSV Validator: rows made shorter (empty extra fields removed). */
  rowsShortened?: number;
  duplicatesRemoved: number;
  /** Cells, rows and columns changed by automatic fixes. */
  automaticCorrections: number;
  manualEdits: number;
  /** CSV downloads: how the file was written. */
  csv?: { delimiter: string; lineEnding: "\r\n" | "\n"; bom: boolean; values?: "shown" | "plain" };
  /** What the downloaded file can't keep (empty: nothing lost). */
  notPreserved: string[];
  warnings: string[];
  /** How the file was checked before it was offered. */
  verification: { reader: string; rows: number; cells: number };
  /** Edit version that was exported (a later change makes this download out of date). */
  version: number;
}

/** Stage 6: CSV → Excel conversion result (shown after a verified download). */
export interface ConvertSummary {
  originalName: string;
  downloadName: string;
  bytes: number;
  headerRow: boolean;
  /** Sheets written, with their data rows (header excluded). */
  sheets: { name: string; rows: number }[];
  /** More rows than one Excel sheet holds: continued on more sheets (decision 2). */
  split: boolean;
  counts: { numbers: number; dates: number; text: number; empty: number };
  /** Values that look like numbers or dates but were kept as text, with the reason. */
  keptAsText: { reason: string; count: number }[];
  verification: { reader: string; rows: number; cells: number };
}

export interface ConvertResult {
  blob: Blob;
  summary: ConvertSummary;
}

export interface ExportResult {
  blob: Blob;
  summary: ExportSummary;
}

/** One cell, for the cell editor. */
export interface CellInfo {
  row: number;
  col: number;
  /** "B4" (current position). */
  ref: string;
  /** As shown in the table. */
  display: string;
  /** Text to start editing with. */
  editText: string;
  /** Formula text (without "="), if the cell holds a formula. */
  formula: string | null;
  isDate: boolean;
  edited: boolean;
}

/** A fix preview as sent to the page: the token must be passed back to apply exactly this preview. */
/** Stage 12: CSV / Excel → JSON. */
export interface JsonExportOptions {
  headerRow: boolean;
  /** Plain numbers, true/false and empty cells become numbers, booleans and null (decision 3A). */
  detect: boolean;
  layout: JsonLayout;
}

export interface JsonPreview {
  keys: string[];
  records: number;
  /** The first records, exactly as they will be written. */
  sample: string;
  sampleRecords: number;
}

export interface JsonExportResult {
  blob: Blob;
  summary: { downloadName: string; bytes: number; records: number; keys: number; layout: JsonLayout };
}

/** Stage 11: preview of the Remove Duplicates page. */
export interface DuplicatesPreview extends Omit<DuplicatePlan, "requests" | "removeRows"> {
  /** Pass to applyFix to apply exactly this preview; null when nothing will change. */
  token: string | null;
  /**
   * Removing the rows was not allowed: what would break in the workbook (.xlsx), or that
   * an old .xls file can't be checked. Nothing is removed unless the user chooses to clear the rows.
   */
  blockedBy: string[];
  /** The rows' cells are cleared instead of removing the rows (the user chose it after a block). */
  clearing: boolean;
  /** Cells that will be cleared when `clearing`. */
  cellsCleared: number;
}

/** Stage 10: preview of "Split a column" or "Combine columns". */
export interface SplitCombinePreview extends Omit<SplitCombinePlan, "requests"> {
  /** Pass to applyFix to apply exactly this preview; null when nothing would change. */
  token: string | null;
  /** Excel: removing the original column(s) would break these, so they are kept. */
  originalsKept: string[];
}

export interface FixPreviewResult extends FixPreview {
  token: string;
  /** Rows or columns would be removed from an Excel file (workbook references must be checked before download). */
  deletesFromExcel: boolean;
  /**
   * Excel files (S2): what removing these rows/columns would break. When not
   * empty, removal is not offered; `clearing` says the preview clears the cells instead.
   */
  excelCheck: { affected: string[]; clearing: boolean } | null;
}

/** S3: tell the user when rows/columns were cleared instead of removed (they remain as empty rows/columns). */
function clearedWarning(applied: HistorySummary[]): string | null {
  const cleared = applied.filter((e) => e.label.endsWith("(cells cleared, positions kept)"));
  if (!cleared.length) return null;
  const cells = cleared.reduce((n, e) => n + e.cells, 0);
  return `${cells.toLocaleString("en-US")} cell${cells === 1 ? " was" : "s were"} cleared instead of removing rows or columns (to protect formulas, charts or other parts that refer to them), so those rows or columns remain in the file as empty rows or columns.`;
}

/** Turn row/column removals into clearing their cells (positions stay; nothing that refers to them breaks). */
function removalsToClears(view: SheetModel, req: ChangeRequest): ChangeRequest | null {
  const keys: number[] = [];
  const g = view.grid;
  const add = (r: number, c: number) => {
    const v = g.get(r, c);
    if (v !== null && v !== "" && !view.formulas.has(cellKey(r, c))) keys.push(cellKey(r, c));
  };
  for (const d of req.deleteRows ?? []) for (let c = 0; c < g.rowLength(d.row); c++) add(d.row, c);
  for (const d of req.deleteColumns ?? []) for (let r = 0; r < g.rowCount; r++) if (d.col < g.rowLength(r)) add(r, d.col);
  const unique = [...new Set(keys)];
  if (!unique.length) return null;
  return { operation: req.operation, label: `${req.label} (cells cleared, positions kept)`, cellKeys: Float64Array.from(unique), cellValues: unique.map(() => null) };
}

/** "Fix all safe problems": every safe fix, planned one after another, applied as one step each. */
export interface FixAllPreview {
  token: string;
  /** Fixes that would change something, in the order they are applied. */
  steps: FixPreview[];
  cellsChanged: number;
  rowsRemoved: number;
  columnsRemoved: number;
  rowsShortened: number;
  /** What "Fix all" leaves for the user, with the reason. */
  notes: string[];
}

/** Order matters: spaces first (so " Ann" and "Ann" become duplicates), removals last. */
const FIX_ALL_ORDER: FixId[] = ["extra-spaces", "inconsistent-case", "numbers-as-text", "duplicate-rows", "empty-rows", "empty-columns"];
const ROW_OR_COLUMN_FIXES = new Set<FixId>(["duplicate-rows", "empty-rows", "empty-columns"]);

const NO_EDITS: EditStats = { cellsEdited: 0, rowsRemoved: 0, columnsRemoved: 0, rowsShortened: 0, columnsAdded: 0, changesApplied: 0, canUndo: false, canRedo: false, version: 0 };

export function featureWarnings(f: FeatureInventory | null): string[] {
  if (!f) return [];
  const w: string[] = [];
  const parts: string[] = [];
  if (f.charts) parts.push(`${f.charts} chart${f.charts > 1 ? "s" : ""}`);
  if (f.images) parts.push(`${f.images} image${f.images > 1 ? "s" : ""}`);
  if (f.pivotTables) parts.push(`${f.pivotTables} pivot table${f.pivotTables > 1 ? "s" : ""}`);
  if (f.dataValidation) parts.push("data validation rules");
  if (f.conditionalFormatting) parts.push("conditional formatting");
  if (f.comments) parts.push("comments");
  if (f.tables) parts.push(`${f.tables} Excel table${f.tables > 1 ? "s" : ""}`);
  if (parts.length) {
    w.push(
      `This workbook contains ${joinList(parts)}. MyDataFixer reads the cell data only; these features stay untouched in your original file. Any file you download later will tell you clearly which of them it can keep.`,
    );
  }
  if (f.macros) w.push("This workbook contains macros. MyDataFixer never runs macros.");
  if (f.externalLinks) w.push("This workbook links to other workbooks. MyDataFixer never opens or updates external links; linked values are shown as last saved.");
  if (f.embeddedObjects) w.push("This workbook contains embedded objects. MyDataFixer never opens or runs them.");
  return w;
}

function joinList(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function csvWarnings(meta: CsvMeta): string[] {
  const w: string[] = [];
  if (meta.replacementChars > 0) {
    w.push(
      `${meta.replacementChars.toLocaleString("en-US")} character${meta.replacementChars > 1 ? "s" : ""} could not be decoded and ${meta.replacementChars > 1 ? "are" : "is"} shown as “�”. The file may use a different text encoding than detected (${meta.encoding}).`,
    );
  }
  if (meta.encoding === "windows-1252") {
    w.push("This file is not UTF-8, so it was read using the Windows (Western European) encoding. Check that accented characters look right.");
  }
  if (meta.formulaLikeCells > 0) {
    w.push(
      `${meta.formulaLikeCells.toLocaleString("en-US")} cell${meta.formulaLikeCells > 1 ? "s" : ""} start with =, +, - or @. Spreadsheet apps may treat these as formulas when the CSV is opened. MyDataFixer shows them as plain text and never runs them.`,
    );
  }
  return w;
}

/**
 * Stage 12: open a JSON or JSON Lines file as a text table. Numbers keep their JSON
 * spelling, true/false become text and null an empty cell, so the table works exactly
 * like an opened CSV file (the verified CSV download and the CSV to Excel rules apply).
 */
async function openJson(file: File, options: OpenOptions, onProgress: Progress, startedAt: number, cancel?: CancelToken): Promise<OpenState> {
  const lines = /\.jsonl$/i.test(file.name);
  const budget = options.memoryBudgetBytes;
  const tooLarge = (needMB: number) =>
    new EngineError(
      "too-large-for-engine",
      `This JSON file is too large to open safely in this browser on this device (it needs roughly ${needMB} MB of memory or more). Nothing was changed. Try a computer${lines ? "" : ", or save the data as JSON Lines (.jsonl, one record per line)"}.`,
    );
  const notUtf8 = () => new EngineError("corrupt-file", "This file isn't UTF-8 text, so it can't be read as JSON. Save it as UTF-8 and try again.");
  const invalid = (e: JsonSyntaxError) => new EngineError("corrupt-file", `This file isn't valid JSON${lines ? " Lines" : ""}: ${e.message}`);
  const builder = new JsonTableBuilder({ asText: true });
  let lists: { path: string; length: number }[];
  let path: string | null;

  if (lines) {
    // JSON Lines is read in pieces, one line at a time, so memory grows with the table (like a CSV file).
    const limit = budget ? budget * 0.8 : Infinity;
    const reader = file.stream().pipeThrough(new TextDecoderStream("utf-8", { fatal: true })).getReader();
    let rest = "";
    let lineNo = 0;
    let loaded = 0;
    let offset = 0;
    const handle = (raw: string) => {
      lineNo++;
      let line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      if (lineNo === 1 && line.charCodeAt(0) === 0xfeff) line = line.slice(1);
      if (line.trim() !== "") {
        let value;
        try {
          value = parseJson(line);
        } catch (e) {
          if (e instanceof JsonSyntaxError) throw invalid(new JsonSyntaxError(e.what, lineNo, e.column, offset + e.offset));
          throw e;
        }
        builder.add(value, 64 + line.length * 2);
        if (builder.bytes > limit) throw tooLarge(Math.ceil((builder.bytes / Math.max(loaded, 1)) * file.size / 1048576));
      }
      offset += raw.length + 1;
    };
    for (;;) {
      let chunk;
      try {
        chunk = await reader.read();
      } catch {
        throw notUtf8();
      }
      if (chunk.done) break;
      loaded += chunk.value.length;
      const text = rest + chunk.value;
      let from = 0;
      for (let nl = text.indexOf("\n"); nl !== -1; nl = text.indexOf("\n", from)) {
        handle(text.slice(from, nl));
        from = nl + 1;
      }
      rest = text.slice(from);
      throwIfCancelled(cancel);
      onProgress({ phase: "parsing", loaded: Math.min(loaded, file.size), total: file.size });
    }
    if (rest !== "") handle(rest);
    path = "";
    lists = [{ path: "", length: 0 }];
  } else {
    // A .json file has to be read as a whole: about 10 times its size in memory (measured).
    if (budget && file.size * 10 > budget) throw tooLarge(Math.ceil((file.size * 10) / 1048576));
    onProgress({ phase: "parsing", loaded: 0, total: file.size });
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      throw notUtf8();
    }
    throwIfCancelled(cancel);
    let root: JsonValue;
    try {
      root = parseJson(text);
    } catch (e) {
      if (e instanceof JsonSyntaxError) throw invalid(e);
      throw e;
    }
    text = "";
    throwIfCancelled(cancel);
    lists = findLists(root);
    const wanted = options.jsonPath;
    path = wanted !== undefined && lists.some((l) => l.path === wanted) ? wanted : (lists[0]?.path ?? null);
    const data = path === null ? root : atPath(root, path);
    for (const item of Array.isArray(data) ? data : [data]) builder.add(item);
  }
  onProgress({ phase: "indexing", loaded: null, total: null });
  const table = builder.finish();
  const rows = table.rows;
  const records = Math.max(0, rows.length - (table.headerRow ? 1 : 0));
  if (lines) lists = [{ path: "", length: records }];
  const sheet = createSheet("Sheet1");
  sheet.grid = new ArrayGrid(rows);
  sheet.columnCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return {
    file,
    fileName: file.name,
    format: "csv",
    sheets: [{ name: sheet.name, state: "visible", kind: "worksheet" }],
    loaded: new Map([[sheet.name, { sheet, query: new SheetQuery(sheet) }]]),
    inspection: null,
    csv: null,
    json: { lines, lists, path, records, listsAsText: table.listsAsText, longNumbers: table.longNumbers, headerRow: table.headerRow },
    activeSheet: sheet.name,
    sheetError: null,
    sheetWarnings: [],
    memoryBudgetBytes: options.memoryBudgetBytes,
    startedAt,
    lastScan: null,
  };
}

/** Stage 14: the encoding named by a BOM or the XML declaration (UTF-8 when none). */
function xmlEncoding(head: Uint8Array): string {
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return "utf-8";
  if (head[0] === 0xff && head[1] === 0xfe) return "utf-16le";
  if (head[0] === 0xfe && head[1] === 0xff) return "utf-16be";
  const start = new TextDecoder("latin1").decode(head.subarray(0, 200));
  const m = /^\s*<\?xml[^>]*\bencoding\s*=\s*["']([A-Za-z0-9._-]+)["']/.exec(start);
  return m ? m[1]!.toLowerCase() : "utf-8";
}

/**
 * Stage 14: open an XML file as a text table. The file is read twice in pieces: first to
 * find the repeating elements (the records), then to build the rows, so memory grows with
 * the table, with a safe stop when it would pass the device's memory budget.
 */
async function openXml(file: File, options: OpenOptions, onProgress: Progress, startedAt: number, cancel?: CancelToken): Promise<OpenState> {
  const encoding = xmlEncoding(new Uint8Array(await file.slice(0, 512).arrayBuffer()));
  try {
    new TextDecoder(encoding);
  } catch {
    throw new EngineError("unsupported-format", `This file uses the “${encoding}” text encoding, which this browser can't read. Save it as UTF-8 and try again.`);
  }
  const limit = options.memoryBudgetBytes ? options.memoryBudgetBytes * 0.8 : Infinity;
  const pass = async (reader: XmlReader, phase: "inspecting" | "parsing", check?: () => void) => {
    const stream = file.stream().pipeThrough(new TextDecoderStream(encoding, { fatal: true })).getReader();
    let loaded = 0;
    try {
      for (;;) {
        let chunk;
        try {
          chunk = await stream.read();
        } catch {
          throw new EngineError("corrupt-file", `This file can't be read as ${encoding.toUpperCase()} text. Save it as UTF-8 and try again.`);
        }
        if (chunk.done) break;
        reader.feed(chunk.value);
        check?.();
        loaded += chunk.value.length;
        throwIfCancelled(cancel);
        onProgress({ phase, loaded: Math.min(loaded, file.size), total: file.size });
      }
      reader.end();
    } catch (e) {
      if (e instanceof XmlSyntaxError) throw new EngineError("corrupt-file", `This file isn't valid XML: ${e.message}`);
      throw e;
    }
  };
  const finder = new RecordFinder();
  await pass(new XmlReader(finder), "inspecting");
  const choices = finder.choices();
  const wanted = options.xmlPath;
  const path = wanted !== undefined && choices.some((c) => c.path === wanted) ? wanted : choices[0]!.path;
  const builder = new XmlTableBuilder(path);
  await pass(new XmlReader(builder), "parsing", () => {
    if (builder.bytes > limit) {
      throw new EngineError(
        "too-large-for-engine",
        `This XML file is too large to open safely in this browser on this device (it needs roughly ${Math.ceil((limit / 0.8) / 1048576)} MB of memory or more). Nothing was changed. Try a computer.`,
      );
    }
  });
  onProgress({ phase: "indexing", loaded: null, total: null });
  const table = builder.finish();
  const sheet = createSheet("Sheet1");
  sheet.grid = new ArrayGrid(table.rows);
  sheet.columnCount = table.rows.reduce((m, r) => Math.max(m, r.length), 0);
  return {
    file,
    fileName: file.name,
    format: "csv",
    sheets: [{ name: sheet.name, state: "visible", kind: "worksheet" }],
    loaded: new Map([[sheet.name, { sheet, query: new SheetQuery(sheet) }]]),
    inspection: null,
    csv: null,
    xml: { choices, path, records: table.records, joinedCells: table.joinedCells, outside: table.outside, encoding },
    activeSheet: sheet.name,
    sheetError: null,
    sheetWarnings: [],
    memoryBudgetBytes: options.memoryBudgetBytes,
    startedAt,
    lastScan: null,
  };
}

/** Stage 15 (decision 5A): limits for merging. */
export const MERGE_MAX_FILES = 50;
export const MERGE_MAX_BYTES = 150 * 1024 * 1024;
/** Stage 17 (decision 4A): both files together. */
export const COMPARE_MAX_BYTES = 150 * 1024 * 1024;

interface CompareSide {
  id: string;
  sheet: SheetModel;
  table: CompareTable;
  info: CompareSideSummary;
}

export class EngineCore {
  private state: OpenState | null = null;
  private scanSeq = 0;
  private fixSeq = 0;
  /** The latest fix preview; applying it requires the data to be unchanged since. */
  private pendingFix: { token: string; sheet: string; version: number; requests: ChangeRequest[] } | null = null;

  close(): void {
    this.state = null;
    this.pendingFix = null;
  }

  async open(file: File, format: SpreadsheetFormat, options: OpenOptions, onProgress: Progress, cancel?: CancelToken): Promise<WorkbookSummary> {
    this.close(); // release any previous file first
    const startedAt = Date.now();
    if (file.size === 0) throw new EngineError("empty-file", "This file is empty (0 bytes).");

    if (format === "json") {
      this.state = await openJson(file, options, onProgress, startedAt, cancel);
      return this.summary();
    }
    if (format === "xml") {
      this.state = await openXml(file, options, onProgress, startedAt, cancel);
      return this.summary();
    }

    if (format === "csv") {
      const { sheet, meta } = await parseCsv(file, "Sheet1", {
        delimiter: options.delimiter,
        encoding: options.encoding,
        memoryBudgetBytes: options.memoryBudgetBytes,
        cancel,
        onProgress: (loaded, total) => onProgress({ phase: "parsing", loaded, total }),
      });
      onProgress({ phase: "indexing", loaded: null, total: null });
      this.state = {
        file,
        fileName: file.name,
        format,
        sheets: [{ name: sheet.name, state: "visible", kind: "worksheet" }],
        loaded: new Map([[sheet.name, { sheet, query: new SheetQuery(sheet) }]]),
        inspection: null,
        csv: meta,
        activeSheet: sheet.name,
        sheetError: null,
        sheetWarnings: [],
        memoryBudgetBytes: options.memoryBudgetBytes,
        startedAt,
        lastScan: null,
      };
      return this.summary();
    }

    let inspection: InspectionResult | null = null;
    let sheets: SheetInfo[];
    if (format === "xlsx") {
      inspection = await inspectXlsx(file, {
        cancel,
        onProgress: (loaded, total) => onProgress({ phase: "inspecting", loaded, total }),
      });
      sheets = inspection.sheets.map((s) => ({
        name: s.name,
        state: s.state,
        kind: s.kind,
        declared: dimensionSize(s.dimension),
      }));
    } else {
      // XLS (binary): the sheet list is discovered while reading.
      sheets = [];
    }

    const first = sheets.find((s) => s.kind === "worksheet" && s.state === "visible") ?? sheets.find((s) => s.kind === "worksheet");
    this.state = {
      file,
      fileName: file.name,
      format,
      sheets,
      loaded: new Map(),
      inspection,
      csv: null,
      activeSheet: first?.name ?? sheets[0]?.name ?? "",
      sheetError: null,
      sheetWarnings: [],
      memoryBudgetBytes: options.memoryBudgetBytes,
      startedAt,
      lastScan: null,
    };
    if (first) await this.loadSheet(first.name, onProgress, cancel);
    else if (format === "xls") {
      await this.loadExcelSheet(0, onProgress, cancel);
      // If the first sheet is hidden or a chart, open the first visible worksheet instead.
      const st = this.requireState();
      const visible = st.sheets.findIndex((s) => s.kind === "worksheet" && s.state === "visible");
      if (visible > 0 && st.sheets[0]?.state !== "visible") await this.loadSheet(st.sheets[visible]!.name, onProgress, cancel);
    }
    return this.summary();
  }

  /**
   * Stage 15: read several files one at a time and merge them into one text table
   * (Excel files: their first visible sheet, values as shown). Only the merged table is
   * kept; the usual memory budget applies.
   */
  async openMerge(
    files: { file: File; format: SpreadsheetFormat }[],
    options: MergeOptions & { memoryBudgetBytes?: number },
    onProgress: Progress,
    cancel?: CancelToken,
  ): Promise<WorkbookSummary> {
    this.close();
    const startedAt = Date.now();
    if (files.length < 2) throw new EngineError("unsupported-format", "Choose at least two files to merge.");
    if (files.length > MERGE_MAX_FILES) throw new EngineError("unsupported-format", `Up to ${MERGE_MAX_FILES} files can be merged at once. Merge them in groups, then merge the results.`);
    const total = files.reduce((n, f) => n + f.file.size, 0);
    if (total > MERGE_MAX_BYTES) {
      throw new EngineError("too-large-for-engine", `These files are ${(total / 1048576).toFixed(1)} MB together; up to ${MERGE_MAX_BYTES / 1048576} MB can be merged at once. Merge them in smaller groups.`);
    }
    const budget = options.memoryBudgetBytes;
    const merger = new TableMerger({ sourceColumn: options.sourceColumn, removeDuplicates: options.removeDuplicates });
    const infos: MergeSummary["files"] = [];
    let done = 0;
    for (const { file, format } of files) {
      throwIfCancelled(cancel);
      if (file.size === 0) throw new EngineError("empty-file", `“${file.name}” is empty (0 bytes).`);
      const progress = (loaded: number | null) => onProgress({ phase: "parsing", loaded: loaded === null ? done : done + loaded, total });
      let sheet: SheetModel;
      try {
        if (format === "csv") {
          sheet = (await parseCsv(file, "Sheet1", { memoryBudgetBytes: budget, cancel, onProgress: (loaded) => progress(loaded) })).sheet;
        } else if (format === "xlsx" || format === "xls") {
          let index = 0;
          let inspection: InspectionResult | null = null;
          if (format === "xlsx") {
            inspection = await inspectXlsx(file, { cancel });
            const i = inspection.sheets.findIndex((s) => s.kind === "worksheet" && s.state === "visible");
            index = i >= 0 ? i : 0;
          }
          sheet = (await readExcelSheet(file, format, { sheetIndex: index, inspection, memoryBudgetBytes: budget, cancel })).sheet;
        } else throw new EngineError("unsupported-format", "Only CSV, TSV, TXT and Excel files can be merged.");
      } catch (e) {
        if (e instanceof EngineError && e.code !== "cancelled") throw new EngineError(e.code, `“${file.name}”: ${e.message}`, e.detail);
        throw e;
      }
      const header = guessHeaderRow(sheet);
      const g = sheet.grid;
      // The merger reads each cell as shown, straight from the file's table (no copy of the file).
      merger.add(file.name, { rowCount: g.rowCount, rowLength: (r) => g.rowLength(r), text: (r, c) => cellOutText(sheet, r, c, true) }, header);
      infos.push({ name: file.name, rows: Math.max(0, g.rowCount - (header ? 1 : 0)), columns: sheet.columnCount, header, sheet: format === "csv" ? null : sheet.name });
      if (budget && merger.bytes > budget * 0.8) {
        throw new EngineError("too-large-for-engine", "The merged table would be too large to keep safely in this browser on this device. Nothing was changed. Merge fewer or smaller files, or use a computer.");
      }
      done += file.size;
      progress(null);
    }
    onProgress({ phase: "indexing", loaded: null, total: null });
    const result = merger.finish();
    const merged = createSheet("Merged");
    merged.grid = result.grid;
    let width = 0;
    for (let r = 0; r < result.grid.rowCount; r++) width = Math.max(width, result.grid.rowLength(r));
    merged.columnCount = width;
    this.state = {
      file: files[0]!.file,
      fileName: "merged.csv",
      format: "csv",
      sheets: [{ name: merged.name, state: "visible", kind: "worksheet" }],
      loaded: new Map([[merged.name, { sheet: merged, query: new SheetQuery(merged) }]]),
      inspection: null,
      csv: null,
      merge: {
        files: infos,
        columns: result.columns,
        sourceColumn: options.sourceColumn,
        removeDuplicates: options.removeDuplicates,
        duplicatesRemoved: result.duplicatesRemoved,
        records: result.records,
        headerRow: result.headerRow,
        bytes: total,
      },
      activeSheet: merged.name,
      sheetError: null,
      sheetWarnings: [],
      memoryBudgetBytes: budget,
      startedAt,
      lastScan: null,
    };
    return this.summary();
  }

  async loadSheet(name: string, onProgress: Progress, cancel?: CancelToken): Promise<WorkbookSummary> {
    const st = this.requireState();
    const index = st.sheets.findIndex((s) => s.name === name);
    const info = st.sheets[index];
    if (!info) throw new EngineError("sheet-not-found", `There is no sheet called “${name}” in this file.`);
    st.activeSheet = name;
    st.sheetError = null;
    if (st.loaded.has(name)) return this.summary();
    if (info.kind !== "worksheet") {
      st.sheetWarnings = [];
      st.sheetError = { code: "chartsheet", message: "This sheet contains a chart, not cells, so there is no data to show." };
      return this.summary();
    }
    if (st.format === "csv") return this.summary();
    await this.loadExcelSheet(index, onProgress, cancel);
    return this.summary();
  }

  /** Parse one Excel sheet. Only one Excel sheet is kept in memory at a time. */
  private async loadExcelSheet(index: number, onProgress: Progress, cancel?: CancelToken): Promise<void> {
    const st = this.requireState();
    if (st.format === "csv") return;
    st.loaded.clear(); // release the previously loaded sheet before parsing the next one
    st.lastScan = null;
    st.sheetWarnings = [];
    st.sheetError = null;
    try {
      const result = await readExcelSheet(st.file, st.format, {
        sheetIndex: index,
        inspection: st.inspection,
        memoryBudgetBytes: st.memoryBudgetBytes,
        cancel,
        onProgress: (phase, loaded, total) => onProgress({ phase, loaded, total }),
      });
      if (result.sheets) st.sheets = result.sheets;
      st.activeSheet = result.sheet.name;
      st.loaded.set(result.sheet.name, { sheet: result.sheet, query: new SheetQuery(result.sheet) });
      st.sheetWarnings = result.warnings;
    } catch (err) {
      if (err instanceof EngineError && (err.code === "too-large-for-engine" || err.code === "out-of-memory") && st.sheets.length > 0) {
        // File-level information stays valid; only this sheet's cells are unavailable.
        st.sheetError = { code: err.code, message: err.message };
      } else throw err;
    }
  }

  getRows(sheetName: string, query: RowQuery): RowPage {
    const { query: q } = this.current(sheetName);
    return q.getPage(query, this.issueView(sheetName, query.issue));
  }

  /**
   * Row mask and cell flags for "view affected data". The mask is built once
   * per issue (1 byte per row); flagged cells are found by binary search in the
   * issue's sorted cell list, so only visible cells are looked up.
   */
  private issueView(sheetName: string, issueId: string | undefined): PageView {
    const scan = this.state?.lastScan;
    if (!issueId || !scan || scan.sheet !== sheetName) return {};
    const f = scan.findings.find((x) => x.issue.id === issueId);
    if (!f) throw new EngineError("internal", "That problem is no longer in the results. Please check the file again.");
    if (scan.view?.id !== issueId) {
      let mask: Uint8Array | undefined;
      if (f.rows) {
        mask = new Uint8Array(scan.rowCount);
        for (const r of f.rows) mask[r] = 1;
      }
      scan.view = { id: issueId, mask };
    }
    const cells = f.cells;
    const columns = f.columns ? new Set(f.columns) : null;
    const flagged = cells
      ? (r: number, c: number) => {
          const key = cellKey(r, c);
          let lo = 0;
          let hi = cells.length - 1;
          while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            const v = cells[mid]!;
            if (v === key) return true;
            if (v < key) lo = mid + 1;
            else hi = mid - 1;
          }
          return false;
        }
      : columns
        ? (r: number, c: number) => r >= scan.startRow && columns.has(c)
        : f.rows
          ? () => true // row-level issue (e.g. duplicates): the whole row is affected
          : undefined;
    return { mask: scan.view.mask, maskKey: `issue:${issueId}:${scan.seq}`, flagged };
  }

  /**
   * Error Detector scan of a loaded sheet. Read-only: data is never changed.
   * The scan context is kept (replacing any previous one) for later views.
   */
  async scan(sheetName: string, options: ScanOptions, onProgress: Progress, cancel?: CancelToken): Promise<ScanResult> {
    const st = this.requireState();
    const { sheet } = this.current(sheetName);
    st.lastScan = null; // release the previous scan's caches first
    const { result, ctx, findings } = await runScan(sheet, {
      headerRow: options.headerRow,
      cancel,
      memoryBudgetBytes: st.memoryBudgetBytes,
      checks: ALL_CHECKS,
      onProgress: (done, total) => onProgress({ phase: "scanning", loaded: done, total }),
    });
    st.lastScan = { sheet: sheetName, headerRow: options.headerRow, rowCount: ctx.rowCount, startRow: ctx.startRow, findings, seq: ++this.scanSeq };
    return result;
  }

  /**
   * Stage 5: CSV Validator. Checks the file's structure on the current view
   * (with any changes). Read-only. Findings replace the previous scan's, so
   * "view affected rows" works the same way as in the Error Detector.
   */
  async validate(sheetName: string, options: { headerRow: boolean }, onProgress: Progress, cancel?: CancelToken): Promise<ValidationResult> {
    const st = this.requireState();
    if (st.format !== "csv" || !st.csv) throw new EngineError("unsupported-format", "The CSV Validator checks CSV files only.");
    const { sheet } = this.current(sheetName);
    st.lastScan = null;
    const { result, findings } = await validateCsv(sheet, st.csv, {
      headerRow: options.headerRow,
      cancel,
      onProgress: (done, total) => onProgress({ phase: "scanning", loaded: done, total }),
    });
    // Raw lines from the file: only while the data is unchanged (row numbers then match the file).
    const entry = st.loaded.get(sheetName);
    const unchanged = !entry?.session || entry.session.appliedEntries().length === 0;
    if (unchanged) {
      await attachRawLines(result.issues, st.file, st.csv, cancel, (loaded, total) => onProgress({ phase: "locating", loaded, total }));
      result.rawLines = "shown";
    } else result.rawLines = "changed";
    st.lastScan = { sheet: sheetName, headerRow: options.headerRow, rowCount: sheet.grid.rowCount, startRow: result.firstDataRow, findings, seq: ++this.scanSeq };
    return result;
  }

  /** The sheet as it currently looks (with any Stage 4 changes), for tools running inside the worker. */
  getSheet(name: string): SheetModel | null {
    const entry = this.state?.loaded.get(name);
    if (!entry) return null;
    return entry.session ? entry.session.view() : entry.sheet;
  }

  /** The current (edited) sheet and a query over it; the query is rebuilt after every change. */
  private current(sheetName: string): { sheet: SheetModel; query: SheetQuery } {
    const st = this.requireState();
    const entry = st.loaded.get(sheetName);
    if (!entry) throw new EngineError("sheet-not-found", `The sheet “${sheetName}” is not loaded.`);
    if (!entry.session) return entry;
    if (entry.queryVersion !== entry.session.version) {
      entry.query = new SheetQuery(entry.session.view());
      entry.queryVersion = entry.session.version;
    }
    return { sheet: entry.session.view(), query: entry.query };
  }

  // ------------------------------------------------------------------ Stage 4: editing

  private session(sheetName: string): EditSession {
    const st = this.requireState();
    const entry = st.loaded.get(sheetName);
    if (!entry) throw new EngineError("sheet-not-found", `The sheet “${sheetName}” is not loaded.`);
    entry.session ??= new EditSession(entry.sheet, { memoryBudgetBytes: st.memoryBudgetBytes });
    return entry.session;
  }

  /** After any change the previous scan no longer matches the data. */
  private changed(sheetName: string, entry: HistorySummary | null, entries: HistorySummary[] = entry ? [entry] : []): EditResult {
    const st = this.requireState();
    if (entry && st.lastScan?.sheet === sheetName) st.lastScan = null;
    return { entry, entries, stats: this.session(sheetName).stats() };
  }

  /** What the cell editor needs to know about one cell (view position). */
  cellInfo(sheetName: string, row: number, col: number): CellInfo {
    const view = this.current(sheetName).sheet;
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= view.grid.rowCount || col >= view.columnCount) {
      throw new EngineError("invalid-edit", "That cell doesn't exist.");
    }
    const g = view.grid;
    const v = g.get(row, col);
    const display = g.display ? g.display(row, col) : v === null ? "" : String(v);
    const isDate = v !== null && !!g.isDate?.(row, col);
    const editText = v === null ? "" : typeof v === "number" && !isDate ? String(v) : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : display;
    const edited = typeof (g as { isEdited?: unknown }).isEdited === "function" ? (g as unknown as { isEdited(r: number, c: number): boolean }).isEdited(row, col) : false;
    return { row, col, ref: `${columnLetter(col)}${row + 1}`, display, editText, formula: view.formulas.get(cellKey(row, col)) ?? null, isDate, edited };
  }

  /** Apply a change (from a fix or the editor). Positions are view positions. */
  applyChange(sheetName: string, req: ChangeRequest): EditResult {
    return this.changed(sheetName, this.session(sheetName).apply(req));
  }

  /**
   * Manual edit of one cell. Excel cells: typed numbers become numbers (unless
   * they start with a zero, like "007"); CSV cells always stay text. A formula
   * cell is only replaced when `replaceFormula` confirms the user saw the warning.
   */
  editCell(sheetName: string, row: number, col: number, text: string, options: { replaceFormula?: boolean } = {}): EditResult {
    const st = this.requireState();
    const view = this.current(sheetName).sheet;
    if (!Number.isInteger(row) || !Number.isInteger(col) || row < 0 || col < 0 || row >= view.grid.rowCount || col >= view.columnCount) {
      throw new EngineError("invalid-edit", "That cell doesn't exist.");
    }
    const formula = view.formulas.get(cellKey(row, col));
    if (formula !== undefined && !options.replaceFormula) {
      throw new EngineError(
        "formula-cell",
        `Cell ${columnLetter(col)}${row + 1} contains the formula =${formula}. Saving replaces the formula with the value you typed, and the cell will no longer update. Other cells that use this cell will be recalculated when the file is opened in Excel.`,
      );
    }
    let value: string | number | null = text;
    let format: string | undefined;
    if (st.format !== "csv") {
      const t = text.trim();
      if (t === "") value = null;
      else if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(t) && !/^[+-]?0\d/.test(t) && Number.isFinite(Number(t))) value = Number(t);
      else if (view.grid.get(row, col) !== null && view.grid.isDate?.(row, col)) {
        // A date typed into a date cell stays a real Excel date (same display format),
        // when the text is a clear date (31/01/2024 yes; 03/04/2024 is ambiguous: kept as text).
        const fam = familyOf(classify(t, false, false));
        const parsed = fam && fam !== "excel" ? parseTextDate(fam, t, null) : null;
        if (parsed && "ok" in parsed) {
          const serial = excelSerial(parsed.ok, view.date1904 ?? false);
          if (serial !== null) {
            value = serial;
            format = view.numberFormats.get(cellKey(row, col)) ?? "yyyy-mm-dd";
          }
        }
      }
    }
    return this.applyChange(sheetName, { operation: "edit-cell", label: `Edit cell ${columnLetter(col)}${row + 1}`, cells: [{ row, col, value, format }] });
  }

  /**
   * Work out what a fix would change, without changing anything. The preview
   * is kept until it is applied, replaced by another preview, or made stale by
   * any other change.
   */
  /** Plan a Stage 4 fix or a Stage 5 CSV Validator repair on `view`. */
  private planAny(view: SheetModel, fixId: AnyFixId, options: FixOptions, pc: PlanContext): Promise<FixPlan> {
    if (!isRepairId(fixId)) return planFix(view, fixId, options, pc);
    const st = this.requireState();
    if (st.format !== "csv" || !st.csv) throw new EngineError("unsupported-format", "These repairs are for CSV files only.");
    return planRepair(view, fixId, { headerRow: options.headerRow, delimiter: st.csv.delimiter }, pc);
  }

  async previewFix(sheetName: string, fixId: AnyFixId, options: FixOptions, onProgress: Progress, cancel?: CancelToken): Promise<FixPreviewResult> {
    const st = this.requireState();
    const session = this.session(sheetName);
    const plan = await this.planAny(session.view(), fixId, { ...options, textOnly: st.format === "csv" }, {
      cancel,
      memoryBudgetBytes: st.memoryBudgetBytes,
      onProgress: (done, total) => onProgress({ phase: "scanning", loaded: done, total }),
      originalRow: (r) => session.grid().baseRow(r),
    });
    let request = plan.request;
    let preview = plan.preview;
    let excelCheck: FixPreviewResult["excelCheck"] = null;
    const removes = !!request && ((request.deleteRows?.length ?? 0) > 0 || (request.deleteColumns?.length ?? 0) > 0);
    if (removes && st.format !== "csv") {
      // S2: check everything in the workbook that refers to these rows/columns.
      const g = session.grid();
      const rows = (request!.deleteRows ?? []).map((d) => g.baseRow(d.row));
      const cols = (request!.deleteColumns ?? []).map((d) => g.baseCol(d.col));
      const affected = st.format === "xlsx" ? await this.excelRemovalCheck(sheetName, rows, cols, cancel) : ["References in old .xls files can't be checked"];
      if (affected.length) {
        excelCheck = { affected, clearing: !!options.clearInsteadOfRemove };
        if (options.clearInsteadOfRemove) {
          request = removalsToClears(session.view(), request!);
          const cells = request?.cellKeys?.length ?? 0;
          preview = {
            ...preview,
            cellsChanged: cells,
            rowsRemoved: 0,
            columnsRemoved: 0,
            description: `${preview.description} Instead of removing them, their ${cells === 1 ? "cell is" : "cells are"} cleared, so nothing in the workbook that refers to these positions breaks.`,
          };
        } else {
          // Blocked: nothing will change until the user chooses to clear the cells instead.
          request = null;
          preview = { ...preview, rowsRemoved: 0, columnsRemoved: 0, rows: [], columns: [] };
        }
      } else excelCheck = { affected: [], clearing: false };
    }
    const token = `fix-${++this.fixSeq}`;
    this.pendingFix = { token, sheet: sheetName, version: session.version, requests: request ? [request] : [] };
    return { ...preview, token, excelCheck, deletesFromExcel: st.format !== "csv" && removes };
  }

  /**
   * Preview "Fix all safe problems": spaces, capitalization (clear cases only;
   * ties are left for the user), numbers stored as text, then duplicate rows,
   * empty rows and unnamed empty columns. Each fix is planned on a scratch copy
   * that already includes the previous fixes, so the preview is exact. Excel
   * files: no rows or columns are removed (the workbook reference check comes first).
   */
  async previewFixAll(sheetName: string, options: { headerRow: boolean; set?: "detector" | "validator" }, onProgress: Progress, cancel?: CancelToken): Promise<FixAllPreview> {
    const st = this.requireState();
    const session = this.session(sheetName);
    const excel = st.format !== "csv";
    const scratch = new EditSession(session.view(), { memoryBudgetBytes: st.memoryBudgetBytes });
    const steps: FixPreview[] = [];
    const requests: ChangeRequest[] = [];
    const notes: string[] = [];
    // .xls: references can't be checked, so no removals. .xlsx: removals only where nothing refers to them (S2).
    // CSV Validator: only its safe repairs (never short rows, decision 1).
    const order: AnyFixId[] =
      options.set === "validator" ? [...VALIDATOR_FIX_ALL] : FIX_ALL_ORDER.filter((id) => !(st.format === "xls" && ROW_OR_COLUMN_FIXES.has(id)));
    const removedRows: number[] = [];
    const removedCols: number[] = [];
    for (let i = 0; i < order.length; i++) {
      const fixId = order[i]!;
      let keepColumns: number[] | undefined;
      if (fixId === "empty-columns") {
        // Named empty columns are kept here; "Remove empty columns" lets the user decide.
        const probe = await planFix(scratch.view(), fixId, { headerRow: options.headerRow, textOnly: !excel }, { cancel, memoryBudgetBytes: st.memoryBudgetBytes });
        keepColumns = probe.preview.columns.filter((c) => c.name).map((c) => c.index);
        if (keepColumns.length) notes.push(`${keepColumns.length === 1 ? "1 empty column has" : `${keepColumns.length} empty columns have`} a name, so ${keepColumns.length === 1 ? "it was" : "they were"} kept. Use “Remove empty columns” to decide.`);
      }
      const plan = await this.planAny(scratch.view(), fixId, { headerRow: options.headerRow, textOnly: !excel, keepColumns }, {
        cancel,
        memoryBudgetBytes: st.memoryBudgetBytes,
        onProgress: (done, total) => onProgress({ phase: "scanning", loaded: i * total + done, total: order.length * total }),
        originalRow: (r) => session.grid().baseRow(scratch.grid().baseRow(r)),
      });
      for (const s of plan.preview.skipped) {
        if (fixId === "empty-columns" && s.reason === "Columns you chose to keep.") continue;
        // A reason about one named column ("name has too many different values…") needs no count.
        const perColumn = /has too many different values/.test(s.reason);
        notes.push(`${plan.preview.label}: ${s.reason}${perColumn ? "" : ` (${s.count.toLocaleString("en-US")})`}`);
      }
      if (!plan.request) continue;
      if (st.format === "xlsx" && ROW_OR_COLUMN_FIXES.has(fixId as FixId)) {
        const toOriginal = (r: number) => session.grid().baseRow(scratch.grid().baseRow(r));
        const toOriginalCol = (c: number) => session.grid().baseCol(scratch.grid().baseCol(c));
        const rows = (plan.request.deleteRows ?? []).map((d) => toOriginal(d.row));
        const cols = (plan.request.deleteColumns ?? []).map((d) => toOriginalCol(d.col));
        const affected = await this.excelRemovalCheck(sheetName, [...removedRows, ...rows], [...removedCols, ...cols], cancel);
        if (affected.length) {
          notes.push(`${plan.preview.label}: not done here, because removing them would break ${affected.join("; ")}. Use the Fix button on that problem to clear them instead.`);
          continue;
        }
        removedRows.push(...rows);
        removedCols.push(...cols);
      }
      scratch.apply(plan.request);
      steps.push(plan.preview);
      requests.push(plan.request);
    }
    if (st.format === "xls") notes.push("Old .xls file: duplicate and empty rows and columns are not removed, because MyDataFixer can't check what refers to them. Use the Fix button on those problems to clear them instead.");
    const token = `fix-${++this.fixSeq}`;
    this.pendingFix = { token, sheet: sheetName, version: session.version, requests };
    return {
      token,
      steps,
      cellsChanged: steps.reduce((n, s) => n + s.cellsChanged, 0),
      rowsRemoved: steps.reduce((n, s) => n + s.rowsRemoved, 0),
      columnsRemoved: steps.reduce((n, s) => n + s.columnsRemoved, 0),
      rowsShortened: steps.reduce((n, s) => n + (s.rowsShortened ?? 0), 0),
      notes,
    };
  }

  /** Stage 10: preview "Split a column" (CSV and .xlsx). Apply with applyFix(token). */
  async previewSplit(sheetName: string, input: Omit<SplitPlanInput, "sheet">, cancel?: CancelToken): Promise<SplitCombinePreview> {
    this.requireSplitCombineFormat();
    return this.stageSplitCombine(sheetName, planSplitColumn({ ...input, sheet: this.session(sheetName).view() }), cancel);
  }

  /** Stage 10: preview "Combine columns" (CSV and .xlsx). Apply with applyFix(token). */
  async previewCombine(sheetName: string, input: Omit<CombinePlanInput, "sheet">, cancel?: CancelToken): Promise<SplitCombinePreview> {
    this.requireSplitCombineFormat();
    return this.stageSplitCombine(sheetName, planCombineColumns({ ...input, sheet: this.session(sheetName).view() }), cancel);
  }

  /** Stage 12: key names and a way to read each data row as a JSON record. */
  private jsonSource(sheetName: string, options: JsonExportOptions) {
    const { sheet: view } = this.current(sheetName);
    const g = view.grid;
    const width = view.columnCount;
    const header = options.headerRow && g.rowCount > 0 ? Array.from({ length: width }, (_, c) => cellOutText(view, 0, c, true)) : [];
    const keys = keyNames(header, width);
    const start = options.headerRow ? 1 : 0;
    const record = (r: number): JsonOut[] =>
      keys.map((_, c) => jsonValue({ value: g.get(r, c), text: cellOutText(view, r, c, true), date: g.isDate?.(r, c) ?? false }, options.detect));
    return { view, keys, start, rows: Math.max(0, g.rowCount - start), record };
  }

  /** Stage 12: the first records as they will be written (CSV to JSON preview). */
  previewJson(sheetName: string, options: JsonExportOptions): JsonPreview {
    const src = this.jsonSource(sheetName, options);
    const n = Math.min(3, src.rows);
    const records = Array.from({ length: n }, (_, i) => src.record(src.start + i));
    const f = jsonFrame(options.layout, n === 0);
    const sample = f.open + records.map((r) => recordJson(src.keys, r, options.layout, f.indent)).join(f.between) + f.close;
    return { keys: src.keys, records: src.rows, sample, sampleRecords: n };
  }

  /**
   * Stage 12: the sheet as a .json or .jsonl file. Records are written in pieces;
   * each one is read back with the strict JSON reader and compared before the file
   * is offered (the brackets and commas around them are fixed text).
   */
  async exportJson(sheetName: string, options: JsonExportOptions, onProgress: Progress, cancel?: CancelToken): Promise<JsonExportResult> {
    const st = this.requireState();
    const src = this.jsonSource(sheetName, options);
    if (st.memoryBudgetBytes && src.view.grid.approxBytes * 2.5 + 32 * 1024 * 1024 > st.memoryBudgetBytes * 1.3) {
      throw new EngineError("out-of-memory", "This file is too large to turn into JSON safely in this browser on this device. Nothing was created. Close other tabs and try again, or use a device with more memory.");
    }
    const f = jsonFrame(options.layout, src.rows === 0);
    const parts: string[] = [f.open];
    const same = (a: unknown, b: JsonOut) => a === b;
    let batch: string[] = [];
    let written = 0;
    for (let i = 0; i < src.rows; i++) {
      const values = src.record(src.start + i);
      const text = recordJson(src.keys, values, options.layout, f.indent);
      // Check: the record reads back to the same keys, in the same order, with the same values.
      const back = parseJson(text) as Record<string, unknown>;
      const backKeys = Object.keys(back);
      if (backKeys.length !== src.keys.length || src.keys.some((k, c) => backKeys[c] !== k || !same(back[k], values[c]!))) {
        throw new EngineError("internal", `The JSON file didn't match the table when it was checked (record ${i + 1}), so it was not offered. Nothing was changed.`);
      }
      batch.push(text);
      if (batch.length >= 5000) {
        parts.push((written ? f.between : "") + batch.join(f.between));
        written += batch.length;
        batch = [];
        throwIfCancelled(cancel);
        onProgress({ phase: "exporting", loaded: i + 1, total: src.rows });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (batch.length) parts.push((written ? f.between : "") + batch.join(f.between));
    parts.push(f.close);
    const blob = new Blob(parts, { type: options.layout === "lines" ? "application/x-ndjson" : "application/json" });
    const base = st.fileName.replace(/\.[^.]+$/, "") || "data";
    const sheetPart = st.format !== "csv" && st.sheets.filter((x) => x.kind === "worksheet").length > 1 ? ` - ${sheetName.replace(/[\\/:*?"<>|]+/g, "_")}` : "";
    return {
      blob,
      summary: { downloadName: `${base}${sheetPart}.${options.layout === "lines" ? "jsonl" : "json"}`, bytes: blob.size, records: src.rows, keys: src.keys.length, layout: options.layout },
    };
  }

  /**
   * Stage 11: preview the Remove Duplicates page. Removal from an .xlsx file runs the
   * workbook reference check first; from an .xls file it is never allowed. In both cases
   * the user can mark the duplicates instead, or clear the rows (`clearInstead`).
   */
  async previewDuplicates(sheetName: string, input: Omit<DuplicatePlanInput, "sheet"> & { clearInstead?: boolean }, cancel?: CancelToken): Promise<DuplicatesPreview> {
    const st = this.requireState();
    const session = this.session(sheetName);
    const view = session.view();
    const plan = planDuplicates({ sheet: view, headerRow: input.headerRow, options: input.options });
    let requests = plan.requests;
    let blockedBy: string[] = [];
    let clearing = false;
    let cellsCleared = 0;
    if (input.options.action === "remove" && plan.removeRows.length && st.format !== "csv") {
      const g = session.grid();
      blockedBy =
        st.format === "xls"
          ? ["Old .xls files: what refers to these rows can't be checked, so rows are never removed from them"]
          : await this.excelRemovalCheck(sheetName, plan.removeRows.map((r) => g.baseRow(r)), [], cancel);
      if (blockedBy.length) {
        if (input.clearInstead) {
          const cleared = removalsToClears(view, requests[0]!);
          requests = cleared ? [cleared] : [];
          clearing = true;
          cellsCleared = cleared?.cellKeys?.length ?? 0;
        } else requests = [];
      }
    }
    const { requests: _r, removeRows: _rows, ...rest } = plan;
    void _r;
    void _rows;
    if (!requests.length) {
      this.pendingFix = null;
      return { ...rest, token: null, blockedBy, clearing, cellsCleared };
    }
    const token = `fix-${++this.fixSeq}`;
    this.pendingFix = { token, sheet: sheetName, version: session.version, requests };
    return { ...rest, token, blockedBy, clearing, cellsCleared };
  }

  private requireSplitCombineFormat(): void {
    if (this.requireState().format === "xls") {
      throw new EngineError(
        "unsupported-format",
        "Split and Combine work on CSV and .xlsx files. Columns can't be added safely to old .xls files. Save the file as .xlsx in Excel, or convert it to CSV first.",
      );
    }
  }

  private async stageSplitCombine(sheetName: string, plan: SplitCombinePlan, cancel?: CancelToken): Promise<SplitCombinePreview> {
    const st = this.requireState();
    const session = this.session(sheetName);
    let requests = plan.requests;
    let originalsKept: string[] = [];
    // The removal request's positions are valid after the add (added columns go at the right edge).
    const removal = requests.find((r) => (r.deleteColumns?.length ?? 0) > 0);
    if (removal && st.format === "xlsx") {
      const g = session.grid();
      const affected = await this.excelRemovalCheck(sheetName, [], removal.deleteColumns!.map((d) => g.baseCol(d.col)), cancel);
      if (affected.length) {
        requests = requests.filter((r) => r !== removal);
        originalsKept = affected;
      }
    }
    const { requests: _planned, ...rest } = plan;
    void _planned;
    if (!requests.length) {
      this.pendingFix = null;
      return { ...rest, token: null, originalsKept };
    }
    const token = `fix-${++this.fixSeq}`;
    this.pendingFix = { token, sheet: sheetName, version: session.version, requests };
    return { ...rest, token, originalsKept };
  }

  /** Apply exactly the previewed fix (or fixes). Refused if anything changed since the preview. */
  applyFix(sheetName: string, token: string): EditResult {
    const p = this.pendingFix;
    const session = this.session(sheetName);
    if (!p || p.token !== token || p.sheet !== sheetName || p.version !== session.version) {
      throw new EngineError("stale-preview", "The data changed after this preview, so it was not applied. Nothing was changed. Please preview the fix again.");
    }
    this.pendingFix = null;
    let entry: HistorySummary | null = null;
    const entries: HistorySummary[] = [];
    let applied = 0;
    try {
      // Positions in each request match the view after the previous requests (planned that way).
      for (const req of p.requests) {
        const e = session.apply(req);
        if (e) {
          entry = e;
          entries.push(e);
          applied++;
        }
      }
    } catch (err) {
      // All or nothing: roll back the steps already applied (e.g. memory ran out halfway).
      session.rollback(applied);
      throw err;
    }
    return this.changed(sheetName, entry, entries);
  }

  /**
   * Create the corrected sheet as a CSV file (UTF-8 with BOM), then read the
   * generated bytes back and compare every cell before returning it. Nothing
   * is returned if the check fails; the changes are always kept.
   */
  async exportCsv(sheetName: string, onProgress: Progress, cancel?: CancelToken, options: CsvDownloadOptions = {}): Promise<ExportResult> {
    const st = this.requireState();
    const session = this.session(sheetName);
    const view = session.view();
    const excel = st.format !== "csv";
    if (options.delimiter !== undefined && ![",", ";", "\t"].includes(options.delimiter)) throw new EngineError("internal", "Unknown separator for the download.");
    if (options.lineEnding !== undefined && options.lineEnding !== "\n" && options.lineEnding !== "\r\n") throw new EngineError("internal", "Unknown line ending for the download.");
    // Defaults (Stage 4): the original separator and line endings, UTF-8 with BOM.
    const delimiter = options.delimiter ?? st.csv?.delimiter ?? ",";
    const lineEnding: "\n" | "\r\n" = options.lineEnding ?? (st.csv?.lineEnding === "\n" ? "\n" : "\r\n");
    const bom = options.bom ?? true;
    if (options.values !== undefined && options.values !== "shown" && options.values !== "plain") throw new EngineError("internal", "Unknown value option for the download.");
    const plain = excel && options.values === "plain";
    // Running out of memory in a worker crashes the whole tab in Chromium, so check first.
    // The export streams (2 MB text parts become Blobs at once; verification reads 4 MB at a
    // time), so beyond the data already held it needs only a few chunks: ~32 MB. The budget is
    // 45% of the heap limit and leaves room for scans; a streamed export may use up to 1.3× it
    // (≈ 60% of the limit). Measured: a 150 MB CSV exports within a 512 MB heap in Node.
    if (st.memoryBudgetBytes && view.grid.approxBytes * 1.6 + 32 * 1024 * 1024 > st.memoryBudgetBytes * 1.3) {
      throw new EngineError(
        "out-of-memory",
        "This sheet is too large to create a download safely in this browser on this device. Nothing was downloaded, and your changes are kept. Close other tabs and try again, or use a device with more memory.",
        `export needs ~${Math.round(view.grid.approxBytes * 1.6 / 1048576) + 32} MB, allowed ${Math.round((st.memoryBudgetBytes * 1.3) / 1048576)} MB`,
      );
    }
    try {
      const { blob, formulaLike } = await buildCsv(view, {
        delimiter,
        lineEnding,
        bom,
        plain,
        useDisplay: excel,
        cancel,
        onProgress: (done, total) => onProgress({ phase: "exporting", loaded: done, total }),
      });
      const verification = await verifyCsv(blob, view, {
        delimiter,
        bom,
        plain,
        useDisplay: excel,
        cancel,
        onProgress: (loaded, total) => onProgress({ phase: "verifying", loaded, total }),
      });
      const stats = session.stats();
      const applied = session.appliedEntries();
      const auto = applied.filter((e) => e.operation !== "edit-cell");
      const base = st.fileName.replace(/\.[^.]+$/, "") || "spreadsheet";
      const safeSheet = sheetName.replace(/[\\/:*?"<>|]+/g, "_");
      const notPreserved: string[] = [];
      const warnings: string[] = [];
      if (excel) {
        notPreserved.push("Formatting such as fonts, colours, borders and column widths (CSV files hold values only)");
        if (view.formulas.size) notPreserved.push(`Formulas (${view.formulas.size.toLocaleString("en-US")}): the values they show are saved instead`);
        if (st.sheets.filter((s) => s.kind === "worksheet").length > 1) notPreserved.push(`Other sheets: only “${sheetName}” is saved`);
        const f = st.inspection?.features;
        if (f?.charts) notPreserved.push(`${f.charts} chart${f.charts > 1 ? "s" : ""}`);
        if (f?.images) notPreserved.push(`${f.images} image${f.images > 1 ? "s" : ""}`);
        if (f?.comments) notPreserved.push("Comments");
        if (f?.dataValidation) notPreserved.push("Data validation rules");
        if (f?.conditionalFormatting) notPreserved.push("Conditional formatting");
        if (view.merges.length) notPreserved.push("Merged cells");
        if (view.hiddenRows.size || view.hiddenColumns.size) notPreserved.push("Hidden rows and columns (they are included, unhidden)");
        if (view.hyperlinks.size) notPreserved.push("Hyperlinks (the cell text is kept)");
        warnings.push(
          plain
            ? "Plain values: dates are saved as year-month-day (2026-11-13, with the time when there is one), numbers in full precision without formatting, and TRUE/FALSE as words."
            : "Dates and numbers are saved as they are shown in the table.",
        );
      } else {
        if (st.csv && st.csv.encoding !== "utf-8") warnings.push(`The original file used ${st.csv.encoding}; the new file is UTF-8, which Excel and Google Sheets read correctly.`);
        if (st.csv && st.csv.lineEnding !== "\n" && st.csv.lineEnding !== "\r\n" && options.lineEnding === undefined) warnings.push("Line endings were made consistent (Windows style).");
        if (!bom) warnings.push("Saved without a byte-order mark, as databases and many programs expect. Excel may show accented letters wrongly when you double-click this file; use Data → From Text/CSV in Excel, or download with the BOM for Excel.");
        if (st.csv && delimiter !== st.csv.delimiter) warnings.push(`The separator was changed. Values that contain the new separator are put in quotes, so they stay in one cell.`);
      }
      const clearedNote = clearedWarning(applied);
      if (clearedNote) warnings.push(clearedNote);
      if (formulaLike) {
        warnings.push(
          `${formulaLike.toLocaleString("en-US")} cell${formulaLike > 1 ? "s" : ""} start with =, +, - or @. Spreadsheet apps may treat these as formulas when the file is opened. They were saved exactly as they are.`,
        );
      }
      return {
        blob,
        summary: {
          originalName: st.fileName,
          // Excel sheet without changes (Excel to CSV converter): “Book - Sheet.csv”.
          // JSON, and TSV/TXT files turned into CSV (Stage 13): named after the file, with the new extension.
          downloadName: st.json || st.xml || st.merge || (!excel && delimiter !== "\t" && /\.(tsv|tab|txt)$/i.test(st.fileName))
            ? `${base}.${delimiter === "\t" ? "tsv" : "csv"}`
            : excel && !stats.changesApplied
              ? `${base} - ${safeSheet}.${delimiter === "\t" ? "tsv" : "csv"}`
              : `${excel ? `${base} - ${safeSheet}` : base}-${stats.changesApplied ? "cleaned" : "copy"}.${delimiter === "\t" ? "tsv" : "csv"}`,
          format: "csv",
          csv: { delimiter, lineEnding, bom, ...(excel ? { values: plain ? ("plain" as const) : ("shown" as const) } : {}) },
          bytes: blob.size,
          rows: view.grid.rowCount,
          columns: view.columnCount,
          cellsEdited: stats.cellsEdited,
          rowsRemoved: stats.rowsRemoved,
          columnsRemoved: stats.columnsRemoved,
          ...(stats.rowsShortened ? { rowsShortened: stats.rowsShortened } : {}),
          duplicatesRemoved: auto.filter((e) => e.operation === "duplicate-rows").reduce((n, e) => n + e.rowsRemoved, 0),
          automaticCorrections: auto.reduce((n, e) => n + e.cells + e.rowsRemoved + e.columnsRemoved + e.rowsShortened, 0),
          manualEdits: applied.length - auto.length,
          notPreserved,
          warnings,
          verification: { reader: "MyDataFixer's CSV reader", rows: verification.rows, cells: verification.cells },
          version: stats.version,
        },
      };
    } catch (err) {
      if (isOutOfMemory(err)) {
        throw new EngineError(
          "out-of-memory",
          "There wasn't enough memory on this device to create the download. Your changes are kept and nothing was downloaded. Close other tabs or apps and try again, or use a device with more memory.",
          String((err as Error).message),
        );
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------ Stage 4: Excel download

  /** Index of everything in the workbook that refers to positions on this sheet (S2), cached per sheet. */
  private async referenceIndex(sheetName: string, cancel?: CancelToken): Promise<ReferenceIndex> {
    const st = this.requireState();
    if (st.format !== "xlsx" || !st.inspection) throw new EngineError("internal", "Reference checks are for Excel (.xlsx) files.");
    st.refIndex ??= new Map();
    const hit = st.refIndex.get(sheetName);
    if (hit) return hit;
    st.zip ??= await readZipEntries(st.file);
    const sheetIndex = st.inspection.sheets.findIndex((s) => s.name === sheetName);
    const entry = st.loaded.get(sheetName);
    if (sheetIndex < 0 || !entry) throw new EngineError("sheet-not-found", `The sheet “${sheetName}” is not loaded.`);
    const index = await buildReferenceIndex({ blob: st.file, entries: st.zip, sheets: st.inspection.sheets, sheetIndex, sheet: entry.sheet, cancel });
    st.refIndex.set(sheetName, index);
    return index;
  }

  /**
   * Would removing these rows/columns (original positions, together with the
   * ones already removed) break anything in the workbook? Returns the features.
   */
  async excelRemovalCheck(sheetName: string, rows: number[], cols: number[], cancel?: CancelToken): Promise<string[]> {
    const index = await this.referenceIndex(sheetName, cancel);
    const plan = this.session(sheetName).exportPlan();
    return [...new Set(affectedBy(index, [...plan.deletedRows, ...rows], [...plan.deletedCols, ...cols]))];
  }

  /**
   * Create the corrected Excel file by changing only the edited cells inside
   * the original package (owner decision 4), then read the generated bytes back
   * with MyDataFixer's Excel reader and compare every cell before returning it.
   */
  /**
   * Stage 6 (decision 3): every worksheet as its own verified CSV, in one ZIP.
   * Sheets are read one at a time and released after use; the sheet already
   * open is used as it is. Chart sheets have no cells and are listed as left out.
   * Each CSV is checked cell by cell before it is added, and the ZIP is read
   * back and compared byte by byte before it is offered.
   */
  async exportWorkbookZip(options: CsvDownloadOptions, onProgress: Progress, cancel?: CancelToken): Promise<WorkbookZipResult> {
    const st = this.requireState();
    if (st.format === "csv") throw new EngineError("unsupported-format", "A ZIP of all sheets is only for Excel workbooks.");
    const delimiter = options.delimiter ?? ",";
    if (![",", ";", "\t"].includes(delimiter)) throw new EngineError("internal", "Unknown separator for the download.");
    const lineEnding = options.lineEnding ?? "\r\n";
    const bom = options.bom ?? true;
    const plain = options.values === "plain";
    const ext = delimiter === "\t" ? "tsv" : "csv";
    const base = st.fileName.replace(/\.[^.]+$/, "") || "workbook";
    const worksheets = st.sheets.map((info, index) => ({ info, index })).filter((x) => x.info.kind === "worksheet");
    const skipped = st.sheets.filter((x) => x.kind !== "worksheet").map((x) => x.name);
    if (worksheets.length === 0) throw new EngineError("unsupported-format", "This workbook has no sheets with cells.");
    const used = new Set<string>();
    const fileName = (sheet: string) => {
      const safe = sheet.replace(/[\\/:*?"<>|]+/g, "_").trim() || "Sheet";
      let name = `${safe}.${ext}`;
      for (let n = 2; used.has(name.toLowerCase()); n++) name = `${safe} (${n}).${ext}`;
      used.add(name.toLowerCase());
      return name;
    };
    let active = st.loaded.get(st.activeSheet);
    let activeBytes = active ? this.current(st.activeSheet).sheet.grid.approxBytes : 0;
    // Low memory: if the open sheet plus the largest other sheet wouldn't fit, set the open sheet
    // aside while the ZIP is made (it is read again afterwards). It has no changes on this page.
    const activeIndex = st.sheets.findIndex((x) => x.name === st.activeSheet);
    let reloadActive = false;
    if (active && st.memoryBudgetBytes && !active.session?.hasChanges) {
      const largest = Math.max(0, ...worksheets.filter((w) => w.info.name !== st.activeSheet).map((w) => estimateExcelMemory(st.file.size, st.format as "xlsx" | "xls", st.inspection, w.index)));
      if (activeBytes * 1.6 + largest > st.memoryBudgetBytes) {
        st.loaded.clear();
        st.lastScan = null;
        active = undefined;
        activeBytes = 0;
        reloadActive = true;
      }
    }
    const files: WorkbookZipSummary["files"] = [];
    const entries: OutputEntry[] = [];
    const blobs: Blob[] = [];
    let formulas = 0;
    let merges = 0;
    let hiddenRowsCols = false;
    let links = 0;
    try {
      for (let k = 0; k < worksheets.length; k++) {
        const { info, index } = worksheets[k]!;
        onProgress({ phase: "exporting", loaded: k, total: worksheets.length });
        let sheet: SheetModel;
        if (info.name === st.activeSheet && active) sheet = this.current(info.name).sheet;
        else {
          try {
            const read = await readExcelSheet(st.file, st.format, {
              sheetIndex: index,
              inspection: st.inspection,
              // The open sheet stays in memory, so the others get what is left of the budget.
              memoryBudgetBytes: st.memoryBudgetBytes ? Math.max(1, st.memoryBudgetBytes - activeBytes) : undefined,
              cancel,
            });
            sheet = read.sheet;
          } catch (err) {
            // Say which sheet couldn't be read (e.g. too large for this device's memory).
            if (err instanceof EngineError && err.code !== "cancelled") {
              throw new EngineError(err.code, `“${info.name}” couldn't be read, so no ZIP was created: ${err.message} Nothing was downloaded.`, err.detail);
            }
            throw err;
          }
        }
        const { blob } = await buildCsv(sheet, { delimiter, lineEnding, bom, plain, useDisplay: true, cancel });
        const v = await verifyCsv(blob, sheet, { delimiter, bom, plain, useDisplay: true, cancel });
        formulas += sheet.formulas.size;
        merges += sheet.merges.length;
        links += sheet.hyperlinks.size;
        if (sheet.hiddenRows.size || sheet.hiddenColumns.size) hiddenRowsCols = true;
        const name = fileName(info.name);
        const w = new PartWriter();
        for (let off = 0; off < blob.size; off += 4 * 1024 * 1024) {
          w.push(new Uint8Array(await blob.slice(off, off + 4 * 1024 * 1024).arrayBuffer()));
          throwIfCancelled(cancel);
        }
        entries.push({ kind: "new", entry: newEntry(name), ...w.finish() });
        blobs.push(blob);
        files.push({ name, sheet: info.name, hidden: info.state !== "visible", rows: v.rows, cells: v.cells, bytes: blob.size });
      }
      const zip = await writeZip(new Blob([]), entries);
      // Read the ZIP back: every file must decompress to exactly the CSV that was checked.
      const back = await readZipEntries(zip);
      if (back.length !== blobs.length) throw new EngineError("internal", "The ZIP file didn't pass MyDataFixer's check, so it was not offered. Please try again.", "zip entry count");
      for (let k = 0; k < back.length; k++) {
        const want = new Uint8Array(await blobs[k]!.arrayBuffer());
        let pos = 0;
        let ok = back[k]!.name === files[k]!.name;
        await streamEntry(zip, back[k]!, (d) => {
          for (let i = 0; i < d.length && ok; i++) if (d[i] !== want[pos + i]) ok = false;
          pos += d.length;
        }, { cancel, maxBytes: Number.MAX_SAFE_INTEGER });
        if (!ok || pos !== want.length) throw new EngineError("internal", "The ZIP file didn't pass MyDataFixer's check, so it was not offered. Please try again.", `zip entry ${k}`);
      }
      onProgress({ phase: "verifying", loaded: worksheets.length, total: worksheets.length });
      const f = st.inspection?.features;
      const notPreserved = ["Formatting such as fonts, colours, borders and column widths (CSV files hold values only)"];
      if (formulas) notPreserved.push(`Formulas (${formulas.toLocaleString("en-US")}): the values they show are saved instead`);
      if (skipped.length) notPreserved.push(`Chart sheets (${skipped.join(", ")}): they have no cells`);
      if (f?.charts) notPreserved.push(`${f.charts} chart${f.charts > 1 ? "s" : ""}`);
      if (f?.images) notPreserved.push(`${f.images} image${f.images > 1 ? "s" : ""}`);
      if (f?.comments) notPreserved.push("Comments");
      if (f?.dataValidation) notPreserved.push("Data validation rules");
      if (f?.conditionalFormatting) notPreserved.push("Conditional formatting");
      if (merges) notPreserved.push("Merged cells (each value is saved once, in its first cell)");
      if (hiddenRowsCols) notPreserved.push("Hidden rows and columns (they are included, unhidden)");
      if (links) notPreserved.push("Hyperlinks (the cell text is kept)");
      const warnings = [
        plain
          ? "Plain values: dates are saved as year-month-day (2026-11-13, with the time when there is one), numbers in full precision without formatting, and TRUE/FALSE as words."
          : "Dates and numbers are saved as they are shown in Excel.",
      ];
      if (files.some((x) => x.hidden)) warnings.push("Hidden sheets are included (their names are marked in the list).");
      return {
        blob: zip,
        summary: { originalName: st.fileName, downloadName: `${base} - all sheets.zip`, bytes: zip.size, csv: { delimiter, lineEnding, bom, values: plain ? "plain" : "shown" }, files, skipped, notPreserved, warnings },
      };
    } catch (err) {
      if (!(err instanceof EngineError) && isOutOfMemory(err)) throw new EngineError("out-of-memory", "There wasn't enough memory on this device to create the ZIP file. Nothing was downloaded. Download the sheets one at a time instead, or close other tabs and try again.", String((err as Error).message));
      throw err;
    } finally {
      // Bring back the sheet that was open (whatever happened above).
      if (reloadActive && activeIndex >= 0) {
        // (The returned summary uses `files`, so only the working copies are released.)
        entries.length = 0;
        blobs.length = 0;
        await this.loadExcelSheet(activeIndex, () => {}).catch(() => {});
      }
    }
  }

  /**
   * Stage 6: CSV → new Excel workbook (decisions 1, 2 and 6). Uses the current
   * view (with any changes); the original file is never changed. The new file
   * is checked cell by cell before it is offered.
   */
  async convertCsvToXlsx(sheetName: string, options: { headerRow: boolean }, onProgress: Progress, cancel?: CancelToken): Promise<ConvertResult> {
    const st = this.requireState();
    if (st.format !== "csv") throw new EngineError("unsupported-format", "Only CSV files can be converted to Excel here.");
    const { sheet: view } = this.current(sheetName);
    if (st.memoryBudgetBytes && view.grid.approxBytes * 1.6 + 32 * 1024 * 1024 > st.memoryBudgetBytes * 1.3) {
      throw new EngineError(
        "out-of-memory",
        "This file is too large to convert safely in this browser on this device. Nothing was created. Close other tabs and try again, or use a device with more memory.",
      );
    }
    const base = st.fileName.replace(/\.[^.]+$/, "") || "spreadsheet";
    const plan = planCsvToXlsx(view, { headerRow: options.headerRow, name: base });
    try {
      const written = await writeXlsx(plan.sheets, { cancel, onProgress: (phase, done, total) => onProgress({ phase, loaded: done, total }) });
      const verification = await verifyNewXlsx(written.blob, plan.sheets, written.sheetNames, { cancel, onProgress: (phase, done, total) => onProgress({ phase, loaded: done, total }) });
      const c = countConversion(view, options.headerRow);
      return {
        blob: written.blob,
        summary: {
          originalName: st.fileName,
          downloadName: `${base}.xlsx`,
          bytes: written.blob.size,
          headerRow: options.headerRow,
          sheets: written.sheetNames.map((name, i) => ({ name, rows: plan.rowsPerSheet[i]! })),
          split: plan.split,
          counts: { numbers: c.numbers, dates: c.dates, text: c.text, empty: c.empty },
          keptAsText: (Object.entries(c.kept) as [KeptReason, number][]).map(([k, count]) => ({ reason: KEPT_REASON_TEXT[k], count })),
          verification: { reader: "MyDataFixer's check of the new workbook", rows: verification.rows, cells: verification.cells },
        },
      };
    } catch (err) {
      if (isOutOfMemory(err)) {
        throw new EngineError("out-of-memory", "There wasn't enough memory on this device to create the Excel file. Nothing was created. Close other tabs or apps and try again, or use a device with more memory.", String((err as Error).message));
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------ Stage 17: Compare

  private compareState: { older: CompareSide; newer: CompareSide; result: CompareResult; suggested: number | null; lists: Partial<Record<CompareKind, Uint32Array>> } | null = null;

  /** Read one file of a comparison (kept while the same file and sheet are compared again). */
  private async readCompareSide(input: CompareFileInput, label: string, keep: CompareSide | undefined, budget: number | undefined, onProgress: (loaded: number | null) => void, cancel?: CancelToken): Promise<CompareSide> {
    const { file, format } = input;
    const id = `${file.name}|${file.size}|${file.lastModified}|${format}|${input.sheet ?? ""}`;
    if (keep?.id === id) return keep;
    if (file.size === 0) throw new EngineError("empty-file", `The ${label} file, “${file.name}”, is empty (0 bytes).`);
    let sheet: SheetModel;
    let sheets: string[] = [];
    try {
      if (format === "csv") sheet = (await parseCsv(file, "Sheet1", { memoryBudgetBytes: budget, cancel, onProgress: (loaded) => onProgress(loaded) })).sheet;
      else if (format === "xlsx") {
        const inspection = await inspectXlsx(file, { cancel });
        const ws = inspection.sheets.map((x, i) => ({ x, i })).filter((w) => w.x.kind === "worksheet");
        sheets = ws.map((w) => w.x.name);
        const chosen = ws.find((w) => w.x.name === input.sheet) ?? ws.find((w) => w.x.state === "visible") ?? ws[0];
        if (!chosen) throw new EngineError("unsupported-format", "This workbook has no sheets with cells.");
        sheet = (await readExcelSheet(file, format, { sheetIndex: chosen.i, inspection, memoryBudgetBytes: budget, cancel })).sheet;
      } else if (format === "xls") {
        let read = await readExcelSheet(file, format, { sheetIndex: 0, inspection: null, memoryBudgetBytes: budget, cancel });
        const all = read.sheets ?? [];
        sheets = all.filter((x) => x.kind === "worksheet").map((x) => x.name);
        const want = all.findIndex((x) => x.name === input.sheet && x.kind === "worksheet");
        if (want > 0) read = await readExcelSheet(file, format, { sheetIndex: want, inspection: null, memoryBudgetBytes: budget, cancel });
        sheet = read.sheet;
      } else throw new EngineError("unsupported-format", "Only CSV, TSV, TXT and Excel files can be compared.");
    } catch (e) {
      if (e instanceof EngineError && e.code !== "cancelled") throw new EngineError(e.code, `The ${label} file, “${file.name}”: ${e.message}`, e.detail);
      throw e;
    }
    const header = guessHeaderRow(sheet);
    const g = sheet.grid;
    const excel = format !== "csv";
    const table: CompareTable = { rowCount: g.rowCount, rowLength: (r) => g.rowLength(r), text: (r, c) => cellOutText(sheet, r, c, excel), header };
    return { id, sheet, table, info: { name: file.name, sheet: excel ? sheet.name : null, sheets, rows: Math.max(0, g.rowCount - (header ? 1 : 0)), columns: sheet.columnCount, header } };
  }

  /** Compare an older and a newer file (decisions 1A–5A). Files already read are kept for the next comparison. */
  async compareFiles(older: CompareFileInput, newer: CompareFileInput, options: CompareOptionsInput, onProgress: Progress, cancel?: CancelToken): Promise<CompareSummary> {
    this.close();
    const total = older.file.size + newer.file.size;
    if (total > COMPARE_MAX_BYTES) {
      throw new EngineError("too-large-for-engine", `These files are ${(total / 1048576).toFixed(1)} MB together; up to ${COMPARE_MAX_BYTES / 1048576} MB can be compared at once.`);
    }
    const budget = options.memoryBudgetBytes;
    const prev = this.compareState;
    this.compareState = null;
    const o = await this.readCompareSide(older, "older", prev?.older, budget, (l) => onProgress({ phase: "parsing", loaded: l, total }), cancel);
    if (budget && o.sheet.grid.approxBytes > budget * 0.6) {
      throw new EngineError("too-large-for-engine", "These files are too large to compare safely in this browser on this device. Nothing was changed. Compare smaller files, or use a computer.");
    }
    const n = await this.readCompareSide(newer, "newer", prev?.newer, budget, (l) => onProgress({ phase: "parsing", loaded: l === null ? null : older.file.size + l, total }), cancel);
    if (budget && o.sheet.grid.approxBytes + n.sheet.grid.approxBytes > budget * 0.8) {
      throw new EngineError("too-large-for-engine", "These files are too large to compare safely in this browser on this device. Nothing was changed. Compare smaller files, or use a computer.");
    }
    onProgress({ phase: "indexing", loaded: null, total: null });
    const columns = matchColumns(o.table, n.table);
    if (!columns.some((c) => c.older >= 0 && c.newer >= 0)) throw new EngineError("unsupported-format", "These two files have no columns in common, so they can't be compared. Check that you chose two versions of the same table.");
    const suggested = prev && prev.older === o && prev.newer === n ? prev.suggested : await suggestKey(o.table, n.table, columns, cancel);
    let keys: number[] | null;
    if (options.keys === undefined) keys = suggested === null ? null : [suggested];
    else if (options.keys === null || options.keys.length === 0) keys = null;
    else {
      keys = options.keys.map((name) => {
        const k = columns.findIndex((c) => c.name.trim().toLowerCase() === name.trim().toLowerCase());
        if (k < 0 || columns[k]!.older < 0 || columns[k]!.newer < 0) throw new EngineError("internal", `The column “${name}” isn't in both files, so it can't be used to match rows.`);
        return k;
      });
    }
    const result = await compareTables(o.table, n.table, columns, { keys, ignoreCase: options.ignoreCase, ignoreSpaces: options.ignoreSpaces }, cancel);
    this.compareState = { older: o, newer: n, result, suggested, lists: {} };
    return {
      older: o.info,
      newer: n.info,
      columns: columns.map((c) => ({ name: c.name, inOlder: c.older >= 0, inNewer: c.newer >= 0 })),
      keys: keys ? keys.map((k) => columns[k]!.name) : null,
      suggestedKey: suggested === null ? null : columns[suggested]!.name,
      counts: result.counts,
      repeated: result.repeated,
      ignoreCase: options.ignoreCase,
      ignoreSpaces: options.ignoreSpaces,
    };
  }

  private requireCompare() {
    if (!this.compareState) throw new EngineError("internal", "Compare two files first.");
    return this.compareState;
  }

  /** One page of the differences of one kind, in file order. */
  compareDetails(kind: CompareKind, offset: number, limit: number): { total: number; items: CompareItem[] } {
    const cs = this.requireCompare();
    const res = cs.result;
    let list = cs.lists[kind];
    if (!list) {
      if (kind === "removed") list = res.removed;
      else {
        const want = kind === "added" ? ADDED : kind === "changed" ? CHANGED : UNCHANGED;
        let count = 0;
        for (let i = 0; i < res.newerRows; i++) if (res.status[i] === want) count++;
        list = new Uint32Array(count);
        for (let i = 0, k = 0; i < res.newerRows; i++) if (res.status[i] === want) list[k++] = i;
      }
      cs.lists[kind] = list;
    }
    const o = cs.older.table;
    const n = cs.newer.table;
    const text = (t: CompareTable, r: number, c: number) => (c >= 0 && c < t.rowLength(r) ? t.text(r, c) : "");
    const keyCols = res.keys ?? res.columns.map((c, i) => ({ c, i })).filter((x) => x.c.older >= 0 && x.c.newer >= 0).slice(0, 2).map((x) => x.i);
    const items: CompareItem[] = [];
    const end = Math.min(list.length, Math.max(0, offset) + Math.max(0, Math.min(limit, 500)));
    for (let k = Math.max(0, offset); k < end; k++) {
      const x = list[k]!;
      if (kind === "removed") {
        const r = res.olderStart + x;
        items.push({
          kind,
          newerRow: null,
          olderRow: r + 1,
          key: keyCols.map((c) => text(o, r, res.columns[c]!.older)).join(", "),
          repeated: !!res.repeatedOlder?.[x],
          changes: [],
          values: res.columns.filter((c) => c.older >= 0).map((c) => ({ column: c.name, value: text(o, r, c.older) })),
        });
      } else {
        const r = res.newerStart + x;
        const m = res.match[x]!;
        items.push({
          kind,
          newerRow: r + 1,
          olderRow: m >= 0 ? res.olderStart + m + 1 : null,
          key: keyCols.map((c) => text(n, r, res.columns[c]!.newer)).join(", "),
          repeated: !!res.repeatedNewer?.[x],
          changes: kind === "changed" ? rowChanges(o, n, res, x).map((ch) => ({ column: res.columns[ch.column]!.name, old: ch.old, new: ch.new })) : [],
          values: kind === "added" ? res.columns.filter((c) => c.newer >= 0).map((c) => ({ column: c.name, value: text(n, r, c.newer) })) : [],
        });
      }
    }
    return { total: list.length, items };
  }

  /**
   * The difference report (decision 3A), as Excel (changed cells coloured) or CSV, with or
   * without the unchanged rows. Checked before it is offered: the CSV read back cell by cell,
   * the workbook read back cell by cell with its colours.
   */
  async exportCompareReport(format: "csv" | "xlsx", options: { includeUnchanged: boolean }, onProgress: Progress, cancel?: CancelToken): Promise<CompareReportResult> {
    const cs = this.requireCompare();
    const report = new CompareReport(cs.older.table, cs.newer.table, cs.result, options.includeUnchanged);
    const base = (cs.newer.info.name.replace(/\.[^.]+$/, "") || "newer").replace(/[\\/:*?"<>|]+/g, "_");
    const sheet = createSheet("Differences");
    sheet.grid = new ReportGrid(report);
    sheet.columnCount = report.width;
    const progress = (phase: "exporting" | "verifying", done: number, total: number) => onProgress({ phase, loaded: done, total });
    try {
      if (format === "csv") {
        const { blob } = await buildCsv(sheet, { delimiter: ",", lineEnding: "\r\n", bom: true, useDisplay: false, cancel, onProgress: (d, t) => progress("exporting", d, t) });
        const v = await verifyCsv(blob, sheet, { delimiter: ",", bom: true, useDisplay: false, cancel, onProgress: (d, t) => progress("verifying", d, t) });
        return { blob, summary: { downloadName: `${base} - differences.csv`, bytes: blob.size, format, rows: report.rows.length, sheets: 1, includeUnchanged: options.includeUnchanged, verification: { reader: "MyDataFixer's CSV reader", rows: v.rows, cells: v.cells } } };
      }
      if (format !== "xlsx") throw new EngineError("internal", "Unknown report format.");
      // Excel: values converted as in CSV to Excel (codes keep their zeros); the Change label and changed cells coloured.
      const width = report.width;
      const header: OutCell[] = report.header.map((v) => ({ t: "s", v }));
      let cacheK = -1;
      let cacheRow: OutCell[] = [];
      const dataRow = (k: number): OutCell[] => {
        if (k === cacheK) return cacheRow;
        const r = report.row(k);
        const out: OutCell[] = new Array(width);
        const label = r.label + (r.repeated ? " (repeated key)" : "");
        out[0] = r.label === "Unchanged" ? { t: "s", v: label } : { t: "s", v: label, fill: CHANGE_COLOURS[r.label] };
        for (let c = 0; c < r.cells.length; c++) {
          const cell = convertValue(r.cells[c]!).cell;
          out[c + 1] = r.changed.has(c) ? (cell ? { ...cell, fill: CHANGE_COLOURS.Changed } : { t: "s", v: "", fill: CHANGE_COLOURS.Changed }) : cell;
        }
        out[width - 1] = r.whatChanged ? { t: "s", v: r.whatChanged } : null;
        cacheK = k;
        cacheRow = out;
        return out;
      };
      const perSheet = XLSX_MAX_ROWS - 1;
      const sheetCount = Math.max(1, Math.ceil(report.rows.length / perSheet));
      const sheets: SheetSource[] = Array.from({ length: sheetCount }, (_, s) => {
        const first = s * perSheet;
        const count = Math.max(0, Math.min(perSheet, report.rows.length - first));
        return { name: s === 0 ? "Differences" : `Differences (${s + 1})`, rowCount: count + 1, colCount: width, header: true, row: (r: number) => (r === 0 ? header : dataRow(first + r - 1)) };
      });
      const written = await writeXlsx(sheets, { cancel, onProgress: progress });
      const v = await verifyNewXlsx(written.blob, sheets, written.sheetNames, { cancel, onProgress: progress });
      return {
        blob: written.blob,
        summary: { downloadName: `${base} - differences.xlsx`, bytes: written.blob.size, format, rows: report.rows.length, sheets: sheetCount, includeUnchanged: options.includeUnchanged, verification: { reader: "MyDataFixer's check of the new workbook", rows: v.rows, cells: v.cells } },
      };
    } catch (err) {
      if (!(err instanceof EngineError) && isOutOfMemory(err)) throw new EngineError("out-of-memory", "There wasn't enough memory on this device to create the report. Nothing was downloaded. Leave out the unchanged rows, or close other tabs and try again.", String((err as Error).message));
      throw err;
    }
  }

  // ------------------------------------------------------------------ Stage 16: Split File

  private splitCache: { key: string; plan: SplitFilePlan } | null = null;

  /** The parts for this choice (cached until the table or the choice changes). */
  private async splitPlan(sheetName: string, input: SplitFileInput, cancel?: CancelToken): Promise<{ plan: SplitFilePlan; view: SheetModel; excel: boolean }> {
    const st = this.requireState();
    const { sheet: view } = this.current(sheetName);
    const excel = st.format !== "csv";
    const version = st.loaded.get(sheetName)?.session?.version ?? 0;
    const key = `${st.startedAt}|${sheetName}|${version}|${JSON.stringify(input)}`;
    if (this.splitCache?.key !== key) {
      const base = st.fileName.replace(/\.[^.]+$/, "") || "spreadsheet";
      this.splitCache = { key, plan: await planSplitFile(view, input, excel ? `${base} - ${sheetName}` : base, excel, cancel) };
    }
    return { plan: this.splitCache.plan, view, excel };
  }

  /** How CSV parts are written: the original separator and line endings (Excel files: comma, Windows), UTF-8 with BOM. */
  private splitCsvFormat(): { delimiter: "," | ";" | "\t"; lineEnding: "\r\n" | "\n"; bom: boolean } {
    const st = this.requireState();
    const d = st.format === "csv" ? st.csv?.delimiter : ",";
    const delimiter = d === ";" || d === "\t" ? d : ",";
    const lineEnding = st.format === "csv" && st.csv?.lineEnding === "\n" ? "\n" : "\r\n";
    return { delimiter, lineEnding, bom: true };
  }

  private splitFileName(name: string, output: SplitOutput): string {
    return `${name}.${output === "xlsx" ? "xlsx" : this.splitCsvFormat().delimiter === "\t" ? "tsv" : "csv"}`;
  }

  private splitMemoryCheck(view: SheetModel): void {
    const st = this.requireState();
    if (st.memoryBudgetBytes && view.grid.approxBytes * 1.6 + 32 * 1024 * 1024 > st.memoryBudgetBytes * 1.3) {
      throw new EngineError(
        "out-of-memory",
        "This file is too large to split safely in this browser on this device. Nothing was created. Close other tabs and try again, or use a device with more memory.",
      );
    }
  }

  async previewSplitFile(sheetName: string, input: SplitFileInput, output: SplitOutput, cancel?: CancelToken): Promise<SplitFilePreview> {
    if (output !== "csv" && output !== "xlsx") throw new EngineError("internal", "Unknown format for the parts.");
    const { plan } = await this.splitPlan(sheetName, input, cancel);
    const perSheet = XLSX_MAX_ROWS - (plan.headerRow ? 1 : 0);
    return {
      parts: plan.parts.map((p) => ({ name: p.name, fileName: this.splitFileName(p.name, output), value: p.value, rows: p.rows, firstRow: p.firstRow, lastRow: p.lastRow })),
      headerRow: plan.headerRow,
      dataRows: plan.dataRows,
      columnName: plan.columnName,
      output,
      csv: output === "csv" ? this.splitCsvFormat() : null,
      overSheetLimit: output === "xlsx" ? plan.parts.filter((p) => p.rows > perSheet).length : 0,
    };
  }

  /** Create one part and check it (CSV: read back cell by cell; Excel: the new workbook read back). */
  private async buildSplitPart(view: SheetModel, plan: SplitFilePlan, k: number, excel: boolean, output: SplitOutput, cancel?: CancelToken): Promise<SplitPartResult> {
    const p = plan.parts[k];
    if (!p) throw new EngineError("internal", "That part doesn't exist.");
    const fileName = this.splitFileName(p.name, output);
    if (output === "csv") {
      const f = this.splitCsvFormat();
      const sheet = partSheet(view, plan, k, { asText: false, useDisplay: excel });
      const { blob } = await buildCsv(sheet, { ...f, useDisplay: excel, cancel });
      const v = await verifyCsv(blob, sheet, { delimiter: f.delimiter, bom: f.bom, useDisplay: excel, cancel });
      return { blob, fileName, rows: p.rows, verification: { reader: "MyDataFixer's CSV reader", rows: v.rows, cells: v.cells } };
    }
    // Excel parts: the values as the table shows them, converted as in CSV to Excel (codes keep their zeros).
    const sheet = partSheet(view, plan, k, { asText: true, useDisplay: excel });
    const xplan = planCsvToXlsx(sheet, { headerRow: plan.headerRow, name: (view.name || "Sheet").slice(0, 31) });
    const written = await writeXlsx(xplan.sheets, { cancel });
    const v = await verifyNewXlsx(written.blob, xplan.sheets, written.sheetNames, { cancel });
    return { blob: written.blob, fileName, rows: p.rows, verification: { reader: "MyDataFixer's check of the new workbook", rows: v.rows, cells: v.cells } };
  }

  async exportSplitPart(sheetName: string, input: SplitFileInput, index: number, output: SplitOutput, onProgress: Progress, cancel?: CancelToken): Promise<SplitPartResult> {
    const { plan, view, excel } = await this.splitPlan(sheetName, input, cancel);
    this.splitMemoryCheck(view);
    onProgress({ phase: "exporting", loaded: 0, total: 1 });
    try {
      const out = await this.buildSplitPart(view, plan, index, excel, output, cancel);
      onProgress({ phase: "verifying", loaded: 1, total: 1 });
      return out;
    } catch (err) {
      if (!(err instanceof EngineError) && isOutOfMemory(err)) throw new EngineError("out-of-memory", "There wasn't enough memory on this device to create this part. Nothing was downloaded. Close other tabs or apps and try again.", String((err as Error).message));
      throw err;
    }
  }

  /** Every part, each checked, in one ZIP; the ZIP is read back and compared byte by byte before it is offered. */
  async exportSplitZip(sheetName: string, input: SplitFileInput, output: SplitOutput, onProgress: Progress, cancel?: CancelToken): Promise<SplitZipResult> {
    const st = this.requireState();
    const { plan, view, excel } = await this.splitPlan(sheetName, input, cancel);
    this.splitMemoryCheck(view);
    const entries: OutputEntry[] = [];
    const sums: { size: number; crc32: number }[] = [];
    const files: SplitZipResult["summary"]["files"] = [];
    let rows = 0;
    let cells = 0;
    try {
      for (let k = 0; k < plan.parts.length; k++) {
        onProgress({ phase: "exporting", loaded: k, total: plan.parts.length });
        const part = await this.buildSplitPart(view, plan, k, excel, output, cancel);
        const w = new PartWriter();
        for (let off = 0; off < part.blob.size; off += 4 * 1024 * 1024) {
          w.push(new Uint8Array(await part.blob.slice(off, off + 4 * 1024 * 1024).arrayBuffer()));
          throwIfCancelled(cancel);
        }
        const done = w.finish();
        entries.push({ kind: "new", entry: newEntry(part.fileName), ...done });
        sums.push({ size: done.size, crc32: done.crc32 });
        files.push({ name: part.fileName, rows: part.rows, bytes: part.blob.size });
        rows += part.verification.rows;
        cells += part.verification.cells;
      }
      const zip = await writeZip(new Blob([]), entries);
      entries.length = 0;
      const back = await readZipEntries(zip);
      const failed = (detail: string) => new EngineError("internal", "The ZIP file didn't pass MyDataFixer's check, so it was not offered. Please try again, or download the parts one at a time.", detail);
      if (back.length !== sums.length) throw failed("zip entry count");
      for (let k = 0; k < back.length; k++) {
        onProgress({ phase: "verifying", loaded: k, total: back.length });
        // Unzip each file again: its size and CRC-32 must equal those of the part that was checked.
        const crc = new Crc32();
        let size = 0;
        await streamEntry(zip, back[k]!, (d) => {
          crc.update(d);
          size += d.length;
        }, { cancel, maxBytes: Number.MAX_SAFE_INTEGER });
        const ok = back[k]!.name === files[k]!.name && size === sums[k]!.size && crc.value === sums[k]!.crc32 && back[k]!.crc32 === sums[k]!.crc32;
        if (!ok) throw failed(`zip entry ${k}`);
      }
      onProgress({ phase: "verifying", loaded: back.length, total: back.length });
      const base = (st.fileName.replace(/\.[^.]+$/, "") || "spreadsheet").replace(/[\\/:*?"<>|]+/g, "_");
      return {
        blob: new Blob([zip], { type: "application/zip" }),
        summary: { downloadName: `${base} - split.zip`, bytes: zip.size, output, files, verification: { reader: output === "csv" ? "MyDataFixer's CSV reader" : "MyDataFixer's check of the new workbook", rows, cells } },
      };
    } catch (err) {
      if (!(err instanceof EngineError) && isOutOfMemory(err)) throw new EngineError("out-of-memory", "There wasn't enough memory on this device to create the ZIP file. Nothing was downloaded. Download the parts one at a time instead, or close other tabs and try again.", String((err as Error).message));
      throw err;
    }
  }

  async exportXlsx(sheetName: string, onProgress: Progress, cancel?: CancelToken): Promise<ExportResult> {
    const st = this.requireState();
    if (st.format === "xls") return this.exportXlsAsXlsx(sheetName, onProgress, cancel);
    if (st.format !== "xlsx" || !st.inspection) throw new EngineError("internal", "Excel download is for Excel files.");
    if (st.inspection.conformance === "strict") {
      throw new EngineError("unsupported-format", "This workbook uses the “Strict Open XML” format, which MyDataFixer can't rewrite safely. Download it as CSV instead, or save it as a normal .xlsx in Excel and try again.");
    }
    const session = this.session(sheetName);
    const view = session.view();
    const base = session.base;
    const sheetIndex = st.inspection.sheets.findIndex((s) => s.name === sheetName);
    const part = st.inspection.sheets[sheetIndex]?.part;
    if (!part) throw new EngineError("sheet-not-found", `The sheet “${sheetName}” could not be found in the workbook.`);
    const plan = session.exportPlan();

    // S2: never remove rows/columns that something in the workbook refers to.
    let referenceNotes: string[] = [];
    if (plan.deletedRows.length || plan.deletedCols.length) {
      const index = await this.referenceIndex(sheetName, cancel);
      const affected = [...new Set(affectedBy(index, plan.deletedRows, plan.deletedCols))];
      if (affected.length) {
        throw new EngineError(
          "would-break-references",
          `Removing rows or columns from this Excel file would break: ${affected.join("; ")}. Nothing was downloaded, and your changes are kept. Undo the removal and use “Clear the rows instead”, or download as CSV.`,
        );
      }
      referenceNotes = index.notes;
    }

    // Verification re-reads the new workbook: make sure that fits next to the data already held.
    const verifyNeed = estimateExcelMemory(st.file.size, "xlsx", st.inspection, sheetIndex);
    if (st.memoryBudgetBytes && view.grid.approxBytes * 1.6 + verifyNeed > st.memoryBudgetBytes) {
      throw new EngineError(
        "out-of-memory",
        "This workbook is too large to create and check an Excel download in this browser on this device. Nothing was downloaded, and your changes are kept. Download it as CSV instead, or use a device with more memory.",
      );
    }

    st.zip ??= await readZipEntries(st.file);
    const formulaCells = new Set(base.formulas.keys());
    const { blob, changedParts, removedParts } = await patchXlsx({
      source: st.file,
      entries: st.zip,
      sheetPart: part,
      edits: plan.edits,
      deletedRows: plan.deletedRows,
      deletedCols: plan.deletedCols,
      formulaCells,
      cancel,
      onProgress: (done, total) => onProgress({ phase: "exporting", loaded: done, total }),
    });

    // V1/V2: read the generated bytes back with MyDataFixer's reader and compare every cell.
    onProgress({ phase: "verifying", loaded: null, total: null });
    const verification = await this.verifyXlsx(blob, sheetIndex, view, plan.edits.size ? session : null, cancel);

    const stats = session.stats();
    const applied = session.appliedEntries();
    const auto = applied.filter((e) => e.operation !== "edit-cell");
    const replacedFormulas = [...plan.edits.keys()].filter((k) => formulaCells.has(k)).length;
    const warnings: string[] = [];
    if (plan.edits.size) warnings.push("Formulas will recalculate when the file is opened in Excel, so totals that use changed cells are up to date.");
    if (replacedFormulas) warnings.push(`${replacedFormulas} formula${replacedFormulas > 1 ? "s were" : " was"} replaced by the value${replacedFormulas > 1 ? "s" : ""} you typed (you confirmed this).`);
    warnings.push(`Only these parts of the workbook were changed: ${[...changedParts, ...removedParts.map((p) => `${p} (removed; Excel rebuilds it)`)].join(", ")}. Everything else is exactly as in your original file.`);
    const clearedNote = clearedWarning(applied);
    if (clearedNote) warnings.push(clearedNote);
    warnings.push(...referenceNotes);
    const baseName = st.fileName.replace(/\.[^.]+$/, "") || "workbook";
    return {
      blob,
      summary: {
        originalName: st.fileName,
        downloadName: `${baseName}-cleaned.xlsx`,
        format: "xlsx",
        bytes: blob.size,
        changedParts: [...changedParts, ...removedParts],
        rows: view.grid.rowCount,
        columns: view.columnCount,
        cellsEdited: stats.cellsEdited,
        rowsRemoved: stats.rowsRemoved,
        columnsRemoved: stats.columnsRemoved,
        duplicatesRemoved: auto.filter((e) => e.operation === "duplicate-rows").reduce((n, e) => n + e.rowsRemoved, 0),
        automaticCorrections: auto.reduce((n, e) => n + e.cells + e.rowsRemoved + e.columnsRemoved, 0),
        manualEdits: applied.length - auto.length,
        notPreserved: [],
        warnings,
        verification: { reader: "MyDataFixer's Excel reader", rows: verification.rows, cells: verification.cells },
        version: stats.version,
      },
    };
  }

  /** Old .xls files: rebuilt as a new .xlsx (they can't be patched in place); losses are listed. */
  private async exportXlsAsXlsx(sheetName: string, onProgress: Progress, cancel?: CancelToken): Promise<ExportResult> {
    const st = this.requireState();
    const session = this.session(sheetName);
    const view = session.view();
    const plan = session.exportPlan();
    if (plan.deletedRows.length || plan.deletedCols.length) {
      throw new EngineError("would-break-references", "Rows or columns can't be removed from .xls files, because MyDataFixer can't check what refers to them. Undo the removal, or download as CSV.");
    }
    const sheetIndex = st.sheets.findIndex((s) => s.name === sheetName);
    if (st.memoryBudgetBytes && view.grid.approxBytes * 1.6 + 2 * estimateExcelMemory(st.file.size, "xls", null, sheetIndex) > st.memoryBudgetBytes) {
      throw new EngineError("out-of-memory", "This .xls workbook is too large to rebuild and check in this browser on this device. Nothing was downloaded, and your changes are kept. Download it as CSV instead.");
    }
    onProgress({ phase: "exporting", loaded: null, total: null });
    const blob = await rebuildXlsAsXlsx(st.file, sheetIndex, plan.edits, cancel);
    onProgress({ phase: "verifying", loaded: null, total: null });
    const verification = await this.verifyXlsx(blob, sheetIndex, view, session, cancel, st.sheets.map((s) => s.name));
    const stats = session.stats();
    const applied = session.appliedEntries();
    const auto = applied.filter((e) => e.operation !== "edit-cell");
    const baseName = st.fileName.replace(/\.[^.]+$/, "") || "workbook";
    return {
      blob,
      summary: {
        originalName: st.fileName,
        downloadName: `${baseName}-cleaned.xlsx`,
        format: "xlsx",
        bytes: blob.size,
        rows: view.grid.rowCount,
        columns: view.columnCount,
        cellsEdited: stats.cellsEdited,
        rowsRemoved: 0,
        columnsRemoved: 0,
        duplicatesRemoved: 0,
        automaticCorrections: auto.reduce((n, e) => n + e.cells, 0),
        manualEdits: applied.length - auto.length,
        notPreserved: [...XLS_REBUILD_LOSSES],
        warnings: [
          "The old .xls format was converted to the newer .xlsx format, which every current spreadsheet app opens.",
          "Your original .xls file is unchanged.",
          ...(clearedWarning(applied) ? [clearedWarning(applied)!] : []),
        ],
        verification: { reader: "MyDataFixer's Excel reader", rows: verification.rows, cells: verification.cells },
        version: stats.version,
      },
    };
  }

  /** Read the new workbook back and compare it with the expected (edited) sheet, cell by cell. */
  private async verifyXlsx(
    blob: Blob,
    sheetIndex: number,
    view: SheetModel,
    session: EditSession | null,
    cancel?: CancelToken,
    expectedSheets: string[] = this.requireState().inspection!.sheets.map((s) => s.name),
  ): Promise<{ rows: number; cells: number }> {
    const fail = (detail: string) =>
      new EngineError(
        "internal",
        "The corrected Excel file didn't pass MyDataFixer's check, so it was not offered for download. Your changes are kept. Please try again, or download as CSV.",
        `XLSX verification failed: ${detail}`,
      );
    const inspection = await inspectXlsx(blob, { cancel });
    const names = inspection.sheets.map((s) => s.name).join("\u0000");
    if (names !== expectedSheets.join("\u0000")) throw fail("sheet list changed");
    const { sheet: back } = await readExcelSheet(blob, "xlsx", { sheetIndex, inspection, cancel });
    const g = view.grid;
    const b = back.grid;
    const rows = Math.max(g.rowCount, b.rowCount);
    let cells = 0;
    const same = (x: CellValue, y: CellValue) => x === y || (x === null && y === "") || (x === "" && y === null);
    for (let r = 0; r < rows; r++) {
      const len = Math.max(g.rowLength(r), b.rowLength(r));
      for (let c = 0; c < len; c++) {
        const want = g.get(r, c);
        const got = b.get(r, c);
        if (!same(want, got)) throw fail(`cell ${columnLetter(c)}${r + 1}`);
        if (want !== null) cells++;
        const key = cellKey(r, c);
        if ((view.formulas.get(key) ?? null) !== (back.formulas.get(key) ?? null)) throw fail(`formula at ${columnLetter(c)}${r + 1}`);
        const fmt = view.numberFormats.get(key);
        if (session && fmt !== undefined && (g as { isEdited?(r: number, c: number): boolean }).isEdited?.(r, c)) {
          const gotFmt = (b as { format?(r: number, c: number): string | null }).format?.(r, c) ?? null;
          if (gotFmt !== fmt) throw fail(`number format at ${columnLetter(c)}${r + 1}`);
        }
      }
      if ((r & 0x3fff) === 0) throwIfCancelled(cancel);
    }
    if (back.merges.length !== view.merges.length) throw fail("merged cells changed");
    return { rows, cells };
  }

  undo(sheetName: string): EditResult {
    return this.changed(sheetName, this.session(sheetName).undo());
  }

  redo(sheetName: string): EditResult {
    return this.changed(sheetName, this.session(sheetName).redo());
  }

  editStats(sheetName: string): EditStats {
    return this.requireState().loaded.get(sheetName)?.session?.stats() ?? NO_EDITS;
  }

  /** True when any loaded sheet has applied changes (warn before switching sheets or files). */
  hasEdits(): boolean {
    for (const entry of this.state?.loaded.values() ?? []) if (entry.session?.hasChanges) return true;
    return false;
  }

  history(sheetName: string): HistorySummary[] {
    return this.requireState().loaded.get(sheetName)?.session?.history() ?? [];
  }

  historyDetails(sheetName: string, id: number, offset?: number, limit?: number): { total: number; items: HistoryItem[] } {
    return this.session(sheetName).historyDetails(id, offset, limit);
  }

  private requireState(): OpenState {
    if (!this.state) throw new EngineError("internal", "No file is open.");
    return this.state;
  }

  private summary(): WorkbookSummary {
    const st = this.requireState();
    const sheetStats: WorkbookSummary["sheetStats"] = {};
    let issueCount = 0;
    const issues: WorkbookSummary["issues"] = [];
    for (const [name, { sheet }] of st.loaded) {
      sheetStats[name] = { rows: sheet.grid.rowCount, columns: sheet.columnCount };
      issueCount += sheet.issueCount;
      issues.push(...sheet.issues.slice(0, 50));
    }
    const active = st.loaded.get(st.activeSheet)?.sheet;
    const features = st.inspection?.features ?? null;
    return {
      fileName: st.fileName,
      fileSize: st.merge ? st.merge.bytes : st.file.size,
      format: st.json ? "json" : st.xml ? "xml" : st.format,
      sheets: st.sheets,
      activeSheet: st.activeSheet,
      sheetStats,
      features,
      csv: st.csv,
      warnings: [...(st.csv ? csvWarnings(st.csv) : []), ...st.sheetWarnings, ...featureWarnings(features)],
      issueCount,
      issues,
      sheetError: st.sheetError,
      headerGuess: st.json ? st.json.headerRow : st.xml ? true : st.merge ? st.merge.headerRow : active ? guessHeaderRow(active) : false,
      namesGuess: st.json ? st.json.headerRow : st.xml ? true : st.merge ? st.merge.headerRow : active && active.grid.rowCount > 0 ? !namesLookLikeData(active.grid.row(0).map((v) => (v === null ? "" : String(v)))) : false,
      xml: st.xml ?? null,
      merge: st.merge
        ? { files: st.merge.files, columns: st.merge.columns, sourceColumn: st.merge.sourceColumn, removeDuplicates: st.merge.removeDuplicates, duplicatesRemoved: st.merge.duplicatesRemoved, records: st.merge.records }
        : null,
      json: st.json ? { lines: st.json.lines, lists: st.json.lists, path: st.json.path, records: st.json.records, listsAsText: st.json.listsAsText, longNumbers: st.json.longNumbers } : null,
      timings: { totalMs: Date.now() - st.startedAt },
    };
  }
}
