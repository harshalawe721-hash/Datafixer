/**
 * Stage 11: duplicate rows with options, for the Remove Duplicates page.
 *
 * Rows are compared on all columns or on the columns the user chooses; matching
 * can ignore capital letters and extra spaces (only for the comparison: kept
 * values are never changed). Each row is fingerprinted first, then every match
 * in a fingerprint bucket is confirmed cell by cell, so different rows are never
 * treated as copies. The first (or last) row of each group is kept; the others
 * are removed or marked in a new column. Rows with formulas are never removed.
 *
 * Positions are VIEW rows (the sheet as it is now); row numbers shown to the
 * user are view row + 1, as in the downloaded file.
 */
import type { ChangeRequest } from "../edit/session.ts";
import { cellKey, type CellValue, type SheetModel } from "../types.ts";

export type KeepWhich = "first" | "last";
export type DuplicateAction = "remove" | "mark";

export interface DuplicateOptions {
  /** Columns to compare (view indexes); null = all columns. */
  columns: number[] | null;
  /** “Paris” = “PARIS”. */
  ignoreCase: boolean;
  /** Spaces at the ends ignored and runs of spaces inside counted as one. */
  ignoreSpaces: boolean;
  keep: KeepWhich;
  action: DuplicateAction;
}

export interface DuplicatePlanInput {
  sheet: SheetModel;
  headerRow: boolean;
  options: DuplicateOptions;
}

export interface DuplicateGroupExample {
  /** Row number (1-based) of the row that is kept. */
  kept: number;
  /** Row numbers of up to 5 copies. */
  copies: number[];
  /** All copies in this group. */
  copyCount: number;
  /** The kept row's compared values (up to 6), for the preview. */
  values: string[];
}

export interface DuplicatePlan {
  /** Requests to apply (empty when nothing would change). */
  requests: ChangeRequest[];
  /** Groups of matching rows (each has 2 or more rows). */
  groups: number;
  /** Rows that will be removed or marked. */
  duplicates: number;
  /** Rows with formulas that would have been removed (never removed automatically). */
  formulaSkipped: number;
  /** Up to 10 groups, largest first. */
  examples: DuplicateGroupExample[];
  /** View rows that will be removed (for the Excel reference check). */
  removeRows: number[];
  /** Set when there is nothing to do; nothing is applied. */
  refused?: string;
}

const MAX_GROUP_EXAMPLES = 10;
export const MARK_HEADER = "Duplicate";

function text(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

/** The comparison form of one cell ("" = empty). Numbers, text and TRUE/FALSE never match each other. */
function normalise(v: CellValue, o: DuplicateOptions): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") return `n${v}`;
  if (typeof v === "boolean") return v ? "bT" : "bF";
  let s = v;
  if (o.ignoreSpaces) s = s.trim().replace(/\s+/g, " ");
  if (o.ignoreCase) s = s.toLocaleLowerCase();
  return s === "" ? "" : `s${s}`;
}

/** 32-bit FNV-1a over the compared cells of one row. */
function fingerprint(parts: string[]): number {
  let h = 0x811c9dc5;
  for (let p = 0; p < parts.length; p++) {
    const s = parts[p]!;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x1f; // cell boundary
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function planDuplicates(input: DuplicatePlanInput): DuplicatePlan {
  const { sheet, headerRow, options } = input;
  const g = sheet.grid;
  const none = (refused: string): DuplicatePlan => ({ requests: [], groups: 0, duplicates: 0, formulaSkipped: 0, examples: [], removeRows: [], refused });

  const width = sheet.columnCount;
  const cols = options.columns === null ? Array.from({ length: width }, (_, c) => c) : [...new Set(options.columns)].sort((a, b) => a - b);
  if (cols.length === 0) return none("Choose at least one column to compare.");
  if (cols.some((c) => c < 0 || c >= width)) return none("One of the chosen columns doesn't exist.");

  const start = headerRow ? 1 : 0;
  const rowCount = g.rowCount;
  const n = Math.max(0, rowCount - start);
  const partsOf = (r: number) => cols.map((c) => normalise(g.get(r, c), options));

  // 1. Fingerprint every row; rows whose compared cells are all empty are never duplicates.
  const hashes = new Uint32Array(n);
  const hasValue = new Uint8Array(n);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const parts = partsOf(i + start);
    if (parts.every((p) => p === "")) continue;
    hasValue[i] = 1;
    hashes[i] = fingerprint(parts);
    m++;
  }
  // 2. Sort by fingerprint, then confirm matches cell by cell within each bucket.
  const order = new Uint32Array(m);
  for (let i = 0, k = 0; i < n; i++) if (hasValue[i]) order[k++] = i;
  order.sort((a, b) => hashes[a]! - hashes[b]! || a - b);
  const groups: number[][] = [];
  for (let s = 0; s < m; ) {
    let e = s + 1;
    while (e < m && hashes[order[e]!] === hashes[order[s]!]) e++;
    if (e - s > 1) {
      const reps: { parts: string[]; rows: number[] }[] = [];
      for (let k = s; k < e; k++) {
        const r = order[k]! + start;
        const parts = partsOf(r);
        const same = reps.find((x) => x.parts.every((p, j) => p === parts[j]));
        if (same) same.rows.push(r);
        else reps.push({ parts, rows: [r] });
      }
      for (const x of reps) if (x.rows.length > 1) groups.push(x.rows); // rows ascending (order is stable by index)
    }
    s = e;
  }
  if (groups.length === 0) return none(options.columns === null ? "No duplicate rows found: every row is different." : "No duplicate rows found in the chosen columns.");

  // 3. Keep the first or last row of each group; the others are duplicates of it.
  const isFormulaRow = (r: number) => {
    if (!sheet.formulas.size) return false;
    const len = g.rowLength(r);
    for (let c = 0; c < len; c++) if (sheet.formulas.has(cellKey(r, c))) return true;
    return false;
  };
  const marks = new Map<number, number>(); // duplicate row → kept row
  const removeRows: number[] = [];
  let formulaSkipped = 0;
  const examples: (DuplicateGroupExample & { size: number })[] = [];
  for (const rows of groups) {
    const kept = options.keep === "first" ? rows[0]! : rows[rows.length - 1]!;
    const copies = rows.filter((r) => r !== kept);
    for (const r of copies) {
      if (options.action === "remove") {
        if (isFormulaRow(r)) {
          formulaSkipped++;
          continue;
        }
        removeRows.push(r);
      }
      marks.set(r, kept);
    }
    examples.push({ kept: kept + 1, copies: copies.slice(0, 5).map((r) => r + 1), copyCount: copies.length, values: cols.slice(0, 6).map((c) => text(g.get(kept, c))), size: rows.length });
  }
  examples.sort((a, b) => b.size - a.size || a.kept - b.kept);
  const shown: DuplicateGroupExample[] = examples.slice(0, MAX_GROUP_EXAMPLES).map((e) => ({ kept: e.kept, copies: e.copies, copyCount: e.copyCount, values: e.values }));

  const requests: ChangeRequest[] = [];
  if (options.action === "remove") {
    removeRows.sort((a, b) => a - b);
    if (removeRows.length) {
      requests.push({
        operation: "remove-duplicates",
        label: "Remove duplicates",
        deleteRows: removeRows.map((r) => ({ row: r, reason: `Copy of row ${marks.get(r)! + 1}` })),
      });
    }
  } else {
    const values: CellValue[] = new Array(rowCount).fill(null);
    if (headerRow) values[0] = MARK_HEADER;
    for (const [r, kept] of marks) values[r] = `Duplicate of row ${kept + 1}`;
    requests.push({ operation: "mark-duplicates", label: "Mark duplicates", addColumns: [{ values, reason: "Mark duplicates" }] });
  }
  return {
    requests,
    groups: groups.length,
    duplicates: options.action === "remove" ? removeRows.length : marks.size,
    formulaSkipped,
    examples: shown,
    removeRows,
    ...(requests.length ? {} : { refused: "Every duplicate row contains a formula, and rows with formulas are never removed automatically. Use “Mark duplicates” instead." }),
  };
}
