/**
 * Cell storage.
 *
 * Measured in V8: storing every CSV cell as its own string inside per-row
 * arrays costs 5–8× the file size (60–69 bytes per cell), so a 150 MB CSV
 * needs ~1 GB of heap. Running out of heap in a worker crashes the whole tab
 * in Chromium, so storage must be compact.
 *
 * CompactTextGrid packs each parsed chunk into ONE string (all cells joined)
 * plus a Uint32Array of cell end offsets and a Uint32Array of row starts:
 * ~1 byte per character (2 for non-Latin-1 text) + 4 bytes per cell. Cells are
 * materialised only when read (preview page, scans).
 */
import type { CellValue } from "./types.ts";

export interface CellGrid {
  readonly rowCount: number;
  /** Number of cells in row r (rows can be ragged). */
  rowLength(r: number): number;
  /** Value at (r, c); null for missing/empty-trailing cells. */
  get(r: number, c: number): CellValue;
  /** Materialise one row (for small reads only). */
  row(r: number): CellValue[];
  /**
   * Text as a spreadsheet app would show it (e.g. a date serial formatted as
   * "2024-01-31"). Grids without number formats omit this; callers then fall
   * back to the raw value.
   */
  display?(r: number, c: number): string;
  /** Approximate bytes used, for memory budgeting. */
  readonly approxBytes: number;
}

/** Simple array-backed grid (small data, XLSX reader, tests). */
export class ArrayGrid implements CellGrid {
  private readonly rows: CellValue[][];
  constructor(rows: CellValue[][]) {
    this.rows = rows;
  }
  get rowCount() {
    return this.rows.length;
  }
  rowLength(r: number) {
    return this.rows[r]?.length ?? 0;
  }
  get(r: number, c: number): CellValue {
    return this.rows[r]?.[c] ?? null;
  }
  row(r: number): CellValue[] {
    return this.rows[r] ? [...this.rows[r]!] : [];
  }
  get approxBytes() {
    let n = 0;
    for (const row of this.rows) n += 56 + row.length * 40;
    return n;
  }
}

interface Chunk {
  firstRow: number;
  text: string;
  /** cellEnds[i] = end offset (exclusive) of cell i within text. */
  cellEnds: Uint32Array;
  /** rowStarts[k] = index of first cell of local row k; length rows+1. */
  rowStarts: Uint32Array;
  bytes: number;
}

/** Append-only compact grid of text cells. */
export class CompactTextGrid implements CellGrid {
  private chunks: Chunk[] = [];
  private chunkFirstRows: number[] = [];
  private rows = 0;
  private bytes = 0;

  get rowCount() {
    return this.rows;
  }

  get approxBytes() {
    return this.bytes;
  }

  /** Add parsed rows (string cells). The input arrays can be discarded afterwards. */
  appendRows(rows: string[][]): void {
    if (rows.length === 0) return;
    let cells = 0;
    for (const r of rows) cells += r.length;
    const cellEnds = new Uint32Array(cells);
    const rowStarts = new Uint32Array(rows.length + 1);
    const parts = new Array<string>(cells);
    let ci = 0;
    let offset = 0;
    let twoByte = false;
    for (let k = 0; k < rows.length; k++) {
      rowStarts[k] = ci;
      const r = rows[k]!;
      for (let j = 0; j < r.length; j++) {
        const v = r[j]!;
        parts[ci] = v;
        offset += v.length;
        cellEnds[ci] = offset;
        ci++;
        if (!twoByte) {
          for (let x = 0; x < v.length; x++) {
            if (v.charCodeAt(x) > 0xff) {
              twoByte = true;
              break;
            }
          }
        }
      }
    }
    rowStarts[rows.length] = ci;
    // join() produces one flat string; the individual cell strings become garbage.
    const text = parts.join("");
    const bytes = text.length * (twoByte ? 2 : 1) + cellEnds.byteLength + rowStarts.byteLength + 96;
    this.chunks.push({ firstRow: this.rows, text, cellEnds, rowStarts, bytes });
    this.chunkFirstRows.push(this.rows);
    this.rows += rows.length;
    this.bytes += bytes;
  }

  /** Remove the last row (used to drop the empty row after a final line break). */
  dropLastRow(): void {
    const last = this.chunks[this.chunks.length - 1];
    if (!last) return;
    const localRows = last.rowStarts.length - 1;
    if (localRows <= 1) {
      this.chunks.pop();
      this.chunkFirstRows.pop();
      this.bytes -= last.bytes;
    } else {
      last.rowStarts = last.rowStarts.subarray(0, localRows);
    }
    this.rows--;
  }

  private locate(r: number): { chunk: Chunk; local: number } | null {
    if (r < 0 || r >= this.rows) return null;
    // Binary search for the chunk containing row r.
    let lo = 0;
    let hi = this.chunkFirstRows.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.chunkFirstRows[mid]! <= r) lo = mid;
      else hi = mid - 1;
    }
    const chunk = this.chunks[lo]!;
    return { chunk, local: r - chunk.firstRow };
  }

  rowLength(r: number): number {
    const loc = this.locate(r);
    if (!loc) return 0;
    return loc.chunk.rowStarts[loc.local + 1]! - loc.chunk.rowStarts[loc.local]!;
  }

  get(r: number, c: number): CellValue {
    const loc = this.locate(r);
    if (!loc) return null;
    const { chunk, local } = loc;
    const first = chunk.rowStarts[local]!;
    const idx = first + c;
    if (c < 0 || idx >= chunk.rowStarts[local + 1]!) return null;
    const start = idx === 0 ? 0 : chunk.cellEnds[idx - 1]!;
    return chunk.text.slice(start, chunk.cellEnds[idx]!);
  }

  row(r: number): CellValue[] {
    const n = this.rowLength(r);
    const out = new Array<CellValue>(n);
    for (let c = 0; c < n; c++) out[c] = this.get(r, c);
    return out;
  }
}

/** Formats a raw cell value with an Excel number format (injected: SheetJS SSF in the worker). */
export type NumberFormatter = (format: string, value: number) => string;

/**
 * Grid for Excel sheets: raw values in row arrays (positions match Excel, so
 * row 0 is Excel row 1), plus number-format ids per row in small Uint16Arrays,
 * only for rows that have non-General formats. Formatting (dates, currency)
 * happens only when a cell is displayed, so millions of formatted strings are
 * never stored.
 */
export class WorkbookGrid implements CellGrid {
  private readonly rows: (CellValue[] | undefined)[];
  private readonly formatIds: (Uint16Array | undefined)[];
  private readonly formats: string[];
  private readonly formatter: NumberFormatter | null;
  readonly approxBytes: number;

  constructor(
    rows: (CellValue[] | undefined)[],
    formatIds: (Uint16Array | undefined)[],
    formats: string[],
    formatter: NumberFormatter | null,
    approxBytes: number,
  ) {
    this.rows = rows;
    this.formatIds = formatIds;
    this.formats = formats;
    this.formatter = formatter;
    this.approxBytes = approxBytes;
  }
  get rowCount() {
    return this.rows.length;
  }
  rowLength(r: number) {
    return this.rows[r]?.length ?? 0;
  }
  get(r: number, c: number): CellValue {
    return this.rows[r]?.[c] ?? null;
  }
  row(r: number): CellValue[] {
    const row = this.rows[r];
    return row ? Array.from(row, (v) => v ?? null) : [];
  }
  /** Number format of a cell, or null for General/none. */
  format(r: number, c: number): string | null {
    const id = this.formatIds[r]?.[c] ?? 0;
    return id === 0 ? null : (this.formats[id] ?? null);
  }
  display(r: number, c: number): string {
    const v = this.get(r, c);
    if (v === null) return "";
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (typeof v === "number") {
      const fmt = this.format(r, c);
      if (fmt && this.formatter) {
        try {
          return this.formatter(fmt, v);
        } catch {
          return String(v);
        }
      }
      return String(v);
    }
    return v;
  }
}
