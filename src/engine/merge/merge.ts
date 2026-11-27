/**
 * Stage 15: merging several tables (one per file) into one.
 *
 * - Columns are matched by name, ignoring capital letters and spaces around the
 *   name (decision 1A); the first spelling seen is kept. Columns found in only
 *   some files are added at the end and left empty for the other files.
 * - A file without column names is matched by position.
 * - Optionally a “Source file” column (first) says which file each row came from (2A).
 * - Optionally rows that appear more than once are removed (exact whole-row
 *   copies, ignoring the Source file column; the first copy is kept) (4A).
 *
 * Inputs are added one at a time (`add`), so only the merged table is held.
 */
import type { CellValue } from "../types.ts";

export const SOURCE_COLUMN = "Source file";

export interface MergeOptions {
  sourceColumn: boolean;
  removeDuplicates: boolean;
}

export interface MergeColumnInfo {
  name: string;
  /** In how many of the files this column appears. */
  files: number;
}

export interface MergeResult {
  rows: CellValue[][];
  /** The merged table has a header row (at least one file had column names). */
  headerRow: boolean;
  columns: MergeColumnInfo[];
  duplicatesRemoved: number;
  bytes: number;
}

const norm = (name: string) => name.trim().toLowerCase();

/** 32-bit FNV-1a over a row's cells (for finding duplicate rows). */
function rowHash(row: CellValue[], from: number): number {
  let h = 0x811c9dc5;
  for (let c = from; c < row.length; c++) {
    const v = row[c];
    const s = v === null || v === undefined ? "" : String(v);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export class TableMerger {
  bytes = 0;
  duplicatesRemoved = 0;
  private readonly o: MergeOptions;
  private readonly names: string[] = [];
  private readonly index = new Map<string, number>();
  private readonly fileCount: number[] = [];
  private readonly rows: CellValue[][] = [];
  private anyHeader = false;
  /** Duplicate check: hash → row indexes in `rows`. */
  private readonly seen = new Map<number, number[]>();

  constructor(options: MergeOptions) {
    this.o = options;
  }

  private column(name: string): number {
    const key = norm(name);
    let c = this.index.get(key);
    if (c === undefined) {
      c = this.names.length;
      this.index.set(key, c);
      this.names.push(name.trim());
      this.fileCount.push(0);
    }
    return c;
  }

  /**
   * Adds one file's table. `header`: its first row holds column names. Empty
   * names are matched by position (“Column 3”).
   */
  add(fileName: string, table: CellValue[][], header: boolean): void {
    const width = table.reduce((m, r) => Math.max(m, r.length), 0);
    const map: number[] = [];
    if (header && table.length) {
      this.anyHeader = true;
      const used = new Set<number>();
      for (let c = 0; c < width; c++) {
        const raw = table[0]![c];
        const name = raw === null || raw === undefined ? "" : String(raw);
        let col = name.trim() === "" ? this.positional(c) : this.column(name);
        // The same name twice in one file: the second gets its own column.
        if (used.has(col)) col = this.column(`${name.trim()} (${c + 1})`);
        used.add(col);
        map.push(col);
      }
    } else for (let c = 0; c < width; c++) map.push(this.positional(c));
    for (const col of new Set(map)) this.fileCount[col]!++;

    const start = header ? 1 : 0;
    const offset = this.o.sourceColumn ? 1 : 0;
    for (let r = start; r < table.length; r++) {
      const src = table[r]!;
      if (src.every((v) => v === null || v === "")) continue; // empty lines between files
      const row: CellValue[] = [];
      if (offset) row[0] = fileName;
      for (let c = 0; c < src.length; c++) {
        const v = src[c] ?? null;
        row[map[c]! + offset] = v === "" ? null : v;
        this.bytes += 16 + (typeof v === "string" ? v.length * 2 : 0);
      }
      if (this.o.removeDuplicates && this.isDuplicate(row, offset)) {
        this.duplicatesRemoved++;
        continue;
      }
      this.bytes += 32 + row.length * 8;
      this.rows.push(row);
    }
  }

  /** Column for position c when there is no name: the existing column at that position, or a new “Column N”. */
  private positional(c: number): number {
    return c < this.names.length ? c : this.column(`Column ${c + 1}`);
  }

  private isDuplicate(row: CellValue[], from: number): boolean {
    const h = rowHash(row, from);
    const list = this.seen.get(h);
    const width = Math.max(row.length, ...(list ?? []).map((i) => this.rows[i]!.length));
    if (list) {
      for (const i of list) {
        const other = this.rows[i]!;
        let same = true;
        for (let c = from; c < width && same; c++) same = (row[c] ?? null) === (other[c] ?? null);
        if (same) return true;
      }
      list.push(this.rows.length);
    } else this.seen.set(h, [this.rows.length]);
    return false;
  }

  finish(): MergeResult {
    const offset = this.o.sourceColumn ? 1 : 0;
    const width = this.names.length + offset;
    for (const row of this.rows) for (let c = 0; c < width; c++) if (row[c] === undefined) row[c] = null;
    const header = [...(offset ? [SOURCE_COLUMN] : []), ...this.names];
    const columns = this.names.map((name, i) => ({ name, files: this.fileCount[i]! }));
    return {
      rows: this.anyHeader ? [header, ...this.rows] : this.rows,
      headerRow: this.anyHeader,
      columns,
      duplicatesRemoved: this.duplicatesRemoved,
      bytes: this.bytes,
    };
  }
}
