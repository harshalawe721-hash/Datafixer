/**
 * EngineCore holds the single open spreadsheet and answers requests.
 * It runs inside the Web Worker (see worker/engine.worker.ts) but has no
 * worker-specific code, so it can be unit-tested directly.
 *
 * The user's File is only ever read (Blob.slice), never written. All parsed
 * data stays here; callers receive summaries and pages of rows.
 */
import type { SpreadsheetFormat } from "@/lib/file-validation";
import { EngineError } from "./errors.ts";
import { cellKey } from "./types.ts";
import type { CancelToken } from "./cancel.ts";
import { parseCsv } from "./csv/parse-csv.ts";
import { inspectXlsx, dimensionSize, type InspectionResult } from "./xlsx/inspect.ts";
import { readExcelSheet } from "./xlsx/read-workbook.ts";
import { SheetQuery, guessHeaderRow, type PageView, type RowPage, type RowQuery } from "./query/query.ts";
import type { CsvMeta, FeatureInventory, ProgressEvent, SheetInfo, SheetModel, WorkbookSummary } from "./types.ts";
import type { OpenOptions } from "./protocol.ts";
import { runScan, type Finding, type ScanContext, type ScanOptions, type ScanResult } from "./scan/scan.ts";
import { ALL_CHECKS } from "./scan/checks/index.ts";
import { EditSession, type ChangeRequest, type EditStats, type HistoryItem, type HistorySummary } from "./edit/session.ts";
import { columnLetter } from "./query/query.ts";

interface OpenState {
  file: Blob;
  fileName: string;
  format: SpreadsheetFormat;
  sheets: SheetInfo[];
  loaded: Map<string, LoadedSheet>;
  inspection: InspectionResult | null;
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
    ctx: ScanContext;
    result: ScanResult;
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
  /** The history entry changed by this call (null when nothing changed). */
  entry: HistorySummary | null;
  stats: EditStats;
}

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

  close(): void {
    this.state = null;
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
        mask = new Uint8Array(scan.ctx.rowCount);
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
        ? (r: number, c: number) => r >= scan.ctx.startRow && columns.has(c)
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
    st.lastScan = { sheet: sheetName, headerRow: options.headerRow, ctx, result, findings, seq: ++this.scanSeq };
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
  private changed(sheetName: string, entry: HistorySummary | null): EditResult {
    const st = this.requireState();
    if (entry && st.lastScan?.sheet === sheetName) st.lastScan = null;
    return { entry, stats: this.session(sheetName).stats() };
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
    if (st.format !== "csv") {
      const t = text.trim();
      if (t === "") value = null;
      else if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(t) && !/^[+-]?0\d/.test(t) && Number.isFinite(Number(t))) value = Number(t);
    }
    return this.applyChange(sheetName, { operation: "edit-cell", label: "Edit cell", cells: [{ row, col, value }] });
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
