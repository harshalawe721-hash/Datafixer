/**
 * Read-only views over a SheetModel: pagination, search and sorting.
 * Runs inside the worker; only the requested page (and column window) is sent
 * to the UI, so even millions of rows never reach the main thread.
 * Sort/filter results are cached as compact Uint32Array row-index lists.
 */
import { cellKey, type CellValue, type SheetModel } from "../types.ts";

export interface SortSpec {
  column: number;
  direction: "asc" | "desc";
}

export interface RowQuery {
  /** First data row (after header/filter/sort) to return. */
  offset: number;
  limit: number;
  /** First column and number of columns to return. */
  columnOffset?: number;
  columnLimit?: number;
  /** Treat the first sheet row as column headers (excluded from data). */
  headerRow: boolean;
  sort?: SortSpec | null;
  /** Case-insensitive "contains" across all cells. */
  search?: string;
}

export interface PageRow {
  /** Zero-based row index in the original sheet (for row numbers and highlights). */
  index: number;
  cells: string[];
  /** Columns (absolute indexes) of cells holding formulas / error values. */
  formulaColumns?: number[];
  errorColumns?: number[];
}

export interface RowPage {
  /** Rows matching the search (excluding the header row). */
  total: number;
  /** Data rows in the sheet (excluding the header row). */
  totalUnfiltered: number;
  columnCount: number;
  columnOffset: number;
  /** Header labels for the returned column window, when headerRow is true. */
  header: string[] | null;
  rows: PageRow[];
}

export const MAX_PAGE_ROWS = 1000;
export const MAX_PAGE_COLUMNS = 200;

export function cellText(value: CellValue | undefined): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return typeof value === "number" ? String(value) : value;
}

const NUMERIC = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/;

/** Column letters: 0 → "A", 25 → "Z", 26 → "AA". */
export function columnLetter(index: number): string {
  let s = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export class SheetQuery {
  private readonly sheet: SheetModel;
  private sortCache = new Map<string, Uint32Array>();
  private filterCache: { key: string; rows: Uint32Array } | null = null;
  private collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

  constructor(sheet: SheetModel) {
    this.sheet = sheet;
  }

  /** Row indexes in sorted order (cached per column/direction/header setting). */
  private sorted(headerRow: boolean, sort: SortSpec | null | undefined): Uint32Array {
    const start = headerRow ? 1 : 0;
    const grid = this.sheet.grid;
    const total = grid.rowCount;
    const n = Math.max(0, total - start);
    const key = `${start}:${sort ? `${sort.column}:${sort.direction}` : "none"}`;
    const cached = this.sortCache.get(key);
    if (cached) return cached;

    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i + start;
    if (sort) {
      const col = sort.column;
      // Precompute keys once: 0 = number, 1 = text, 2 = empty (always last).
      const kind = new Uint8Array(total);
      const num = new Float64Array(total);
      const text: (string | undefined)[] = new Array(total);
      for (let i = start; i < total; i++) {
        const v = grid.get(i, col);
        if (v === null || v === "") kind[i] = 2;
        else if (typeof v === "number") num[i] = v;
        else if (typeof v === "string" && NUMERIC.test(v)) num[i] = Number(v);
        else {
          kind[i] = 1;
          text[i] = cellText(v);
        }
      }
      const dir = sort.direction === "asc" ? 1 : -1;
      const collator = this.collator;
      order.sort((a, b) => {
        const ka = kind[a]!;
        const kb = kind[b]!;
        if (ka === 2 || kb === 2) return ka === kb ? a - b : ka === 2 ? 1 : -1;
        let c: number;
        if (ka !== kb) c = ka - kb;
        else if (ka === 0) c = num[a]! - num[b]!;
        else c = collator.compare(text[a]!, text[b]!);
        return c !== 0 ? c * dir : a - b; // stable
      });
    }
    // Keep at most a few sort orders to bound memory.
    if (this.sortCache.size >= 4) this.sortCache.delete(this.sortCache.keys().next().value!);
    this.sortCache.set(key, order);
    return order;
  }

  private filtered(base: Uint32Array, search: string, cacheKey: string): Uint32Array {
    if (this.filterCache?.key === cacheKey) return this.filterCache.rows;
    const term = search.toLowerCase();
    const grid = this.sheet.grid;
    const out = new Uint32Array(base.length);
    let n = 0;
    for (let i = 0; i < base.length; i++) {
      const r = base[i]!;
      const len = grid.rowLength(r);
      for (let c = 0; c < len; c++) {
        const v = grid.get(r, c);
        if (v !== null && v !== "" && cellText(v).toLowerCase().includes(term)) {
          out[n++] = base[i]!;
          break;
        }
      }
    }
    const result = out.slice(0, n);
    this.filterCache = { key: cacheKey, rows: result };
    return result;
  }

  getPage(q: RowQuery): RowPage {
    const sheet = this.sheet;
    const start = q.headerRow ? 1 : 0;
    const totalUnfiltered = Math.max(0, sheet.grid.rowCount - start);
    const sort = q.sort && q.sort.column >= 0 && q.sort.column < sheet.columnCount ? q.sort : null;
    let order = this.sorted(q.headerRow, sort);
    const search = (q.search ?? "").trim();
    if (search) order = this.filtered(order, search, `${start}:${sort?.column}:${sort?.direction}:${search}`);

    const limit = Math.max(0, Math.min(q.limit, MAX_PAGE_ROWS));
    const offset = Math.max(0, Math.min(q.offset, order.length));
    const colOffset = Math.max(0, Math.min(q.columnOffset ?? 0, sheet.columnCount));
    const colEnd = Math.min(sheet.columnCount, colOffset + Math.min(q.columnLimit ?? MAX_PAGE_COLUMNS, MAX_PAGE_COLUMNS));
    const hasFormulas = sheet.formulas.size > 0;
    const hasErrors = sheet.errors.size > 0;

    const rows: PageRow[] = [];
    for (let i = offset; i < Math.min(order.length, offset + limit); i++) {
      const r = order[i]!;
      const cells = new Array<string>(colEnd - colOffset);
      let formulaColumns: number[] | undefined;
      let errorColumns: number[] | undefined;
      for (let c = colOffset; c < colEnd; c++) {
        cells[c - colOffset] = cellText(sheet.grid.get(r, c));
        if (hasFormulas && sheet.formulas.has(cellKey(r, c))) (formulaColumns ??= []).push(c);
        if (hasErrors && sheet.errors.has(cellKey(r, c))) (errorColumns ??= []).push(c);
      }
      rows.push({ index: r, cells, formulaColumns, errorColumns });
    }

    let header: string[] | null = null;
    if (q.headerRow) {
      header = [];
      for (let c = colOffset; c < colEnd; c++) header.push(cellText(sheet.grid.get(0, c)));
    }

    return { total: order.length, totalUnfiltered, columnCount: sheet.columnCount, columnOffset: colOffset, header, rows };
  }
}

/**
 * Guess whether the first row is a header: every cell non-empty, mostly text
 * (not numbers), and values not repeated. Users can override this in the UI.
 */
export function guessHeaderRow(sheet: SheetModel): boolean {
  if (sheet.grid.rowCount < 2 || sheet.grid.rowLength(0) === 0) return false;
  const values = sheet.grid.row(0).map(cellText);
  const nonEmpty = values.filter((v) => v.trim() !== "");
  if (nonEmpty.length < Math.max(1, Math.ceil(sheet.columnCount * 0.8))) return false;
  const numeric = nonEmpty.filter((v) => NUMERIC.test(v)).length;
  if (numeric > nonEmpty.length * 0.2) return false;
  return new Set(nonEmpty.map((v) => v.trim().toLowerCase())).size === nonEmpty.length;
}
