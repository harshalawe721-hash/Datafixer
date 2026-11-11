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
import type { CancelToken } from "./cancel.ts";
import { parseCsv } from "./csv/parse-csv.ts";
import { inspectXlsx, dimensionSize, type InspectionResult } from "./xlsx/inspect.ts";
import { readExcelSheet } from "./xlsx/read-workbook.ts";
import { SheetQuery, guessHeaderRow, type RowPage, type RowQuery } from "./query/query.ts";
import type { CsvMeta, FeatureInventory, ProgressEvent, SheetInfo, SheetModel, WorkbookSummary } from "./types.ts";
import type { OpenOptions } from "./protocol.ts";
import { runScan, type Finding, type ScanContext, type ScanOptions, type ScanResult } from "./scan/scan.ts";
import { ALL_CHECKS } from "./scan/checks/index.ts";

interface OpenState {
  file: Blob;
  fileName: string;
  format: SpreadsheetFormat;
  sheets: SheetInfo[];
  loaded: Map<string, { sheet: SheetModel; query: SheetQuery }>;
  inspection: InspectionResult | null;
  csv: CsvMeta | null;
  activeSheet: string;
  sheetError: { code: string; message: string } | null;
  /** Warnings produced while reading the active sheet (Excel). */
  sheetWarnings: string[];
  memoryBudgetBytes: number | undefined;
  startedAt: number;
  /** Latest Error Detector scan (kept for "view affected data"). */
  lastScan: { sheet: string; headerRow: boolean; ctx: ScanContext; result: ScanResult; findings: Finding[] } | null;
}

type Progress = (p: ProgressEvent) => void;

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
    const st = this.requireState();
    const entry = st.loaded.get(sheetName);
    if (!entry) throw new EngineError("sheet-not-found", `The sheet “${sheetName}” is not loaded.`);
    return entry.query.getPage(query);
  }

  /**
   * Error Detector scan of a loaded sheet. Read-only: data is never changed.
   * The scan context is kept (replacing any previous one) for later views.
   */
  async scan(sheetName: string, options: ScanOptions, onProgress: Progress, cancel?: CancelToken): Promise<ScanResult> {
    const st = this.requireState();
    const entry = st.loaded.get(sheetName);
    if (!entry) throw new EngineError("sheet-not-found", `The sheet “${sheetName}” is not loaded.`);
    st.lastScan = null; // release the previous scan's caches first
    const { result, ctx, findings } = await runScan(entry.sheet, {
      headerRow: options.headerRow,
      cancel,
      memoryBudgetBytes: st.memoryBudgetBytes,
      checks: ALL_CHECKS,
      onProgress: (done, total) => onProgress({ phase: "scanning", loaded: done, total }),
    });
    st.lastScan = { sheet: sheetName, headerRow: options.headerRow, ctx, result, findings };
    return result;
  }

  /** Access for future tools (scanners, cleaners) running inside the worker. */
  getSheet(name: string): SheetModel | null {
    return this.state?.loaded.get(name)?.sheet ?? null;
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
