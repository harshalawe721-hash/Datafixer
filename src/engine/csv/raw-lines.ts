/**
 * Stage 5: read selected rows exactly as they are written in the original CSV
 * file (the "raw line"), so the validator can show the actual characters:
 * separators, quotes, hidden characters, line breaks inside values.
 *
 * The file is decoded the same way the reader did (same encoding, BOM skipped)
 * and rows are found with the same quote rules (LineEndingNormaliser). Reading
 * stops as soon as every requested row has been found, so examples near the
 * top of a large file cost almost nothing. Only the first MAX_RAW characters
 * of each row are kept.
 */
import type { CsvMeta } from "../types.ts";
import { throwIfCancelled, yieldToEventLoop, type CancelToken } from "../cancel.ts";
import { decodeBlobText } from "./encoding.ts";
import { LineEndingNormaliser } from "./line-endings.ts";

export const MAX_RAW = 300;
/** Text kept after the current position, for row ends decided late (a CR or a quote at a chunk end). */
const KEEP_TAIL = 65536;

export interface RawLine {
  /** Line number in the file (1-based) where the row starts. */
  line: number;
  /** The row's text as written, without its final line break (at most MAX_RAW characters). */
  text: string;
  /** True when the row is longer than MAX_RAW characters (or never ends: an unclosed quote). */
  truncated: boolean;
}

export function bomLengthOf(meta: Pick<CsvMeta, "encoding" | "hadBom">): number {
  if (!meta.hadBom) return 0;
  return meta.encoding === "utf-8" ? 3 : 2;
}

export async function readRawLines(
  file: Blob,
  meta: Pick<CsvMeta, "encoding" | "hadBom" | "delimiter">,
  rows: Iterable<number>,
  options: { cancel?: CancelToken; chunkBytes?: number; onProgress?: (loaded: number, total: number) => void } = {},
): Promise<Map<number, RawLine>> {
  const want = new Set(rows);
  const found = new Map<number, RawLine>();
  if (want.size === 0) return found;
  const lastWanted = Math.max(...want);

  const endings = new LineEndingNormaliser(meta.delimiter);
  let buf = "";
  let bufBase = 0; // absolute offset of buf[0]
  let rowStart = 0; // absolute offset where the current row starts
  let rowLine = 1; // file line where the current row starts
  let head: string | null = null; // first MAX_RAW+ characters of a very long current row
  let done = false;

  const take = (row: number, end: number) => {
    const text = head ?? buf.slice(rowStart - bufBase, end - bufBase);
    found.set(row, { line: rowLine, text: text.slice(0, MAX_RAW), truncated: head !== null || text.length > MAX_RAW });
  };
  endings.onRowEnd = (row, breakAt, nextRowAt) => {
    if (want.has(row)) take(row, breakAt);
    rowStart = nextRowAt;
    rowLine = row + 2 + endings.quotedBreaks;
    head = null;
    if (row >= lastWanted) done = true;
  };

  for await (const chunk of decodeBlobText(file, meta.encoding, { startByte: bomLengthOf(meta), chunkBytes: options.chunkBytes, onBytes: (n) => options.onProgress?.(n, file.size) })) {
    throwIfCancelled(options.cancel);
    buf += chunk;
    endings.push(chunk);
    if (done) break;
    // Drop text before the current row; keep only the head of a very long row.
    if (rowStart > bufBase) {
      buf = buf.slice(rowStart - bufBase);
      bufBase = rowStart;
    }
    if (buf.length > MAX_RAW + 2 * KEEP_TAIL) {
      if (head === null) head = buf.slice(0, MAX_RAW + 1);
      const drop = buf.length - KEEP_TAIL;
      buf = buf.slice(drop);
      bufBase += drop;
      // Once the current row is the last one wanted and its head is kept, there is nothing more to learn.
      if (endings.row >= lastWanted && want.has(endings.row)) {
        take(endings.row, bufBase + buf.length);
        break;
      }
    }
    await yieldToEventLoop();
  }
  if (!done) {
    endings.push("", true);
    // The last row has no line break (or a quote never closed).
    const row = endings.row;
    if (want.has(row) && !found.has(row)) {
      const end = bufBase + buf.length;
      if (end > rowStart || head !== null) take(row, end);
    }
  }
  return found;
}

export { visibleRaw } from "./visible.ts";
