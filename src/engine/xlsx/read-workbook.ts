/**
 * Excel cell reader (XLSX and XLS → SheetModel) using the official SheetJS
 * Community Edition 0.20.3, vendored in vendor/ (see vendor/README.md).
 *
 * Safety and accuracy:
 * - XLSX files have already passed inspect.ts (size limits, no DOCTYPE, sheet list).
 * - Formulas are read as text and never calculated or executed; macros (VBA)
 *   are not extracted (bookVBA: false); external links are never fetched.
 * - Only the requested sheet is parsed for XLSX. SheetJS parses every sheet of
 *   an XLS file; the others are released immediately.
 * - SheetJS's cell objects are released row by row while converting, to keep
 *   peak memory down. Number formats are applied only when a cell is shown.
 * - SheetJS 0.20.3 mis-decodes numeric character references above U+FFFF
 *   (e.g. "&#128512;" → U+F600). inspect.ts finds them; characters that can be
 *   restored unambiguously are restored here and the user is told.
 */
import type * as XLSXTypes from "xlsx";
import { EngineError, isOutOfMemory, OUT_OF_MEMORY_MESSAGE } from "../errors.ts";
import { throwIfCancelled, type CancelToken } from "../cancel.ts";
import { cellKey, createSheet, type CellValue, type SheetInfo, type SheetModel } from "../types.ts";
import { WorkbookGrid } from "../grid.ts";
import { tooLargeForDevice } from "../csv/parse-csv.ts";
import type { InspectionResult } from "./inspect.ts";

type XLSXModule = typeof XLSXTypes;

export const EXCEL_READER_AVAILABLE = true;

let xlsxModule: Promise<XLSXModule> | null = null;
let codepagesLoaded = false;

/** Load SheetJS only when an Excel file is opened (keeps CSV processing light). */
async function loadSheetJS(withCodepages: boolean): Promise<XLSXModule> {
  xlsxModule ??= import("xlsx") as Promise<XLSXModule>;
  const XLSX = await xlsxModule;
  if (withCodepages && !codepagesLoaded) {
    // Legacy .xls files may store text in Windows code pages; SheetJS needs these tables to decode them.
    const cptable = await import("xlsx/dist/cpexcel.full.mjs");
    XLSX.set_cptable(cptable);
    codepagesLoaded = true;
  }
  return XLSX;
}

/** Excel error codes as stored by SheetJS (cell type "e"). */
export const EXCEL_ERRORS: Record<number, string> = {
  0x00: "#NULL!",
  0x07: "#DIV/0!",
  0x0f: "#VALUE!",
  0x17: "#REF!",
  0x1d: "#NAME?",
  0x24: "#NUM!",
  0x2a: "#N/A",
  0x2b: "#GETTING_DATA",
};

export interface ReadSheetOptions {
  /** Position of the sheet in the workbook (SheetJS selects by index). */
  sheetIndex: number;
  inspection: InspectionResult | null;
  memoryBudgetBytes?: number;
  cancel?: CancelToken;
  onProgress?: (phase: "reading" | "parsing" | "indexing", loaded: number | null, total: number | null) => void;
}

export interface ExcelReadResult {
  sheet: SheetModel;
  /** For XLS (no inspection): the sheets discovered while reading. */
  sheets: SheetInfo[] | null;
  warnings: string[];
  stats: { cells: number; formulas: number; formulasWithoutResult: number; repairedCharacters: number };
}

/**
 * Peak memory needed to parse, estimated before reading anything.
 * Calibrated with measurements (docs/stage-2-test-report.md): SheetJS
 * decompresses EVERY part of the workbook (even when asked for one sheet),
 * holds XML parts as strings (~2 bytes per byte), binary parts as-is, and
 * about 100 bytes per parsed cell. Typical Excel XML uses ~30 bytes per cell.
 */
export const XLSX_BYTES_PER_CELL = 100;
export const XLSX_XML_BYTES_PER_CELL = 30;
/**
 * SheetJS parses EVERY sheet of an .xls file (it ignores the `sheets` option
 * for this format). Measured: a 50 MB .xls (6 sheets, 3.1M cells) peaked at
 * 2.0 GB = 40× the file size, with or without styles.
 */
export const XLS_FILE_MULTIPLIER = 42;

export function estimateExcelMemory(fileBytes: number, format: "xlsx" | "xls", inspection: InspectionResult | null, sheetIndex: number): number {
  if (format === "xls" || !inspection) return fileBytes * XLS_FILE_MULTIPLIER;
  const s = inspection.sheets[sheetIndex];
  const sheetXml = s?.uncompressedBytes ?? 0;
  let cells = Math.ceil(sheetXml / XLSX_XML_BYTES_PER_CELL);
  const dim = s?.dimension?.match(/^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/i);
  if (dim && dim[3] && dim[4]) {
    const col = (x: string) => [...x.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
    const declared = (Number(dim[4]) - Number(dim[2]) + 1) * (col(dim[3]) - col(dim[1]!) + 1);
    if (declared > 0) cells = Math.min(cells, declared);
  }
  return fileBytes + inspection.xmlBytes * 2 + inspection.binaryBytes + cells * XLSX_BYTES_PER_CELL;
}

function mapReadError(err: unknown): EngineError {
  if (err instanceof EngineError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/password|encrypt/i.test(msg)) {
    return new EngineError(
      "encrypted-file",
      "This workbook is password-protected (encrypted), so it can't be opened. Remove the password in Excel and save it again, then try once more.",
      msg,
    );
  }
  if (err instanceof RangeError && /string length/i.test(msg)) {
    return new EngineError(
      "too-large-for-engine",
      "This sheet contains more data than a web browser can read in one piece. Try saving it as CSV, or splitting it into smaller sheets.",
      msg,
    );
  }
  if (isOutOfMemory(err)) return new EngineError("out-of-memory", OUT_OF_MEMORY_MESSAGE, msg);
  return new EngineError("corrupt-file", "This Excel file could not be read. It may be damaged or saved in an unusual format. Try opening it in Excel and saving it again.", msg);
}

function repairText(s: string, repair: Map<string, string>, counter: { n: number }): string {
  if (repair.size === 0) return s;
  let out: string | null = null;
  for (let i = 0; i < s.length; i++) {
    const fixed = repair.get(s[i]!);
    if (fixed !== undefined) {
      out ??= s.slice(0, i);
      out += fixed;
      counter.n++;
    } else if (out !== null) out += s[i];
  }
  return out ?? s;
}

interface SheetJSCell {
  t: "s" | "n" | "b" | "e" | "d" | "z";
  v?: unknown;
  f?: string;
  z?: string | number;
  l?: { Target?: string };
  c?: unknown[];
}

export async function readExcelSheet(file: Blob, format: "xlsx" | "xls", options: ReadSheetOptions): Promise<ExcelReadResult> {
  const { sheetIndex, inspection, cancel } = options;
  const need = estimateExcelMemory(file.size, format, inspection, sheetIndex);
  if (options.memoryBudgetBytes && need > options.memoryBudgetBytes) {
    if (format === "xls") {
      const mb = Math.ceil(need / (1024 * 1024) / 10) * 10;
      throw new EngineError(
        "too-large-for-engine",
        `Older Excel 97–2003 (.xls) files need much more memory to open than newer ones: this one needs roughly ${mb.toLocaleString("en-US")} MB, more than this browser allows. Nothing was changed. Open it in Excel and save it as .xlsx (which needs far less memory), or as CSV, then try again.`,
        `estimated ${need} bytes`,
      );
    }
    throw tooLargeForDevice(need);
  }

  options.onProgress?.("reading", 0, file.size);
  const XLSX = await loadSheetJS(format === "xls");
  throwIfCancelled(cancel);
  let buffer: Uint8Array | null = new Uint8Array(await file.arrayBuffer());
  options.onProgress?.("parsing", null, null);

  let wb: XLSXTypes.WorkBook | null;
  try {
    wb = XLSX.read(buffer, {
      type: "array",
      dense: true,
      sheets: format === "xlsx" ? [sheetIndex] : undefined,
      cellFormula: true,
      cellNF: true,
      // Styles slow SheetJS ~9× (measured). XLSX layout (widths, hidden rows/columns,
      // heights) comes from the safety inspection instead; XLS needs SheetJS for it.
      cellStyles: format === "xls",
      // Keep cells without a stored value: otherwise SheetJS drops formulas
      // that have no saved result (verified with openpyxl files).
      sheetStubs: true,
      cellText: false, // formatted text is produced on demand, not stored per cell
      cellHTML: false,
      cellDates: false,
      bookVBA: false,
      WTF: false,
    });
  } catch (err) {
    throw mapReadError(err);
  } finally {
    buffer = null; // release the file copy before converting
  }
  throwIfCancelled(cancel);

  const names = wb.SheetNames;
  const wbSheets = (wb.Workbook?.Sheets ?? []) as { Hidden?: number }[];
  let sheets: SheetInfo[] | null = null;
  if (format === "xls") {
    sheets = names.map((name, i) => {
      const ws = wb!.Sheets[name] as Record<string, unknown> | undefined;
      const hidden = wbSheets[i]?.Hidden ?? 0;
      const type = ws?.["!type"];
      return {
        name,
        state: hidden === 2 ? "veryHidden" : hidden === 1 ? "hidden" : "visible",
        kind: type === "chart" ? "chartsheet" : type && type !== "sheet" ? "other" : "worksheet",
      };
    });
  }
  const sheetName = names[sheetIndex];
  if (sheetName === undefined) throw new EngineError("sheet-not-found", "That sheet could not be found in this file.");
  const ws = wb.Sheets[sheetName] as Record<string, unknown> | undefined;
  // Release every other parsed sheet (XLS parses them all).
  for (const n of names) if (n !== sheetName) delete wb.Sheets[n];
  const date1904 = Boolean((wb.Workbook as { WBProps?: { date1904?: boolean } } | undefined)?.WBProps?.date1904);
  wb = null;

  const displayName = inspection?.sheets[sheetIndex]?.name ?? sheetName;
  const sheet = createSheet(displayName);
  const repair = new Map(Object.entries(inspection?.astralRefs.repair ?? {}));
  const repaired = { n: 0 };
  const data = (ws?.["!data"] ?? []) as (SheetJSCell[] | undefined)[];
  const rows: (CellValue[] | undefined)[] = new Array(data.length);
  const formatIds: (Uint16Array | undefined)[] = new Array(data.length);
  const formatTable: string[] = ["General"];
  const formatIndex = new Map<string, number>([["General", 0]]);
  let columnCount = 0;
  let cells = 0;
  let formulasWithoutResult = 0;
  let stringChars = 0;

  for (let r = 0; r < data.length; r++) {
    const src = data[r];
    if (!src) continue;
    const values: CellValue[] = new Array(src.length);
    let fmts: Uint16Array | undefined;
    for (let c = 0; c < src.length; c++) {
      const cell = src[c];
      if (!cell) continue;
      cells++;
      const key = cellKey(r, c);
      let v: CellValue = null;
      switch (cell.t) {
        case "s":
          v = repairText(String(cell.v ?? ""), repair, repaired);
          stringChars += v.length;
          break;
        case "n":
          v = typeof cell.v === "number" ? cell.v : Number(cell.v);
          break;
        case "b":
          v = Boolean(cell.v);
          break;
        case "e": {
          const text = EXCEL_ERRORS[cell.v as number] ?? "#ERROR!";
          v = text;
          sheet.errors.set(key, text);
          break;
        }
        case "d":
          v = cell.v instanceof Date ? cell.v.toISOString() : String(cell.v ?? "");
          break;
        default:
          v = null; // "z": stub / formula without a stored result
      }
      if (v !== null) values[c] = v;
      if (cell.f) {
        sheet.formulas.set(key, repairText(cell.f, repair, repaired));
        if (cell.t === "z" || cell.v === undefined) formulasWithoutResult++;
      }
      const z = typeof cell.z === "number" ? XLSX.SSF.get_table()[cell.z] : cell.z;
      if (z && z !== "General") {
        let id = formatIndex.get(z);
        if (id === undefined && formatTable.length < 65535) {
          id = formatTable.length;
          formatTable.push(z);
          formatIndex.set(z, id);
        }
        if (id !== undefined) (fmts ??= new Uint16Array(src.length))[c] = id;
      }
      if (cell.l?.Target) sheet.hyperlinks.set(key, cell.l.Target);
    }
    rows[r] = values;
    formatIds[r] = fmts;
    if (src.length > columnCount) columnCount = src.length;
    data[r] = undefined; // release SheetJS's cell objects as we go
    if ((r & 0x3fff) === 0) {
      options.onProgress?.("indexing", r, data.length);
      throwIfCancelled(cancel);
    }
  }

  for (const m of (ws?.["!merges"] ?? []) as { s: { r: number; c: number }; e: { r: number; c: number } }[]) {
    sheet.merges.push({ startRow: m.s.r, startCol: m.s.c, endRow: m.e.r, endCol: m.e.c });
  }
  const layout = inspection?.sheets[sheetIndex]?.layout;
  if (layout) {
    for (const r of layout.hiddenRows) sheet.hiddenRows.add(r);
    for (const [r, h] of layout.rowHeights) sheet.rowHeights.set(r, h);
    for (const c of layout.hiddenColumns) sheet.hiddenColumns.add(c);
    for (const [c, w] of layout.columnWidths) sheet.columnWidths.set(c, w);
  } else {
    ((ws?.["!rows"] ?? []) as ({ hidden?: boolean; hpt?: number } | undefined)[]).forEach((info, i) => {
      if (!info) return;
      if (info.hidden) sheet.hiddenRows.add(i);
      if (typeof info.hpt === "number") sheet.rowHeights.set(i, info.hpt);
    });
    ((ws?.["!cols"] ?? []) as ({ hidden?: boolean; wch?: number; width?: number } | undefined)[]).forEach((info, i) => {
      if (!info) return;
      if (info.hidden) sheet.hiddenColumns.add(i);
      const w = info.width ?? info.wch;
      if (typeof w === "number") sheet.columnWidths.set(i, w);
    });
  }

  const SSF = XLSX.SSF;
  sheet.grid = new WorkbookGrid(
    rows,
    formatIds,
    formatTable,
    (fmt, value) => SSF.format(fmt, value, { date1904 }),
    rows.length * 64 + cells * 16 + stringChars * 2,
    (fmt) => SSF.is_date(fmt),
  );
  // Use the sheet's declared used range too (e.g. a merged range ending in empty cells).
  const ref = typeof ws?.["!ref"] === "string" ? XLSX.utils.decode_range(ws["!ref"] as string) : null;
  sheet.columnCount = Math.max(columnCount, ref ? ref.e.c + 1 : 0);

  const warnings: string[] = [];
  if (formulasWithoutResult > 0) {
    warnings.push(
      `${formulasWithoutResult.toLocaleString("en-US")} formula cell${formulasWithoutResult > 1 ? "s have" : " has"} no saved result (the file was saved by a program that doesn't calculate formulas), so ${formulasWithoutResult > 1 ? "they are" : "it is"} shown empty. DataFixer never calculates formulas.`,
    );
  }
  if (repaired.n > 0) {
    warnings.push(
      `${repaired.n.toLocaleString("en-US")} character${repaired.n > 1 ? "s" : ""} such as emoji ${repaired.n > 1 ? "were" : "was"} stored in a way the Excel reader decodes incorrectly; DataFixer restored ${repaired.n > 1 ? "them" : "it"} from the original file.`,
    );
  }
  if ((inspection?.astralRefs.ambiguous ?? 0) > 0) {
    warnings.push("Some characters such as emoji in this file could not be decoded reliably and may look wrong in the preview. Your original file is unchanged.");
  }

  return { sheet, sheets, warnings, stats: { cells, formulas: sheet.formulas.size, formulasWithoutResult, repairedCharacters: repaired.n } };
}
