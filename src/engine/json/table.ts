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

/** Builds the table for one list (or a single object). */
export function jsonToTable(data: JsonValue): JsonTable {
  let listsAsText = 0;
  let longNumbers = 0;
  const cell = (v: JsonValue): CellValue => {
    if (v === null) return null;
    if (v instanceof LongNumber) {
      longNumbers++;
      return v.text;
    }
    if (Array.isArray(v) || isObject(v)) {
      listsAsText++;
      return jsonText(v);
    }
    return v;
  };

  const items: JsonValue[] = Array.isArray(data) ? data : [data];
  if (items.length === 0) return { rows: [], headerRow: false, listsAsText, longNumbers };

  if (items.every((x) => Array.isArray(x))) {
    return { rows: (items as JsonValue[][]).map((row) => row.map(cell)), headerRow: false, listsAsText, longNumbers };
  }
  if (!items.some(isObject)) {
    return { rows: [["value"], ...items.map((x) => [cell(x)])], headerRow: true, listsAsText, longNumbers };
  }

  // Objects (plain values among them go into a “value” column).
  const index = new Map<string, number>();
  const columns: string[] = [];
  const col = (name: string) => {
    let c = index.get(name);
    if (c === undefined) {
      c = columns.length;
      index.set(name, c);
      columns.push(name);
    }
    return c;
  };
  const flatten = (obj: { [key: string]: JsonValue }, prefix: string, row: CellValue[]) => {
    for (const k of Object.keys(obj)) {
      const v = obj[k]!;
      const name = prefix ? `${prefix}.${k}` : k;
      if (isObject(v) && Object.keys(v).length > 0) flatten(v, name, row);
      else row[col(name)] = isObject(v) ? null : cell(v);
    }
  };
  const body: CellValue[][] = items.map((x) => {
    const row: CellValue[] = [];
    if (isObject(x)) flatten(x, "", row);
    else row[col("value")] = cell(x);
    return row;
  });
  for (const row of body) for (let c = 0; c < columns.length; c++) if (row[c] === undefined) row[c] = null;
  return { rows: [columns, ...body], headerRow: true, listsAsText, longNumbers };
}
