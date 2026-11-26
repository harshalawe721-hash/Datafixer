/**
 * Stage 10: pure text rules for "Split a column" and "Combine columns".
 *
 * These functions only compute values. They do not touch the sheet: the
 * edit session adds the new columns later, and formula cells are never
 * changed. Separators inside double quotes can be respected when asked.
 */
import type { CellValue } from "../types.ts";

/** Excel limits: a cell holds at most 32,767 characters and a sheet at most 16,384 columns. */
export const EXCEL_MAX_CELL_CHARS = 32767;
export const EXCEL_MAX_COLUMNS = 16384;

export type SplitMode = "first" | "every";

export interface SplitOptions {
  /** Text between the parts, e.g. " " or ",". Must not be empty. */
  separator: string;
  /** "first": split only at the first separator. "every": at each separator. */
  mode: SplitMode;
  /** Most parts to produce; the last part keeps the rest of the text. null = no limit. */
  maxParts: number | null;
  /** Remove spaces around each part. */
  trim: boolean;
  /** Ignore separators that sit inside a pair of double quotes. */
  respectQuotes: boolean;
}

export interface CombineOptions {
  /** Text placed between values, e.g. " ", ", ", "-" or "" (none). */
  separator: string;
  /** Leave out empty values without adding extra separators. */
  skipEmpty: boolean;
}

/** Start index and length of every separator that counts as a cut. */
function cutPositions(value: string, separator: string, respectQuotes: boolean): [number, number][] {
  const cuts: [number, number][] = [];
  let quoted = false;
  let i = 0;
  while (i < value.length) {
    if (respectQuotes && value[i] === '"') {
      quoted = !quoted;
      i++;
      continue;
    }
    if (!quoted && value.startsWith(separator, i)) {
      cuts.push([i, separator.length]);
      i += separator.length;
      continue;
    }
    i++;
  }
  return cuts;
}

/** Splits one text value into parts. Returns a single part when the separator is not found. */
export function splitText(value: string, o: SplitOptions): string[] {
  if (!o.separator) throw new Error("The separator must not be empty.");
  let cuts = cutPositions(value, o.separator, o.respectQuotes);
  if (o.mode === "first") cuts = cuts.slice(0, 1);
  if (o.maxParts !== null && o.maxParts >= 1) cuts = cuts.slice(0, o.maxParts - 1);
  const parts: string[] = [];
  let start = 0;
  for (const [at, len] of cuts) {
    parts.push(value.slice(start, at));
    start = at + len;
  }
  parts.push(value.slice(start));
  return o.trim ? parts.map((p) => p.trim()) : parts;
}

/** Number of parts a text value would give, without building them. */
export function countParts(value: string, o: SplitOptions): number {
  return splitText(value, o).length;
}

/** Text of a cell value as it is written in CSV or Excel for a text column. */
export function cellText(v: CellValue): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

/** Headers for split parts: "name (1)", "name (2)" … */
export function splitHeaderNames(name: string, width: number): string[] {
  return Array.from({ length: width }, (_, i) => `${name} (${i + 1})`);
}

/** Joins values with a separator. Empty values are left out when skipEmpty is set. */
export function combineValues(values: CellValue[], o: CombineOptions): string {
  const parts: string[] = [];
  for (const v of values) {
    const t = cellText(v);
    if (o.skipEmpty && t === "") continue;
    parts.push(t);
  }
  return parts.join(o.separator);
}

/** True when a combined value would not fit in one Excel cell. */
export function tooLongForCell(value: string): boolean {
  return value.length > EXCEL_MAX_CELL_CHARS;
}
