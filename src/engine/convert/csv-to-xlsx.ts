/**
 * Stage 6, Step 2: CSV → Excel conversion rules.
 *
 * Owner decision 1 (A): only values that are clearly numbers or ISO dates
 * become numbers or dates; everything else stays text exactly as written.
 * Owner decision 2 (A): more rows than an Excel sheet holds continue on more
 * sheets (“Name (2)”…), with the header row repeated when there is one.
 *
 * A converted value must look the same in Excel as in the CSV: decimals keep
 * their number of places with a display format (“1.50”), 12–15 digit whole
 * numbers get the “0” format (Excel's General format would show 1.23E+11), and
 * anything that can't be stored exactly stays text.
 */
import type { SheetModel } from "../types.ts";
import { isFormulaLike } from "../csv/parse-csv.ts";
import { XLSX_MAX_ROWS, type OutCell, type SheetSource } from "../export/xlsx-writer.ts";

/** Why a value that looks like a number or date was kept as text. */
export type KeptReason =
  | "leading-zero"
  | "too-many-digits"
  | "formatted-number"
  | "ambiguous-date"
  | "early-or-invalid-date"
  | "formula-like"
  | "spaces"
  | "other";

export const KEPT_REASON_TEXT: Record<KeptReason, string> = {
  "leading-zero": "Leading zeros (codes, phone numbers, ZIP codes): kept as text so the zeros aren't lost",
  "too-many-digits": "More than 15 digits (long IDs, card numbers): kept as text because Excel would round them",
  "formatted-number": "Numbers with separators, signs, %, currency or exponents (1,250 · 12% · $5 · +5 · 1e5 · -0): kept as text because they can mean different things or would look different",
  "ambiguous-date": "Dates other than year-month-day (03/04/2024 could be 3 April or March 4): kept as text",
  "early-or-invalid-date": "Year-month-day dates that don't exist (2023-02-30) or are before 1 March 1900 (Excel counts 1900 as a leap year): kept as text",
  "formula-like": "Values that start like formulas (=, +, -, @): kept as text, never run as formulas",
  spaces: "Numbers with spaces before or after them: kept as text, exactly as written",
  other: "Other",
};

export type ConvertedCell = { cell: OutCell; kind: "empty" | "text" | "number" | "date"; kept?: KeptReason };

const PLAIN = /^-?(0|[1-9]\d*)(\.\d+)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const NUMBERISH = /^[\s+\-]*[$€£¥₹]?\s*[\d.,\s']*\d[\d.,\s']*\s*(%|[$€£¥₹])?\s*$/;
const EXPONENT = /^[+-]?\d+(\.\d+)?[eE][+-]?\d+$/;
const OTHER_DATE = /^\d{1,4}[/.\-]\d{1,2}[/.\-]\d{1,4}$/;

function digits(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) >= 48 && s.charCodeAt(i) <= 57) n++;
  return n;
}

/** Days since 1899-12-30 (Excel's 1900 date system) for a date on or after 1900-03-01, else null. */
export function isoToSerial(y: number, m: number, d: number): number | null {
  if (y < 1900 || y > 9999 || m < 1 || m > 12 || d < 1) return null;
  const t = Date.UTC(y, m - 1, d);
  const back = new Date(t);
  if (back.getUTCFullYear() !== y || back.getUTCMonth() !== m - 1 || back.getUTCDate() !== d) return null; // e.g. 2023-02-30
  const serial = Math.round((t - Date.UTC(1899, 11, 30)) / 86_400_000);
  // Excel treats 1900 as a leap year (serial 60 = 29 Feb 1900), so earlier dates would be off by one.
  return serial >= 61 ? serial : null;
}

const DATE_FORMAT = "yyyy-mm-dd";

/** How one CSV value becomes a cell (decision 1). */
export function convertValue(raw: string): ConvertedCell {
  if (raw === "") return { cell: null, kind: "empty" };
  const text = (kept?: KeptReason): ConvertedCell => ({ cell: { t: "s", v: raw }, kind: "text", ...(kept ? { kept } : {}) });

  const iso = ISO_DATE.exec(raw);
  if (iso) {
    const serial = isoToSerial(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return serial !== null ? { cell: { t: "n", v: serial, fmt: DATE_FORMAT }, kind: "date" } : text("early-or-invalid-date");
  }
  if (PLAIN.test(raw)) {
    if (/^-0(\.0+)?$/.test(raw)) return text("formatted-number"); // Excel has no negative zero
    const [int, frac = ""] = raw.replace(/^-/, "").split(".");
    const significant = (int === "0" ? "" : int!) + frac;
    if (digits(significant.replace(/^0+/, "")) > 15 || digits(int!) > 15) return text("too-many-digits");
    const v = Number(raw);
    const shown = frac.length ? v.toFixed(frac.length) : String(v);
    if (!Number.isFinite(v) || shown !== raw) return text("too-many-digits");
    if (frac.length) return { cell: { t: "n", v, fmt: `0.${"0".repeat(frac.length)}` }, kind: "number" };
    if (int!.length > 11) return { cell: { t: "n", v, fmt: "0" }, kind: "number" };
    return { cell: { t: "n", v }, kind: "number" };
  }
  // Kept as text: say why, when it looks like a number or a date.
  if (isFormulaLike(raw)) return text(/^[+-]\d/.test(raw) && NUMBERISH.test(raw) ? "formatted-number" : "formula-like");
  const trimmed = raw.trim();
  if (trimmed !== raw && trimmed !== "" && (PLAIN.test(trimmed) || ISO_DATE.test(trimmed))) return text("spaces");
  if (/^-?0\d+$/.test(raw)) return text("leading-zero");
  if (/^\d+$/.test(raw) && raw.length > 15) return text("too-many-digits");
  if (OTHER_DATE.test(raw)) return text("ambiguous-date");
  if (EXPONENT.test(raw) || NUMBERISH.test(raw)) return text(/^-?0\d/.test(raw.replace(/[\s,']/g, "")) ? "leading-zero" : "formatted-number");
  return text();
}

export interface ConversionPlan {
  sheets: SheetSource[];
  /** Data rows per sheet (header excluded), for the summary. */
  rowsPerSheet: number[];
  split: boolean;
}

/**
 * Turn the CSV sheet into the sheets to write. With column names, row 0 is
 * the header (always text) and is repeated at the top of every extra sheet.
 */
export function planCsvToXlsx(sheet: SheetModel, options: { headerRow: boolean; name: string }): ConversionPlan {
  const g = sheet.grid;
  const total = g.rowCount;
  const header = options.headerRow && total > 0;
  const dataStart = header ? 1 : 0;
  const dataRows = total - dataStart;
  const perSheet = header ? XLSX_MAX_ROWS - 1 : XLSX_MAX_ROWS;
  const sheetCount = Math.max(1, Math.ceil(dataRows / perSheet));
  const colCount = Math.max(1, sheet.columnCount);
  const textRow = (r: number): OutCell[] => {
    const len = g.rowLength(r);
    const out = new Array<OutCell>(len);
    for (let c = 0; c < len; c++) {
      const v = g.get(r, c);
      const s = v === null ? "" : String(v);
      out[c] = s === "" ? null : { t: "s", v: s };
    }
    return out;
  };
  const dataRow = (r: number): OutCell[] => {
    const len = g.rowLength(r);
    const out = new Array<OutCell>(len);
    for (let c = 0; c < len; c++) {
      const v = g.get(r, c);
      out[c] = convertValue(v === null ? "" : String(v)).cell;
    }
    return out;
  };
  const sheets: SheetSource[] = [];
  const rowsPerSheet: number[] = [];
  for (let k = 0; k < sheetCount; k++) {
    const first = dataStart + k * perSheet;
    const count = Math.max(0, Math.min(perSheet, total - first));
    rowsPerSheet.push(count);
    sheets.push({
      name: k === 0 ? options.name : `${options.name} (${k + 1})`,
      rowCount: count + (header ? 1 : 0),
      colCount,
      header,
      row: header ? (r) => (r === 0 ? textRow(0) : dataRow(first + r - 1)) : (r) => dataRow(first + r),
    });
  }
  return { sheets, rowsPerSheet, split: sheetCount > 1 };
}

/** What became of the values (for the summary): cells per kind, and why look-alike values stayed text. */
export function countConversion(sheet: SheetModel, headerRow: boolean): { numbers: number; dates: number; text: number; empty: number; kept: Partial<Record<KeptReason, number>> } {
  const g = sheet.grid;
  const out = { numbers: 0, dates: 0, text: 0, empty: 0, kept: {} as Partial<Record<KeptReason, number>> };
  for (let r = headerRow && g.rowCount > 0 ? 1 : 0; r < g.rowCount; r++) {
    const len = g.rowLength(r);
    for (let c = 0; c < len; c++) {
      const v = g.get(r, c);
      const res = convertValue(v === null ? "" : String(v));
      if (res.kind === "number") out.numbers++;
      else if (res.kind === "date") out.dates++;
      else if (res.kind === "empty") out.empty++;
      else {
        out.text++;
        if (res.kept && res.kept !== "other") out.kept[res.kept] = (out.kept[res.kept] ?? 0) + 1;
      }
    }
  }
  return out;
}
