/**
 * Stage 12: JSON → table (decision 2A).
 *
 * - A list of objects: one row per object; every key becomes a column, in the
 *   order keys first appear; nested objects become dotted columns
 *   (address.city); lists inside a record are kept as JSON text in one cell.
 * - A list of lists: each inner list is a row (no header row is made up).
 * - A list of plain values: one column named “value”.
 * - An object holding lists (for example {"results": [ … ]}): the lists are
 *   offered as choices; an object without lists is one row.
 */
import { LongNumber, type JsonValue } from "./parse.ts";
import type { CellValue } from "../types.ts";

export interface JsonListChoice {
  /** Where the list is, e.g. "" (the whole file), "results", "data.items". */
  path: string;
  /** Number of items in the list. */
  length: number;
}

export interface JsonTable {
  /** Header row first when `headerRow` is true. */
  rows: CellValue[][];
  headerRow: boolean;
  /** Nested lists kept as JSON text (cells). */
  listsAsText: number;
  /** Numbers longer than 15 digits kept as text (cells). */
  longNumbers: number;
}

const isObject = (v: JsonValue): v is { [key: string]: JsonValue } => v !== null && typeof v === "object" && !Array.isArray(v) && !(v instanceof LongNumber);

/** JSON text of a value, keeping long numbers exactly as written. */
export function jsonText(v: JsonValue): string {
  if (v instanceof LongNumber) return v.text;
  if (Array.isArray(v)) return `[${v.map(jsonText).join(",")}]`;
  if (isObject(v)) return `{${Object.keys(v).map((k) => `${JSON.stringify(k)}:${jsonText(v[k]!)}`).join(",")}}`;
  return JSON.stringify(v);
}

/** Lists in the data that can become a table, the whole file first, then by size. Searches 3 levels deep. */
export function findLists(root: JsonValue): JsonListChoice[] {
  const out: JsonListChoice[] = [];
  const walk = (v: JsonValue, path: string, depth: number) => {
    if (Array.isArray(v)) {
      out.push({ path, length: v.length });
      return;
    }
    if (!isObject(v) || depth >= 3) return;
    for (const k of Object.keys(v)) walk(v[k]!, path ? `${path}.${k}` : k, depth + 1);
  };
  walk(root, "", 0);
  return out.sort((a, b) => (a.path === "" ? -1 : b.path === "" ? 1 : b.length - a.length));
}

/** The value at a dotted path found by findLists. */
export function atPath(root: JsonValue, path: string): JsonValue {
  if (path === "") return root;
  let v: JsonValue = root;
  // Keys can contain dots, so match the longest key at each step.
  let rest = path;
  while (rest) {
    if (!isObject(v)) return null;
    const keys: string[] = Object.keys(v)
      .filter((k: string) => rest === k || rest.startsWith(`${k}.`))
      .sort((a: string, b: string) => b.length - a.length);
    const k = keys[0];
    if (k === undefined) return null;
    v = v[k]!;
    rest = rest.slice(k.length + 1);
  }
  return v;
}

export interface TableBuilderOptions {
  /** Write every cell as text (numbers in their JSON spelling, true/false, null as empty), as the engine shows JSON. */
  asText?: boolean;
}

/**
 * Builds the table one record at a time (so JSON Lines can be read line by line),
 * following the rules above. `bytes` estimates the memory the table holds.
 */
export class JsonTableBuilder {
  listsAsText = 0;
  longNumbers = 0;
  bytes = 0;
  private readonly asText: boolean;
  private readonly columns: string[] = [];
  private readonly index = new Map<string, number>();
  private readonly rows: CellValue[][] = [];
  /** Raw items while every item so far is a list (they become rows without a header). */
  private pendingLists: JsonValue[][] | null = [];
  private count = 0;

  constructor(options: TableBuilderOptions = {}) {
    this.asText = options.asText ?? false;
  }

  private cell(v: JsonValue): CellValue {
    let out: CellValue;
    if (v === null) out = null;
    else if (v instanceof LongNumber) {
      this.longNumbers++;
      out = v.text;
    } else if (Array.isArray(v) || isObject(v)) {
      this.listsAsText++;
      out = jsonText(v);
    } else out = this.asText && typeof v !== "string" ? (typeof v === "boolean" ? (v ? "true" : "false") : String(v)) : v;
    this.bytes += 16 + (typeof out === "string" ? out.length * 2 : 0);
    return out;
  }

  private col(name: string): number {
    let c = this.index.get(name);
    if (c === undefined) {
      c = this.columns.length;
      this.index.set(name, c);
      this.columns.push(name);
    }
    return c;
  }

  private flatten(obj: { [key: string]: JsonValue }, prefix: string, row: CellValue[]): void {
    for (const k of Object.keys(obj)) {
      const v = obj[k]!;
      const name = prefix ? `${prefix}.${k}` : k;
      if (isObject(v) && Object.keys(v).length > 0) this.flatten(v, name, row);
      else row[this.col(name)] = isObject(v) ? null : this.cell(v);
    }
  }

  private addRow(x: JsonValue): void {
    const row: CellValue[] = [];
    if (isObject(x)) this.flatten(x, "", row);
    else row[this.col("value")] = this.cell(x);
    this.bytes += 32 + row.length * 8;
    this.rows.push(row);
  }

  /** Adds one item; `rawBytes` estimates its size while it is held as a list. */
  add(x: JsonValue, rawBytes = 0): void {
    this.count++;
    if (this.pendingLists && Array.isArray(x)) {
      this.pendingLists.push(x);
      this.bytes += rawBytes || 64 + x.length * 24;
      return;
    }
    if (this.pendingLists) {
      const held = this.pendingLists;
      this.pendingLists = null;
      for (const a of held) this.addRow(a);
    }
    this.addRow(x);
  }

  finish(): JsonTable {
    const done = (rows: CellValue[][], headerRow: boolean): JsonTable => ({ rows, headerRow, listsAsText: this.listsAsText, longNumbers: this.longNumbers });
    if (this.count === 0) return done([], false);
    if (this.pendingLists) return done(this.pendingLists.map((r) => r.map((v) => this.cell(v))), false);
    const width = this.columns.length;
    for (const row of this.rows) for (let c = 0; c < width; c++) if (row[c] === undefined) row[c] = null;
    return done([this.columns, ...this.rows], true);
  }
}

/** Builds the table for one list (or a single object). */
export function jsonToTable(data: JsonValue, options: TableBuilderOptions = {}): JsonTable {
  const b = new JsonTableBuilder(options);
  for (const item of Array.isArray(data) ? data : [data]) b.add(item);
  return b.finish();
}
