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
import { CompactTextGrid, type CellGrid } from "../grid.ts";

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
  /** The merged table: the header row (when headerRow) and then every row. */
  grid: CellGrid;
  /** The merged table has a header row (at least one file had column names). */
  headerRow: boolean;
  columns: MergeColumnInfo[];
  duplicatesRemoved: number;
  /** Data rows (without the header). */
  records: number;
  bytes: number;
}

/** A file's table as the merger reads it: cell texts, read one at a time (no copy of the file). */
export interface MergeSource {
  rowCount: number;
  rowLength(r: number): number;
  text(r: number, c: number): string;
}

const norm = (name: string) => name.trim().toLowerCase();
const BATCH = 5000;

/** 32-bit FNV-1a over a row's cells from `from` (for finding duplicate rows). */
function rowHash(row: string[], from: number): number {
  let h = 0x811c9dc5;
  for (let c = from; c < row.length; c++) {
    const s = row[c] ?? "";
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The merged rows with the header row in front (the header is only known when every file is
 * in). Every row has the full width, so a CSV download has the same number of fields on every
 * line; cells a file didn't have are empty.
 */
class HeaderedGrid implements CellGrid {
  private readonly header: string[] | null;
  private readonly body: CompactTextGrid;
  private readonly width: number;
  constructor(header: string[] | null, body: CompactTextGrid, width: number) {
    this.header = header;
    this.body = body;
    this.width = width;
  }
  get rowCount() {
    return this.body.rowCount + (this.header ? 1 : 0);
  }
  get approxBytes() {
    return this.body.approxBytes + (this.header ? this.header.length * 64 : 0);
  }
  rowLength(r: number): number {
    return r >= 0 && r < this.rowCount ? this.width : 0;
  }
  get(r: number, c: number): CellValue {
    if (c < 0 || c >= this.width) return null;
    if (this.header && r === 0) return this.header[c] ?? null;
    return this.body.get(this.header ? r - 1 : r, c);
  }
  row(r: number): CellValue[] {
    const n = this.rowLength(r);
    const out = new Array<CellValue>(n);
    for (let c = 0; c < n; c++) out[c] = this.get(r, c);
    return out;
  }
}

export class TableMerger {
  duplicatesRemoved = 0;
  private readonly o: MergeOptions;
  private readonly names: string[] = [];
  private readonly index = new Map<string, number>();
  private readonly fileCount: number[] = [];
  /** Merged rows are kept compactly (like a CSV file), appended in batches. */
  private readonly body = new CompactTextGrid();
  private pending: string[][] = [];
  private pendingBytes = 0;
  private anyHeader = false;
  /** Duplicate check: hash → row numbers (in body, then pending). */
  private readonly seen = new Map<number, number[]>();

  constructor(options: MergeOptions) {
    this.o = options;
  }

  get bytes(): number {
    return this.body.approxBytes + this.pendingBytes + this.seen.size * 48;
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

  /** Column for position c when there is no name: the existing column at that position, or a new “Column N”. */
  private positional(c: number): number {
    return c < this.names.length ? c : this.column(`Column ${c + 1}`);
  }

  /** Adds one file's table. `header`: its first row holds column names (empty names are matched by position). */
  add(fileName: string, src: MergeSource, header: boolean): void {
    let width = 0;
    for (let r = 0; r < src.rowCount; r++) width = Math.max(width, src.rowLength(r));
    const map: number[] = [];
    if (header && src.rowCount) {
      this.anyHeader = true;
      const used = new Set<number>();
      for (let c = 0; c < width; c++) {
        const name = c < src.rowLength(0) ? src.text(0, c) : "";
        let col = name.trim() === "" ? this.positional(c) : this.column(name);
        // The same name twice in one file: the second gets its own column.
        if (used.has(col)) col = this.column(`${name.trim()} (${c + 1})`);
        used.add(col);
        map.push(col);
      }
    } else for (let c = 0; c < width; c++) map.push(this.positional(c));
    for (const col of new Set(map)) this.fileCount[col]!++;

    const offset = this.o.sourceColumn ? 1 : 0;
    for (let r = header ? 1 : 0; r < src.rowCount; r++) {
      const len = src.rowLength(r);
      const row: string[] = [];
      let any = false;
      for (let c = 0; c < len; c++) {
        const v = src.text(r, c);
        if (v !== "") any = true;
        row[map[c]! + offset] = v;
      }
      if (!any) continue; // empty lines between files
      if (offset) row[0] = fileName;
      for (let c = 0; c < row.length; c++) if (row[c] === undefined) row[c] = "";
      if (this.o.removeDuplicates && this.isDuplicate(row, offset)) {
        this.duplicatesRemoved++;
        continue;
      }
      this.pending.push(row);
      for (const v of row) this.pendingBytes += 16 + v.length * 2;
      if (this.pending.length >= BATCH) this.flush();
    }
  }

  private flush(): void {
    this.body.appendRows(this.pending);
    this.pending = [];
    this.pendingBytes = 0;
  }

  private rowAt(i: number): string[] {
    const n = this.body.rowCount;
    if (i >= n) return this.pending[i - n]!;
    return this.body.row(i).map((v) => (v === null ? "" : String(v)));
  }

  private isDuplicate(row: string[], from: number): boolean {
    const h = rowHash(trimEnd(row), from);
    const list = this.seen.get(h);
    const index = this.body.rowCount + this.pending.length;
    if (list) {
      for (const i of list) {
        const other = this.rowAt(i);
        const width = Math.max(row.length, other.length);
        let same = true;
        for (let c = from; c < width && same; c++) same = (row[c] ?? "") === (other[c] ?? "");
        if (same) return true;
      }
      list.push(index);
    } else this.seen.set(h, [index]);
    return false;
  }

  finish(): MergeResult {
    if (this.pending.length) this.flush();
    const header = this.anyHeader ? [...(this.o.sourceColumn ? [SOURCE_COLUMN] : []), ...this.names] : null;
    const grid = new HeaderedGrid(header, this.body, this.names.length + (this.o.sourceColumn ? 1 : 0));
    return {
      grid,
      headerRow: this.anyHeader,
      columns: this.names.map((name, i) => ({ name, files: this.fileCount[i]! })),
      duplicatesRemoved: this.duplicatesRemoved,
      records: this.body.rowCount,
      bytes: grid.approxBytes,
    };
  }
}

/** A row without empty cells at the end (rows that differ only by trailing empties are equal). */
function trimEnd(row: string[]): string[] {
  let n = row.length;
  while (n > 0 && row[n - 1] === "") n--;
  return n === row.length ? row : row.slice(0, n);
}
