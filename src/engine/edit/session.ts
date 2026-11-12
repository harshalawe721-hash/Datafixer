/**
 * Stage 4: edit session for one sheet: the change layer, the edited view, and
 * the change history with Undo and Redo.
 *
 * - The original SheetModel is never modified. All changes are stored by
 *   ORIGINAL cell position, so undo/redo and deletions never shift them.
 * - Callers describe changes in VIEW positions (what the user sees now); the
 *   session converts them when the change is applied.
 * - Each history entry stores only its own changes: new values plus the value
 *   each cell had just before (for undo). Original values are read from the
 *   unchanged original data, so they are not stored twice.
 */
import { EngineError } from "../errors.ts";
import { cellKey, splitCellKey, type CellRange, type CellValue, type ParseIssue, type SheetModel } from "../types.ts";
import { columnLetter } from "../query/query.ts";
import { EditedGrid, type EditLayer } from "./edited-grid.ts";

/** A change requested by a fix or a manual edit, in VIEW positions. */
export interface ChangeRequest {
  /** Stable operation id, e.g. "edit-cell", "remove-extra-spaces". */
  operation: string;
  /** Label shown in the history, e.g. "Remove extra spaces". */
  label: string;
  /** `format`: Excel number format for the new value (e.g. a date format for a converted date). */
  cells?: { row: number; col: number; value: CellValue; format?: string }[];
  /** Compact form for large changes: view cell keys (cellKey(row, col)) and their new values. */
  cellKeys?: Float64Array;
  cellValues?: CellValue[];
  /** Optional number formats aligned with cellKeys (null = none). */
  cellFormats?: (string | null)[];
  deleteRows?: { row: number; reason: string }[];
  deleteColumns?: { col: number; reason: string }[];
}

export type HistoryStatus = "applied" | "undone";

export interface HistorySummary {
  id: number;
  operation: string;
  label: string;
  status: HistoryStatus;
  /** False for undone changes that can no longer be redone (a newer change replaced them). */
  redoable: boolean;
  cells: number;
  rowsRemoved: number;
  columnsRemoved: number;
  createdAt: number;
}

export type HistoryItem =
  | { kind: "cell"; cell: string; row: number; column: string; original: string; newValue: string }
  | { kind: "row"; row: number; reason: string }
  | { kind: "column"; column: string; reason: string };

export interface EditStats {
  /** Cells whose current value differs from the original file. */
  cellsEdited: number;
  rowsRemoved: number;
  columnsRemoved: number;
  /** Applied history entries. */
  changesApplied: number;
  canUndo: boolean;
  canRedo: boolean;
  /** Increases with every change, undo and redo (cache key). */
  version: number;
}

interface Entry {
  id: number;
  operation: string;
  label: string;
  createdAt: number;
  status: HistoryStatus;
  redoable: boolean;
  /** Original cell keys, new values, and the values just before (undefined = no earlier edit). */
  keys: Float64Array;
  values: CellValue[];
  prev: (CellValue | undefined)[];
  /** Number formats given with the new values, and the formats just before (sparse; usually empty). */
  formats: (string | undefined)[] | null;
  prevFormats: (string | undefined)[] | null;
  /** Original rows/columns deleted, with an index into `reasons`. */
  rows: Uint32Array;
  rowReason: Uint16Array;
  cols: Uint32Array;
  colReason: Uint16Array;
  reasons: string[];
  bytes: number;
}

export interface EditSessionOptions {
  /** Memory budget (bytes) for the whole sheet, as used elsewhere in the engine. */
  memoryBudgetBytes?: number;
}

/** Rough cost of one edited cell: map entry, history arrays, value. */
function cellBytes(v: CellValue | undefined): number {
  return 120 + (typeof v === "string" ? v.length * 2 : 0);
}

function shown(v: CellValue | undefined): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

export class EditSession {
  readonly base: SheetModel;
  private readonly budget: number | undefined;
  private readonly layer: EditLayer;
  private readonly rowDeleted: Uint8Array;
  private readonly colDeleted: Uint8Array;
  private rowsRemoved = 0;
  private colsRemoved = 0;
  /** Applied entries [0, cursor) plus redoable undone entries [cursor, …). */
  private chain: Entry[] = [];
  private cursor = 0;
  /** Undone entries replaced by a newer change (shown in the history, not redoable). */
  private discarded: Entry[] = [];
  private nextId = 1;
  private bytes = 0;
  private versionNo = 0;
  private cachedView: { version: number; sheet: SheetModel; grid: EditedGrid; baseToViewRow: Int32Array | null; baseToViewCol: Int32Array | null } | null = null;

  constructor(base: SheetModel, options: EditSessionOptions = {}) {
    this.base = base;
    this.budget = options.memoryBudgetBytes;
    this.layer = { edits: new Map(), editedRows: new Uint16Array(base.grid.rowCount), extent: new Map(), formats: new Map() };
    this.rowDeleted = new Uint8Array(base.grid.rowCount);
    this.colDeleted = new Uint8Array(base.columnCount);
  }

  get version(): number {
    return this.versionNo;
  }

  get hasChanges(): boolean {
    return this.cursor > 0;
  }

  stats(): EditStats {
    return {
      cellsEdited: this.layer.edits.size,
      rowsRemoved: this.rowsRemoved,
      columnsRemoved: this.colsRemoved,
      changesApplied: this.cursor,
      canUndo: this.cursor > 0,
      canRedo: this.cursor < this.chain.length,
      version: this.versionNo,
    };
  }

  // ------------------------------------------------------------------ view

  /** The sheet as it looks with all applied changes (cached until the next change). */
  view(): SheetModel {
    return this.viewState().sheet;
  }

  /** Edited view's grid (for isEdited / position mapping). */
  grid(): EditedGrid {
    return this.viewState().grid;
  }

  /** Original position of a cell shown at view position (row, col). */
  toBase(row: number, col: number): { row: number; col: number } {
    const g = this.grid();
    if (row < 0 || row >= g.rowCount) throw new EngineError("invalid-edit", `Row ${row + 1} doesn't exist.`);
    const bc = g.baseCol(col);
    if (bc < 0 || col >= this.view().columnCount) throw new EngineError("invalid-edit", `Column ${columnLetter(col)} doesn't exist.`);
    return { row: g.baseRow(row), col: bc };
  }

  private viewState() {
    if (this.cachedView?.version === this.versionNo) return this.cachedView;
    const base = this.base;
    const baseRows = base.grid.rowCount;
    const baseCols = base.columnCount;

    let rowMap: Uint32Array | null = null;
    let baseToViewRow: Int32Array | null = null;
    if (this.rowsRemoved > 0) {
      rowMap = new Uint32Array(baseRows - this.rowsRemoved);
      baseToViewRow = new Int32Array(baseRows);
      for (let r = 0, v = 0; r < baseRows; r++) {
        if (this.rowDeleted[r]) baseToViewRow[r] = -1;
        else {
          baseToViewRow[r] = v;
          rowMap[v++] = r;
        }
      }
    }
    let colMap: Uint32Array | null = null;
    let keptBefore: Uint32Array | null = null;
    let baseToViewCol: Int32Array | null = null;
    if (this.colsRemoved > 0) {
      // Rows may be longer than columnCount in theory; cover up to the widest edit/row.
      const width = Math.max(baseCols, 1);
      colMap = new Uint32Array(baseCols - this.colsRemoved);
      keptBefore = new Uint32Array(width + 1);
      baseToViewCol = new Int32Array(width);
      for (let c = 0, v = 0; c < width; c++) {
        keptBefore[c] = v;
        if (c < baseCols && this.colDeleted[c]) baseToViewCol[c] = -1;
        else {
          baseToViewCol[c] = v;
          if (v < colMap.length) colMap[v] = c;
          v++;
        }
      }
      keptBefore[width] = baseCols - this.colsRemoved;
    }

    const grid = new EditedGrid(base.grid, this.layer, rowMap, colMap, keptBefore, base.grid.approxBytes + this.bytes);
    const mapKey = (key: number): number => {
      if (!baseToViewRow && !baseToViewCol) return key;
      const { row, col } = splitCellKey(key);
      const vr = baseToViewRow ? baseToViewRow[row]! : row;
      const vc = baseToViewCol ? (col < baseToViewCol.length ? baseToViewCol[col]! : -1) : col;
      return vr < 0 || vc < 0 ? -1 : cellKey(vr, vc);
    };
    const edits = this.layer.edits;
    // A cell with a new value no longer holds its formula or error value.
    const remap = <T>(m: Map<number, T>, dropEdited: boolean): Map<number, T> => {
      if (m.size === 0) return m;
      let touched = !!(baseToViewRow || baseToViewCol);
      if (!touched && dropEdited) for (const k of edits.keys()) if (m.has(k)) { touched = true; break; }
      if (!touched) return m;
      const out = new Map<number, T>();
      for (const [k, v] of m) {
        if (dropEdited && edits.has(k)) continue;
        const nk = mapKey(k);
        if (nk >= 0) out.set(nk, v);
      }
      return out;
    };
    const remapRow = (r: number) => (baseToViewRow ? baseToViewRow[r]! : r);
    const remapCol = (c: number) => (baseToViewCol ? (c < baseToViewCol.length ? baseToViewCol[c]! : -1) : c);
    const remapSet = (s: Set<number>, f: (n: number) => number) => {
      if (s.size === 0) return s;
      const out = new Set<number>();
      for (const n of s) {
        const m = f(n);
        if (m >= 0) out.add(m);
      }
      return out;
    };
    const remapIndexMap = <T>(m: Map<number, T>, f: (n: number) => number) => {
      if (m.size === 0) return m;
      const out = new Map<number, T>();
      for (const [n, v] of m) {
        const k = f(n);
        if (k >= 0) out.set(k, v);
      }
      return out;
    };
    const merges: CellRange[] = [];
    for (const m of base.merges) {
      // Shrink a merge to the rows/columns that remain; drop it if nothing remains.
      let sr = m.startRow, er = m.endRow, sc = m.startCol, ec = m.endCol;
      while (sr <= er && remapRow(sr) < 0) sr++;
      while (er >= sr && remapRow(er) < 0) er--;
      while (sc <= ec && remapCol(sc) < 0) sc++;
      while (ec >= sc && remapCol(ec) < 0) ec--;
      if (sr > er || sc > ec) continue;
      merges.push({ startRow: remapRow(sr), endRow: remapRow(er), startCol: remapCol(sc), endCol: remapCol(ec) });
    }
    const issues: ParseIssue[] = base.issues.map((i) => (i.row === null || !baseToViewRow ? i : { ...i, row: baseToViewRow[i.row]! >= 0 ? baseToViewRow[i.row]! : null }));

    const sheet: SheetModel = {
      ...base,
      grid,
      columnCount: baseCols - this.colsRemoved,
      formulas: remap(base.formulas, true),
      errors: remap(base.errors, true),
      numberFormats: this.withFormatOverrides(remap(base.numberFormats, false), mapKey),
      hyperlinks: remap(base.hyperlinks, false),
      merges,
      hiddenRows: baseToViewRow ? remapSet(base.hiddenRows, remapRow) : base.hiddenRows,
      hiddenColumns: baseToViewCol ? remapSet(base.hiddenColumns, remapCol) : base.hiddenColumns,
      columnWidths: baseToViewCol ? remapIndexMap(base.columnWidths, remapCol) : base.columnWidths,
      rowHeights: baseToViewRow ? remapIndexMap(base.rowHeights, remapRow) : base.rowHeights,
      issues,
    };
    this.cachedView = { version: this.versionNo, sheet, grid, baseToViewRow, baseToViewCol };
    return this.cachedView;
  }

  /** Number formats of the view, including formats given to edited cells. */
  private withFormatOverrides(m: Map<number, string>, mapKey: (key: number) => number): Map<number, string> {
    if (this.layer.formats.size === 0) return m;
    const out = new Map(m);
    for (const [key, fmt] of this.layer.formats) {
      const nk = mapKey(key);
      if (nk >= 0) out.set(nk, fmt);
    }
    return out;
  }

  // ------------------------------------------------------------------ changes

  /**
   * Apply a change. Cells whose value would not change are skipped. Returns the
   * new history entry, or null when nothing would change (no entry is added).
   */
  apply(req: ChangeRequest): HistorySummary | null {
    const view = this.view();
    const g = this.grid();

    // Cells (last value wins if a cell is listed twice).
    const byKey = new Map<number, { value: CellValue; format: string | undefined }>();
    const add = (vr: number, vc: number, value: CellValue, format: string | undefined) => {
      if (!Number.isInteger(vr) || !Number.isInteger(vc) || vc < 0 || vc >= view.columnCount) {
        throw new EngineError("invalid-edit", `Cell ${columnLetter(Math.max(0, vc))}${vr + 1} doesn't exist.`);
      }
      const { row, col } = this.toBase(vr, vc);
      byKey.set(cellKey(row, col), { value, format });
    };
    for (const cell of req.cells ?? []) add(cell.row, cell.col, cell.value, cell.format);
    if (req.cellKeys) {
      if (!req.cellValues || req.cellValues.length !== req.cellKeys.length) throw new EngineError("internal", "Change has mismatched cells and values.");
      for (let i = 0; i < req.cellKeys.length; i++) {
        const { row, col } = splitCellKey(req.cellKeys[i]!);
        add(row, col, req.cellValues[i]!, req.cellFormats?.[i] ?? undefined);
      }
    }
    const keys: number[] = [];
    const values: CellValue[] = [];
    const prev: (CellValue | undefined)[] = [];
    let formats: (string | undefined)[] | null = null;
    let prevFormats: (string | undefined)[] | null = null;
    let addBytes = 0;
    for (const [key, { value, format }] of byKey) {
      const { row, col } = splitCellKey(key);
      const edited = this.layer.edits.has(key);
      const current = edited ? this.layer.edits.get(key)! : this.base.grid.get(row, col);
      const currentFormat = this.layer.formats.get(key);
      if (current === value && currentFormat === format) continue;
      if ((format !== undefined || currentFormat !== undefined) && !formats) {
        formats = new Array(keys.length).fill(undefined);
        prevFormats = new Array(keys.length).fill(undefined);
      }
      keys.push(key);
      values.push(value);
      prev.push(edited ? this.layer.edits.get(key) : undefined);
      if (formats) {
        formats.push(format);
        prevFormats!.push(currentFormat);
      }
      addBytes += cellBytes(value) + (typeof current === "string" ? current.length * 2 : 0);
    }

    // Rows and columns (deduplicated; each must currently be visible).
    const reasons: string[] = [];
    const reasonIndex = new Map<string, number>();
    const reasonOf = (s: string) => {
      let i = reasonIndex.get(s);
      if (i === undefined) {
        i = reasons.length;
        reasons.push(s);
        reasonIndex.set(s, i);
      }
      return i;
    };
    const rowSet = new Map<number, number>();
    for (const d of req.deleteRows ?? []) {
      if (!Number.isInteger(d.row) || d.row < 0 || d.row >= g.rowCount) throw new EngineError("invalid-edit", `Row ${d.row + 1} doesn't exist.`);
      rowSet.set(g.baseRow(d.row), reasonOf(d.reason));
    }
    const colSet = new Map<number, number>();
    for (const d of req.deleteColumns ?? []) {
      if (!Number.isInteger(d.col) || d.col < 0 || d.col >= view.columnCount) throw new EngineError("invalid-edit", `Column ${columnLetter(Math.max(0, d.col))} doesn't exist.`);
      colSet.set(g.baseCol(d.col), reasonOf(d.reason));
    }
    if (keys.length === 0 && rowSet.size === 0 && colSet.size === 0) return null;
    addBytes += 200 + rowSet.size * 6 + colSet.size * 6;
    this.ensureBudget(addBytes, keys.length + rowSet.size + colSet.size);

    const rows = Uint32Array.from([...rowSet.keys()].sort((a, b) => a - b));
    const cols = Uint32Array.from([...colSet.keys()].sort((a, b) => a - b));
    const entry: Entry = {
      id: this.nextId++,
      operation: req.operation,
      label: req.label,
      createdAt: Date.now(),
      status: "applied",
      redoable: true,
      keys: Float64Array.from(keys),
      values,
      prev,
      formats,
      prevFormats,
      rows,
      rowReason: Uint16Array.from(rows, (r) => rowSet.get(r)!),
      cols,
      colReason: Uint16Array.from(cols, (c) => colSet.get(c)!),
      reasons,
      bytes: addBytes,
    };

    // A new change ends the redo chain; those entries stay visible as "undone".
    for (const e of this.chain.splice(this.cursor)) {
      e.redoable = false;
      this.discarded.push(e);
    }
    this.forward(entry);
    this.chain.push(entry);
    this.cursor = this.chain.length;
    this.bytes += addBytes;
    this.versionNo++;
    return this.summaryOf(entry);
  }

  undo(): HistorySummary | null {
    if (this.cursor === 0) return null;
    const e = this.chain[--this.cursor]!;
    this.backward(e);
    e.status = "undone";
    this.versionNo++;
    return this.summaryOf(e);
  }

  redo(): HistorySummary | null {
    if (this.cursor >= this.chain.length) return null;
    const e = this.chain[this.cursor++]!;
    this.forward(e);
    e.status = "applied";
    this.versionNo++;
    return this.summaryOf(e);
  }

  /** Take back the last `count` applied changes completely (they leave no history), e.g. when a multi-step fix fails halfway. */
  rollback(count: number): void {
    for (let i = 0; i < count && this.cursor > 0; i++) {
      const e = this.chain[--this.cursor]!;
      this.backward(e);
      this.chain.splice(this.cursor, 1);
      this.bytes -= e.bytes;
      this.versionNo++;
    }
  }

  private ensureBudget(extra: number, items: number): void {
    if (!this.budget) return;
    if (this.base.grid.approxBytes + this.bytes + extra > this.budget) {
      throw new EngineError(
        "out-of-memory",
        `This change (${items.toLocaleString("en-US")} cells or rows) needs more memory than this device allows. Nothing was changed and your earlier changes are kept. Try fixing one column at a time, or use a device with more memory.`,
        `edit layer ${this.bytes} + ${extra} bytes`,
      );
    }
  }

  private setCell(key: number, value: CellValue | undefined, format?: string): void {
    const edits = this.layer.edits;
    const { row, col } = splitCellKey(key);
    if (format === undefined || value === undefined) this.layer.formats.delete(key);
    else this.layer.formats.set(key, format);
    // Back to the original value (and no new format): drop the edit, so "cells edited" stays exact.
    const remove = value === undefined || (value === this.base.grid.get(row, col) && format === undefined);
    const had = edits.has(key);
    if (remove) {
      if (!had) return;
      edits.delete(key);
      this.layer.editedRows[row]!--;
      if (this.layer.extent.has(row)) this.recomputeExtent(row);
      return;
    }
    edits.set(key, value);
    if (!had) this.layer.editedRows[row]!++;
    if (col >= this.base.grid.rowLength(row)) this.layer.extent.set(row, Math.max(this.layer.extent.get(row) ?? 0, col + 1));
  }

  private recomputeExtent(row: number): void {
    const len = this.base.grid.rowLength(row);
    for (let c = Math.max(this.base.columnCount, this.layer.extent.get(row) ?? 0) - 1; c >= len; c--) {
      if (this.layer.edits.has(cellKey(row, c))) {
        this.layer.extent.set(row, c + 1);
        return;
      }
    }
    this.layer.extent.delete(row);
  }

  private forward(e: Entry): void {
    for (let i = 0; i < e.keys.length; i++) this.setCell(e.keys[i]!, e.values[i]!, e.formats?.[i]);
    for (const r of e.rows) {
      this.rowDeleted[r] = 1;
      this.rowsRemoved++;
    }
    for (const c of e.cols) {
      this.colDeleted[c] = 1;
      this.colsRemoved++;
    }
  }

  private backward(e: Entry): void {
    for (const c of e.cols) {
      this.colDeleted[c] = 0;
      this.colsRemoved--;
    }
    for (const r of e.rows) {
      this.rowDeleted[r] = 0;
      this.rowsRemoved--;
    }
    for (let i = e.keys.length - 1; i >= 0; i--) this.setCell(e.keys[i]!, e.prev[i], e.prevFormats?.[i]);
  }

  // ------------------------------------------------------------------ history

  private summaryOf(e: Entry): HistorySummary {
    return {
      id: e.id,
      operation: e.operation,
      label: e.label,
      status: e.status,
      redoable: e.redoable,
      cells: e.keys.length,
      rowsRemoved: e.rows.length,
      columnsRemoved: e.cols.length,
      createdAt: e.createdAt,
    };
  }

  /** All history entries, newest first. */
  history(): HistorySummary[] {
    return [...this.discarded, ...this.chain].sort((a, b) => b.id - a.id).map((e) => this.summaryOf(e));
  }

  /**
   * One page of an entry's details: every changed cell (original position,
   * value before this change, new value), then removed rows and columns with
   * the reason. Positions refer to the original file.
   */
  historyDetails(id: number, offset = 0, limit = 100): { total: number; items: HistoryItem[] } {
    const e = this.chain.find((x) => x.id === id) ?? this.discarded.find((x) => x.id === id);
    if (!e) throw new EngineError("invalid-edit", "That change is no longer in the history.");
    const total = e.keys.length + e.rows.length + e.cols.length;
    const items: HistoryItem[] = [];
    const end = Math.min(total, offset + Math.max(0, Math.min(limit, 1000)));
    for (let i = Math.max(0, offset); i < end; i++) {
      if (i < e.keys.length) {
        const { row, col } = splitCellKey(e.keys[i]!);
        const before = e.prev[i];
        const original = before !== undefined ? shown(before) : this.base.grid.display ? this.base.grid.display(row, col) : shown(this.base.grid.get(row, col));
        items.push({ kind: "cell", cell: `${columnLetter(col)}${row + 1}`, row: row + 1, column: columnLetter(col), original, newValue: shown(e.values[i]) });
      } else if (i < e.keys.length + e.rows.length) {
        const k = i - e.keys.length;
        items.push({ kind: "row", row: e.rows[k]! + 1, reason: e.reasons[e.rowReason[k]!]! });
      } else {
        const k = i - e.keys.length - e.rows.length;
        items.push({ kind: "column", column: columnLetter(e.cols[k]!), reason: e.reasons[e.colReason[k]!]! });
      }
    }
    return { total, items };
  }
}
