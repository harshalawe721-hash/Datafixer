/**
 * Stage 6, Step 1: write a NEW Excel workbook (.xlsx) from scratch.
 *
 * - Cells: text (inline strings, so no large shared-string table is held in
 *   memory), numbers, and dates (numbers with a date format). Formula-like
 *   text is always written as text: this writer never writes formulas.
 * - Layout (owner decision 6): optional bold header row, frozen top row and a
 *   filter on the header; column widths estimated from the data.
 * - Written row by row into the ZIP (deflate as it goes), so a 150 MB CSV never
 *   becomes one huge string.
 * - Excel's limits are checked first, and a file that can't be stored exactly
 *   is refused with the reason (more than 1,048,576 rows or 16,384 columns per
 *   sheet, more than 32,767 characters in a cell). Nothing is cut off silently.
 * - Verification (verifyNewXlsx): the produced bytes are unzipped and every
 *   sheet's XML is parsed back row by row and compared cell by cell (type,
 *   value and number format) with what was meant to be written. Streaming, so
 *   it needs little memory even for very large files.
 * - Characters XML 1.0 can't hold (control characters) are written with
 *   Excel's own _xHHHH_ escape; a literal “_xHHHH_” in the text is protected
 *   as “_x005F_xHHHH_”, so every value reads back exactly.
 */
import { EngineError } from "../errors.ts";
import { throwIfCancelled, yieldToEventLoop, type CancelToken } from "../cancel.ts";
import { columnLetter } from "../query/query.ts";
import { PartWriter, pushText, readZipEntries, readEntryText, streamEntry, writeZip, type OutputEntry, type ZipEntry } from "../xlsx/zip.ts";

export const XLSX_MAX_ROWS = 1_048_576;
export const XLSX_MAX_COLUMNS = 16_384;
export const XLSX_MAX_CELL_CHARS = 32_767;

/** A cell to write: text, or a number with an optional display format (a date is a number with a date format). */
export type OutCell = null | { t: "s"; v: string } | { t: "n"; v: number; fmt?: string };

export interface SheetSource {
  name: string;
  rowCount: number;
  /** Widest row (cells per row). */
  colCount: number;
  /** Bold first row, frozen top row and a filter on it (decision 6). */
  header: boolean;
  /** The cells of row r (0-based). Called twice per row (writing, then verification). */
  row(r: number): OutCell[];
}

export interface XlsxWriteOptions {
  cancel?: CancelToken;
  onProgress?: (phase: "exporting" | "verifying", done: number, total: number) => void;
}

const BATCH_ROWS = 4096;
const WIDTH_SAMPLE_ROWS = 10_000;
const MAIN_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

// ---------------------------------------------------------------- text escaping

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

/** Text as it goes inside <t>: XML-escaped, control characters as _xHHHH_, literal _xHHHH_ protected. */
export function escapeCellText(s: string): string {
  let out = s.replace(/_x([0-9A-Fa-f]{4})_/g, "_x005F_x$1_");
  out = out.replace(CONTROL, (c) => `_x${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}_`);
  // CR as a character reference: XML parsers turn a literal CR LF into LF, but keep &#13;.
  return out.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\r/g, "&#13;");
}

/** The reverse of escapeCellText (for verification). */
export function unescapeCellText(s: string): string {
  const xml = s.replace(/&(lt|gt|amp|quot|apos|#x[0-9A-Fa-f]+|#\d+);/g, (_, e: string) =>
    e === "lt" ? "<" : e === "gt" ? ">" : e === "amp" ? "&" : e === "quot" ? '"' : e === "apos" ? "'" : String.fromCodePoint(e[1] === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)),
  );
  return xml.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

const attr = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

/** Sheet names: at most 31 characters, none of : \ / ? * [ ], not blank, unique (case-insensitive). */
export function safeSheetName(name: string, taken: Set<string>): string {
  let base = name.replace(/[:\\/?*[\]]/g, " ").replace(/^'+|'+$/g, "").trim() || "Sheet";
  base = base.slice(0, 31);
  let out = base;
  for (let n = 2; taken.has(out.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    out = base.slice(0, 31 - suffix.length) + suffix;
  }
  taken.add(out.toLowerCase());
  return out;
}

function numberText(v: number): string {
  if (!Number.isFinite(v)) throw new EngineError("internal", "A value that isn't a finite number can't be written to Excel.");
  return String(v);
}

// ---------------------------------------------------------------- styles

interface Styles {
  /** Number format code → custom numFmtId (164+). */
  formats: Map<string, number>;
  /** Style index per format code (cellXfs). 0 = default, 1 = bold header. */
  xfOf: Map<string, number>;
  xml: string;
}

function buildStyles(formats: string[]): Styles {
  const fm = new Map<string, number>();
  const xfOf = new Map<string, number>();
  formats.forEach((f, i) => {
    fm.set(f, 164 + i);
    xfOf.set(f, 2 + i);
  });
  const numFmts = formats.length ? `<numFmts count="${formats.length}">${formats.map((f) => `<numFmt numFmtId="${fm.get(f)}" formatCode="${attr(f)}"/>`).join("")}</numFmts>` : "";
  const xfs = [
    `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`,
    `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>`,
    ...formats.map((f) => `<xf numFmtId="${fm.get(f)}" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>`),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="${MAIN_NS}">${numFmts}` +
    `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
    `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
    `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
    `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
    `<cellXfs count="${xfs.length}">${xfs.join("")}</cellXfs>` +
    `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  return { formats: fm, xfOf, xml };
}

// ---------------------------------------------------------------- checks before writing

function cellRef(r: number, c: number): string {
  return `${columnLetter(c)}${r + 1}`;
}

function checkLimits(sheets: SheetSource[]) {
  if (sheets.length === 0) throw new EngineError("internal", "There is nothing to write.");
  for (const s of sheets) {
    if (s.rowCount > XLSX_MAX_ROWS) {
      throw new EngineError("unsupported-format", `“${s.name}” has ${s.rowCount.toLocaleString("en-US")} rows, but an Excel sheet holds at most ${XLSX_MAX_ROWS.toLocaleString("en-US")}. Nothing was created.`);
    }
    if (s.colCount > XLSX_MAX_COLUMNS) {
      throw new EngineError("unsupported-format", `Some rows have ${s.colCount.toLocaleString("en-US")} values, but an Excel sheet holds at most ${XLSX_MAX_COLUMNS.toLocaleString("en-US")} columns. Nothing was created; the file would lose data in Excel.`);
    }
  }
}

function tooLong(sheet: string, r: number, c: number, len: number): EngineError {
  return new EngineError(
    "unsupported-format",
    `Cell ${cellRef(r, c)}${sheet ? ` in “${sheet}”` : ""} has ${len.toLocaleString("en-US")} characters, but an Excel cell holds at most ${XLSX_MAX_CELL_CHARS.toLocaleString("en-US")}. Nothing was created, because Excel would cut the value off. The CSV Validator lists every cell that is too long.`,
  );
}

// ---------------------------------------------------------------- writing

/** A ZIP entry header for a newly written part (also used for the all-sheets ZIP). */
export function newEntry(name: string): ZipEntry {
  const d = new Date();
  return {
    name,
    method: 8,
    flags: 0,
    modTime: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    modDate: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    crc32: 0,
    compressedSize: 0,
    size: 0,
    versionMadeBy: 20,
    versionNeeded: 20,
    internalAttr: 0,
    externalAttr: 0,
    localHeaderOffset: 0,
  };
}

function textPart(name: string, text: string): OutputEntry {
  const w = new PartWriter();
  pushText(w, text);
  return { kind: "new", entry: newEntry(name), ...w.finish() };
}

/** Estimated column widths (Excel character units) from the header and the first rows. */
function estimateWidths(s: SheetSource): number[] {
  const widths = new Array<number>(s.colCount).fill(0);
  const rows = Math.min(s.rowCount, WIDTH_SAMPLE_ROWS);
  for (let r = 0; r < rows; r++) {
    const cells = s.row(r);
    for (let c = 0; c < cells.length; c++) {
      const cell = cells[c];
      if (!cell) continue;
      const len = cell.t === "s" ? Math.max(...cell.v.split(/\r\n|\r|\n/).map((l) => l.length)) : cell.fmt ? Math.max(cell.fmt.length, 10) : numberText(cell.v).length;
      if (len > widths[c]!) widths[c] = len;
    }
  }
  return widths.map((w) => Math.min(60, Math.max(8, Math.ceil(w * 1.15 + 2))));
}

export interface XlsxWriteResult {
  blob: Blob;
  /** Sheet names as written. */
  sheetNames: string[];
  /** Cells written per kind. */
  counts: { text: number; numbers: number; dates: number; empty: number };
}

export async function writeXlsx(sheets: SheetSource[], o: XlsxWriteOptions = {}): Promise<XlsxWriteResult> {
  checkLimits(sheets);
  const taken = new Set<string>();
  const names = sheets.map((s) => safeSheetName(s.name, taken));
  const totalRows = sheets.reduce((n, s) => n + s.rowCount, 0);

  // Pass 1 (cheap): number formats used, and column widths from a sample.
  const formatSet = new Set<string>();
  const widths: number[][] = [];
  for (const s of sheets) {
    for (let r = 0; r < s.rowCount; r++) {
      for (const cell of s.row(r)) if (cell?.t === "n" && cell.fmt) formatSet.add(cell.fmt);
      if ((r & (BATCH_ROWS - 1)) === BATCH_ROWS - 1) {
        throwIfCancelled(o.cancel);
        await yieldToEventLoop();
      }
    }
    widths.push(estimateWidths(s));
  }
  const styles = buildStyles([...formatSet]);
  const counts = { text: 0, numbers: 0, dates: 0, empty: 0 };
  const isDateFmt = (f: string) => /[dmy]/i.test(f.replace(/"[^"]*"/g, "").replace(/\[[^\]]*\]/g, ""));

  // Pass 2: the sheets, row by row.
  const sheetParts: OutputEntry[] = [];
  let done = 0;
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i]!;
    const w = new PartWriter();
    const lastCol = Math.max(1, s.colCount);
    const lastRow = Math.max(1, s.rowCount);
    const range = `A1:${columnLetter(lastCol - 1)}${lastRow}`;
    const frozen = s.header && s.rowCount > 1;
    let head = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><dimension ref="${range}"/>`;
    head += frozen
      ? `<sheetViews><sheetView workbookViewId="0"${i === 0 ? ` tabSelected="1"` : ""}><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0"${i === 0 ? ` tabSelected="1"` : ""}/></sheetViews>`;
    head += `<sheetFormatPr defaultRowHeight="15"/>`;
    if (widths[i]!.length) head += `<cols>${widths[i]!.map((wd, c) => `<col min="${c + 1}" max="${c + 1}" width="${wd}" customWidth="1"/>`).join("")}</cols>`;
    head += `<sheetData>`;
    pushText(w, head);
    let buf: string[] = [];
    for (let r = 0; r < s.rowCount; r++) {
      const cells = s.row(r);
      const parts: string[] = [`<row r="${r + 1}">`];
      for (let c = 0; c < cells.length; c++) {
        const cell = cells[c];
        if (!cell || (cell.t === "s" && cell.v === "")) {
          counts.empty++;
          continue;
        }
        const ref = cellRef(r, c);
        if (cell.t === "s") {
          if (cell.v.length > XLSX_MAX_CELL_CHARS) throw tooLong(names[i]!, r, c, cell.v.length);
          const style = s.header && r === 0 ? ` s="1"` : "";
          const space = /^\s|\s$/.test(cell.v) || /[\r\n\t]/.test(cell.v) ? ` xml:space="preserve"` : "";
          parts.push(`<c r="${ref}"${style} t="inlineStr"><is><t${space}>${escapeCellText(cell.v)}</t></is></c>`);
          counts.text++;
        } else {
          const style = cell.fmt ? ` s="${styles.xfOf.get(cell.fmt)}"` : "";
          parts.push(`<c r="${ref}"${style}><v>${numberText(cell.v)}</v></c>`);
          if (cell.fmt && isDateFmt(cell.fmt)) counts.dates++;
          else counts.numbers++;
        }
      }
      parts.push("</row>");
      buf.push(parts.join(""));
      if (buf.length >= 2048) {
        pushText(w, buf.join(""));
        buf = [];
      }
      done++;
      if ((r & (BATCH_ROWS - 1)) === BATCH_ROWS - 1) {
        throwIfCancelled(o.cancel);
        o.onProgress?.("exporting", done, totalRows);
        await yieldToEventLoop();
      }
    }
    pushText(w, buf.join(""));
    let tail = `</sheetData>`;
    if (s.header && s.rowCount > 0) tail += `<autoFilter ref="${range}"/>`;
    tail += `<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/></worksheet>`;
    pushText(w, tail);
    sheetParts.push({ kind: "new", entry: newEntry(`xl/worksheets/sheet${i + 1}.xml`), ...w.finish() });
  }

  const quoted = (n: string) => `'${n.replace(/'/g, "''")}'`;
  const filterNames = sheets
    .map((s, i) => (s.header && s.rowCount > 0 ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${attr(quoted(names[i]!))}!$A$1:$${columnLetter(Math.max(1, s.colCount) - 1)}$${Math.max(1, s.rowCount)}</definedName>` : ""))
    .join("");
  const workbook =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="${MAIN_NS}" xmlns:r="${REL_NS}"><bookViews><workbookView/></bookViews><sheets>` +
    names.map((n, i) => `<sheet name="${attr(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets>${filterNames ? `<definedNames>${filterNames}</definedNames>` : ""}<calcPr calcId="191029"/></workbook>`;
  const wbRels =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
    names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL_NS}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("") +
    `<Relationship Id="rId${names.length + 1}" Type="${REL_NS}/styles" Target="styles.xml"/></Relationships>`;
  const contentTypes =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
    `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
    names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
    `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

  const blob = await writeZip(new Blob([]), [
    textPart("[Content_Types].xml", contentTypes),
    textPart("_rels/.rels", rootRels),
    textPart("xl/workbook.xml", workbook),
    textPart("xl/_rels/workbook.xml.rels", wbRels),
    textPart("xl/styles.xml", styles.xml),
    ...sheetParts,
  ]);
  o.onProgress?.("exporting", totalRows, totalRows);
  return { blob, sheetNames: names, counts };
}

// ---------------------------------------------------------------- verification

function verifyFailed(detail: string): EngineError {
  return new EngineError(
    "internal",
    "The new Excel file didn't pass DataFixer's check, so it was not offered for download. Your file is unchanged. Please try again; if it keeps happening, the file may contain content DataFixer can't write correctly yet.",
    `XLSX verification failed: ${detail}`,
  );
}

/**
 * Read the produced workbook back (unzipping it and parsing every sheet's XML
 * row by row) and compare every cell — type, value and number format — with
 * what was meant to be written. Throws on any difference.
 */
export async function verifyNewXlsx(blob: Blob, sheets: SheetSource[], sheetNames: string[], o: XlsxWriteOptions = {}): Promise<{ rows: number; cells: number }> {
  const entries = await readZipEntries(blob);
  const byName = new Map(entries.map((e) => [e.name, e]));
  const need = (n: string) => byName.get(n) ?? (() => { throw verifyFailed(`missing part ${n}`); })();
  const workbook = await readEntryText(blob, need("xl/workbook.xml"), o.cancel);
  const gotNames = [...workbook.matchAll(/<sheet name="([^"]*)"/g)].map((m) => unescapeCellText(m[1]!));
  if (gotNames.join("\u0000") !== sheetNames.join("\u0000")) throw verifyFailed("sheet names");
  // Style index → number format code, from the written styles.xml.
  const styles = await readEntryText(blob, need("xl/styles.xml"), o.cancel);
  const fmtCode = new Map([...styles.matchAll(/<numFmt numFmtId="(\d+)" formatCode="([^"]*)"\/>/g)].map((m) => [Number(m[1]), unescapeCellText(m[2]!)]));
  const xfs = (styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)?.[1] ?? "").match(/<xf [^>]*\/>/g) ?? [];
  const xfFmt = xfs.map((x) => fmtCode.get(Number(/numFmtId="(\d+)"/.exec(x)?.[1] ?? "0")) ?? null);
  const xfBold = xfs.map((x) => /fontId="1"/.test(x));

  const totalRows = sheets.reduce((n, s) => n + s.rowCount, 0);
  let doneRows = 0;
  let cells = 0;
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i]!;
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let text = "";
    let r = 0;
    const checkRow = (rowXml: string) => {
      const m = /^<row r="(\d+)">/.exec(rowXml);
      if (!m || Number(m[1]) !== r + 1) throw verifyFailed(`row order in sheet ${i + 1} at row ${r + 1}`);
      const want = s.row(r);
      const got = new Map<number, { style: number; t: "s" | "n"; v: string }>();
      for (const c of rowXml.matchAll(/<c r="([A-Z]+)(\d+)"(?: s="(\d+)")?( t="inlineStr")?>(?:<is><t(?: xml:space="preserve")?>([\s\S]*?)<\/t><\/is>|<v>([^<]*)<\/v>)<\/c>/g)) {
        if (Number(c[2]) !== r + 1) throw verifyFailed(`cell row in sheet ${i + 1} row ${r + 1}`);
        let col = 0;
        for (const ch of c[1]!) col = col * 26 + (ch.charCodeAt(0) - 64);
        got.set(col - 1, { style: Number(c[3] ?? 0), t: c[4] ? "s" : "n", v: c[4] ? unescapeCellText(c[5] ?? "") : c[6]! });
      }
      const width = Math.max(want.length, got.size ? Math.max(...got.keys()) + 1 : 0);
      for (let c = 0; c < width; c++) {
        const w = want[c] ?? null;
        const g = got.get(c);
        const where = `sheet ${i + 1}, ${cellRef(r, c)}`;
        if (!w || (w.t === "s" && w.v === "")) {
          if (g) throw verifyFailed(`${where} should be empty`);
          continue;
        }
        if (!g || g.t !== w.t) throw verifyFailed(`${where} type`);
        if (w.t === "s") {
          if (g.v !== w.v) throw verifyFailed(`${where} text`);
          if ((s.header && r === 0) !== (xfBold[g.style] ?? false)) throw verifyFailed(`${where} header style`);
        } else {
          if (Number(g.v) !== w.v) throw verifyFailed(`${where} number`);
          if ((xfFmt[g.style] ?? null) !== (w.fmt ?? null)) throw verifyFailed(`${where} number format`);
        }
        cells++;
      }
      r++;
    };
    await streamEntry(
      blob,
      need(`xl/worksheets/sheet${i + 1}.xml`),
      (chunk) => {
        text += decoder.decode(chunk, { stream: true });
        let start = text.indexOf("<row ");
        if (start < 0) return;
        let consumed = 0;
        for (;;) {
          const end = text.indexOf("</row>", start);
          if (end < 0) break;
          checkRow(text.slice(start, end));
          consumed = end + 6;
          start = text.indexOf("<row ", consumed);
          if (start < 0) break;
        }
        if (consumed) text = text.slice(consumed);
      },
      { cancel: o.cancel, maxBytes: Number.MAX_SAFE_INTEGER },
    );
    text += decoder.decode();
    if (text.includes("<row ")) throw verifyFailed(`unfinished row in sheet ${i + 1}`);
    if (r !== s.rowCount) throw verifyFailed(`${r} rows read back instead of ${s.rowCount} in sheet ${i + 1}`);
    doneRows += r;
    o.onProgress?.("verifying", doneRows, totalRows);
    await yieldToEventLoop();
  }
  return { rows: doneRows, cells };
}
