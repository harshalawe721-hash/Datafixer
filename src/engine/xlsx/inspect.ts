/**
 * Safety inspection of XLSX (ZIP/OOXML) files before full parsing.
 *
 * One streaming pass over the archive with fflate:
 * - decompresses every part but keeps only small metadata parts, so memory
 *   stays bounded no matter how large the workbook expands;
 * - enforces limits on the bytes actually produced (ZIP headers can lie), so
 *   decompression bombs are stopped early;
 * - rejects XML containing <!DOCTYPE / <!ENTITY (entity-expansion attacks);
 * - lists sheets (name, visibility, kind, declared dimension, part size) and
 *   workbook features that later stages must not silently drop.
 */
import { Unzip, UnzipInflate, type UnzipFile } from "fflate";
import { EngineError } from "../errors.ts";
import { throwIfCancelled, yieldToEventLoop, type CancelToken } from "../cancel.ts";
import type { FeatureInventory, SheetInfo } from "../types.ts";

export interface InspectLimits {
  /** Max decompressed size of a single part. */
  maxPartBytes: number;
  /** Max decompressed size of all parts together. */
  maxTotalBytes: number;
  maxEntries: number;
}

/**
 * Defaults. A single XML part larger than ~500 MB cannot be turned into one
 * JavaScript string (V8's limit is ~536 million characters), which the XLSX
 * parser requires, so it is rejected up front with a clear explanation.
 */
export const DEFAULT_LIMITS: InspectLimits = {
  maxPartBytes: 500 * 1024 * 1024,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
  maxEntries: 10000,
};

export interface InspectedSheet extends SheetInfo {
  /** Path of the sheet's XML part inside the archive, e.g. "xl/worksheets/sheet1.xml". */
  part: string | null;
  /** Declared used range from <dimension ref="…">, e.g. "A1:F2000". */
  dimension: string | null;
  /** Decompressed size of the sheet part in bytes. */
  uncompressedBytes: number;
}

export interface InspectionResult {
  entries: number;
  compressedBytes: number;
  uncompressedBytes: number;
  largestPart: { name: string; bytes: number };
  sheets: InspectedSheet[];
  features: FeatureInventory;
  /** "transitional" (normal) or "strict" OOXML. */
  conformance: "transitional" | "strict";
  /** Decompressed size of xl/sharedStrings.xml (0 if none). */
  sharedStringsBytes: number;
  /**
   * Characters outside the Basic Multilingual Plane (emoji, rare CJK) written as
   * numeric references such as "&#128512;". SheetJS 0.20.3 decodes these with
   * String.fromCharCode, which keeps only the low 16 bits (😀 becomes U+F600).
   * `repair` maps each corrupted character back to the real one where that is
   * unambiguous; `ambiguous` counts characters that cannot be restored safely.
   */
  astralRefs: { repair: Record<string, string>; ambiguous: number };
}

export interface InspectOptions {
  limits?: Partial<InspectLimits>;
  cancel?: CancelToken;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
  chunkBytes?: number;
}

/** Small parts we keep in full to read sheet names and relationships. */
const KEEP_PARTS = new Set(["[Content_Types].xml", "xl/workbook.xml", "xl/_rels/workbook.xml.rels"]);
const KEEP_MAX_BYTES = 8 * 1024 * 1024;
/** Longest marker we search for; carried across chunks so split markers are found. */
const CARRY = 32;
/** Bytes at the start of a sheet part scanned for <dimension>. */
const SHEET_HEAD_BYTES = 4096;

export function emptyFeatures(): FeatureInventory {
  return {
    charts: 0,
    images: 0,
    pivotTables: 0,
    tables: 0,
    comments: 0,
    externalLinks: 0,
    macros: false,
    dataValidation: false,
    conditionalFormatting: false,
    embeddedObjects: 0,
  };
}

function classifyPart(name: string, f: FeatureInventory): void {
  if (/^xl\/charts\/chart\d*\.xml$/i.test(name)) f.charts++;
  else if (/^xl\/media\//i.test(name)) f.images++;
  else if (/^xl\/pivotTables\/[^/]+\.xml$/i.test(name)) f.pivotTables++;
  else if (/^xl\/tables\/[^/]+\.xml$/i.test(name)) f.tables++;
  else if (/^xl\/comments\d*\.xml$/i.test(name) || /^xl\/threadedComments\/[^/]+\.xml$/i.test(name)) f.comments++;
  else if (/^xl\/externalLinks\/externalLink\d*\.xml$/i.test(name)) f.externalLinks++;
  else if (/^xl\/vbaProject\.bin$/i.test(name)) f.macros = true;
  else if (/^xl\/(embeddings|activeX)\//i.test(name) && !/\.rels$/i.test(name)) f.embeddedObjects++;
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

export function decodeXmlText(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    return XML_ENTITIES[e.toLowerCase()] ?? m;
  });
}

function attr(tag: string, name: string): string | null {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(tag);
  return m ? decodeXmlText(m[2] ?? m[3] ?? "") : null;
}

/** Resolve a relationship target (relative to xl/) to an archive path. */
function resolveTarget(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = ["xl"];
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

export function parseWorkbookSheets(workbookXml: string, relsXml: string | undefined): InspectedSheet[] {
  const rels = new Map<string, string>();
  if (relsXml) {
    for (const m of relsXml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)\/?>/g)) {
      const id = attr(m[1]!, "Id");
      const target = attr(m[1]!, "Target");
      const mode = attr(m[1]!, "TargetMode");
      if (id && target && mode !== "External") rels.set(id, resolveTarget(target));
    }
  }
  const sheets: InspectedSheet[] = [];
  for (const m of workbookXml.matchAll(/<(?:\w+:)?sheet\b([^>]*)\/?>/g)) {
    const a = m[1]!;
    const name = attr(a, "name");
    if (name === null) continue;
    const state = attr(a, "state");
    const rid = /\b(?:\w+:)?id\s*=\s*"([^"]*)"/.exec(a)?.[1] ?? null;
    const part = rid ? (rels.get(rid) ?? null) : null;
    const kind: SheetInfo["kind"] = part
      ? /\/worksheets\//.test(part)
        ? "worksheet"
        : /\/chartsheets\//.test(part)
          ? "chartsheet"
          : "other"
      : "worksheet";
    sheets.push({
      name,
      state: state === "hidden" ? "hidden" : state === "veryHidden" ? "veryHidden" : "visible",
      kind,
      part,
      dimension: null,
      uncompressedBytes: 0,
    });
  }
  return sheets;
}

interface PartState {
  name: string;
  bytes: number;
  isXml: boolean;
  isSheet: boolean;
  keep: Uint8Array[] | null;
  decoder: TextDecoder | null;
  carry: string;
  head: string;
}

const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/** Parts whose text ends up in cell values or sheet names. */
function carriesCellText(name: string): boolean {
  return (
    name === "xl/sharedStrings.xml" ||
    name === "xl/workbook.xml" ||
    /^xl\/worksheets\/[^/]+\.xml$/i.test(name) ||
    /^xl\/comments\d*\.xml$/i.test(name)
  );
}

const NUMERIC_REF = /&#(x[0-9a-fA-F]{1,6}|\d{1,7});/g;

export async function inspectXlsx(blob: Blob, options: InspectOptions = {}): Promise<InspectionResult> {
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const sig = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (OLE2_SIGNATURE.every((b, i) => sig[i] === b)) {
    throw new EngineError(
      "encrypted-file",
      "This workbook is password-protected (encrypted), so it can't be opened. Remove the password in Excel (File → Info → Protect Workbook) and save it again, then try once more.",
    );
  }
  const chunkBytes = options.chunkBytes ?? 4 * 1024 * 1024;
  const features = emptyFeatures();
  const kept = new Map<string, Uint8Array>();
  const sheetParts = new Map<string, { bytes: number; dimension: string | null }>();
  let entries = 0;
  let total = 0;
  let largest = { name: "", bytes: 0 };
  let failure: EngineError | null = null;
  let strict = false;
  let sharedStringsBytes = 0;
  /** low 16 bits → set of astral code points referenced numerically */
  const astral = new Map<number, Set<number>>();
  /** BMP code points referenced numerically (legitimate uses of a low-16 value) */
  const bmpRefs = new Set<number>();
  const open = new Set<PartState>();

  const fail = (e: EngineError) => {
    if (!failure) failure = e;
  };

  const unzip = new Unzip((file: UnzipFile) => {
    if (failure) return;
    entries++;
    if (entries > limits.maxEntries) {
      fail(new EngineError("zip-bomb", `This workbook contains more than ${limits.maxEntries.toLocaleString("en-US")} internal parts, which is not normal for a spreadsheet. It was not opened for safety.`));
      return;
    }
    const name = file.name;
    if (name.includes("\0") || name.split("/").includes("..")) {
      fail(new EngineError("unsafe-content", "This workbook contains an invalid internal file name. It was not opened for safety."));
      return;
    }
    classifyPart(name, features);
    const isXml = /\.(xml|rels|vml)$/i.test(name);
    const st: PartState = {
      name,
      bytes: 0,
      isXml,
      isSheet: /^xl\/worksheets\/[^/]+\.xml$/i.test(name),
      keep: KEEP_PARTS.has(name) ? [] : null,
      decoder: isXml ? new TextDecoder("utf-8") : null,
      carry: "",
      head: "",
    };
    open.add(st);
    file.ondata = (err, data, final) => {
      if (failure) return;
      if (err) {
        fail(new EngineError("corrupt-file", "This workbook is damaged: part of it could not be decompressed.", `${name}: ${err.message}`));
        return;
      }
      st.bytes += data.length;
      total += data.length;
      if (st.bytes > limits.maxPartBytes) {
        file.terminate();
        fail(
          new EngineError(
            "too-large-for-engine",
            `One part of this workbook expands to more than ${Math.round(limits.maxPartBytes / 1024 / 1024)} MB of data, which is more than a web browser can read in one piece. Try saving the sheet as CSV, or splitting it into several smaller sheets or files.`,
            `${name} > ${limits.maxPartBytes} bytes`,
          ),
        );
        return;
      }
      if (total > limits.maxTotalBytes) {
        file.terminate();
        fail(
          new EngineError(
            "zip-bomb",
            `This workbook expands to more than ${Math.round(limits.maxTotalBytes / 1024 / 1024 / 1024)} GB when opened. That is too much to process safely in a browser (and can be a sign of a malicious "zip bomb" file). It was not opened.`,
          ),
        );
        return;
      }
      if (st.keep) {
        if (st.bytes > KEEP_MAX_BYTES) st.keep = null;
        else st.keep.push(data);
      }
      if (st.decoder) {
        const text = st.carry + st.decoder.decode(data, { stream: !final });
        if (text.includes("<!DOCTYPE") || text.includes("<!ENTITY")) {
          file.terminate();
          fail(new EngineError("unsafe-content", "This workbook contains XML features (document type definitions) that real spreadsheets don't use and that can be used in attacks. It was not opened for safety.", name));
          return;
        }
        if (st.isSheet) {
          if (st.head.length < SHEET_HEAD_BYTES) st.head += text.slice(0, SHEET_HEAD_BYTES - st.head.length);
          // Element names only ("<dataValidations" or "<x14:dataValidations"), not cell text.
          if (!features.dataValidation && /<(?:\w+:)?dataValidations\b/.test(text)) features.dataValidation = true;
          if (!features.conditionalFormatting && /<(?:\w+:)?conditionalFormatting\b/.test(text)) features.conditionalFormatting = true;
        }
        if (name === "xl/workbook.xml" && text.includes("purl.oclc.org/ooxml")) strict = true;
        if (carriesCellText(name) && text.includes("&#")) {
          for (const m of text.matchAll(NUMERIC_REF)) {
            const ref = m[1]!;
            const cp = ref[0] === "x" ? parseInt(ref.slice(1), 16) : parseInt(ref, 10);
            if (!(cp >= 0 && cp <= 0x10ffff)) continue;
            if (cp > 0xffff) {
              const low = cp & 0xffff;
              let set = astral.get(low);
              if (!set) astral.set(low, (set = new Set()));
              set.add(cp);
            } else bmpRefs.add(cp);
          }
        }
        st.carry = text.slice(-CARRY);
      }
      if (final) {
        open.delete(st);
        if (st.bytes > largest.bytes) largest = { name, bytes: st.bytes };
        if (name === "xl/sharedStrings.xml") sharedStringsBytes = st.bytes;
        if (st.keep) kept.set(name, concat(st.keep));
        if (st.isSheet) {
          const dim = /<(?:\w+:)?dimension\b[^>]*\bref\s*=\s*"([^"]+)"/.exec(st.head)?.[1] ?? null;
          sheetParts.set(name, { bytes: st.bytes, dimension: dim });
        }
      }
    };
    file.start();
  });
  unzip.register(UnzipInflate);

  let offset = 0;
  try {
    while (offset < blob.size && !failure) {
      throwIfCancelled(options.cancel);
      const end = Math.min(offset + chunkBytes, blob.size);
      const chunk = new Uint8Array(await blob.slice(offset, end).arrayBuffer());
      offset = end;
      unzip.push(chunk, offset >= blob.size);
      options.onProgress?.(offset, blob.size);
      await yieldToEventLoop();
    }
  } catch (err) {
    if (err instanceof EngineError) throw err;
    throw new EngineError("corrupt-file", "This workbook is damaged and could not be read. Try opening it in Excel and saving it again.", String(err));
  }
  if (failure) throw failure;
  throwIfCancelled(options.cancel);

  if (open.size > 0 || entries === 0) {
    throw new EngineError("corrupt-file", "This workbook is incomplete or damaged (it may have been cut off while downloading). Try downloading or saving it again.", `${open.size} unfinished part(s), ${entries} entries`);
  }

  if (!kept.has("[Content_Types].xml")) {
    throw new EngineError("unsupported-format", "This file is a ZIP archive but not an Excel workbook.");
  }
  const workbookXml = kept.get("xl/workbook.xml");
  if (!workbookXml) {
    const types = new TextDecoder().decode(kept.get("[Content_Types].xml"));
    if (types.includes("wordprocessingml")) throw new EngineError("unsupported-format", "This is a Word document, not an Excel workbook.");
    if (types.includes("presentationml")) throw new EngineError("unsupported-format", "This is a PowerPoint presentation, not an Excel workbook.");
    if (types.includes("sheet.binary") || /xl\/workbook\.bin/.test(types)) {
      throw new EngineError("unsupported-format", "This is an Excel Binary Workbook (.xlsb), which DataFixer does not support. Open it in Excel and save it as .xlsx.");
    }
    throw new EngineError("unsupported-format", "This file is a ZIP archive but not an Excel workbook.");
  }

  const dec = new TextDecoder();
  const rels = kept.get("xl/_rels/workbook.xml.rels");
  const sheets = parseWorkbookSheets(dec.decode(workbookXml), rels ? dec.decode(rels) : undefined);
  for (const s of sheets) {
    const info = s.part ? sheetParts.get(s.part) : undefined;
    if (info) {
      s.uncompressedBytes = info.bytes;
      s.dimension = info.dimension;
    }
  }
  if (sheets.length === 0) {
    throw new EngineError("corrupt-file", "This workbook does not list any sheets. It may be damaged.");
  }

  // Work out which corrupted characters can be restored unambiguously: exactly
  // one astral character maps to that low-16 value, and the low-16 character
  // itself never appears legitimately (as a reference or as raw text).
  const repair: Record<string, string> = {};
  let ambiguous = 0;
  if (astral.size > 0) {
    const candidates = new Map<string, string>();
    for (const [low, cps] of astral) {
      if (cps.size === 1 && !bmpRefs.has(low)) candidates.set(String.fromCharCode(low), String.fromCodePoint([...cps][0]!));
      else ambiguous += cps.size;
    }
    if (candidates.size > 0) {
      const seenRaw = await findRawChars(blob, new Set(candidates.keys()), chunkBytes, options.cancel);
      for (const [low, real] of candidates) {
        if (seenRaw.has(low)) ambiguous++;
        else repair[low] = real;
      }
    }
  }

  return {
    sharedStringsBytes,
    astralRefs: { repair, ambiguous },
    entries,
    compressedBytes: blob.size,
    uncompressedBytes: total,
    largestPart: largest,
    sheets,
    features,
    conformance: strict ? "strict" : "transitional",
  };
}

/**
 * Second, targeted pass (only when astral references exist): which of the given
 * characters appear as raw text in parts that carry cell text?
 */
async function findRawChars(blob: Blob, chars: Set<string>, chunkBytes: number, cancel?: CancelToken): Promise<Set<string>> {
  const found = new Set<string>();
  const unzip = new Unzip((file: UnzipFile) => {
    if (!carriesCellText(file.name)) return;
    const decoder = new TextDecoder("utf-8");
    file.ondata = (err, data, final) => {
      if (err || found.size === chars.size) return;
      const text = decoder.decode(data, { stream: !final });
      for (const ch of chars) if (!found.has(ch) && text.includes(ch)) found.add(ch);
    };
    file.start();
  });
  unzip.register(UnzipInflate);
  for (let offset = 0; offset < blob.size && found.size < chars.size; ) {
    throwIfCancelled(cancel);
    const end = Math.min(offset + chunkBytes, blob.size);
    unzip.push(new Uint8Array(await blob.slice(offset, end).arrayBuffer()), end >= blob.size);
    offset = end;
    await yieldToEventLoop();
  }
  return found;
}

function concat(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1) return parts[0]!;
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** "A1:F2000" → { rows: 2000, columns: 6 } (declared, not verified). */
export function dimensionSize(ref: string | null): { rows: number; columns: number } | null {
  if (!ref) return null;
  const m = /^\$?([A-Z]{1,3})\$?(\d+)(?::\$?([A-Z]{1,3})\$?(\d+))?$/i.exec(ref.trim());
  if (!m) return null;
  const col = (s: string) => [...s.toUpperCase()].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const c1 = col(m[1]!);
  const r1 = Number(m[2]);
  const c2 = m[3] ? col(m[3]) : c1;
  const r2 = m[4] ? Number(m[4]) : r1;
  return { rows: Math.abs(r2 - r1) + 1, columns: Math.abs(c2 - c1) + 1 };
}
