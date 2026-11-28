/**
 * Stage 17, decision 3A: the difference report.
 *
 * Every row of the newer file (rows with no values left out), then the removed rows of the
 * older file. Columns: “Change” (Added, Removed, Changed, Unchanged; “(repeated key)” when the
 * row's key appears more than once in its file), every column (columns only in the older file
 * last), then “What changed” (“city: Pune → Oslo; price: 10 → 12”). Optionally without the
 * unchanged rows. In the Excel report, changed cells and the Change label are coloured.
 *
 * The report is a view computed row by row from the two tables; nothing is copied.
 */
import type { CellGrid } from "../grid.ts";
import type { CellValue } from "../types.ts";
import { ADDED, CHANGED, EMPTY, UNCHANGED, rowChanges, type CompareResult, type CompareTable } from "./compare.ts";

export const CHANGE_COLOURS = { Added: "E2EFDA", Removed: "FCE4D6", Changed: "FFF2CC" } as const;
/** “What changed” stays within one Excel cell (32,767 characters). */
const MAX_WHAT_CHANGED = 32_000;

export interface ReportRow {
  label: "Added" | "Removed" | "Changed" | "Unchanged";
  repeated: boolean;
  cells: string[];
  /** Columns (positions in `cells`) whose value changed. */
  changed: Set<number>;
  whatChanged: string;
}

export class CompareReport {
  readonly older: CompareTable;
  readonly newer: CompareTable;
  readonly res: CompareResult;
  /** Report rows: i ≥ 0 is data row i of the newer file; i < 0 is removed data row −i−1 of the older file. */
  readonly rows: Int32Array;

  constructor(older: CompareTable, newer: CompareTable, res: CompareResult, includeUnchanged: boolean) {
    this.older = older;
    this.newer = newer;
    this.res = res;
    let n = res.removed.length;
    for (let i = 0; i < res.newerRows; i++) if (res.status[i] !== EMPTY && (includeUnchanged || res.status[i] !== UNCHANGED)) n++;
    this.rows = new Int32Array(n);
    let k = 0;
    for (let i = 0; i < res.newerRows; i++) if (res.status[i] !== EMPTY && (includeUnchanged || res.status[i] !== UNCHANGED)) this.rows[k++] = i;
    for (const r of res.removed) this.rows[k++] = -r - 1;
  }

  get header(): string[] {
    return ["Change", ...this.res.columns.map((c) => c.name), "What changed"];
  }

  get width(): number {
    return this.res.columns.length + 2;
  }

  /** Report row k (0-based, header not counted). */
  row(k: number): ReportRow {
    const { older, newer, res } = this;
    const at = this.rows[k]!;
    const text = (t: CompareTable, r: number, c: number) => (c >= 0 && c < t.rowLength(r) ? t.text(r, c) : "");
    if (at < 0) {
      const r = -at - 1;
      return {
        label: "Removed",
        repeated: !!res.repeatedOlder?.[r],
        cells: res.columns.map((c) => text(older, res.olderStart + r, c.older)),
        changed: new Set(),
        whatChanged: "",
      };
    }
    const i = at;
    const st = res.status[i]!;
    const o = res.match[i]!;
    const cells = res.columns.map((c) => (c.newer >= 0 ? text(newer, res.newerStart + i, c.newer) : o >= 0 ? text(older, res.olderStart + o, c.older) : ""));
    const changed = new Set<number>();
    let whatChanged = "";
    if (st === CHANGED) {
      const parts: string[] = [];
      let length = 0;
      const list = rowChanges(older, newer, res, i);
      for (let x = 0; x < list.length; x++) {
        const ch = list[x]!;
        changed.add(ch.column);
        const part = `${res.columns[ch.column]!.name}: ${ch.old || "(empty)"} → ${ch.new || "(empty)"}`;
        if (length + part.length > MAX_WHAT_CHANGED) {
          parts.push(`… and ${list.length - x} more change${list.length - x > 1 ? "s" : ""} (see the coloured cells)`);
          break;
        }
        parts.push(part);
        length += part.length + 2;
      }
      whatChanged = parts.join("; ");
    }
    return {
      label: st === ADDED ? "Added" : st === CHANGED ? "Changed" : "Unchanged",
      repeated: !!res.repeatedNewer?.[i],
      cells,
      changed,
      whatChanged,
    };
  }

  /** The texts of report row k as written (Change, every column, What changed). */
  texts(k: number): string[] {
    const r = this.row(k);
    return [r.label + (r.repeated ? " (repeated key)" : ""), ...r.cells, r.whatChanged];
  }
}

/** The report as a table of texts (header first), for the CSV writer and its check. */
export class ReportGrid implements CellGrid {
  readonly rowCount: number;
  private readonly report: CompareReport;
  private cacheRow = -1;
  private cache: string[] = [];
  constructor(report: CompareReport) {
    this.report = report;
    this.rowCount = report.rows.length + 1;
  }
  get approxBytes(): number {
    return 64;
  }
  private texts(r: number): string[] {
    if (r !== this.cacheRow) {
      this.cache = r === 0 ? this.report.header : this.report.texts(r - 1);
      this.cacheRow = r;
    }
    return this.cache;
  }
  rowLength(r: number): number {
    return r >= 0 && r < this.rowCount ? this.report.width : 0;
  }
  get(r: number, c: number): CellValue {
    const v = this.texts(r)[c] ?? "";
    return v === "" ? null : v;
  }
  row(r: number): CellValue[] {
    return this.texts(r).map((v) => (v === "" ? null : v));
  }
}
