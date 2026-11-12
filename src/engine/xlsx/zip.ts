/**
 * Minimal ZIP reading and writing for patching XLSX packages (Stage 4, Step 7).
 *
 * Reading uses the central directory, so any single part can be read (and
 * decompressed in a stream) without touching the others. Writing copies the
 * compressed bytes of unchanged parts exactly as they are (no decompression,
 * so they stay byte-identical), and adds newly compressed bytes for changed
 * parts. The output is assembled from Blob slices of the original file, so
 * unchanged parts are never even copied into JavaScript memory.
 */
import { Deflate, Inflate } from "fflate";
import { EngineError } from "../errors.ts";
import { throwIfCancelled, yieldToEventLoop, type CancelToken } from "../cancel.ts";

export interface ZipEntry {
  name: string;
  /** 0 = stored, 8 = deflate. */
  method: number;
  flags: number;
  modTime: number;
  modDate: number;
  crc32: number;
  compressedSize: number;
  size: number;
  versionMadeBy: number;
  versionNeeded: number;
  internalAttr: number;
  externalAttr: number;
  localHeaderOffset: number;
}

const unsupported = (detail: string) =>
  new EngineError(
    "unsupported-format",
    "This Excel file uses a ZIP layout DataFixer can't rewrite safely (for example a very large ZIP64 package). Download it as CSV instead, or save it again in Excel and retry.",
    detail,
  );

/** Read the central directory (entries in their original order). */
export async function readZipEntries(blob: Blob): Promise<ZipEntry[]> {
  const tailSize = Math.min(blob.size, 65_557); // EOCD (22) + max comment (65,535)
  const tail = new Uint8Array(await blob.slice(blob.size - tailSize).arrayBuffer());
  const dv = new DataView(tail.buffer);
  let eocd = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw unsupported("no end of central directory");
  const count = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) throw unsupported("ZIP64");
  const cd = new Uint8Array(await blob.slice(cdOffset, cdOffset + cdSize).arrayBuffer());
  const c = new DataView(cd.buffer);
  const utf8 = new TextDecoder("utf-8");
  const latin1 = new TextDecoder("latin1");
  const entries: ZipEntry[] = [];
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (c.getUint32(p, true) !== 0x02014b50) throw unsupported("bad central directory entry");
    const flags = c.getUint16(p + 8, true);
    const nameLen = c.getUint16(p + 28, true);
    const extraLen = c.getUint16(p + 30, true);
    const commentLen = c.getUint16(p + 32, true);
    const nameBytes = cd.subarray(p + 46, p + 46 + nameLen);
    const e: ZipEntry = {
      name: (flags & 0x800 ? utf8 : latin1).decode(nameBytes),
      versionMadeBy: c.getUint16(p + 4, true),
      versionNeeded: c.getUint16(p + 6, true),
      flags,
      method: c.getUint16(p + 10, true),
      modTime: c.getUint16(p + 12, true),
      modDate: c.getUint16(p + 14, true),
      crc32: c.getUint32(p + 16, true),
      compressedSize: c.getUint32(p + 20, true),
      size: c.getUint32(p + 24, true),
      internalAttr: c.getUint16(p + 36, true),
      externalAttr: c.getUint32(p + 38, true),
      localHeaderOffset: c.getUint32(p + 42, true),
    };
    if (e.compressedSize === 0xffffffff || e.size === 0xffffffff || e.localHeaderOffset === 0xffffffff) throw unsupported("ZIP64 entry");
    if (e.flags & 0x1) throw new EngineError("encrypted-file", "This file is password-protected.");
    entries.push(e);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Where an entry's compressed data starts in the file. */
async function dataOffset(blob: Blob, e: ZipEntry): Promise<number> {
  const h = new DataView(await blob.slice(e.localHeaderOffset, e.localHeaderOffset + 30).arrayBuffer());
  if (h.getUint32(0, true) !== 0x04034b50) throw unsupported(`bad local header for ${e.name}`);
  return e.localHeaderOffset + 30 + h.getUint16(26, true) + h.getUint16(28, true);
}

/** The compressed bytes of an entry, as a slice of the original file (not copied). */
export async function rawEntryData(blob: Blob, e: ZipEntry): Promise<Blob> {
  const start = await dataOffset(blob, e);
  return blob.slice(start, start + e.compressedSize);
}

/** Decompress an entry in a stream, calling `onData` with each piece of bytes. */
export async function streamEntry(
  blob: Blob,
  e: ZipEntry,
  onData: (chunk: Uint8Array) => void,
  options: { cancel?: CancelToken; chunkBytes?: number; maxBytes?: number } = {},
): Promise<void> {
  const raw = await rawEntryData(blob, e);
  const chunkBytes = options.chunkBytes ?? 4 * 1024 * 1024;
  const maxBytes = options.maxBytes ?? 600 * 1024 * 1024;
  let produced = 0;
  const emit = (d: Uint8Array) => {
    produced += d.length;
    if (produced > maxBytes) throw new EngineError("zip-bomb", "A part of this workbook expands to an unsafe size.", e.name);
    if (d.length) onData(d);
  };
  if (e.method === 0) {
    for (let off = 0; off < raw.size; off += chunkBytes) {
      emit(new Uint8Array(await raw.slice(off, off + chunkBytes).arrayBuffer()));
      throwIfCancelled(options.cancel);
    }
    return;
  }
  if (e.method !== 8) throw unsupported(`compression method ${e.method} in ${e.name}`);
  const inflate = new Inflate();
  inflate.ondata = (d) => emit(d);
  for (let off = 0; off < raw.size; off += chunkBytes) {
    const end = Math.min(raw.size, off + chunkBytes);
    inflate.push(new Uint8Array(await raw.slice(off, end).arrayBuffer()), end >= raw.size);
    throwIfCancelled(options.cancel);
    await yieldToEventLoop();
  }
  if (raw.size === 0) inflate.push(new Uint8Array(0), true);
}

/** A whole (small) part as text. */
export async function readEntryText(blob: Blob, e: ZipEntry, cancel?: CancelToken): Promise<string> {
  const decoder = new TextDecoder("utf-8");
  let out = "";
  await streamEntry(blob, e, (d) => (out += decoder.decode(d, { stream: true })), { cancel });
  return out + decoder.decode();
}

// ---------------------------------------------------------------- CRC-32

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export class Crc32 {
  private c = 0xffffffff;
  update(d: Uint8Array): void {
    let c = this.c;
    for (let i = 0; i < d.length; i++) c = CRC_TABLE[(c ^ d[i]!) & 0xff]! ^ (c >>> 8);
    this.c = c;
  }
  get value(): number {
    return (this.c ^ 0xffffffff) >>> 0;
  }
}

// ---------------------------------------------------------------- writing

/** A part whose new content is produced as a stream of bytes. */
export class PartWriter {
  private readonly crc = new Crc32();
  private readonly deflate: Deflate;
  private readonly chunks: Uint8Array[] = [];
  size = 0;
  compressedSize = 0;
  constructor() {
    this.deflate = new Deflate({ level: 6 });
    this.deflate.ondata = (d) => {
      this.chunks.push(d);
      this.compressedSize += d.length;
    };
  }
  push(d: Uint8Array): void {
    if (!d.length) return;
    this.crc.update(d);
    this.size += d.length;
    this.deflate.push(d, false);
  }
  finish(): { data: Blob; crc32: number; size: number; compressedSize: number } {
    this.deflate.push(new Uint8Array(0), true);
    return { data: new Blob(this.chunks as BlobPart[]), crc32: this.crc.value, size: this.size, compressedSize: this.compressedSize };
  }
}

export type OutputEntry =
  | { kind: "copy"; entry: ZipEntry }
  | { kind: "new"; entry: ZipEntry; data: Blob; crc32: number; size: number; compressedSize: number };

const encoder = new TextEncoder();

/**
 * Assemble a ZIP from copied and new entries, in the given order. Copied
 * entries keep their compressed bytes, CRC, sizes, times and attributes.
 */
export async function writeZip(source: Blob, out: OutputEntry[]): Promise<Blob> {
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const o of out) {
    const e = o.entry;
    const nameBytes = encoder.encode(e.name);
    const nonAscii = /[^\x00-\x7f]/.test(e.name);
    // Sizes are in the headers, so no data descriptor is needed (bit 3 cleared); keep the UTF-8 name flag.
    const flags = (e.flags & ~0x8) | (nonAscii ? 0x800 : 0);
    const method = o.kind === "copy" ? e.method : 8;
    const crc = o.kind === "copy" ? e.crc32 : o.crc32;
    const csize = o.kind === "copy" ? e.compressedSize : o.compressedSize;
    const size = o.kind === "copy" ? e.size : o.size;
    const data = o.kind === "copy" ? await rawEntryData(source, e) : o.data;
    if (offset > 0xfffffff0 || csize > 0xfffffff0) throw unsupported("output would need ZIP64");

    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, Math.max(20, e.versionNeeded), true);
    lh.setUint16(6, flags, true);
    lh.setUint16(8, method, true);
    lh.setUint16(10, e.modTime, true);
    lh.setUint16(12, e.modDate, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, csize, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), nameBytes, data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, e.versionMadeBy || 20, true);
    ch.setUint16(6, Math.max(20, e.versionNeeded), true);
    ch.setUint16(8, flags, true);
    ch.setUint16(10, method, true);
    ch.setUint16(12, e.modTime, true);
    ch.setUint16(14, e.modDate, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, csize, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint16(30, 0, true);
    ch.setUint16(32, 0, true);
    ch.setUint16(34, 0, true);
    ch.setUint16(36, e.internalAttr, true);
    ch.setUint32(38, e.externalAttr, true);
    ch.setUint32(42, offset, true);
    const rec = new Uint8Array(46 + nameBytes.length);
    rec.set(new Uint8Array(ch.buffer), 0);
    rec.set(nameBytes, 46);
    central.push(rec);
    offset += 30 + nameBytes.length + csize;
  }
  let cdSize = 0;
  for (const r of central) cdSize += r.length;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, out.length, true);
  eocd.setUint16(10, out.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as BlobPart[]), new Uint8Array(eocd.buffer)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Stream a string into a PartWriter. */
export function pushText(w: PartWriter, s: string): void {
  if (s) w.push(encoder.encode(s));
}
