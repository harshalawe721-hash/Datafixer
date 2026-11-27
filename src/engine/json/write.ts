/**
 * Stage 12: table → JSON (decisions 3A and 4A).
 *
 * The header row gives the key names (empty names become column_N, repeated
 * names name_2, name_3 …). Values are text by default, exactly as shown; with
 * `detect`, plain numbers, true/false and empty cells become JSON numbers,
 * booleans and null, while codes with leading zeros, numbers longer than 15
 * digits and dates stay text. Output is pretty (indented), compact, or JSON
 * Lines (one record per line).
 */
import type { CellValue } from "../types.ts";

export type JsonLayout = "pretty" | "compact" | "lines";

export interface JsonWriteOptions {
  /** Plain numbers, true/false and empty cells become numbers, booleans and null. */
  detect: boolean;
  layout: JsonLayout;
}

/** One cell as the writer sees it: the value and the text shown in the sheet. */
export interface WriteCell {
  value: CellValue;
  text: string;
  /** An Excel date (stays text, as shown). */
  date?: boolean;
}

export type JsonOut = null | boolean | number | string;

/** Unique key names from the header texts. */
export function keyNames(header: string[], width: number): string[] {
  const used = new Set<string>();
  const out: string[] = [];
  for (let c = 0; c < width; c++) {
    const base = (header[c] ?? "").trim() || `column_${c + 1}`;
    let name = base;
    for (let k = 2; used.has(name); k++) name = `${base}_${k}`;
    used.add(name);
    out.push(name);
  }
  return out;
}

const PLAIN_NUMBER = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;

/** The JSON value for one cell. */
export function jsonValue(cell: WriteCell, detect: boolean): JsonOut {
  if (!detect) return cell.text;
  const { value, text } = cell;
  if (value === null || text === "") return null;
  if (cell.date) return text;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : text;
  const t = text.trim();
  if (t !== text) return text; // spaces around the value: keep it as written
  if (t === "true" || t === "TRUE") return true;
  if (t === "false" || t === "FALSE") return false;
  if (PLAIN_NUMBER.test(t)) {
    const digits = t.replace(/^-/, "").replace(".", "").replace(/^0+/, "");
    if (digits.length <= 15) return Number(t);
  }
  return text;
}

/** JSON text of one record; `indent` is the record's own indentation in a pretty file. */
export function recordJson(keys: string[], r: JsonOut[], layout: JsonLayout, indent = ""): string {
  return layout === "pretty"
    ? `${indent}{\n${keys.map((k, c) => `${indent}  ${JSON.stringify(k)}: ${JSON.stringify(r[c] ?? null)}`).join(",\n")}\n${indent}}`
    : `{${keys.map((k, c) => `${JSON.stringify(k)}:${JSON.stringify(r[c] ?? null)}`).join(",")}}`;
}

/** What goes before the first record, between records and after the last one. */
export function jsonFrame(layout: JsonLayout, empty: boolean): { open: string; between: string; close: string; indent: string } {
  if (layout === "lines") return { open: "", between: "\n", close: empty ? "" : "\n", indent: "" };
  if (empty) return { open: "[]\n", between: "", close: "", indent: "" };
  if (layout === "pretty") return { open: "[\n", between: ",\n", close: "\n]\n", indent: "  " };
  return { open: "[", between: ",", close: "]\n", indent: "" };
}

/** JSON text for records (each an ordered list of values, in key order). */
export function recordsToJson(keys: string[], records: JsonOut[][], layout: JsonLayout): string {
  const f = jsonFrame(layout, records.length === 0);
  return f.open + records.map((r) => recordJson(keys, r, layout, f.indent)).join(f.between) + f.close;
}
