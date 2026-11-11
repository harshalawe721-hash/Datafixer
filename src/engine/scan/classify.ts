/**
 * Cell classification for the Error Detector (Stage 3, pass 1).
 *
 * Every cell is put in exactly one category, stored as one byte per cell, so
 * later checks never have to re-run these regular expressions. Rules are
 * deliberately conservative: when in doubt a value is plain "text".
 */
import type { CellValue } from "../types.ts";

export const Cat = {
  /** No value at all. */
  Empty: 0,
  /** Only whitespace (spaces, tabs, non-breaking spaces). */
  Blank: 1,
  /** A real number (Excel numeric cell). */
  Number: 2,
  /** Text that is a plain number: "42", "-3.5", "1e6", "007". */
  NumericText: 3,
  /** Text that is a number with formatting: "1,234", "$12", "12%", "(5)". */
  FormattedNumber: 4,
  /** Excel numeric cell with a date/time format. */
  Date: 5,
  /** TRUE/FALSE (Excel boolean, or the text TRUE/FALSE). */
  Boolean: 6,
  /** Excel error value (#DIV/0!, #N/A …), or that text in a CSV. */
  Error: 7,
  /** Any other text. */
  Text: 8,
  /** Text that looks like a date; the category is DateTextBase + pattern index. */
  DateTextBase: 32,
} as const

/** Recognised text date patterns (pattern id = index). */
export const DATE_PATTERNS = [
  { id: "iso", label: "2024-01-31", re: /^\d{4}-\d{1,2}-\d{1,2}$/ },
  { id: "iso-time", label: "2024-01-31 14:30", re: /^\d{4}-\d{1,2}-\d{1,2}[T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/ },
  { id: "ymd-slash", label: "2024/01/31", re: /^\d{4}\/\d{1,2}\/\d{1,2}$/ },
  { id: "dmy-or-mdy-slash", label: "31/01/2024 or 01/31/2024", re: /^\d{1,2}\/\d{1,2}\/\d{4}$/ },
  { id: "dmy-or-mdy-dash", label: "31-01-2024 or 01-31-2024", re: /^\d{1,2}-\d{1,2}-\d{4}$/ },
  { id: "dmy-dot", label: "31.01.2024", re: /^\d{1,2}\.\d{1,2}\.\d{4}$/ },
  { id: "short-year-slash", label: "31/01/24 or 01/31/24", re: /^\d{1,2}\/\d{1,2}\/\d{2}$/ },
  { id: "d-mon-y", label: "31 Jan 2024", re: /^\d{1,2}[ -](jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?[\s,-]+\d{2,4}$/i },
  { id: "mon-d-y", label: "Jan 31, 2024", re: /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.? \d{1,2},? \d{4}$/i },
] as const;

export type DatePatternId = (typeof DATE_PATTERNS)[number]["id"];

const MON_D_Y_INDEX = DATE_PATTERNS.findIndex((p) => p.id === "mon-d-y");
const MON_D_Y = DATE_PATTERNS[MON_D_Y_INDEX]!.re;

const EXCEL_ERROR_TEXT = /^#(NULL!|DIV\/0!|VALUE!|REF!|NAME\?|NUM!|N\/A|GETTING_DATA|SPILL!|CALC!)$/;
/** Plain number: optional sign, digits, optional decimal part, optional exponent. */
export const PLAIN_NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;
/**
 * Number with formatting a spreadsheet may not read as a number: thousands
 * separators (comma, dot, space), currency symbols, percent, accounting
 * parentheses, trailing minus, decimal comma ("1.234,56").
 */
const FORMATTED_NUMBER =
  /^(\(?[+-]?[$€£¥₹¢]?\s?(\d{1,3}([,.\s\u00a0]\d{3})+|\d+)([.,]\d+)?\s?[$€£¥₹¢%]?\)?|[+-]?\d+([.,]\d+)?-)$/;
/** All Unicode whitespace JavaScript knows, incl. U+00A0 and U+FEFF. */
const ONLY_WHITESPACE = /^[\s\uFEFF]+$/;

export function isDateTextCat(cat: number): boolean {
  return cat >= Cat.DateTextBase;
}

export function datePatternOf(cat: number): DatePatternId | null {
  return cat >= Cat.DateTextBase ? (DATE_PATTERNS[cat - Cat.DateTextBase]?.id ?? null) : null;
}

/**
 * Classify one cell.
 * @param isError the cell is recorded as an Excel error value
 * @param isDate  the numeric cell has an Excel date format
 */
export function classify(value: CellValue, isError: boolean, isDate: boolean): number {
  if (value === null) return Cat.Empty;
  if (isError) return Cat.Error;
  if (typeof value === "number") return isDate ? Cat.Date : Cat.Number;
  if (typeof value === "boolean") return Cat.Boolean;
  const s = value;
  if (s === "") return Cat.Empty;
  const c0 = s.charCodeAt(0);
  const cLast = s.charCodeAt(s.length - 1);
  // Only strings that start or end with whitespace need the regex and trim (rare).
  const edgeSpace = isSpaceCode(c0) || isSpaceCode(cLast);
  if (edgeSpace && ONLY_WHITESPACE.test(s)) return Cat.Blank;
  const t = edgeSpace ? s.trim() : s;
  // Values starting with a letter can only be a boolean, a "Jan 31, 2024" date, or text.
  const t0 = t.charCodeAt(0);
  if ((t0 >= 0x41 && t0 <= 0x5a) || (t0 >= 0x61 && t0 <= 0x7a) || (t0 > 0x7f && !isCurrencyCode(t0))) {
    if (t.length <= 5) {
      const u = t.toUpperCase();
      if (u === "TRUE" || u === "FALSE") return Cat.Boolean;
    }
    if (t.length <= 20 && hasDigit(t) && MON_D_Y.test(t)) return Cat.DateTextBase + MON_D_Y_INDEX;
    return Cat.Text;
  }
  if (c0 === 0x23 /* # */ && EXCEL_ERROR_TEXT.test(t)) return Cat.Error;
  if (t.length <= 5) {
    const u = t.toUpperCase();
    if (u === "TRUE" || u === "FALSE") return Cat.Boolean;
  }
  if (PLAIN_NUMBER.test(t)) return Cat.NumericText;
  // Dates and formatted numbers always contain a digit.
  if (!hasDigit(t)) return Cat.Text;
  for (let i = 0; i < DATE_PATTERNS.length; i++) {
    if (DATE_PATTERNS[i]!.re.test(t)) return Cat.DateTextBase + i;
  }
  if (t.length <= 24 && FORMATTED_NUMBER.test(t)) return Cat.FormattedNumber;
  return Cat.Text;
}

function isSpaceCode(c: number): boolean {
  return c <= 0x20 || c === 0xa0 || c === 0xfeff || c === 0x2007 || c === 0x202f || (c >= 0x2000 && c <= 0x200a) || c === 0x3000;
}

/** € £ ¥ ₹ (and other currency signs U+20A0–U+20CF) can start a formatted number. */
function isCurrencyCode(c: number): boolean {
  return c === 0xa3 || c === 0xa5 || c === 0xa2 || (c >= 0x20a0 && c <= 0x20cf);
}

function hasDigit(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x30 && c <= 0x39) return true;
  }
  return false;
}

/** Column kinds derived from the categories of its non-empty cells. */
export type ColumnKind = "empty" | "number" | "date" | "text" | "boolean" | "mixed";

/** A category belongs to the "number-like" family. */
export function isNumberLike(cat: number): boolean {
  return cat === Cat.Number || cat === Cat.NumericText || cat === Cat.FormattedNumber;
}

export function isDateLike(cat: number): boolean {
  return cat === Cat.Date || cat >= Cat.DateTextBase;
}
