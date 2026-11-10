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
  startedAt: number;
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
        startedAt,
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
      // XLS (binary) cannot be inspected without the Excel reader.
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
      startedAt,
    };
    if (first) await this.loadSheet(first.name, onProgress, cancel);
    else if (format === "xls") await this.loadSheet("", onProgress, cancel);
    return this.summary();
  }

  async loadSheet(name: string, onProgress: Progress, cancel?: CancelToken): Promise<WorkbookSummary> {
    const st = this.requireState();
    const info = st.sheets.find((s) => s.name === name);
    if (st.format !== "xls" && !info) throw new EngineError("sheet-not-found", `There is no sheet called “${name}” in this file.`);
    st.activeSheet = name;
    st.sheetError = null;
    if (st.loaded.has(name)) return this.summary();
    if (info && info.kind !== "worksheet") {
      st.sheetError = { code: "chartsheet", message: "This sheet contains a chart, not cells, so there is no data to show." };
      return this.summary();
    }
    if (st.format === "csv") return this.summary();
    onProgress({ phase: "parsing", loaded: null, total: null });
    try {
      // Only the requested sheet is parsed; other sheets are not loaded.
      const sheet = await readExcelSheet(st.file, st.format, { sheetName: name, inspection: st.inspection });
      if (cancel?.cancelled) throw new EngineError("cancelled", "Processing was cancelled.");
      st.loaded.set(name, { sheet, query: new SheetQuery(sheet) });
    } catch (err) {
      if (err instanceof EngineError && (err.code === "not-implemented" || err.code === "too-large-for-engine" || err.code === "out-of-memory")) {
        // File-level information stays valid; only this sheet's cells are unavailable.
        st.sheetError = { code: err.code, message: err.message };
      } else throw err;
    }
    return this.summary();
  }

  getRows(sheetName: string, query: RowQuery): RowPage {
    const st = this.requireState();
    const entry = st.loaded.get(sheetName);
    if (!entry) throw new EngineError("sheet-not-found", `The sheet “${sheetName}” is not loaded.`);
    return entry.query.getPage(query);
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
      sheetStats[name] = { rows: sheet.rows.length, columns: sheet.columnCount };
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
      warnings: [...(st.csv ? csvWarnings(st.csv) : []), ...featureWarnings(features)],
      issueCount,
      issues,
      sheetError: st.sheetError,
      headerGuess: active ? guessHeaderRow(active) : false,
      timings: { totalMs: Date.now() - st.startedAt },
    };
  }
}
