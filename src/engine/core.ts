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
import { validateCsv, type ValidationResult } from "./validate/validate.ts";
import { cellKey } from "./types.ts";
import { throwIfCancelled, type CancelToken } from "./cancel.ts";
import { parseCsv } from "./csv/parse-csv.ts";
import { inspectXlsx, dimensionSize, type InspectionResult } from "./xlsx/inspect.ts";
import { readExcelSheet } from "./xlsx/read-workbook.ts";
import { SheetQuery, guessHeaderRow, type PageView, type RowPage, type RowQuery } from "./query/query.ts";
import type { CsvMeta, FeatureInventory, ProgressEvent, SheetInfo, SheetModel, WorkbookSummary } from "./types.ts";
import type { OpenOptions } from "./protocol.ts";
import { runScan, type Finding, type ScanOptions, type ScanResult } from "./scan/scan.ts";
import { ALL_CHECKS } from "./scan/checks/index.ts";
import { EditSession, type ChangeRequest, type EditStats, type HistoryItem, type HistorySummary } from "./edit/session.ts";
import { columnLetter } from "./query/query.ts";
import { planFix, type FixId, type FixOptions, type FixPreview } from "./fix/fixes.ts";
import { excelSerial, parseTextDate } from "./fix/choice-fixes.ts";
import { classify } from "./scan/classify.ts";
import { buildCsv, verifyCsv } from "./export/csv-export.ts";
import { readZipEntries, type ZipEntry } from "./xlsx/zip.ts";
import { affectedBy, buildReferenceIndex, type ReferenceIndex } from "./xlsx/references.ts";
import { patchXlsx } from "./xlsx/patch.ts";
import { estimateExcelMemory } from "./xlsx/read-workbook.ts";
import { XLS_REBUILD_LOSSES, rebuildXlsAsXlsx } from "./export/xls-export.ts";
import type { CellValue } from "./types.ts";
import { familyOf } from "./scan/checks/dates.ts";

interface OpenState {
  file: Blob;
  fileName: string;
  format: SpreadsheetFormat;
  sheets: SheetInfo[];
  loaded: Map<string, LoadedSheet>;
  inspection: InspectionResult | null;
  /** Stage 4 (Excel download): ZIP directory and per-sheet reference indexes, built when first needed. */
  zip?: ZipEntry[];
  refIndex?: Map<string, ReferenceIndex>;
  csv: CsvMeta | null;
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
  duplicatesRemoved: number;
  /** Cells, rows and columns changed by automatic fixes. */
  automaticCorrections: number;
  manualEdits: number;
  /** What the downloaded file can't keep (empty: nothing lost). */
  notPreserved: string[];
  warnings: string[];
  /** How the file was checked before it was offered. */
  verification: { reader: string; rows: number; cells: number };
  /** Edit version that was exported (a later change makes this download out of date). */
  version: number;
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
  /** What "Fix all" leaves for the user, with the reason. */
  notes: string[];
}

/** Order matters: spaces first (so " Ann" and "Ann" become duplicates), removals last. */
const FIX_ALL_ORDER: FixId[] = ["extra-spaces", "inconsistent-case", "numbers-as-text", "duplicate-rows", "empty-rows", "empty-columns"];
const ROW_OR_COLUMN_FIXES = new Set<FixId>(["duplicate-rows", "empty-rows", "empty-columns"]);

const NO_EDITS: EditStats = { cellsEdited: 0, rowsRemoved: 0, columnsRemoved: 0, changesApplied: 0, canUndo: false, canRedo: false, version: 0 };

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
      `This workbook contains ${joinList(parts)}. DataFixer reads the cell data only; these features stay untouched in your original file. Any file you download later will tell you clearly which of them it can keep.`,
    );
  }
  if (f.macros) w.push("This workbook contains macros. DataFixer never runs macros.");
  if (f.externalLinks) w.push("This workbook links to other workbooks. DataFixer never opens or updates external links; linked values are shown as last saved.");
  if (f.embeddedObjects) w.push("This workbook contains embedded objects. DataFixer never opens or runs them.");
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
      `${meta.formulaLikeCells.toLocaleString("en-US")} cell${meta.formulaLikeCells > 1 ? "s" : ""} start with =, +, - or @. Spreadsheet apps may treat these as formulas when the CSV is opened. DataFixer shows them as plain text and never runs them.`,
    );
  }
  return w;
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
  async previewFix(sheetName: string, fixId: FixId, options: FixOptions, onProgress: Progress, cancel?: CancelToken): Promise<FixPreviewResult> {
    const st = this.requireState();
    const session = this.session(sheetName);
    const plan = await planFix(session.view(), fixId, { ...options, textOnly: st.format === "csv" }, {
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
  async previewFixAll(sheetName: string, options: { headerRow: boolean }, onProgress: Progress, cancel?: CancelToken): Promise<FixAllPreview> {
    const st = this.requireState();
    const session = this.session(sheetName);
    const excel = st.format !== "csv";
    const scratch = new EditSession(session.view(), { memoryBudgetBytes: st.memoryBudgetBytes });
    const steps: FixPreview[] = [];
    const requests: ChangeRequest[] = [];
    const notes: string[] = [];
    // .xls: references can't be checked, so no removals. .xlsx: removals only where nothing refers to them (S2).
    const order = FIX_ALL_ORDER.filter((id) => !(st.format === "xls" && ROW_OR_COLUMN_FIXES.has(id)));
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
      const plan = await planFix(scratch.view(), fixId, { headerRow: options.headerRow, textOnly: !excel, keepColumns }, {
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
      if (st.format === "xlsx" && ROW_OR_COLUMN_FIXES.has(fixId)) {
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
    if (st.format === "xls") notes.push("Old .xls file: duplicate and empty rows and columns are not removed, because DataFixer can't check what refers to them. Use the Fix button on those problems to clear them instead.");
    const token = `fix-${++this.fixSeq}`;
    this.pendingFix = { token, sheet: sheetName, version: session.version, requests };
    return {
      token,
      steps,
      cellsChanged: steps.reduce((n, s) => n + s.cellsChanged, 0),
      rowsRemoved: steps.reduce((n, s) => n + s.rowsRemoved, 0),
      columnsRemoved: steps.reduce((n, s) => n + s.columnsRemoved, 0),
      notes,
    };
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
  async exportCsv(sheetName: string, onProgress: Progress, cancel?: CancelToken): Promise<ExportResult> {
    const st = this.requireState();
    const session = this.session(sheetName);
    const view = session.view();
    const excel = st.format !== "csv";
    const delimiter = st.csv?.delimiter ?? ",";
    const lineEnding: "\n" | "\r\n" = st.csv?.lineEnding === "\n" ? "\n" : "\r\n";
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
        useDisplay: excel,
        cancel,
        onProgress: (done, total) => onProgress({ phase: "exporting", loaded: done, total }),
      });
      const verification = await verifyCsv(blob, view, {
        delimiter,
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
        warnings.push("Dates and numbers are saved as they are shown in the table.");
      } else {
        if (st.csv && st.csv.encoding !== "utf-8") warnings.push(`The original file used ${st.csv.encoding}; the new file is UTF-8, which Excel and Google Sheets read correctly.`);
        if (st.csv && st.csv.lineEnding !== "\n" && st.csv.lineEnding !== "\r\n") warnings.push("Line endings were made consistent (Windows style).");
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
          downloadName: excel ? `${base} - ${safeSheet}-cleaned.csv` : `${base}-cleaned.csv`,
          format: "csv",
          bytes: blob.size,
          rows: view.grid.rowCount,
          columns: view.columnCount,
          cellsEdited: stats.cellsEdited,
          rowsRemoved: stats.rowsRemoved,
          columnsRemoved: stats.columnsRemoved,
          duplicatesRemoved: auto.filter((e) => e.operation === "duplicate-rows").reduce((n, e) => n + e.rowsRemoved, 0),
          automaticCorrections: auto.reduce((n, e) => n + e.cells + e.rowsRemoved + e.columnsRemoved, 0),
          manualEdits: applied.length - auto.length,
          notPreserved,
          warnings,
          verification: { reader: "DataFixer's CSV reader", rows: verification.rows, cells: verification.cells },
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
   * with DataFixer's Excel reader and compare every cell before returning it.
   */
  async exportXlsx(sheetName: string, onProgress: Progress, cancel?: CancelToken): Promise<ExportResult> {
    const st = this.requireState();
    if (st.format === "xls") return this.exportXlsAsXlsx(sheetName, onProgress, cancel);
    if (st.format !== "xlsx" || !st.inspection) throw new EngineError("internal", "Excel download is for Excel files.");
    if (st.inspection.conformance === "strict") {
      throw new EngineError("unsupported-format", "This workbook uses the “Strict Open XML” format, which DataFixer can't rewrite safely. Download it as CSV instead, or save it as a normal .xlsx in Excel and try again.");
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

    // V1/V2: read the generated bytes back with DataFixer's reader and compare every cell.
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
        verification: { reader: "DataFixer's Excel reader", rows: verification.rows, cells: verification.cells },
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
      throw new EngineError("would-break-references", "Rows or columns can't be removed from .xls files, because DataFixer can't check what refers to them. Undo the removal, or download as CSV.");
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
        verification: { reader: "DataFixer's Excel reader", rows: verification.rows, cells: verification.cells },
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
        "The corrected Excel file didn't pass DataFixer's check, so it was not offered for download. Your changes are kept. Please try again, or download as CSV.",
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
      fileSize: st.file.size,
      format: st.format,
      sheets: st.sheets,
      activeSheet: st.activeSheet,
      sheetStats,
      features,
      csv: st.csv,
      warnings: [...(st.csv ? csvWarnings(st.csv) : []), ...st.sheetWarnings, ...featureWarnings(features)],
      issueCount,
      issues,
      sheetError: st.sheetError,
      headerGuess: active ? guessHeaderRow(active) : false,
      timings: { totalMs: Date.now() - st.startedAt },
    };
  }
}
