/**
 * Stage 4, Step 7: write changes into the original XLSX package (owner
 * decision 4). Only the edited worksheet is rewritten, and inside it only the
 * edited cells (plus row/column numbers after removed rows/columns). Every
 * other part is copied byte for byte. When needed, workbook.xml gets the
 * "recalculate when opened" flag, styles.xml gets number formats for new dates,
 * and calcChain.xml (Excel's formula order cache, rebuilt automatically) is
 * dropped if formulas were replaced.
 *
 * The worksheet is processed as a stream, one <row> at a time, so large sheets
 * never become one giant string.
 */
import { EngineError } from "../errors.ts";
import { throwIfCancelled, type CancelToken } from "../cancel.ts";
import { cellKey, splitCellKey, type CellValue } from "../types.ts";
import { columnLetter } from "../query/query.ts";
import { PartWriter, pushText, readEntryText, streamEntry, writeZip, type OutputEntry, type ZipEntry } from "./zip.ts";

export interface CellEdit {
  value: CellValue;
  /** Number format for the new value (a new style is added if needed). */
  format?: string;
}

export interface PatchInput {
  source: Blob;
  entries: ZipEntry[];
  sheetPart: string;
  /** Edits by ORIGINAL position (cellKey of the original file). */
  edits: Map<number, CellEdit>;
  /** Original rows / columns removed (zero-based, sorted). */
  deletedRows: number[];
  deletedCols: number[];
  /** Cells that held formulas before editing (original positions), to drop calcChain if replaced. */
  formulaCells: Set<number>;
  cancel?: CancelToken;
  onProgress?: (done: number, total: number) => void;
}

export interface PatchResult {
  blob: Blob;
  /** Parts that were rewritten or removed (everything else is byte-identical). */
  changedParts: string[];
  removedParts: string[];
}

const unsupportedEdit = (message: string, detail: string) => new EngineError("unsupported-format", message, detail);

function colIndex(letters: string): number {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}

function attrOf(tag: string, name: string): string | null {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m ? m[1]! : null;
}

function setAttr(tag: string, name: string, value: string | null): string {
  const re = new RegExp(`\\s${name}="[^"]*"`);
  if (value === null) return tag.replace(re, "");
  if (re.test(tag)) return tag.replace(re, ` ${name}="${value}"`);
  return tag.replace(/(\/?>)$/, ` ${name}="${value}"$1`);
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Text for <t>: XML-escaped; characters XML 1.0 can't hold are written as Excel's _xHHHH_ escapes. */
export function ooxmlText(s: string): string {
  return xmlEscape(s.replace(/_x[0-9A-Fa-f]{4}_/g, (m) => `_x005F${m}`)).replace(
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g,
    (ch) => `_x${ch.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}_`,
  );
}

/** Count of removed indexes below n (sorted array). */
function removedBefore(sorted: number[], n: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid]! < n) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** New XML for an edited cell (keeps its style unless a new number format needs another one). */
function cellXml(prefix: string, ref: string, style: string | null, v: CellValue): string {
  const s = style !== null ? ` s="${style}"` : "";
  if (v === null || v === "") return style !== null ? `<${prefix}c r="${ref}"${s}/>` : "";
  if (typeof v === "number") return `<${prefix}c r="${ref}"${s}><${prefix}v>${String(v)}</${prefix}v></${prefix}c>`;
  if (typeof v === "boolean") return `<${prefix}c r="${ref}"${s} t="b"><${prefix}v>${v ? 1 : 0}</${prefix}v></${prefix}c>`;
  return `<${prefix}c r="${ref}"${s} t="inlineStr"><${prefix}is><${prefix}t xml:space="preserve">${ooxmlText(v)}</${prefix}t></${prefix}is></${prefix}c>`;
}

interface Styles {
  /** Style index for (original style, number format) pairs that need a new xf. */
  resolve(style: string | null, format: string): string;
  /** New styles.xml, or null if unchanged. */
  finish(): string | null;
}

function styleBook(xml: string | null): Styles {
  if (xml === null) {
    return {
      resolve: () => {
        throw unsupportedEdit("This workbook has no style sheet, so new dates can't be formatted. Download it as CSV instead.", "no styles.xml");
      },
      finish: () => null,
    };
  }
  const numFmts = new Map<string, number>(); // formatCode → id
  let maxId = 163;
  for (const m of xml.matchAll(/<(?:\w+:)?numFmt\b[^>]*\/?>/g)) {
    const id = Number(attrOf(m[0], "numFmtId"));
    const code = attrOf(m[0], "formatCode");
    if (code !== null) numFmts.set(code, id);
    if (id > maxId) maxId = id;
  }
  const xfsMatch = /<((?:\w+:)?)cellXfs\b[^>]*>([\s\S]*?)<\/(?:\w+:)?cellXfs>/.exec(xml);
  if (!xfsMatch) {
    return {
      resolve: () => {
        throw unsupportedEdit("This workbook's styles can't be extended, so new dates can't be formatted. Download it as CSV instead.", "no cellXfs");
      },
      finish: () => null,
    };
  }
  const prefix = xfsMatch[1]!;
  const xfs = [...xfsMatch[2]!.matchAll(/<(?:\w+:)?xf\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?xf>)/g)].map((m) => m[0]);
  const newFmts: string[] = [];
  const newXfs: string[] = [];
  const cache = new Map<string, string>();
  return {
    resolve(style, format) {
      const key = `${style ?? "0"}|${format}`;
      const hit = cache.get(key);
      if (hit) return hit;
      let id = numFmts.get(format);
      if (id === undefined) {
        id = ++maxId;
        numFmts.set(format, id);
        newFmts.push(`<${prefix}numFmt numFmtId="${id}" formatCode="${xmlEscape(format)}"/>`);
      }
      const base = xfs[Number(style ?? 0)] ?? xfs[0] ?? `<${prefix}xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>`;
      let xf = base.replace(/^<(?:\w+:)?xf\b[^>]*?(\/?>)/, (tag) => setAttr(setAttr(tag, "numFmtId", String(id)), "applyNumberFormat", "1"));
      if (!xf.startsWith(`<${prefix}xf`)) xf = `<${prefix}xf${xf.slice(xf.indexOf("xf") + 2)}`;
      newXfs.push(xf);
      const index = String(xfs.length + newXfs.length - 1);
      cache.set(key, index);
      return index;
    },
    finish() {
      if (!newXfs.length) return null;
      let out = xml;
      if (newFmts.length) {
        if (/<(?:\w+:)?numFmts\b[^>]*\/>/.test(out)) out = out.replace(/<((?:\w+:)?)numFmts\b[^>]*\/>/, `<$1numFmts count="0"></$1numFmts>`);
        if (/<(?:\w+:)?numFmts\b/.test(out)) {
          out = out.replace(/(<(?:\w+:)?numFmts\b[^>]*>)([\s\S]*?)(<\/(?:\w+:)?numFmts>)/, (_m, open: string, body: string, close: string) => {
            const count = (body.match(/<(?:\w+:)?numFmt\b/g) ?? []).length + newFmts.length;
            return `${setAttr(open, "count", String(count))}${body}${newFmts.join("")}${close}`;
          });
        } else {
          // numFmts must be the first child of styleSheet.
          out = out.replace(/(<(?:\w+:)?styleSheet\b[^>]*>)/, `$1<${prefix}numFmts count="${newFmts.length}">${newFmts.join("")}</${prefix}numFmts>`);
        }
      }
      out = out.replace(/(<(?:\w+:)?cellXfs\b[^>]*>)([\s\S]*?)(<\/(?:\w+:)?cellXfs>)/, (_m, open: string, body: string, close: string) => {
        return `${setAttr(open, "count", String(xfs.length + newXfs.length))}${body}${newXfs.join("")}${close}`;
      });
      return out;
    },
  };
}

/** Rewrite <cols> for removed columns (widths and hidden flags move with their columns). */
function rewriteCols(head: string, deletedCols: number[]): string {
  if (!deletedCols.length) return head;
  const del = new Set(deletedCols);
  return head.replace(/<((?:\w+:)?)cols>([\s\S]*?)<\/(?:\w+:)?cols>/, (_m, prefix: string, body: string) => {
    const out: string[] = [];
    for (const m of body.matchAll(/<(?:\w+:)?col\b[^>]*\/?>/g)) {
      const min = Number(attrOf(m[0], "min")) - 1;
      const max = Number(attrOf(m[0], "max")) - 1;
      // Split the range into runs of kept columns, shifted left.
      let runStart = -1;
      for (let c = min; c <= max + 1; c++) {
        const keep = c <= max && !del.has(c);
        if (keep && runStart < 0) runStart = c;
        if (!keep && runStart >= 0) {
          const a = runStart - removedBefore(deletedCols, runStart) + 1;
          const b = c - 1 - removedBefore(deletedCols, c - 1) + 1;
          out.push(setAttr(setAttr(m[0], "min", String(a)), "max", String(b)));
          runStart = -1;
        }
      }
    }
    return out.length ? `<${prefix}cols>${out.join("")}</${prefix}cols>` : "";
  });
}

function rewriteDimension(head: string, rows: number[], cols: number[]): string {
  if (!rows.length && !cols.length) return head;
  return head.replace(/(<(?:\w+:)?dimension\b[^>]*\bref=")([^"]*)(")/, (_m, a: string, ref: string, b: string) => {
    const parts = ref.split(":");
    const last = parts[parts.length - 1]!;
    const m = /^([A-Z]+)(\d+)$/.exec(last);
    if (!m) return `${a}${ref}${b}`;
    const c = colIndex(m[1]!);
    const r = Number(m[2]) - 1;
    // Last cell: minus the removed rows/columns at or before it.
    const end = `${columnLetter(Math.max(0, c - removedBefore(cols, c + 1)))}${Math.max(1, r - removedBefore(rows, r + 1) + 1)}`;
    return `${a}${parts.length > 1 ? `${parts[0]}:${end}` : end}${b}`;
  });
}

interface SheetRewrite {
  push(text: string): string;
  finish(): string;
}

/** Streaming worksheet rewriter. */
function sheetRewriter(input: PatchInput, styles: Styles): SheetRewrite {
  const { deletedRows, deletedCols } = input;
  const delRows = new Set(deletedRows);
  const delCols = new Set(deletedCols);
  // Edits grouped by original row, columns ascending.
  const byRow = new Map<number, [number, CellEdit][]>();
  for (const [key, edit] of input.edits) {
    const { row, col } = splitCellKey(key);
    if (delRows.has(row) || delCols.has(col)) continue;
    let list = byRow.get(row);
    if (!list) byRow.set(row, (list = []));
    list.push([col, edit]);
  }
  for (const list of byRow.values()) list.sort((a, b) => a[0] - b[0]);
  const pendingRows = [...byRow.keys()].sort((a, b) => a - b);
  let pendingIndex = 0;
  /** Multi-cell array formulas and data tables seen so far (editing inside them would corrupt the file). */
  const arrays: { r1: number; c1: number; r2: number; c2: number; ref: string }[] = [];

  let state: "head" | "rows" | "tail" = "head";
  let buf = "";
  let prefix = "";
  let lastRow = -1;

  const newRowNumber = (r: number) => r - removedBefore(deletedRows, r) + 1;
  const newRef = (r: number, c: number) => `${columnLetter(c - removedBefore(deletedCols, c))}${newRowNumber(r)}`;

  const editedCellXml = (r: number, c: number, edit: CellEdit, style: string | null, oldCell: string | null) => {
    for (const a of arrays) {
      if (r >= a.r1 && r <= a.r2 && c >= a.c1 && c <= a.c2) {
        throw unsupportedEdit(
          `Cell ${columnLetter(c)}${r + 1} is part of an array formula or data table (${a.ref}), which Excel can't change one cell at a time. Download as CSV instead, or change it in Excel.`,
          `edit inside array ${a.ref}`,
        );
      }
    }
    if (oldCell) {
      const f = /<(?:\w+:)?f\b([^>]*)(?:\/>|>)/.exec(oldCell);
      if (f && /\bt="shared"/.test(f[1]!) && /\bref="/.test(f[1]!)) {
        throw unsupportedEdit(
          `Cell ${columnLetter(c)}${r + 1} holds a formula that Excel shares with other cells, so replacing it would break those cells too. Download as CSV instead, or change it in Excel.`,
          "edit of shared formula master",
        );
      }
    }
    const s = edit.format !== undefined && typeof edit.value === "number" ? styles.resolve(style, edit.format) : style;
    return cellXml(prefix, newRef(r, c), s, edit.value);
  };

  const newRowXml = (r: number) => {
    const cells = (byRow.get(r) ?? []).map(([c, e]) => editedCellXml(r, c, e, null, null)).join("");
    return cells ? `<${prefix}row r="${newRowNumber(r)}">${cells}</${prefix}row>` : "";
  };

  /** Rows with edits that don't exist in the file, before original row `upTo`. */
  const flushPending = (upTo: number) => {
    let out = "";
    while (pendingIndex < pendingRows.length && pendingRows[pendingIndex]! < upTo) {
      const r = pendingRows[pendingIndex++]!;
      out += newRowXml(r);
    }
    return out;
  };

  const rewriteRow = (rowXml: string): string => {
    const open = /^<(?:\w+:)?row\b[^>]*?\/?>/.exec(rowXml)![0];
    const rAttr = attrOf(open, "r");
    const r = rAttr ? Number(rAttr) - 1 : lastRow + 1;
    lastRow = r;
    const out = flushPending(r);
    if (pendingRows[pendingIndex] === r) pendingIndex++;
    if (delRows.has(r)) return out;
    const edits = byRow.get(r);
    const shiftRows = removedBefore(deletedRows, r) > 0;
    // Record array formulas starting in this row (they can span later rows).
    if (rowXml.includes("<") && /\bt="(array|dataTable)"/.test(rowXml)) {
      for (const m of rowXml.matchAll(/<(?:\w+:)?f\b[^>]*\bt="(?:array|dataTable)"[^>]*>/g)) {
        const ref = attrOf(m[0], "ref");
        if (!ref || !ref.includes(":")) continue;
        const [a, b] = ref.split(":");
        const ma = /^([A-Z]+)(\d+)$/.exec(a!);
        const mb = /^([A-Z]+)(\d+)$/.exec(b!);
        if (ma && mb) arrays.push({ r1: Number(ma[2]) - 1, c1: colIndex(ma[1]!), r2: Number(mb[2]) - 1, c2: colIndex(mb[1]!), ref });
      }
    }
    if (!edits && !shiftRows && !deletedCols.length) return out + rowXml;

    let newOpen = setAttr(open, "r", String(newRowNumber(r)));
    if (edits || deletedCols.length) newOpen = setAttr(newOpen, "spans", null);
    if (open.endsWith("/>")) {
      // An empty row element: add edited cells if any.
      if (!edits) return out + newOpen;
      const cells = edits.map(([c, e]) => editedCellXml(r, c, e, null, null)).join("");
      return out + newOpen.replace(/\/>$/, ">") + cells + `</${prefix}row>`;
    }
    const body = rowXml.slice(open.length, rowXml.lastIndexOf("<"));
    const pending = edits ? [...edits] : [];
    let cells = "";
    let lastCol = -1;
    const cellRe = /<(?:\w+:)?c\b[^>]*?(?:\/>|>[\s\S]*?<\/(?:\w+:)?c>)/g;
    for (const m of body.matchAll(cellRe)) {
      const cell = m[0];
      const tag = /^<(?:\w+:)?c\b[^>]*?\/?>/.exec(cell)![0];
      const ref = attrOf(tag, "r");
      const c = ref ? colIndex(/^[A-Z]+/.exec(ref)![0]) : lastCol + 1;
      lastCol = c;
      while (pending.length && pending[0]![0] < c) {
        const [pc, pe] = pending.shift()!;
        cells += editedCellXml(r, pc, pe, null, null);
      }
      if (delCols.has(c)) continue;
      if (pending.length && pending[0]![0] === c) {
        const [, pe] = pending.shift()!;
        cells += editedCellXml(r, c, pe, attrOf(tag, "s"), cell);
        continue;
      }
      if (!shiftRows && !removedBefore(deletedCols, c) && ref) cells += cell;
      else cells += cell.replace(tag, setAttr(tag, "r", newRef(r, c)));
    }
    for (const [pc, pe] of pending) cells += editedCellXml(r, pc, pe, null, null);
    return out + newOpen + cells + `</${prefix}row>`;
  };

  let nextTag: RegExp | null = null;
  const processRows = (final: boolean): string => {
    let out = "";
    nextTag ??= new RegExp(`<${prefix}row\\b|</${prefix}sheetData>`);
    for (;;) {
      const start = buf.search(nextTag);
      if (start < 0) {
        if (final) throw unsupportedEdit("The worksheet couldn't be read for rewriting.", "unterminated sheetData");
        // Keep a possible partial tag at the end.
        const lt = buf.lastIndexOf("<");
        if (lt > 0) {
          out += buf.slice(0, lt);
          buf = buf.slice(lt);
        }
        return out;
      }
      out += buf.slice(0, start);
      buf = buf.slice(start);
      if (buf.startsWith(`</${prefix}sheetData>`)) {
        out += flushPending(Number.POSITIVE_INFINITY);
        state = "tail";
        return out;
      }
      const openEnd = buf.indexOf(">");
      if (openEnd < 0) return out;
      let end: number;
      if (buf[openEnd - 1] === "/") end = openEnd + 1;
      else {
        const close = buf.indexOf(`</${prefix}row>`, openEnd);
        if (close < 0) return out;
        end = close + `</${prefix}row>`.length;
      }
      out += rewriteRow(buf.slice(0, end));
      buf = buf.slice(end);
    }
  };

  return {
    push(text: string): string {
      buf += text;
      let out = "";
      if (state === "head") {
        const m = /<((?:\w+:)?)sheetData\b[^>]*?(\/?)>/.exec(buf);
        if (!m) return "";
        prefix = m[1]!;
        let head = buf.slice(0, m.index);
        head = rewriteDimension(rewriteCols(head, deletedCols), deletedRows, deletedCols);
        if (m[2] === "/") {
          // <sheetData/>: no rows at all; write the edited ones.
          out += `${head}<${prefix}sheetData>${flushPending(Number.POSITIVE_INFINITY)}</${prefix}sheetData>`;
          buf = buf.slice(m.index + m[0].length);
          state = "tail";
          return out + this.push("");
        }
        out += head + m[0];
        buf = buf.slice(m.index + m[0].length);
        state = "rows";
      }
      if (state === "rows") out += processRows(false);
      if (state === "tail") {
        out += buf;
        buf = "";
      }
      return out;
    },
    finish(): string {
      if (state === "rows") return processRows(true) + this.push("");
      const rest = buf;
      buf = "";
      return rest;
    },
  };
}

/** Add (or set) the "recalculate when opened" flag. */
export function withFullCalcOnLoad(workbookXml: string): string {
  const calc = /<((?:\w+:)?)calcPr\b[^>]*?\/?>/.exec(workbookXml);
  if (calc) return workbookXml.replace(calc[0], setAttr(calc[0], "fullCalcOnLoad", "1"));
  const prefix = /<((?:\w+:)?)workbook\b/.exec(workbookXml)?.[1] ?? "";
  // calcPr comes after sheets / externalReferences / definedNames in the schema order.
  for (const after of ["definedNames", "externalReferences", "functionGroups", "sheets"]) {
    const m = new RegExp(`</(?:\\w+:)?${after}>`).exec(workbookXml);
    if (m) return workbookXml.slice(0, m.index + m[0].length) + `<${prefix}calcPr fullCalcOnLoad="1"/>` + workbookXml.slice(m.index + m[0].length);
  }
  return workbookXml;
}

export async function patchXlsx(input: PatchInput): Promise<PatchResult> {
  const { source, entries, sheetPart, cancel } = input;
  const byName = new Map(entries.map((e) => [e.name, e]));
  const sheetEntry = byName.get(sheetPart);
  if (!sheetEntry) throw unsupportedEdit("The worksheet couldn't be found in the workbook.", sheetPart);
  const stylesEntry = byName.get("xl/styles.xml");
  const needsStyles = [...input.edits.values()].some((e) => e.format !== undefined);
  const styles = styleBook(needsStyles && stylesEntry ? await readEntryText(source, stylesEntry, cancel) : needsStyles ? null : "");

  // 1. Worksheet (streamed).
  const writer = new PartWriter();
  const rewriter = sheetRewriter(input, styles);
  const decoder = new TextDecoder("utf-8");
  let done = 0;
  await streamEntry(
    source,
    sheetEntry,
    (d) => {
      done += d.length;
      pushText(writer, rewriter.push(decoder.decode(d, { stream: true })));
      input.onProgress?.(done, sheetEntry.size);
    },
    { cancel },
  );
  pushText(writer, rewriter.push(decoder.decode()));
  pushText(writer, rewriter.finish());
  throwIfCancelled(cancel);
  const changed = new Map<string, ReturnType<PartWriter["finish"]>>([[sheetPart, writer.finish()]]);

  // 2. Styles (only for new number formats).
  const newStyles = needsStyles ? styles.finish() : null;
  if (newStyles !== null && stylesEntry) {
    const w = new PartWriter();
    pushText(w, newStyles);
    changed.set(stylesEntry.name, w.finish());
  }

  // 3. Workbook: recalculate when opened (other cells may use the edited ones).
  const removed = new Set<string>();
  const wbEntry = byName.get("xl/workbook.xml");
  const anyChange = input.edits.size > 0 || input.deletedRows.length > 0 || input.deletedCols.length > 0;
  if (wbEntry && anyChange) {
    const xml = await readEntryText(source, wbEntry, cancel);
    const next = withFullCalcOnLoad(xml);
    if (next !== xml) {
      const w = new PartWriter();
      pushText(w, next);
      changed.set(wbEntry.name, w.finish());
    }
  }

  // 4. calcChain lists formula cells; it must go if any formula was replaced or cells moved.
  const formulaReplaced = [...input.edits.keys()].some((k) => input.formulaCells.has(k));
  const calcEntry = byName.get("xl/calcChain.xml");
  if (calcEntry && (formulaReplaced || input.deletedRows.length || input.deletedCols.length)) {
    removed.add(calcEntry.name);
    for (const [name, edit] of [
      ["[Content_Types].xml", (x: string) => x.replace(/<(?:\w+:)?Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, "")],
      ["xl/_rels/workbook.xml.rels", (x: string) => x.replace(/<(?:\w+:)?Relationship\b[^>]*Target="(?:\/xl\/)?calcChain\.xml"[^>]*\/>/, "")],
    ] as const) {
      const e = byName.get(name);
      if (!e) continue;
      const xml = await readEntryText(source, e, cancel);
      const next = edit(xml);
      if (next !== xml) {
        const w = new PartWriter();
        pushText(w, next);
        changed.set(name, w.finish());
      }
    }
  }

  const out: OutputEntry[] = [];
  for (const e of entries) {
    if (removed.has(e.name)) continue;
    const c = changed.get(e.name);
    out.push(c ? { kind: "new", entry: e, ...c } : { kind: "copy", entry: e });
  }
  return { blob: await writeZip(source, out), changedParts: [...changed.keys()], removedParts: [...removed] };
}

export { cellKey };
