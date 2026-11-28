/**
 * Stage 17: comparing two tables (an older and a newer version).
 *
 * - Columns are matched by name, ignoring capital letters and spaces around names, as in
 *   Merge Files; when either file has no column names, by position. Columns found in only
 *   one file are reported as added or removed columns, not as changes in every row.
 * - Rows are matched by one or more key columns (decision 1A), or, without a key, by the
 *   whole row (rows identical in both files are unchanged; the others added or removed).
 * - Values are compared as the table shows them; optionally ignoring capital letters and
 *   spaces at the start and end (2A). The same rules apply to keys.
 * - A key that appears more than once in a file is reported, and those rows are matched in
 *   order: the first with the first (5A).
 *
 * Matching uses 52-bit hashes in sorted typed arrays (no Map of millions of strings), and
 * every hash match is confirmed by comparing the texts.
 */
import { throwIfCancelled, yieldToEventLoop, type CancelToken } from "../cancel.ts";
import { columnLetter } from "../query/query.ts";

/** A table as the comparison reads it: cell texts as shown, one at a time. */
export interface CompareTable {
  rowCount: number;
  rowLength(r: number): number;
  text(r: number, c: number): string;
  /** The first row holds column names. */
  header: boolean;
}

export interface CompareColumn {
  name: string;
  /** Column in the older / newer table, or -1 when the column is only in the other file. */
  older: number;
  newer: number;
}

export interface CompareOptions {
  /** Key columns (indexes into the columns list); null compares whole rows. */
  keys: number[] | null;
  ignoreCase: boolean;
  ignoreSpaces: boolean;
}

/** Status of a row of the newer file. */
export const UNCHANGED = 0;
export const CHANGED = 1;
export const ADDED = 2;
/** A row with no values at all (left out of the comparison). */
export const EMPTY = 3;

export interface CompareResult {
  columns: CompareColumn[];
  keys: number[] | null;
  olderStart: number;
  newerStart: number;
  /** Data rows (the header row not counted). */
  olderRows: number;
  newerRows: number;
  /** Per data row of the newer file: UNCHANGED, CHANGED, ADDED or EMPTY. */
  status: Uint8Array;
  /** Per data row of the newer file: the matching data row of the older file, or -1. */
  match: Int32Array;
  /** Data rows of the older file with no match (removed), in order. Rows with no values are left out. */
  removed: Uint32Array;
  counts: { added: number; removed: number; changed: number; unchanged: number; changedCells: number };
  /** Keys that appear more than once (key comparisons only). */
  repeated: { older: number; newer: number; examples: string[] };
  /** Per data row: its key appears more than once in its file (null when nothing repeats). */
  repeatedOlder: Uint8Array | null;
  repeatedNewer: Uint8Array | null;
  normalize: (s: string) => string;
}

const norm = (name: string) => name.trim().toLowerCase();

function widthOf(t: CompareTable): number {
  let w = 0;
  for (let r = 0; r < t.rowCount; r++) w = Math.max(w, t.rowLength(r));
  return w;
}

/** Match the columns of the two tables (by name when both have column names, else by position). */
export function matchColumns(older: CompareTable, newer: CompareTable): CompareColumn[] {
  const wo = widthOf(older);
  const wn = widthOf(newer);
  const cell = (t: CompareTable, c: number) => (t.rowCount && c < t.rowLength(0) ? t.text(0, c) : "");
  if (!older.header || !newer.header) {
    const out: CompareColumn[] = [];
    for (let c = 0; c < Math.max(wo, wn); c++) {
      const named = (newer.header ? cell(newer, c) : "").trim() || (older.header ? cell(older, c) : "").trim();
      out.push({ name: named || `Column ${columnLetter(c)}`, older: c < wo ? c : -1, newer: c < wn ? c : -1 });
    }
    return out;
  }
  // Names in one file: empty names become “Column X”, a repeated name gets its position.
  const names = (t: CompareTable, w: number) => {
    const seen = new Set<string>();
    return Array.from({ length: w }, (_, c) => {
      let name = cell(t, c).trim() || `Column ${columnLetter(c)}`;
      if (seen.has(norm(name))) name = `${name} (${c + 1})`;
      seen.add(norm(name));
      return name;
    });
  };
  const on = names(older, wo);
  const nn = names(newer, wn);
  const olderIndex = new Map(on.map((n, c) => [norm(n), c]));
  const out: CompareColumn[] = nn.map((name, c) => ({ name, older: olderIndex.get(norm(name)) ?? -1, newer: c }));
  const used = new Set(out.map((x) => x.older));
  on.forEach((name, c) => {
    if (!used.has(c)) out.push({ name, older: c, newer: -1 });
  });
  return out;
}

/** 52-bit hash of a string (two FNV-1a variants), exact in a double. */
function hash52(s: string): number {
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ 0x5bd1e995;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    a = Math.imul(a ^ ch, 0x01000193);
    b = Math.imul(b ^ ch, 0x5bd1e995);
    b ^= b >>> 15;
  }
  return (a >>> 0) * 0x200000 + ((b >>> 0) & 0x1fffff);
}

export function normalizer(o: { ignoreCase: boolean; ignoreSpaces: boolean }): (s: string) => string {
  if (o.ignoreCase && o.ignoreSpaces) return (s) => s.trim().toLowerCase();
  if (o.ignoreCase) return (s) => s.toLowerCase();
  if (o.ignoreSpaces) return (s) => s.trim();
  return (s) => s;
}

/** Sorted index over a list of hashes: row numbers in hash order, and the hashes in that order. */
function sortedIndex(h: Float64Array): { order: Uint32Array; sorted: Float64Array } {
  const order = new Uint32Array(h.length);
  for (let i = 0; i < order.length; i++) order[i] = i;
  order.sort((x, y) => h[x]! - h[y]! || x - y);
  const sorted = new Float64Array(h.length);
  for (let i = 0; i < order.length; i++) sorted[i] = h[order[i]!]!;
  return { order, sorted };
}

function lowerBound(a: Float64Array, v: number): number {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (a[mid]! < v) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

const YIELD = 0x3fff;

/**
 * The column to match rows by, when one is suitable: a column in both files whose values are
 * all filled in and all different in each file. Names like “id”, “code”, “sku” or “email” are
 * tried first, then the columns from left to right (at most 12 are checked). Null: none.
 */
export async function suggestKey(older: CompareTable, newer: CompareTable, columns: CompareColumn[], cancel?: CancelToken): Promise<number | null> {
  const common = columns.map((c, i) => ({ c, i })).filter((x) => x.c.older >= 0 && x.c.newer >= 0);
  const preferred = (n: string) => /^(id|.*[ _-]id|id[ _-].*|.*code|sku|e-?mail.*|key|.*number|no\.?|#)$/i.test(n.trim());
  const ordered = [...common.filter((x) => preferred(x.c.name)), ...common.filter((x) => !preferred(x.c.name))].slice(0, 12);
  const unique = async (t: CompareTable, col: number) => {
    const start = t.header ? 1 : 0;
    const n = t.rowCount - start;
    if (n < 1) return false;
    const h = new Float64Array(n);
    for (let r = start; r < t.rowCount; r++) {
      const v = col < t.rowLength(r) ? t.text(r, col) : "";
      if (v.trim() === "") return false;
      h[r - start] = hash52(v);
      if ((r & YIELD) === 0) {
        throwIfCancelled(cancel);
        await yieldToEventLoop();
      }
    }
    h.sort();
    for (let i = 1; i < n; i++) if (h[i] === h[i - 1]) return false;
    return true;
  };
  for (const { c, i } of ordered) if ((await unique(older, c.older)) && (await unique(newer, c.newer))) return i;
  return null;
}

/** Compare the two tables. */
export async function compareTables(older: CompareTable, newer: CompareTable, columns: CompareColumn[], o: CompareOptions, cancel?: CancelToken): Promise<CompareResult> {
  const normalize = normalizer(o);
  const common = columns.map((c, i) => ({ c, i })).filter((x) => x.c.older >= 0 && x.c.newer >= 0).map((x) => x.i);
  const keys = o.keys && o.keys.length ? o.keys : null;
  if (keys) for (const k of keys) if (!common.includes(k)) throw new Error("A key column must be in both files.");
  const keyCols = keys ?? common;
  const olderStart = older.header ? 1 : 0;
  const newerStart = newer.header ? 1 : 0;
  const nO = Math.max(0, older.rowCount - olderStart);
  const nN = Math.max(0, newer.rowCount - newerStart);
  const value = (t: CompareTable, r: number, c: number) => (c >= 0 && c < t.rowLength(r) ? t.text(r, c) : "");
  const keyText = (t: CompareTable, r: number, side: "older" | "newer") => {
    let s = "";
    for (let k = 0; k < keyCols.length; k++) s += (k ? "\u0001" : "") + normalize(value(t, r, columns[keyCols[k]!]![side]));
    return s;
  };
  const isEmpty = (t: CompareTable, r: number) => {
    for (let c = 0; c < t.rowLength(r); c++) if (t.text(r, c) !== "") return false;
    return true;
  };

  // Hash every row's key; rows with no values at all are left out.
  const hashes = async (t: CompareTable, start: number, n: number, side: "older" | "newer") => {
    const h = new Float64Array(n);
    const empty = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      if (isEmpty(t, start + i)) {
        empty[i] = 1;
        h[i] = -1;
      } else h[i] = hash52(keyText(t, start + i, side));
      if ((i & YIELD) === YIELD) {
        throwIfCancelled(cancel);
        await yieldToEventLoop();
      }
    }
    return { h, empty };
  };
  const ho = await hashes(older, olderStart, nO, "older");
  const hn = await hashes(newer, newerStart, nN, "newer");
  const io = sortedIndex(ho.h);

  // Repeated keys in each file (key comparisons only): neighbours in hash order with the same key text.
  const repeatedOf = (t: CompareTable, start: number, idx: { order: Uint32Array; sorted: Float64Array }, empty: Uint8Array, side: "older" | "newer", examples: string[]) => {
    const marks = new Uint8Array(idx.order.length);
    let keysRepeated = 0;
    for (let p = 0; p < idx.order.length; ) {
      let q = p + 1;
      while (q < idx.order.length && idx.sorted[q] === idx.sorted[p]) q++;
      if (q - p > 1 && !empty[idx.order[p]!]) {
        // Within one hash, group by the actual key text.
        const groups = new Map<string, number[]>();
        for (let x = p; x < q; x++) {
          const row = idx.order[x]!;
          const k = keyText(t, start + row, side);
          const g = groups.get(k);
          if (g) g.push(row);
          else groups.set(k, [row]);
        }
        for (const [k, rows] of groups) {
          if (rows.length < 2) continue;
          keysRepeated++;
          if (examples.length < 5 && !examples.includes(k)) examples.push(k.split("\u0001").join(", ") || "(empty)");
          for (const row of rows) marks[row] = 1;
        }
      }
      p = q;
    }
    return { marks, keysRepeated };
  };
  const examples: string[] = [];
  let repeated = { older: 0, newer: 0, examples };
  let repeatedOlder: Uint8Array | null = null;
  let repeatedNewer: Uint8Array | null = null;
  if (keys) {
    const ro = repeatedOf(older, olderStart, io, ho.empty, "older", examples);
    const rn = repeatedOf(newer, newerStart, sortedIndex(hn.h), hn.empty, "newer", examples);
    repeated = { older: ro.keysRepeated, newer: rn.keysRepeated, examples };
    if (ro.keysRepeated) repeatedOlder = ro.marks;
    if (rn.keysRepeated) repeatedNewer = rn.marks;
  }

  // Match each newer row with the first unused older row that has the same key.
  const used = new Uint8Array(nO);
  const status = new Uint8Array(nN);
  const match = new Int32Array(nN).fill(-1);
  const compared = common.filter((c) => !keys || !keys.includes(c));
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0, changedCells: 0 };
  for (let i = 0; i < nN; i++) {
    if (hn.empty[i]) {
      status[i] = EMPTY;
      continue;
    }
    const h = hn.h[i]!;
    let found = -1;
    let k: string | null = null;
    for (let p = lowerBound(io.sorted, h); p < io.sorted.length && io.sorted[p] === h; p++) {
      const row = io.order[p]!;
      if (used[row] || ho.empty[row]) continue;
      k ??= keyText(newer, newerStart + i, "newer");
      if (keyText(older, olderStart + row, "older") === k) {
        found = row;
        break;
      }
    }
    if (found < 0) {
      status[i] = ADDED;
      counts.added++;
    } else {
      used[found] = 1;
      match[i] = found;
      let diff = 0;
      for (const c of compared) if (normalize(value(older, olderStart + found, columns[c]!.older)) !== normalize(value(newer, newerStart + i, columns[c]!.newer))) diff++;
      if (diff) {
        status[i] = CHANGED;
        counts.changed++;
        counts.changedCells += diff;
      } else counts.unchanged++;
    }
    if ((i & YIELD) === YIELD) {
      throwIfCancelled(cancel);
      await yieldToEventLoop();
    }
  }
  let removedCount = 0;
  for (let r = 0; r < nO; r++) if (!used[r] && !ho.empty[r]) removedCount++;
  const removed = new Uint32Array(removedCount);
  for (let r = 0, k = 0; r < nO; r++) if (!used[r] && !ho.empty[r]) removed[k++] = r;
  counts.removed = removedCount;
  return { columns, keys, olderStart, newerStart, olderRows: nO, newerRows: nN, status, match, removed, counts, repeated, repeatedOlder, repeatedNewer, normalize };
}

/** The changed values of a changed row (columns in both files, keys left out). */
export function rowChanges(older: CompareTable, newer: CompareTable, res: CompareResult, i: number): { column: number; old: string; new: string }[] {
  const o = res.match[i]!;
  if (o < 0) return [];
  const out: { column: number; old: string; new: string }[] = [];
  res.columns.forEach((c, k) => {
    if (c.older < 0 || c.newer < 0 || res.keys?.includes(k)) return;
    const a = c.older < older.rowLength(res.olderStart + o) ? older.text(res.olderStart + o, c.older) : "";
    const b = c.newer < newer.rowLength(res.newerStart + i) ? newer.text(res.newerStart + i, c.newer) : "";
    if (res.normalize(a) !== res.normalize(b)) out.push({ column: k, old: a, new: b });
  });
  return out;
}
