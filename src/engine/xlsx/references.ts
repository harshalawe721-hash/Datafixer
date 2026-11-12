/**
 * Stage 4, Step 7 — safeguard S2: before rows or columns are removed from an
 * Excel file, find everything in the workbook that refers to positions on this
 * sheet. Removing a row shifts everything below it; DataFixer does not rewrite
 * references, so a removal is only allowed when nothing refers to the removed
 * rows or anything after them (or the removed columns and anything to their right).
 *
 * The index records, per feature, the furthest row and column it reaches.
 * Anything that can't be checked statically (INDIRECT, OFFSET, structured or
 * 3-D references, sparklines, unknown parts) "reaches everywhere".
 */
import type { CancelToken } from "../cancel.ts";
import type { SheetModel } from "../types.ts";
import { splitCellKey } from "../types.ts";
import { columnLetter } from "../query/query.ts";
import { readEntryText, streamEntry, type ZipEntry } from "./zip.ts";
import { decodeXmlText } from "./inspect.ts";

export interface ReferenceFeature {
  label: string;
  /** Furthest zero-based row / column it refers to (Infinity: whole column/row, or unknown). */
  maxRow: number;
  maxCol: number;
}

export interface ReferenceIndex {
  features: ReferenceFeature[];
  /** Things worth knowing that can't be checked (e.g. other workbooks linking to this one). */
  notes: string[];
}

const ALL = Number.POSITIVE_INFINITY;

function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Ranges in a formula (or a defined name / chart series), with the sheet each refers to (null: no sheet given). */
export function formulaRefs(text: string): { sheet: string | null; maxRow: number; maxCol: number; dynamic: boolean }[] {
  const out: { sheet: string | null; maxRow: number; maxCol: number; dynamic: boolean }[] = [];
  const s = text.replace(/"(?:[^"]|"")*"/g, '""'); // ignore text literals
  if (/\b(INDIRECT|OFFSET)\s*\(/i.test(s) || /\[/.test(s)) out.push({ sheet: null, maxRow: ALL, maxCol: ALL, dynamic: true });
  const re =
    /(?<![A-Za-z0-9_.$])(?:(?:'((?:[^']|'')+)'|([A-Za-z0-9_.À-￿]+(?::[A-Za-z0-9_.À-￿]+)?))!)?(\$?[A-Za-z]{1,3}\$?\d+(?::\$?[A-Za-z]{1,3}\$?\d+)?|\$?[A-Za-z]{1,3}:\$?[A-Za-z]{1,3}|\$?\d+:\$?\d+)(?![A-Za-z0-9_(!])/g;
  for (const m of s.matchAll(re)) {
    const sheet = m[1] !== undefined ? m[1].replace(/''/g, "'") : (m[2] ?? null);
    const ref = m[3]!.replace(/\$/g, "");
    let maxRow = -1;
    let maxCol = -1;
    let ok = true;
    if (/^\d+:\d+$/.test(ref)) {
      const [a, b] = ref.split(":").map(Number);
      maxRow = Math.max(a!, b!) - 1;
      maxCol = ALL;
    } else if (/^[A-Za-z]+:[A-Za-z]+$/.test(ref)) {
      const [a, b] = ref.split(":").map(colIndex);
      maxCol = Math.max(a!, b!);
      maxRow = ALL;
      ok = maxCol < 16384;
    } else {
      for (const cell of ref.split(":")) {
        const cm = /^([A-Za-z]+)(\d+)$/.exec(cell)!;
        const c = colIndex(cm[1]!);
        const r = Number(cm[2]) - 1;
        if (c >= 16384 || r < 0 || r >= 1_048_576) ok = false;
        maxRow = Math.max(maxRow, r);
        maxCol = Math.max(maxCol, c);
      }
    }
    // A 3-D reference (Sheet1:Sheet3!A1) may include this sheet: treat as reaching everywhere.
    if (ok) out.push(sheet && sheet.includes(":") ? { sheet: null, maxRow: ALL, maxCol: ALL, dynamic: true } : { sheet, maxRow, maxCol, dynamic: false });
  }
  return out;
}

/** "A1:B5 D7" (sqref) → furthest row/column. */
function sqrefReach(sqref: string): { maxRow: number; maxCol: number } {
  let maxRow = -1;
  let maxCol = -1;
  for (const part of sqref.trim().split(/\s+/)) {
    for (const r of formulaRefs(part)) {
      maxRow = Math.max(maxRow, r.maxRow);
      maxCol = Math.max(maxCol, r.maxCol);
    }
  }
  return { maxRow, maxCol };
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  return m ? decodeXmlText(m[2] ?? m[3] ?? "") : null;
}

function resolve(fromPart: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = fromPart.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

function relsPath(part: string): string {
  const i = part.lastIndexOf("/");
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
}

function parseRels(xml: string, fromPart: string): { type: string; target: string; external: boolean }[] {
  const out: { type: string; target: string; external: boolean }[] = [];
  for (const m of xml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
    const type = (attr(m[1]!, "Type") ?? "").split("/").pop() ?? "";
    const t = attr(m[1]!, "Target") ?? "";
    const external = attr(m[1]!, "TargetMode") === "External";
    out.push({ type, target: external ? t : resolve(fromPart, t), external });
  }
  return out;
}

/** Contents of formula-like elements: f, formula, formula1, formula2, xm:f. */
const FORMULA_ELEMENTS = /<(?:\w+:)?(f|formula|formula1|formula2)\b[^>]*>([^<]*)<\/(?:\w+:)?\1>/g;

/** Head (before sheetData) and tail (after it) of a worksheet, without the cell data. */
async function sheetHeadTail(blob: Blob, e: ZipEntry, cancel?: CancelToken): Promise<{ head: string; tail: string }> {
  const decoder = new TextDecoder("utf-8");
  let head = "";
  let tail = "";
  let state: "head" | "data" | "tail" = "head";
  let carry = "";
  await streamEntry(
    blob,
    e,
    (d) => {
      let text = carry + decoder.decode(d, { stream: true });
      carry = "";
      if (state === "head") {
        const i = text.search(/<(?:\w+:)?sheetData\b/);
        if (i < 0) {
          head += text;
          return;
        }
        head += text.slice(0, i);
        text = text.slice(i);
        const selfClosing = /^<(?:\w+:)?sheetData\b[^>]*\/>/.exec(text);
        if (selfClosing) {
          state = "tail";
          tail += text.slice(selfClosing[0].length);
          return;
        }
        state = "data";
      }
      if (state === "data") {
        const m = /<\/(?:\w+:)?sheetData>/.exec(text);
        if (!m) {
          carry = text.slice(-32);
          return;
        }
        state = "tail";
        text = text.slice(m.index + m[0].length);
      }
      tail += text;
    },
    { cancel },
  );
  return { head, tail: tail + decoder.decode() };
}

export interface ReferenceInput {
  blob: Blob;
  entries: ZipEntry[];
  /** Worksheet parts by sheet name, and the workbook's sheet order. */
  sheets: { name: string; part: string | null }[];
  sheetIndex: number;
  /** The loaded sheet (formulas, merges and hyperlinks come from here). */
  sheet: SheetModel;
  cancel?: CancelToken;
}

export async function buildReferenceIndex(input: ReferenceInput): Promise<ReferenceIndex> {
  const { blob, entries, sheets, sheetIndex, sheet, cancel } = input;
  const byName = new Map(entries.map((e) => [e.name, e]));
  const read = async (name: string) => {
    const e = byName.get(name);
    return e ? readEntryText(blob, e, cancel) : null;
  };
  const thisName = sheets[sheetIndex]!.name;
  const thisPart = sheets[sheetIndex]!.part;
  const isThis = (s: string | null) => s !== null && s.toLowerCase() === thisName.toLowerCase();
  const features: ReferenceFeature[] = [];
  const notes: string[] = [];
  const add = (label: string, maxRow: number, maxCol: number) => {
    if (maxRow >= 0 || maxCol >= 0) features.push({ label, maxRow, maxCol });
  };

  const workbookXml = (await read("xl/workbook.xml")) ?? "";
  const names = [...workbookXml.matchAll(/<(?:\w+:)?definedName\b([^>]*)>([^<]*)<\/(?:\w+:)?definedName>/g)].map((m) => ({
    name: attr(m[1]!, "name") ?? "",
    local: attr(m[1]!, "localSheetId"),
    text: decodeXmlText(m[2]!),
  }));

  // 1. Formulas on this sheet: where they are, and what they refer to.
  {
    let maxRow = -1;
    let maxCol = -1;
    let example = "";
    const nameRe = names.length ? new RegExp(`(?<![A-Za-z0-9_.])(${names.map((n) => n.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![A-Za-z0-9_(])`, "i") : null;
    for (const [key, f] of sheet.formulas) {
      const { row, col } = splitCellKey(key);
      let r = row;
      let c = col;
      for (const ref of formulaRefs(f)) {
        if (ref.dynamic || ref.sheet === null || isThis(ref.sheet)) {
          r = Math.max(r, ref.maxRow);
          c = Math.max(c, ref.maxCol);
        }
      }
      if (nameRe?.test(f)) [r, c] = [ALL, ALL]; // uses a named range: treated as reaching everywhere
      if (r > maxRow || c > maxCol) example = `${columnLetter(col)}${row + 1}`;
      maxRow = Math.max(maxRow, r);
      maxCol = Math.max(maxCol, c);
    }
    if (sheet.formulas.size) add(`${sheet.formulas.size.toLocaleString("en-US")} formula${sheet.formulas.size > 1 ? "s" : ""} on this sheet (for example in ${example})`, maxRow, maxCol);
  }

  // 2. Merged cells and hyperlinks on this sheet.
  if (sheet.merges.length) {
    add(
      `${sheet.merges.length} merged cell range${sheet.merges.length > 1 ? "s" : ""}`,
      Math.max(...sheet.merges.map((m) => m.endRow)),
      Math.max(...sheet.merges.map((m) => m.endCol)),
    );
  }
  if (sheet.hyperlinks.size) {
    let r = -1;
    let c = -1;
    for (const key of sheet.hyperlinks.keys()) {
      const p = splitCellKey(key);
      r = Math.max(r, p.row);
      c = Math.max(c, p.col);
    }
    add("Hyperlinks", r, c);
  }

  // 3. The sheet's own XML outside the cell data.
  if (thisPart && byName.has(thisPart)) {
    const { head, tail } = await sheetHeadTail(blob, byName.get(thisPart)!, cancel);
    const xml = head + tail;
    const sq = (re: RegExp, label: string) => {
      let r = -1;
      let c = -1;
      let n = 0;
      for (const m of xml.matchAll(re)) {
        n++;
        const reach = sqrefReach(decodeXmlText(m[1]!));
        r = Math.max(r, reach.maxRow);
        c = Math.max(c, reach.maxCol);
      }
      if (n) add(label, r, c);
    };
    sq(/<(?:\w+:)?conditionalFormatting\b[^>]*\bsqref="([^"]*)"/g, "Conditional formatting");
    sq(/<(?:\w+:)?dataValidation\b[^>]*\bsqref="([^"]*)"/g, "Data validation");
    sq(/<xm:sqref>([^<]*)<\/xm:sqref>/g, "Conditional formatting or data validation (newer Excel format)");
    sq(/<(?:\w+:)?autoFilter\b[^>]*\bref="([^"]*)"/g, "Filter");
    sq(/<(?:\w+:)?protectedRange\b[^>]*\bsqref="([^"]*)"/g, "Protected ranges");
    sq(/<(?:\w+:)?hyperlink\b[^>]*\bref="([^"]*)"/g, "Hyperlinks");
    // Formulas inside rules (conditional formatting, validation) refer to this sheet when no sheet is named.
    let fr = -1;
    let fc = -1;
    for (const m of xml.matchAll(FORMULA_ELEMENTS)) {
      for (const ref of formulaRefs(decodeXmlText(m[2]!))) {
        if (ref.dynamic || ref.sheet === null || isThis(ref.sheet)) {
          fr = Math.max(fr, ref.maxRow);
          fc = Math.max(fc, ref.maxCol);
        }
      }
    }
    add("Formulas in conditional formatting or data validation rules", fr, fc);
    if (/<(?:\w+:)?sparklineGroups\b/.test(xml)) add("Sparklines", ALL, ALL);
    if (/<(?:\w+:)?(oleObjects|controls)\b/.test(xml)) add("Embedded objects or form controls", ALL, ALL);

    // 4. Parts linked from this sheet: tables, comments, drawings (images and charts), pivot tables.
    const relsXml = await read(relsPath(thisPart));
    for (const rel of relsXml ? parseRels(relsXml, thisPart) : []) {
      if (rel.external || rel.type === "printerSettings" || rel.type === "image" || rel.type === "hyperlink") continue;
      const partXml = await read(rel.target);
      if (partXml === null) continue;
      switch (rel.type) {
        case "table": {
          const ref = /<(?:\w+:)?table\b[^>]*\bref="([^"]*)"/.exec(partXml)?.[1];
          const reach = ref ? sqrefReach(ref) : { maxRow: ALL, maxCol: ALL };
          add(`Excel table “${attr(/<(?:\w+:)?table\b([^>]*)>/.exec(partXml)?.[1] ?? "", "displayName") ?? "table"}”`, reach.maxRow, reach.maxCol);
          break;
        }
        case "comments":
        case "threadedComment": {
          let r = -1;
          let c = -1;
          for (const m of partXml.matchAll(/\bref="([^"]*)"/g)) {
            const reach = sqrefReach(m[1]!);
            r = Math.max(r, reach.maxRow);
            c = Math.max(c, reach.maxCol);
          }
          add("Comments or notes", r, c);
          break;
        }
        case "vmlDrawing":
          if (!relsXml!.includes("/comments")) add("Form controls or notes drawn on the sheet", ALL, ALL);
          break;
        case "drawing": {
          let r = -1;
          let c = -1;
          for (const m of partXml.matchAll(/<(?:\w+:)?(?:from|to)>\s*<(?:\w+:)?col>(\d+)<\/(?:\w+:)?col>[\s\S]*?<(?:\w+:)?row>(\d+)<\/(?:\w+:)?row>/g)) {
            c = Math.max(c, Number(m[1]));
            r = Math.max(r, Number(m[2]));
          }
          add("Images, shapes or charts placed on the sheet", r, c);
          break;
        }
        case "pivotTable": {
          const ref = /<(?:\w+:)?location\b[^>]*\bref="([^"]*)"/.exec(partXml)?.[1];
          const reach = ref ? sqrefReach(ref) : { maxRow: ALL, maxCol: ALL };
          add("Pivot table on this sheet", reach.maxRow, reach.maxCol);
          break;
        }
        default:
          add(`Other workbook content linked to this sheet (${rel.type || "unknown"})`, ALL, ALL);
      }
    }
  }

  // 5. Named ranges.
  for (const n of names) {
    let r = -1;
    let c = -1;
    for (const ref of formulaRefs(n.text)) {
      const local = n.local !== null && Number(n.local) === sheetIndex;
      if (ref.dynamic || isThis(ref.sheet) || (ref.sheet === null && local)) {
        r = Math.max(r, ref.maxRow);
        c = Math.max(c, ref.maxCol);
      }
    }
    const label = n.name.startsWith("_xlnm.") ? `Built-in name ${n.name.slice(6).replace(/_/g, " ")}` : `Named range “${n.name}”`;
    add(label, r, c);
  }

  // 6. Charts anywhere in the workbook that use data from this sheet.
  for (const e of entries) {
    if (!/^xl\/charts\/chart[^/]*\.xml$/.test(e.name)) continue;
    const xml = await readEntryText(blob, e, cancel);
    let r = -1;
    let c = -1;
    for (const m of xml.matchAll(/<(?:\w+:)?f>([^<]*)<\/(?:\w+:)?f>/g)) {
      for (const ref of formulaRefs(decodeXmlText(m[1]!))) {
        if (ref.dynamic || isThis(ref.sheet)) {
          r = Math.max(r, ref.maxRow);
          c = Math.max(c, ref.maxCol);
        }
      }
    }
    add(`Chart (${e.name.split("/").pop()})`, r, c);
  }

  // 7. Pivot table sources.
  for (const e of entries) {
    if (!/^xl\/pivotCache\/pivotCacheDefinition[^/]*\.xml$/.test(e.name)) continue;
    const xml = await readEntryText(blob, e, cancel);
    const src = /<(?:\w+:)?worksheetSource\b([^>]*)\/?>/.exec(xml)?.[1];
    if (!src) continue;
    if (attr(src, "name")) add("Pivot table source (named range)", ALL, ALL);
    else if (isThis(attr(src, "sheet"))) {
      const reach = sqrefReach(attr(src, "ref") ?? "");
      add("Pivot table source", reach.maxRow < 0 ? ALL : reach.maxRow, reach.maxCol < 0 ? ALL : reach.maxCol);
    }
  }

  // 8. Formulas and rules on the other sheets that refer to this sheet.
  for (let i = 0; i < sheets.length; i++) {
    const part = sheets[i]!.part;
    if (i === sheetIndex || !part || !byName.has(part) || !/\/worksheets\//.test(part)) continue;
    let r = -1;
    let c = -1;
    const decoder = new TextDecoder("utf-8");
    let buf = "";
    const scan = (final: boolean) => {
      for (const m of buf.matchAll(FORMULA_ELEMENTS)) {
        for (const ref of formulaRefs(decodeXmlText(m[2]!))) {
          if (ref.dynamic || isThis(ref.sheet)) {
            r = Math.max(r, ref.maxRow);
            c = Math.max(c, ref.maxCol);
          }
        }
      }
      // Keep enough text for an element cut at the chunk edge (Excel formulas are at most 8,192 characters).
      buf = final ? "" : buf.slice(-40_000);
    };
    await streamEntry(
      blob,
      byName.get(part)!,
      (d) => {
        buf += decoder.decode(d, { stream: true });
        if (buf.length > 4_000_000) scan(false);
      },
      { cancel },
    );
    buf += decoder.decode();
    scan(true);
    add(`Formulas or rules on sheet “${sheets[i]!.name}”`, r, c);
  }

  if (/<(?:\w+:)?externalReference\b/.test(workbookXml)) notes.push("This workbook links to other workbooks.");
  notes.push("Other files that link to this workbook can't be checked.");
  return { features, notes };
}

/** Features that removing these rows/columns could break (empty: safe to remove). */
export function affectedBy(index: ReferenceIndex, deletedRows: number[], deletedCols: number[]): string[] {
  const minRow = deletedRows.length ? Math.min(...deletedRows) : ALL;
  const minCol = deletedCols.length ? Math.min(...deletedCols) : ALL;
  return index.features.filter((f) => (minRow !== ALL && f.maxRow >= minRow) || (minCol !== ALL && f.maxCol >= minCol)).map((f) => f.label);
}
