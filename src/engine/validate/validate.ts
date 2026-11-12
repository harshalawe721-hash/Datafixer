/**
 * Stage 5: CSV Validator — structural checks of a CSV file (checks A–I in
 * docs/stage-5-plan.md). One pass over the parsed sheet plus facts collected
 * while reading (encoding, separator, line endings, quote errors, final line
 * break). Read-only. Results use the Error Detector's issue shape, so the page
 * can show them with the same cards and "view affected rows".
 *
 * Owner decision 5: uneven row lengths are always errors; missing and
 * duplicate column names are errors only when the first row holds column names
 * (otherwise the first row is data and is never reported as a header).
 */
import { cellKey, type CsvMeta, type SheetModel } from "../types.ts";
import { throwIfCancelled, yieldToEventLoop, type CancelToken } from "../cancel.ts";
import { columnLetter } from "../query/query.ts";
import { CellList, RowList } from "../scan/hits.ts";
import { isFormulaLike } from "../csv/parse-csv.ts";
import { DELIMITER_CANDIDATES } from "../csv/delimiter.ts";
import type { Finding, ScanIssue, Severity } from "../scan/scan.ts";
import { readRawLines } from "../csv/raw-lines.ts";

export const EXCEL_MAX_ROWS = 1_048_576;
export const EXCEL_MAX_COLUMNS = 16_384;
export const EXCEL_MAX_CELL_CHARS = 32_767;
/** Column names longer than this are reported as hard to use. */
const LONG_HEADER = 100;
const MAX_EXAMPLES = 5;
const BATCH_ROWS = 16_384;

export type CheckId = "encoding" | "separator" | "row-lengths" | "header" | "quoting" | "line-endings" | "characters" | "limits" | "trailing-separators";

export const CHECK_LABELS: Record<CheckId, string> = {
  encoding: "Text encoding",
  separator: "Column separator",
  "row-lengths": "Same number of fields in every row",
  header: "Column names",
  quoting: "Quotes",
  "line-endings": "Line endings and blank lines",
  characters: "Hidden control characters",
  limits: "Excel and Google Sheets limits",
  "trailing-separators": "Extra separators at line ends",
};

export interface ValidationCheck {
  id: CheckId;
  label: string;
  /** Worst severity found, or "pass". */
  status: "pass" | Severity;
}

export interface ValidationResult {
  /** Rows in the file, including the header row. */
  rows: number;
  /** Fields per row the file should have (header width, or the most common width). */
  expectedFields: number;
  headerRow: boolean;
  /** First row of data (after a sep= line and the header row). */
  firstDataRow: number;
  issues: ScanIssue[];
  checks: ValidationCheck[];
  verdict: { valid: boolean; errors: number; warnings: number; notes: number; importReady: string };
  /**
   * Whether examples show the line as written in the file: "shown", or
   * "changed" (the data was changed, so row numbers no longer match the file).
   */
  rawLines?: "shown" | "changed";
  file: { encoding: string; hadBom: boolean; delimiter: string; lineEnding: CsvMeta["lineEnding"]; finalLineBreak: boolean };
  timings: { totalMs: number };
}

/** Which check each issue belongs to. */
export const ISSUE_CHECK: Record<string, CheckId> = {
  "unreadable-characters": "encoding",
  "separator-uncertain": "separator",
  "single-column": "separator",
  "sep-line": "separator",
  "uneven-rows": "row-lengths",
  "header-not-names": "header",
  "empty-header": "header",
  "duplicate-header": "header",
  "header-spaces": "header",
  "long-header": "header",
  "unclosed-quote": "quoting",
  "stray-quotes": "quoting",
  "line-breaks-in-cells": "quoting",
  "mixed-line-endings": "line-endings",
  "old-mac-line-endings": "line-endings",
  "blank-lines": "line-endings",
  "no-final-line-break": "line-endings",
  "control-characters": "characters",
  "formula-like": "characters",
  "too-many-rows": "limits",
  "too-many-columns": "limits",
  "cell-too-long": "limits",
  "trailing-separators": "trailing-separators",
};

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, note: 2 };
const SEPARATOR_NAME: Record<string, string> = { ",": "comma (,)", ";": "semicolon (;)", "\t": "tab", "|": "pipe (|)" };
const sepName = (d: string) => SEPARATOR_NAME[d] ?? `“${d}”`;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const rowLabel = (r: number) => `Row ${(r + 1).toLocaleString("en-US")}`;

function cellText(sheet: SheetModel, r: number, c: number): string {
  const v = sheet.grid.get(r, c);
  return v === null ? "" : String(v);
}

/** A row with no data: an empty line, or only empty fields. */
function isBlankRow(sheet: SheetModel, r: number): boolean {
  const len = sheet.grid.rowLength(r);
  for (let c = 0; c < len; c++) if (cellText(sheet, r, c).trim() !== "") return false;
  return true;
}

/** "Excel sep= line": the first line only says which separator to use. */
function sepLine(sheet: SheetModel, delimiter: string): string | null {
  if (sheet.grid.rowCount === 0) return null;
  const len = sheet.grid.rowLength(0);
  const first = cellText(sheet, 0, 0).trim().toLowerCase();
  if (len === 1 && /^sep=.$/.test(first)) return first.slice(4);
  // When the hint names the separator in use, the line splits into "sep=" and "".
  if (len === 2 && first === "sep=" && cellText(sheet, 0, 1) === "") return delimiter;
  return null;
}

function snippet(s: string): string {
  const visible = s.replace(/\r\n|\r|\n/g, "↵").replace(/\t/g, "⇥");
  return visible.length > 60 ? `${visible.slice(0, 57)}…` : visible;
}

export interface ValidateOptions {
  headerRow: boolean;
  cancel?: CancelToken;
  onProgress?: (done: number, total: number) => void;
}

export async function validateCsv(sheet: SheetModel, meta: CsvMeta, options: ValidateOptions): Promise<{ result: ValidationResult; findings: Finding[] }> {
  const t0 = Date.now();
  const g = sheet.grid;
  const rows = g.rowCount;
  const delimiter = meta.delimiter;
  const sep = sepLine(sheet, delimiter);
  const headerRow = options.headerRow && rows > 0;
  // The header is the first row that isn't a sep= hint.
  const headerIndex = sep !== null ? 1 : 0;
  const findings: Finding[] = [];
  const add = (issue: Omit<ScanIssue, "unit"> & { unit?: ScanIssue["unit"] }, extra: Omit<Finding, "issue"> = {}) =>
    findings.push({ issue: { unit: "rows", ...issue } as ScanIssue, ...extra });

  // ---- expected width: the header's, or the most common width among data rows.
  const firstData = headerRow ? headerIndex + 1 : headerIndex;
  let expectedFields: number;
  if (headerRow && rows > headerIndex) expectedFields = g.rowLength(headerIndex);
  else {
    const freq = new Map<number, number>();
    for (let r = firstData; r < rows; r++) {
      if (isBlankRow(sheet, r) && g.rowLength(r) <= 1) continue;
      const n = g.rowLength(r);
      freq.set(n, (freq.get(n) ?? 0) + 1);
    }
    expectedFields = 0;
    let best = -1;
    for (const [n, f] of freq) if (f > best || (f === best && n > expectedFields)) [expectedFields, best] = [n, f];
  }

  // ---- one pass over all rows and cells
  const uneven = new RowList();
  const unevenFreq = new Map<number, number>();
  const unevenEx: ScanIssue["examples"] = [];
  let extraAllEmpty = true;
  const blank = new RowList();
  const unreadable = new CellList();
  const unreadableEx: ScanIssue["examples"] = [];
  const control = new CellList();
  const controlEx: ScanIssue["examples"] = [];
  const lineBreaks = new CellList();
  const lineBreakEx: ScanIssue["examples"] = [];
  const formulaLike = new CellList();
  const formulaEx: ScanIssue["examples"] = [];
  const tooLong = new CellList();
  const tooLongEx: ScanIssue["examples"] = [];
  let trailingEmpty = 0;
  let rowsAtWidth = 0;
  const firstRowsAtWidth: number[] = [];
  // A value swallowed by a quote that never closes is reported as that error, not as line breaks.
  const unclosedRows = new Set(sheet.issues.filter((i) => i.code === "unclosed-quote" && i.row !== null).map((i) => i.row!));
  const SPECIAL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f�\n\r]/;

  for (let r = headerIndex; r < rows; r++) {
    const len = g.rowLength(r);
    const isData = r >= firstData;
    const blankRow = isBlankRow(sheet, r);
    if (isData && blankRow && len <= 1) {
      blank.add(r);
    } else if (isData && len !== expectedFields) {
      uneven.add(r);
      unevenFreq.set(len, (unevenFreq.get(len) ?? 0) + 1);
      if (len > expectedFields) for (let c = expectedFields; c < len; c++) if (cellText(sheet, r, c) !== "") extraAllEmpty = false;
      if (unevenEx.length < MAX_EXAMPLES) {
        unevenEx.push({ row: r, col: 0, value: "", note: `${plural(len, "field")} instead of ${expectedFields.toLocaleString("en-US")}` });
      }
    }
    if (len === expectedFields && len > 1 && !blankRow) {
      if (firstRowsAtWidth.length < 2) firstRowsAtWidth.push(r);
      rowsAtWidth++;
      if (cellText(sheet, r, len - 1) === "") trailingEmpty++;
    }
    for (let c = 0; c < len; c++) {
      const s = cellText(sheet, r, c);
      if (s === "") continue;
      if (s.length > EXCEL_MAX_CELL_CHARS) {
        tooLong.add(cellKey(r, c));
        if (tooLongEx.length < MAX_EXAMPLES) tooLongEx.push({ row: r, col: c, value: `${s.length.toLocaleString("en-US")} characters` });
      }
      if (isData && isFormulaLike(s)) {
        formulaLike.add(cellKey(r, c));
        if (formulaEx.length < MAX_EXAMPLES) formulaEx.push({ row: r, col: c, value: snippet(s) });
      }
      if (!SPECIAL.test(s)) continue;
      if (s.includes("�")) {
        unreadable.add(cellKey(r, c));
        if (unreadableEx.length < MAX_EXAMPLES) unreadableEx.push({ row: r, col: c, value: snippet(s) });
      }
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(s)) {
        control.add(cellKey(r, c));
        if (controlEx.length < MAX_EXAMPLES) {
          const codes = [...new Set([...s].filter((ch) => /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(ch)).map((ch) => `U+${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}${ch === "\u0000" ? " (NUL)" : ""}`))];
          controlEx.push({ row: r, col: c, value: snippet(s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "␀")), note: codes.join(", ") });
        }
      }
      if (/[\n\r]/.test(s) && !unclosedRows.has(r)) {
        lineBreaks.add(cellKey(r, c));
        if (lineBreakEx.length < MAX_EXAMPLES) lineBreakEx.push({ row: r, col: c, value: snippet(s) });
      }
    }
    if ((r & (BATCH_ROWS - 1)) === BATCH_ROWS - 1) {
      throwIfCancelled(options.cancel);
      options.onProgress?.(r + 1, rows);
      await yieldToEventLoop();
    }
  }

  // ---- A: encoding
  if (unreadable.total) {
    const arr = unreadable.toArray();
    add(
      {
        id: "unreadable-characters",
        severity: "error",
        title: "Characters that couldn't be read",
        count: unreadable.total,
        unit: "cells",
        explanation: `${plural(unreadable.total, "cell")} contain characters that couldn't be read with the ${meta.encoding.toUpperCase()} text encoding. They are shown as “�”, and the original characters (often accented letters) are lost in that reading. The file may use a different encoding.`,
        howToFix:
          "Save the file again from the program that created it, choosing “CSV UTF-8”. If you know the file's encoding (for example Windows-1252 from older Excel versions on Windows), open it with that encoding instead.",
        examples: unreadableEx,
      },
      { rows: rowsOfCells(arr), cells: arr },
    );
  }

  // ---- B: separator
  const delimiterIssue = sheet.issues.some((i) => i.code === "delimiter-undetected");
  const dataRows = Math.max(0, rows - firstData);
  if (expectedFields <= 1 && dataRows > 0) {
    // One column: maybe the separator wasn't recognised.
    let suggestion: string | null = null;
    let best = 0;
    for (const cand of [...DELIMITER_CANDIDATES, ":"]) {
      if (cand === delimiter) continue;
      let hits = 0;
      for (let r = firstData; r < Math.min(rows, firstData + 1000); r++) if (cellText(sheet, r, 0).includes(cand)) hits++;
      if (hits > best) [best, suggestion] = [hits, cand];
    }
    const sample = Math.min(dataRows, 1000);
    if (suggestion && best >= sample * 0.8) {
      add({
        id: "single-column",
        severity: "warning",
        title: "The file reads as a single column",
        count: 1,
        unit: "columns",
        explanation: `Every row was read as one column using the ${sepName(delimiter)}, but most rows contain ${sepName(suggestion)} characters. The file probably uses ${sepName(suggestion)} as its separator.`,
        howToFix: `Choose ${sepName(suggestion)} in the “Column separator” box above and check the columns again.`,
      });
    }
  } else if (delimiterIssue) {
    add({
      id: "separator-uncertain",
      severity: "warning",
      title: "Column separator not certain",
      count: 1,
      unit: "columns",
      explanation: `DataFixer chose the ${sepName(delimiter)} as the separator, but the rows don't agree well on the number of columns, so this may be wrong.`,
      howToFix: "Check that the columns in the preview look right. If not, choose the separator yourself in the “Column separator” box above.",
    });
  }
  if (sep !== null) {
    add({
      id: "sep-line",
      severity: "note",
      title: "First line is an Excel “sep=” hint",
      count: 1,
      explanation: `The first line (“sep=${sep}”) only tells Excel which separator the file uses. Other programs (Google Sheets, databases, code) read it as a row of data, which shifts the column names down by one row.`,
      howToFix: "If the file isn't only for Excel, delete the first line so that the column names are the first row.",
      examples: [{ row: 0, col: 0, value: `sep=${sep}` }],
    }, { rows: Uint32Array.of(0) });
  }

  // ---- C: row lengths (always an error, decision 5)
  if (uneven.size) {
    const dist = [...unevenFreq].sort((a, b) => b[1] - a[1]).map(([n, f]) => `${plural(f, "row")} with ${n.toLocaleString("en-US")}`).join(", ");
    const anyShort = [...unevenFreq.keys()].some((n) => n < expectedFields);
    const anyLong = [...unevenFreq.keys()].some((n) => n > expectedFields);
    add(
      {
        id: "uneven-rows",
        severity: "error",
        title: "Rows with the wrong number of fields",
        count: uneven.size,
        explanation: `${plural(uneven.size, "row")} ${uneven.size === 1 ? "doesn't" : "don't"} have ${plural(expectedFields, "field")} like ${headerRow ? "the header row" : "most rows"} (${dist}). Most programs either refuse the file or put values in the wrong columns.${anyShort ? " A short row can be a row with missing values at the end, but it can also mean values have shifted into the wrong columns, so check these rows before filling them." : ""}${anyLong ? ` ${extraAllEmpty ? "The extra fields are all empty (usually an extra separator at the end of the line)." : "Rows with extra values usually contain a separator inside a value that should have been in quotes."}` : ""}`,
        howToFix: `Compare these rows with the original data. ${anyShort ? "If values are simply missing at the end, the row can be filled with empty cells. " : ""}${anyLong ? (extraAllEmpty ? "Empty extra fields can be removed. " : "For extra values, put the value that contains the separator in double quotes, or fix it in the program that created the file. ") : ""}`.trim(),
        examples: unevenEx,
      },
      { rows: uneven.toArray() },
    );
  }

  // ---- D: column names (only when the first row holds column names, decision 5)
  if (headerRow && rows > headerIndex) {
    const names = Array.from({ length: g.rowLength(headerIndex) }, (_, c) => cellText(sheet, headerIndex, c));
    const headerOnlyRow = Uint32Array.of(headerIndex);
    const headerCells = (cols: number[]) => Float64Array.from(cols.map((c) => cellKey(headerIndex, c)));
    const empty = names.map((n, c) => (n.trim() === "" ? c : -1)).filter((c) => c >= 0);
    // A trailing separator on every line makes the last name empty; that's reported as check I instead.
    const trailingOnly = empty.length === 1 && empty[0] === names.length - 1 && rowsAtWidth > 0 && trailingEmpty === rowsAtWidth;
    if (empty.length && !trailingOnly) {
      add(
        {
          id: "empty-header",
          severity: "error",
          title: "Columns without a name",
          count: empty.length,
          unit: "columns",
          explanation: `${plural(empty.length, "column")} (${empty.map(columnLetter).join(", ")}) ${empty.length === 1 ? "has" : "have"} no name in the header row. Databases and many import tools need every column to have a name.`,
          howToFix: "Type a short, unique name for each of these columns in the header row.",
          columns: empty.map((c) => ({ index: c, name: `Column ${columnLetter(c)}`, count: 1 })),
          examples: empty.slice(0, MAX_EXAMPLES).map((c) => ({ row: headerIndex, col: c, value: "", note: "No name" })),
        },
        { rows: headerOnlyRow, cells: headerCells(empty) },
      );
    }
    const byName = new Map<string, number[]>();
    names.forEach((n, c) => {
      const key = n.trim().toLowerCase();
      if (!key) return;
      byName.set(key, [...(byName.get(key) ?? []), c]);
    });
    const dups = [...byName.values()].filter((cs) => cs.length > 1);
    if (dups.length) {
      const extra = dups.reduce((n, cs) => n + cs.length - 1, 0);
      const cols = dups.flat();
      add(
        {
          id: "duplicate-header",
          severity: "error",
          title: "Duplicate column names",
          count: extra,
          unit: "columns",
          explanation: `${plural(dups.length, "name")} ${dups.length === 1 ? "is" : "are"} used for more than one column (${dups.map((cs) => `“${names[cs[0]!]!.trim()}” in ${cs.map(columnLetter).join(", ")}`).join("; ")}). Names are compared ignoring capitals and spaces at the edges. Databases and many tools need unique names, and lookups by name pick the wrong column.`,
          howToFix: "Rename the extra columns so every name is unique, for example “email” and “email (2)”, or remove a column that is a copy.",
          columns: cols.map((c) => ({ index: c, name: names[c]!.trim(), count: 1 })),
          examples: dups.flatMap((cs) => cs.slice(1)).slice(0, MAX_EXAMPLES).map((c) => ({ row: headerIndex, col: c, value: names[c]!, note: `Same as column ${columnLetter(byName.get(names[c]!.trim().toLowerCase())![0]!)}` })),
        },
        { rows: headerOnlyRow, cells: headerCells(cols) },
      );
    }
    const spaced = names.map((n, c) => (n.trim() !== "" && n !== n.trim() ? c : -1)).filter((c) => c >= 0);
    if (spaced.length) {
      add(
        {
          id: "header-spaces",
          severity: "warning",
          title: "Spaces around column names",
          count: spaced.length,
          unit: "columns",
          explanation: `${plural(spaced.length, "column name")} start or end with spaces, so “email ” and “email” don't match when a program looks a column up by name.`,
          howToFix: "Remove the spaces at the start and end of these column names.",
          examples: spaced.slice(0, MAX_EXAMPLES).map((c) => ({ row: headerIndex, col: c, value: `“${names[c]!.replace(/^\s+|\s+$/g, (m) => "·".repeat(m.length))}”` })),
        },
        { rows: headerOnlyRow, cells: headerCells(spaced) },
      );
    }
    const long = names.map((n, c) => (n.trim().length > LONG_HEADER ? c : -1)).filter((c) => c >= 0);
    if (long.length) {
      add(
        {
          id: "long-header",
          severity: "note",
          title: "Very long column names",
          count: long.length,
          unit: "columns",
          explanation: `${plural(long.length, "column name")} ${long.length === 1 ? "is" : "are"} longer than ${LONG_HEADER} characters. Some databases limit names to 64 characters, and long names are hard to use.`,
          howToFix: "Shorten these names. Longer descriptions can go in a separate document.",
          examples: long.slice(0, MAX_EXAMPLES).map((c) => ({ row: headerIndex, col: c, value: snippet(names[c]!), note: `${names[c]!.trim().length} characters` })),
        },
        { rows: headerOnlyRow, cells: headerCells(long) },
      );
    }
    if (namesLookLikeData(names)) {
      add(
        {
          id: "header-not-names",
          severity: "warning",
          title: "The first row may be data, not column names",
          count: 1,
          explanation: "“First row contains column names” is ticked, but the first row looks like data (it has numbers, empty cells or repeated values). If it is data, the file has no header row, which many import tools expect.",
          howToFix: "If the first row is data, untick “First row contains column names” to check the file without a header, and add a header row to the file if the program you import into needs one.",
        },
        { rows: headerOnlyRow },
      );
    }
  }

  // ---- E: quoting (facts from reading the file)
  const unclosed = sheet.issues.filter((i) => i.code === "unclosed-quote");
  if (unclosed.length) {
    add(
      {
        id: "unclosed-quote",
        severity: "error",
        title: "A quote that never closes",
        count: unclosed.length,
        explanation: `A value starts with a double quote (") that is never closed, so everything after it — possibly the rest of the file — was read as one value. ${unclosed[0]!.row !== null ? `It starts on ${rowLabel(unclosed[0]!.row)}.` : ""} Where the value was meant to end can't be known, so this can't be repaired automatically.`,
        howToFix: "Open the file in a text editor, find the quote on that row and add the missing closing quote (or remove the stray one). Then open the file again.",
        examples: unclosed.slice(0, MAX_EXAMPLES).filter((i) => i.row !== null).map((i) => ({ row: i.row!, col: 0, value: "", note: "Quote opened here" })),
      },
      { rows: Uint32Array.from(unclosed.filter((i) => i.row !== null).map((i) => i.row!)) },
    );
  }
  const strayRows = [...new Set(sheet.issues.filter((i) => i.code === "invalid-quotes" && i.row !== null && !unclosedRows.has(i.row)).map((i) => i.row!))].sort((a, b) => a - b);
  const stray = strayRows.map((row) => ({ row }));
  if (stray.length) {
    add(
      {
        id: "stray-quotes",
        severity: "warning",
        title: "Quote characters in unexpected places",
        count: stray.length,
        explanation: `${plural(stray.length, "row")} ${stray.length === 1 ? "has" : "have"} a double quote (") inside a value that isn't wrapped in quotes, or text right after a closing quote. Programs read these rows differently, so values may be split or joined.`,
        howToFix: 'Wrap values that contain quotes in double quotes and write each quote inside them twice: He said "hi" becomes "He said ""hi""".',
        examples: stray.slice(0, MAX_EXAMPLES).map((i) => ({ row: i.row, col: 0, value: "", note: "Unexpected quote" })),
      },
      { rows: Uint32Array.from(strayRows) },
    );
  }
  if (lineBreaks.total) {
    const arr = lineBreaks.toArray();
    add(
      {
        id: "line-breaks-in-cells",
        severity: "note",
        title: "Values that contain line breaks",
        count: lineBreaks.total,
        unit: "cells",
        explanation: `${plural(lineBreaks.total, "value")} contain a line break inside quotes. That is valid CSV, but some programs (and simple scripts that read line by line) split these values into separate rows. In the examples, ↵ marks a line break.`,
        howToFix: "If the program you import into can't handle them, replace the line breaks inside values with a space or another character.",
        examples: lineBreakEx,
      },
      { rows: rowsOfCells(arr), cells: arr },
    );
  }

  // ---- F: line endings (facts about the original file)
  if (meta.lineEnding === "mixed") {
    add({
      id: "mixed-line-endings",
      severity: "warning",
      title: "Mixed line endings",
      count: 1,
      explanation: "Lines end in different ways in this file (Windows-style CRLF on some lines, Unix-style LF or old Mac-style CR on others). Most programs cope, but some import tools and scripts count rows wrongly or add blank rows.",
      howToFix: "Download the file from DataFixer: every line then ends the same way.",
      examples: lineEndingExamples(meta),
    });
  } else if (meta.lineEnding === "\r") {
    add({
      id: "old-mac-line-endings",
      severity: "warning",
      title: "Old Mac line endings",
      count: 1,
      explanation: "Lines end with a single CR character (old Mac OS style). Many current programs don't recognise this and read the whole file as one line.",
      examples: lineEndingExamples(meta),
      howToFix: "Download the file from DataFixer: lines then end with Windows-style CRLF, which every program reads.",
    });
  }
  if (blank.size) {
    add(
      {
        id: "blank-lines",
        severity: "warning",
        title: "Blank lines",
        count: blank.size,
        explanation: `${plural(blank.size, "line")} ${blank.size === 1 ? "is" : "are"} empty. Many import tools create an empty record for each, or stop reading at the first one.`,
        howToFix: "Remove the blank lines unless they are deliberate.",
        examples: Array.from(blank.toArray().slice(0, MAX_EXAMPLES), (row) => ({ row, col: 0, value: "" })),
      },
      { rows: blank.toArray() },
    );
  }
  if (meta.finalLineBreak === false && rows > 0) {
    add({
      id: "no-final-line-break",
      severity: "note",
      title: "No line break at the end of the file",
      count: 1,
      explanation: "The last line doesn't end with a line break. Most programs read it fine, but some command-line tools ignore the last row or join it with the next file.",
      howToFix: "Download the file from DataFixer: every line, including the last, then ends with a line break.",
    });
  }

  // ---- G: control characters and formula-like values
  if (control.total) {
    const arr = control.toArray();
    add(
      {
        id: "control-characters",
        severity: "error",
        title: "Hidden control characters",
        count: control.total,
        unit: "cells",
        explanation: `${plural(control.total, "cell")} contain invisible control characters (such as NUL, bell or backspace). They are usually left over from copying or a broken export, and many databases and import tools stop with an error when they meet them. In the examples, ␀ marks where they are.`,
        howToFix: "Remove these characters. They carry no visible text, so removing them doesn't change what the values look like.",
        examples: controlEx,
      },
      { rows: rowsOfCells(arr), cells: arr },
    );
  }
  if (formulaLike.total) {
    const arr = formulaLike.toArray();
    add(
      {
        id: "formula-like",
        severity: "warning",
        title: "Values that start like formulas",
        count: formulaLike.total,
        unit: "cells",
        explanation: `${plural(formulaLike.total, "value")} start with =, +, - or @. When the file is opened in a spreadsheet app, these can be run as formulas, which can change the value or, in files from unknown sources, be used to attack the computer (“CSV injection”). Phone numbers such as “+44 …” also start with +.`,
        howToFix: "If these are plain text, put an apostrophe (') in front of each value before sharing the file with others, or make sure the program importing the file treats them as text.",
        examples: formulaEx,
      },
      { rows: rowsOfCells(arr), cells: arr },
    );
  }

  // ---- H: import limits
  if (rows > EXCEL_MAX_ROWS) {
    add({
      id: "too-many-rows",
      severity: "warning",
      title: "Too many rows for Excel",
      count: rows - EXCEL_MAX_ROWS,
      explanation: `The file has ${rows.toLocaleString("en-US")} rows. Excel shows at most ${EXCEL_MAX_ROWS.toLocaleString("en-US")} rows per sheet, so the last ${(rows - EXCEL_MAX_ROWS).toLocaleString("en-US")} would be cut off without much warning. Google Sheets has an even lower limit (10 million cells in total).`,
      howToFix: "Split the file into several files, or import it into a database or a tool built for large data.",
    });
  }
  const widest = Math.max(expectedFields, ...[...unevenFreq.keys()]);
  if (widest > EXCEL_MAX_COLUMNS) {
    add({
      id: "too-many-columns",
      severity: "warning",
      title: "Too many columns for Excel",
      count: widest - EXCEL_MAX_COLUMNS,
      unit: "columns",
      explanation: `Some rows have ${widest.toLocaleString("en-US")} fields. Excel shows at most ${EXCEL_MAX_COLUMNS.toLocaleString("en-US")} columns, so the rest would be lost.`,
      howToFix: "Split the columns into several files, or import the file into a tool built for wide data.",
    });
  }
  if (tooLong.total) {
    const arr = tooLong.toArray();
    add(
      {
        id: "cell-too-long",
        severity: "warning",
        title: "Values too long for one Excel cell",
        count: tooLong.total,
        unit: "cells",
        explanation: `${plural(tooLong.total, "value")} ${tooLong.total === 1 ? "is" : "are"} longer than ${EXCEL_MAX_CELL_CHARS.toLocaleString("en-US")} characters, the most one Excel cell can hold. Excel cuts them off. (This can also happen when a quote is never closed.)`,
        howToFix: "Check that these values are meant to be this long. If so, keep them in a tool that allows long text, or split them across several cells.",
        examples: tooLongEx,
      },
      { rows: rowsOfCells(arr), cells: arr },
    );
  }

  // ---- I: trailing separators
  if (rowsAtWidth >= 2 && trailingEmpty === rowsAtWidth) {
    const lastName = headerRow && rows > headerIndex ? cellText(sheet, headerIndex, expectedFields - 1).trim() : "";
    if (lastName === "") {
      add({
        id: "trailing-separators",
        severity: "note",
        title: "Every line ends with an extra separator",
        count: rowsAtWidth,
        explanation: `Every line ends with a ${sepName(delimiter)}, which creates an empty column ${columnLetter(expectedFields - 1)} at the end${headerRow ? " (without a name)" : ""}. Usually harmless, but some programs add an unnamed empty column.`,
        howToFix: "Remove the empty last column before importing, or remove the separator at the end of each line in the program that created the file.",
        columns: [{ index: expectedFields - 1, name: `Column ${columnLetter(expectedFields - 1)}`, count: 0 }],
        examples: firstRowsAtWidth.map((row) => ({ row, col: expectedFields - 1, value: "", note: "Ends with a separator" })),
      }, { columns: [expectedFields - 1] });
    }
  }

  findings.sort((a, b) => SEVERITY_ORDER[a.issue.severity] - SEVERITY_ORDER[b.issue.severity] || b.issue.count - a.issue.count);
  const issues = findings.map((f) => f.issue);
  const checks: ValidationCheck[] = (Object.keys(CHECK_LABELS) as CheckId[]).map((id) => {
    const worst = issues.filter((i) => ISSUE_CHECK[i.id] === id).reduce<"pass" | Severity>((w, i) => (w === "pass" || SEVERITY_ORDER[i.severity] < SEVERITY_ORDER[w] ? i.severity : w), "pass");
    return { id, label: CHECK_LABELS[id], status: worst };
  });
  const errors = issues.filter((i) => i.severity === "error").length;
  const warnings = issues.filter((i) => i.severity === "warning").length;
  const notes = issues.length - errors - warnings;
  const limits = issues.some((i) => ISSUE_CHECK[i.id] === "limits");
  const importReady = errors
    ? `Will not import cleanly: ${issues.filter((i) => i.severity === "error").map((i) => i.title.toLowerCase()).join("; ")}.`
    : limits
      ? "Structurally valid, but too large for Excel (see the limits below)."
      : warnings
        ? "Structurally valid. It should import into Excel and Google Sheets; check the warnings below first."
        : "Ready for Excel, Google Sheets and databases.";
  throwIfCancelled(options.cancel);
  options.onProgress?.(rows, rows);
  return {
    result: {
      rows,
      expectedFields,
      headerRow,
      firstDataRow: firstData,
      issues,
      checks,
      verdict: { valid: errors === 0, errors, warnings, notes, importReady },
      file: { encoding: meta.encoding, hadBom: meta.hadBom, delimiter, lineEnding: meta.lineEnding, finalLineBreak: meta.finalLineBreak ?? true },
      timings: { totalMs: Date.now() - t0 },
    },
    findings,
  };
}

function rowsOfCells(cells: Float64Array): Uint32Array {
  const rows = new RowList();
  for (const k of cells) rows.add(Math.floor(k / 16384));
  return rows.toArray();
}

const DATA_LIKE = [
  /^[-+]?[\d.,\s]*\d[\d.,\s]*%?$/, // numbers
  /^\d{1,4}[-/.]\d{1,2}[-/.]\d{1,4}([ T]\d{1,2}:\d{2}(:\d{2})?)?$/, // dates
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // email addresses
];

/** The "column names" look like a row of data: at least half are numbers, dates or email addresses. */
export function namesLookLikeData(names: string[]): boolean {
  const nonEmpty = names.map((n) => n.trim()).filter((n) => n !== "");
  if (nonEmpty.length === 0) return false;
  const dataLike = nonEmpty.filter((n) => DATA_LIKE.some((re) => re.test(n))).length;
  return dataLike >= Math.max(1, Math.ceil(nonEmpty.length / 2));
}

const ENDING_NAMES = { crlf: "CRLF (Windows)", lf: "LF (Unix, Mac)", cr: "CR (old Mac)" } as const;

/** One example per line-ending type: the first row that ends that way. */
function lineEndingExamples(meta: CsvMeta): NonNullable<ScanIssue["examples"]> {
  const rows = meta.lineEndingRows ?? {};
  return (Object.keys(ENDING_NAMES) as (keyof typeof ENDING_NAMES)[])
    .filter((k) => rows[k] !== undefined)
    .map((k) => ({ row: rows[k]!, col: 0, value: "", note: `First line ending with ${ENDING_NAMES[k]}` }))
    .sort((a, b) => a.row - b.row);
}

/** Problems whose examples show the line as written in the file. */
export const RAW_LINE_ISSUES = new Set([
  "uneven-rows",
  "unclosed-quote",
  "stray-quotes",
  "line-breaks-in-cells",
  "control-characters",
  "trailing-separators",
  "sep-line",
  "mixed-line-endings",
  "old-mac-line-endings",
  "header-spaces",
  "empty-header",
  "duplicate-header",
]);

/**
 * Add the raw line from the original file to the examples of RAW_LINE_ISSUES
 * (Stage 5 Step 2). Only valid while the data is unchanged: after a change, row
 * numbers no longer match the file, so callers skip this.
 */
export async function attachRawLines(
  issues: ScanIssue[],
  file: Blob,
  meta: CsvMeta,
  cancel?: CancelToken,
  onProgress?: (loaded: number, total: number) => void,
): Promise<void> {
  const rows = new Set<number>();
  for (const i of issues) if (RAW_LINE_ISSUES.has(i.id)) for (const e of i.examples ?? []) rows.add(e.row);
  if (rows.size === 0) return;
  const raw = await readRawLines(file, meta, rows, { cancel, onProgress });
  for (const i of issues) {
    if (!RAW_LINE_ISSUES.has(i.id)) continue;
    for (const e of i.examples ?? []) {
      const r = raw.get(e.row);
      if (r) e.raw = r;
    }
  }
}
