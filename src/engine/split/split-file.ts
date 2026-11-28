/**
 * Stage 16: splitting one table into several files.
 *
 * - Three ways (decision 1A): a number of rows per part, a number of equal parts,
 *   or one part per value of a chosen column.
 * - With column names, the header row is repeated at the top of every part.
 * - 2–1,000 parts (4A). By column value: at most 200 different values, compared
 *   exactly as shown; rows without a value go in a part of their own, “(empty)”,
 *   listed last (5A). Rows keep their original order inside each part.
 *
 * Nothing is copied: a part is a view on the open table (a header row plus a range
 * of rows, or a list of row numbers), written out one at a time.
 */
import { EngineError } from "../errors.ts";
import { throwIfCancelled, yieldToEventLoop, type CancelToken } from "../cancel.ts";
import type { CellValue, SheetModel } from "../types.ts";
import type { CellGrid } from "../grid.ts";
import { cellOutText } from "../export/csv-export.ts";
import { columnLetter } from "../query/query.ts";

export const SPLIT_MAX_PARTS = 1000;
export const SPLIT_MAX_VALUES = 200;
export const EMPTY_VALUE_LABEL = "(empty)";

export type SplitFileMode = "rows" | "parts" | "column";

export interface SplitFileInput {
  mode: SplitFileMode;
  /** mode "rows": data rows per part. */
  rowsPerPart?: number;
  /** mode "parts": number of parts. */
  parts?: number;
  /** mode "column": the column whose values decide the part. */
  column?: number;
  headerRow: boolean;
}

/** Rows of one part: a range, or (by column value) a list of row numbers. */
export type PartRows = { first: number; count: number } | { list: Uint32Array };

export interface PlannedPart {
  /** File name without the extension. */
  name: string;
  /** By column value: the value (EMPTY_VALUE_LABEL for no value); otherwise null. */
  value: string | null;
  /** Data rows (the header row not counted). */
  rows: number;
  /** First and last data row, 1-based in the original table counting every row (for “rows 2–100,001”). */
  firstRow: number;
  lastRow: number;
  select: PartRows;
}

export interface SplitFilePlan {
  input: SplitFileInput;
  parts: PlannedPart[];
  headerRow: boolean;
  dataRows: number;
  /** By column value: the column's name (or letter). */
  columnName: string | null;
}

const fmt = (n: number) => n.toLocaleString("en-US");
const refuse = (message: string) => new EngineError("internal", message);

/** Text that a file name can hold: no \ / : * ? " < > | or control characters, no dots or spaces at the end, at most 60 characters. */
export function safeFileNamePart(s: string): string {
  let out = s.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, "_").replace(/\s+/g, " ").trim();
  if (out.length > 60) out = out.slice(0, 60).trim();
  out = out.replace(/[. ]+$/, "");
  return out || "_";
}

/** Work out the parts (no data is copied). Throws a clear message when the choice can't make 2–1,000 parts. */
export async function planSplitFile(sheet: SheetModel, input: SplitFileInput, baseName: string, useDisplay: boolean, cancel?: CancelToken): Promise<SplitFilePlan> {
  const g = sheet.grid;
  const header = input.headerRow && g.rowCount > 0;
  const start = header ? 1 : 0;
  const dataRows = Math.max(0, g.rowCount - start);
  if (dataRows < 2) throw refuse("This table has fewer than 2 rows of data, so there is nothing to split.");
  const base = safeFileNamePart(baseName || "spreadsheet");
  const ranged = (sizes: number[]): PlannedPart[] => {
    const width = Math.max(2, String(sizes.length).length);
    let first = start;
    return sizes.map((count, k) => {
      const part: PlannedPart = { name: `${base}-part-${String(k + 1).padStart(width, "0")}`, value: null, rows: count, firstRow: first + 1, lastRow: first + count, select: { first, count } };
      first += count;
      return part;
    });
  };

  if (input.mode === "rows") {
    const per = input.rowsPerPart ?? 0;
    if (!Number.isInteger(per) || per < 1) throw refuse("Enter a whole number of rows per part, such as 100000.");
    const n = Math.ceil(dataRows / per);
    if (n < 2) throw refuse(`The table has ${fmt(dataRows)} rows of data, so parts of ${fmt(per)} rows would give just one part. Choose fewer rows per part.`);
    if (n > SPLIT_MAX_PARTS) throw refuse(`Parts of ${fmt(per)} rows would make ${fmt(n)} parts; up to ${fmt(SPLIT_MAX_PARTS)} are possible. Choose more rows per part (at least ${fmt(Math.ceil(dataRows / SPLIT_MAX_PARTS))}).`);
    const sizes = Array.from({ length: n }, (_, k) => Math.min(per, dataRows - k * per));
    return { input, parts: ranged(sizes), headerRow: header, dataRows, columnName: null };
  }

  if (input.mode === "parts") {
    const n = input.parts ?? 0;
    if (!Number.isInteger(n) || n < 2) throw refuse("Enter a number of parts from 2 to 1,000.");
    if (n > SPLIT_MAX_PARTS) throw refuse(`Up to ${fmt(SPLIT_MAX_PARTS)} parts are possible.`);
    if (n > dataRows) throw refuse(`The table has ${fmt(dataRows)} rows of data, so it can be split into at most ${fmt(dataRows)} parts.`);
    // Equal parts: sizes differ by at most one row (the first parts get the extra rows).
    const small = Math.floor(dataRows / n);
    const extra = dataRows % n;
    const sizes = Array.from({ length: n }, (_, k) => small + (k < extra ? 1 : 0));
    return { input, parts: ranged(sizes), headerRow: header, dataRows, columnName: null };
  }

  if (input.mode !== "column") throw refuse("Unknown way of splitting.");
  const col = input.column ?? -1;
  if (!Number.isInteger(col) || col < 0 || col >= Math.max(1, sheet.columnCount)) throw refuse("Choose the column whose values decide the parts.");
  const headerName = header ? cellOutText(sheet, 0, col, useDisplay).trim() : "";
  const columnName = headerName || `Column ${columnLetter(col)}`;
  // Pass 1: the values, in order of first appearance, and how many rows each has.
  const index = new Map<string, number>();
  const counts: number[] = [];
  const values: string[] = [];
  const rowValue = new Uint16Array(dataRows);
  let empty = 0;
  for (let r = start; r < g.rowCount; r++) {
    const v = col < g.rowLength(r) ? cellOutText(sheet, r, col, useDisplay) : "";
    if (v === "") {
      empty++;
      rowValue[r - start] = 0xffff;
    } else {
      let k = index.get(v);
      if (k === undefined) {
        k = values.length;
        if (k >= SPLIT_MAX_VALUES) {
          throw refuse(
            `“${columnName}” has more than ${fmt(SPLIT_MAX_VALUES)} different values, so it would make too many files. Choose a column with fewer different values (such as a city, a month or a category), or split by number of rows.`,
          );
        }
        index.set(v, k);
        values.push(v);
        counts.push(0);
      }
      counts[k]!++;
      rowValue[r - start] = k;
    }
    if ((r & 0xffff) === 0) {
      throwIfCancelled(cancel);
      await yieldToEventLoop();
    }
  }
  const groups = values.length + (empty ? 1 : 0);
  if (groups < 2) {
    throw refuse(
      empty === dataRows
        ? `“${columnName}” is empty in every row, so there is nothing to split by. Choose another column.`
        : `Every row has the same value in “${columnName}” (${values[0]}), so it would give just one part. Choose another column.`,
    );
  }
  // Pass 2: the row numbers of each part.
  const lists = counts.map((n) => new Uint32Array(n));
  const emptyList = new Uint32Array(empty);
  const fill = new Uint32Array(values.length);
  let e = 0;
  for (let i = 0; i < dataRows; i++) {
    const k = rowValue[i]!;
    if (k === 0xffff) emptyList[e++] = i + start;
    else lists[k]![fill[k]!++] = i + start;
  }
  const used = new Set<string>();
  const unique = (name: string) => {
    let out = name;
    for (let n = 2; used.has(out.toLowerCase()); n++) out = `${name} (${n})`;
    used.add(out.toLowerCase());
    return out;
  };
  const part = (value: string, list: Uint32Array, label: string): PlannedPart => ({
    name: unique(`${base}-${safeFileNamePart(label)}`),
    value,
    rows: list.length,
    firstRow: list[0]! + 1,
    lastRow: list[list.length - 1]! + 1,
    select: { list },
  });
  const parts = values.map((v, k) => part(v, lists[k]!, v));
  if (empty) parts.push(part(EMPTY_VALUE_LABEL, emptyList, "empty"));
  return { input, parts, headerRow: header, dataRows, columnName };
}

/**
 * One part as a table: the header row (when there is one) and the part's rows, read
 * from the open table. With `asText`, every cell is the text the table shows
 * (Excel files: dates and numbers as shown), for writing an Excel part like CSV to Excel.
 */
class PartGrid implements CellGrid {
  readonly rowCount: number;
  private readonly src: SheetModel;
  private readonly header: boolean;
  private readonly sel: PartRows;
  private readonly asText: boolean;
  private readonly useDisplay: boolean;
  constructor(src: SheetModel, header: boolean, sel: PartRows, asText: boolean, useDisplay: boolean) {
    this.src = src;
    this.header = header;
    this.sel = sel;
    this.asText = asText;
    this.useDisplay = useDisplay;
    this.rowCount = (header ? 1 : 0) + ("list" in sel ? sel.list.length : sel.count);
  }
  get approxBytes(): number {
    return 64;
  }
  /** The row of the open table. */
  private map(r: number): number {
    if (this.header) {
      if (r === 0) return 0;
      r--;
    }
    return "list" in this.sel ? this.sel.list[r]! : this.sel.first + r;
  }
  rowLength(r: number): number {
    return r >= 0 && r < this.rowCount ? this.src.grid.rowLength(this.map(r)) : 0;
  }
  get(r: number, c: number): CellValue {
    const sr = this.map(r);
    if (!this.asText) return this.src.grid.get(sr, c);
    if (c >= this.src.grid.rowLength(sr)) return null;
    const s = cellOutText(this.src, sr, c, this.useDisplay);
    return s === "" ? null : s;
  }
  row(r: number): CellValue[] {
    const n = this.rowLength(r);
    const out = new Array<CellValue>(n);
    for (let c = 0; c < n; c++) out[c] = this.get(r, c);
    return out;
  }
  display(r: number, c: number): string {
    const sr = this.map(r);
    if (this.asText || !this.src.grid.display) {
      const v = this.get(r, c);
      return v === null ? "" : typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : String(v);
    }
    return this.src.grid.display(sr, c);
  }
  isDate(r: number, c: number): boolean {
    return !this.asText && (this.src.grid.isDate?.(this.map(r), c) ?? false);
  }
}

/** The part as a sheet, for the CSV and Excel writers and their checks. */
export function partSheet(src: SheetModel, plan: SplitFilePlan, k: number, o: { asText: boolean; useDisplay: boolean }): SheetModel {
  const p = plan.parts[k];
  if (!p) throw refuse("That part doesn't exist.");
  return {
    name: src.name,
    grid: new PartGrid(src, plan.headerRow, p.select, o.asText, o.useDisplay),
    columnCount: src.columnCount,
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
    ...(src.date1904 ? { date1904: true } : {}),
  };
}
