/**
 * Stage 4: a read-only view of a sheet with the user's changes applied.
 *
 * The original grid is never modified or copied. Edits live in a small layer
 * keyed by ORIGINAL cell positions, and deleted rows/columns are hidden through
 * index maps. Every other part of DataFixer (preview, search, sort, scan,
 * export) reads through this view, so it always sees the edited data.
 */
import type { CellGrid } from "../grid.ts";
import { cellKey, type CellValue } from "../types.ts";

/** Live edit state owned by EditSession (shared by successive views). */
export interface EditLayer {
  /** Original cellKey → new value (null = cleared). */
  readonly edits: Map<number, CellValue>;
  /** Number of edits per original row (fast "does this row have edits?"). */
  readonly editedRows: Uint16Array;
  /** Original rows whose edits reach beyond the original row length: row → new length. */
  readonly extent: Map<number, number>;
}

function text(v: CellValue): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

export class EditedGrid implements CellGrid {
  private readonly base: CellGrid;
  private readonly layer: EditLayer;
  /** View row → original row (null: no rows deleted). */
  private readonly rowMap: Uint32Array | null;
  /** View column → original column (null: no columns deleted). */
  private readonly colMap: Uint32Array | null;
  /** keptBefore[n] = number of kept columns among original columns 0…n-1. */
  private readonly keptBefore: Uint32Array | null;
  readonly approxBytes: number;

  constructor(base: CellGrid, layer: EditLayer, rowMap: Uint32Array | null, colMap: Uint32Array | null, keptBefore: Uint32Array | null, approxBytes: number) {
    this.base = base;
    this.layer = layer;
    this.rowMap = rowMap;
    this.colMap = colMap;
    this.keptBefore = keptBefore;
    this.approxBytes = approxBytes;
  }

  get rowCount(): number {
    return this.rowMap ? this.rowMap.length : this.base.rowCount;
  }

  /** Original row of view row r (r must be valid). */
  baseRow(r: number): number {
    return this.rowMap ? this.rowMap[r]! : r;
  }

  /** Original column of view column c, or -1 if there is none. */
  baseCol(c: number): number {
    if (!this.colMap) return c;
    return c < this.colMap.length ? this.colMap[c]! : -1;
  }

  rowLength(r: number): number {
    if (r < 0 || r >= this.rowCount) return 0;
    const br = this.baseRow(r);
    let len = this.base.rowLength(br);
    if (this.layer.editedRows[br]) {
      const ext = this.layer.extent.get(br);
      if (ext !== undefined && ext > len) len = ext;
    }
    if (!this.keptBefore) return len;
    return this.keptBefore[Math.min(len, this.keptBefore.length - 1)]!;
  }

  get(r: number, c: number): CellValue {
    if (r < 0 || r >= this.rowCount || c < 0) return null;
    const bc = this.baseCol(c);
    if (bc < 0) return null;
    const br = this.baseRow(r);
    if (this.layer.editedRows[br]) {
      const v = this.layer.edits.get(cellKey(br, bc));
      if (v !== undefined) return v;
    }
    return this.base.get(br, bc);
  }

  /** True when the cell at view position (r, c) has been changed. */
  isEdited(r: number, c: number): boolean {
    if (r < 0 || r >= this.rowCount || c < 0) return false;
    const bc = this.baseCol(c);
    if (bc < 0) return false;
    const br = this.baseRow(r);
    return this.layer.editedRows[br] ? this.layer.edits.has(cellKey(br, bc)) : false;
  }

  row(r: number): CellValue[] {
    const n = this.rowLength(r);
    const out = new Array<CellValue>(n);
    for (let c = 0; c < n; c++) out[c] = this.get(r, c);
    return out;
  }

  display(r: number, c: number): string {
    if (r < 0 || r >= this.rowCount || c < 0) return "";
    const bc = this.baseCol(c);
    if (bc < 0) return "";
    const br = this.baseRow(r);
    if (this.layer.editedRows[br]) {
      const v = this.layer.edits.get(cellKey(br, bc));
      if (v !== undefined) return text(v);
    }
    return this.base.display ? this.base.display(br, bc) : text(this.base.get(br, bc));
  }

  isDate(r: number, c: number): boolean {
    if (!this.base.isDate || this.isEdited(r, c)) return false;
    const bc = this.baseCol(c);
    if (bc < 0 || r < 0 || r >= this.rowCount) return false;
    return this.base.isDate(this.baseRow(r), bc);
  }
}
