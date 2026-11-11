/**
 * Error Detector scan framework (Stage 3).
 *
 * Two passes over the sheet, regardless of how many checks exist, so scanning
 * stays fast on low-end devices:
 *   pass 1 – classify every cell once (1 byte per cell) and profile each column;
 *   pass 2 – every check ("visitor") sees each cell once, using the cached
 *            category, and reports its findings at the end.
 * Work is done in batches with progress and cooperative cancellation; the
 * worker can also be terminated at any time. Nothing is ever modified.
 */
import { cellKey, type CellValue, type SheetModel } from "../types.ts";
import { EngineError } from "../errors.ts";
import { throwIfCancelled, yieldToEventLoop, type CancelToken } from "../cancel.ts";
import { columnLetter } from "../query/query.ts";
import { Cat, DATE_PATTERNS, classify, isDateLike, isNumberLike, type ColumnKind, type DatePatternId } from "./classify.ts";

export interface ScanOptions {
  /** Treat the first sheet row as column names (it is not checked as data). */
  headerRow: boolean;
}

export interface ColumnProfile {
  index: number;
  letter: string;
  /** Column name from the header row, if any. */
  name: string | null;
  kind: ColumnKind;
  /** Cells with a value (whitespace-only cells are counted in `blank`). */
  nonEmpty: number;
  /** Rows with no value in this column (including rows that end before it). */
  empty: number;
  blank: number;
  counts: {
    number: number;
    numericText: number;
    formattedNumber: number;
    date: number;
    dateText: number;
    boolean: number;
    error: number;
    text: number;
  };
  /** Numeric text with a leading zero such as "007" (identifiers, ZIP codes). */
  leadingZero: number;
  /** Text date formats found in the column, with counts. */
  datePatterns: Partial<Record<DatePatternId, number>>;
  /** Up to 3 distinct example values, as shown. */
  examples: string[];
}

export type Severity = "error" | "warning" | "note";

/** One problem type found by a check (filled in by Steps 2–6). */
export interface ScanIssue {
  id: string;
  severity: Severity;
  title: string;
  /** Number of affected rows / cells / groups, as `unit` says. */
  count: number;
  unit: "rows" | "cells" | "groups" | "columns";
  explanation: string;
  howToFix: string;
  /** Per-column breakdown, where relevant. */
  columns?: { index: number; name: string; count: number }[];
  /** A few concrete examples (row is the zero-based sheet row). */
  examples?: { row: number; col: number; value: string; note?: string }[];
}

export interface ScanResult {
  sheet: string;
  headerRow: boolean;
  /** Data rows checked (excluding the header row). */
  rows: number;
  columns: number;
  /** Non-empty cells checked. */
  cells: number;
  profiles: ColumnProfile[];
  issues: ScanIssue[];
  timings: { profileMs: number; checksMs: number; totalMs: number };
}

/**
 * A check's result: the issue summary sent to the page, plus the affected
 * rows/cells kept in the worker for "view affected data".
 */
export interface Finding {
  issue: ScanIssue;
  /** Affected sheet rows, ascending. */
  rows?: Uint32Array;
  /** Affected cells as cellKey(row, col), capped (see hits.ts). */
  cells?: Float64Array;
  /** Affected columns (column-level issues). */
  columns?: number[];
}

/** Shared, read-only data for all checks. */
export interface ScanContext {
  sheet: SheetModel;
  headerRow: boolean;
  /** First data row (1 when there is a header row). */
  startRow: number;
  /** Total sheet rows (rows startRow … rowCount-1 are data). */
  rowCount: number;
  columnCount: number;
  /** Category of every cell, row-major; see cellCat(). */
  cats: Uint8Array;
  /** cats offset of each data row (length = data rows + 1). */
  rowStart: Uint32Array;
  profiles: ColumnProfile[];
}

/** Category of cell (r, c) from the cache; Empty if the row is shorter. */
export function cellCat(ctx: ScanContext, r: number, c: number): number {
  const i = r - ctx.startRow;
  const start = ctx.rowStart[i]!;
  const len = ctx.rowStart[i + 1]! - start;
  return c < len ? ctx.cats[start + c]! : Cat.Empty;
}

/** A check: sees every cell once in pass 2, then reports findings. */
export interface CellVisitor {
  cell(r: number, c: number, cat: number, value: CellValue): void;
  /** Called after the last cell of each data row. */
  endRow?(r: number, length: number): void;
  /** Called once after all rows; may read the grid again (e.g. to verify duplicates). */
  finish(): Finding[] | Promise<Finding[]>;
}

export type CheckFactory = (ctx: ScanContext) => CellVisitor;

export interface ScanRunOptions extends ScanOptions {
  cancel?: CancelToken;
  onProgress?: (done: number, total: number) => void;
  /** Bytes the scan may allocate for its caches (memory budget). */
  memoryBudgetBytes?: number;
  /** Checks to run in pass 2 (Steps 2–6 add them). */
  checks?: CheckFactory[];
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, note: 2 };

/** Rows per batch between progress reports / cancellation checks. */
const BATCH_ROWS = 8192;

function emptyProfile(index: number, name: string | null): ColumnProfile {
  return {
    index,
    letter: columnLetter(index),
    name,
    kind: "empty",
    nonEmpty: 0,
    empty: 0,
    blank: 0,
    counts: { number: 0, numericText: 0, formattedNumber: 0, date: 0, dateText: 0, boolean: 0, error: 0, text: 0 },
    leadingZero: 0,
    datePatterns: {},
    examples: [],
  };
}

/** Decide a column's kind: a family must cover ≥ 80% of its typed values. */
export function columnKind(p: ColumnProfile): ColumnKind {
  if (p.nonEmpty === 0) return "empty";
  const n = p.counts;
  const typed = p.nonEmpty - n.error;
  if (typed <= 0) return "mixed";
  const share = (x: number) => x / typed;
  if (share(n.number + n.numericText + n.formattedNumber) >= 0.8) return "number";
  if (share(n.date + n.dateText) >= 0.8) return "date";
  if (share(n.boolean) >= 0.8) return "boolean";
  if (share(n.text) >= 0.8) return "text";
  return "mixed";
}

function cellDisplay(sheet: SheetModel, r: number, c: number, v: CellValue): string {
  if (sheet.grid.display) return sheet.grid.display(r, c);
  return v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
}

export async function runScan(sheet: SheetModel, options: ScanRunOptions): Promise<{ result: ScanResult; ctx: ScanContext; findings: Finding[] }> {
  const t0 = Date.now();
  const grid = sheet.grid;
  const startRow = options.headerRow && grid.rowCount > 0 ? 1 : 0;
  const rowCount = grid.rowCount;
  const dataRows = Math.max(0, rowCount - startRow);
  const columnCount = sheet.columnCount;

  // Size the category cache, and check it against the memory budget first.
  const rowStart = new Uint32Array(dataRows + 1);
  let totalCells = 0;
  for (let i = 0; i < dataRows; i++) {
    rowStart[i] = totalCells;
    totalCells += grid.rowLength(i + startRow);
  }
  rowStart[dataRows] = totalCells;
  const cacheBytes = totalCells + rowStart.byteLength;
  if (options.memoryBudgetBytes && cacheBytes + grid.approxBytes * 1.6 > options.memoryBudgetBytes) {
    throw new EngineError(
      "too-large-for-engine",
      "This sheet is too large to check for problems in this browser on this device. Nothing was changed. Try a desktop computer, or split the file into smaller parts.",
      `scan cache ${cacheBytes} bytes`,
    );
  }
  const cats = new Uint8Array(totalCells);

  const profiles: ColumnProfile[] = [];
  for (let c = 0; c < columnCount; c++) {
    const name = startRow === 1 ? cellDisplay(sheet, 0, c, grid.get(0, c)).trim() || null : null;
    profiles.push(emptyProfile(c, name));
  }

  const checks = options.checks ?? [];
  const totalWork = dataRows * (checks.length > 0 ? 2 : 1);
  const hasErrors = sheet.errors.size > 0;
  const hasDates = typeof grid.isDate === "function";

  // ---- pass 1: classify + profile -------------------------------------
  let nonEmptyCells = 0;
  for (let i = 0; i < dataRows; i++) {
    const r = i + startRow;
    const off = rowStart[i]!;
    const len = rowStart[i + 1]! - off;
    for (let c = 0; c < len; c++) {
      const v = grid.get(r, c);
      const cat = classify(v, hasErrors && sheet.errors.has(cellKey(r, c)), hasDates && v !== null && grid.isDate!(r, c));
      cats[off + c] = cat;
      if (cat === Cat.Empty) continue;
      const p = profiles[c]!;
      if (cat === Cat.Blank) {
        p.blank++;
        continue;
      }
      p.nonEmpty++;
      nonEmptyCells++;
      const n = p.counts;
      switch (cat) {
        case Cat.Number:
          n.number++;
          break;
        case Cat.NumericText: {
          n.numericText++;
          const s = (v as string).trim();
          // "007", "-01" — but not "0", "0.5" or "-0.25".
          if (/^[+-]?0\d/.test(s)) p.leadingZero++;
          break;
        }
        case Cat.FormattedNumber:
          n.formattedNumber++;
          break;
        case Cat.Date:
          n.date++;
          break;
        case Cat.Boolean:
          n.boolean++;
          break;
        case Cat.Error:
          n.error++;
          break;
        case Cat.Text:
          n.text++;
          break;
        default: {
          n.dateText++;
          const pid = DATE_PATTERNS[cat - Cat.DateTextBase]?.id;
          if (pid) p.datePatterns[pid] = (p.datePatterns[pid] ?? 0) + 1;
        }
      }
      if (p.examples.length < 3) {
        const shown = cellDisplay(sheet, r, c, v);
        if (!p.examples.includes(shown)) p.examples.push(shown.length > 60 ? `${shown.slice(0, 57)}…` : shown);
      }
    }
    if ((i & (BATCH_ROWS - 1)) === BATCH_ROWS - 1) {
      throwIfCancelled(options.cancel);
      options.onProgress?.(i + 1, totalWork);
      await yieldToEventLoop();
    }
  }
  for (const p of profiles) {
    p.empty = dataRows - p.nonEmpty - p.blank;
    p.kind = columnKind(p);
  }
  const tProfile = Date.now();

  const ctx: ScanContext = { sheet, headerRow: startRow === 1, startRow, rowCount, columnCount, cats, rowStart, profiles };

  // ---- pass 2: checks ---------------------------------------------------
  const findings: Finding[] = [];
  if (checks.length > 0) {
    const visitors = checks.map((make) => make(ctx));
    for (let i = 0; i < dataRows; i++) {
      const r = i + startRow;
      const off = rowStart[i]!;
      const len = rowStart[i + 1]! - off;
      for (let c = 0; c < len; c++) {
        const cat = cats[off + c]!;
        const v = cat === Cat.Empty ? null : grid.get(r, c);
        for (let k = 0; k < visitors.length; k++) visitors[k]!.cell(r, c, cat, v);
      }
      for (let k = 0; k < visitors.length; k++) visitors[k]!.endRow?.(r, len);
      if ((i & (BATCH_ROWS - 1)) === BATCH_ROWS - 1) {
        throwIfCancelled(options.cancel);
        options.onProgress?.(dataRows + i + 1, totalWork);
        await yieldToEventLoop();
      }
    }
    for (const v of visitors) {
      throwIfCancelled(options.cancel);
      for (const f of await v.finish()) if (f.issue.count > 0) findings.push(f);
    }
    // Most serious first, then the most affected.
    findings.sort((a, b) => SEVERITY_ORDER[a.issue.severity] - SEVERITY_ORDER[b.issue.severity] || b.issue.count - a.issue.count);
  }
  const issues = findings.map((f) => f.issue);
  throwIfCancelled(options.cancel);
  options.onProgress?.(totalWork, totalWork);
  const tEnd = Date.now();

  const result: ScanResult = {
    sheet: sheet.name,
    headerRow: ctx.headerRow,
    rows: dataRows,
    columns: columnCount,
    cells: nonEmptyCells,
    profiles,
    issues,
    timings: { profileMs: tProfile - t0, checksMs: tEnd - tProfile, totalMs: tEnd - t0 },
  };
  return { result, ctx, findings };
}

export { isNumberLike, isDateLike };
