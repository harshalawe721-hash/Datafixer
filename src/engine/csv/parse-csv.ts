/**
 * Chunked CSV reader.
 *
 * Papa Parse does the CSV parsing (quotes, delimiters, line endings). We do NOT
 * pass it the File directly: Papa's file reader decodes each byte slice on its
 * own, which corrupts multi-byte characters that straddle a slice boundary
 * (verified: "Café" became "Caf�"). Instead we read the file in slices,
 * decode with a streaming TextDecoder (which carries split characters over) and
 * hand Papa the decoded text through its documented stream interface.
 *
 * Memory: only one slice of raw bytes is held at a time; parsed rows go
 * straight into the sheet model.
 */
import Papa from "papaparse";
import { addIssue, createSheet, type CellValue, type CsvMeta, type SheetModel } from "../types.ts";
import { EngineError } from "../errors.ts";
import { throwIfCancelled, yieldToEventLoop, type CancelToken } from "../cancel.ts";
import { decodeBlobText, detectEncoding } from "./encoding.ts";
import { detectDelimiter } from "./delimiter.ts";

export interface CsvParseOptions {
  /** Force a delimiter; otherwise it is detected from the start of the file. */
  delimiter?: string;
  /** Force an encoding label; otherwise detected. */
  encoding?: string;
  /** Bytes per slice (default 4 MB). */
  chunkBytes?: number;
  cancel?: CancelToken;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
}

export interface CsvParseResult {
  sheet: SheetModel;
  meta: CsvMeta;
}

const ENCODING_SAMPLE_BYTES = 64 * 1024;

type Listener = (arg?: unknown) => void;

/** Minimal object satisfying Papa Parse's readable-stream duck typing. */
class TextChunkStream {
  readonly readable = true;
  private listeners: Record<string, Listener[]> = { data: [], end: [], error: [] };
  read(): void {}
  pause(): void {}
  resume(): void {}
  on(event: string, cb: Listener): this {
    (this.listeners[event] ??= []).push(cb);
    return this;
  }
  removeListener(event: string, cb: Listener): this {
    this.listeners[event] = (this.listeners[event] ?? []).filter((l) => l !== cb);
    return this;
  }
  emit(event: string, arg?: unknown): void {
    for (const l of [...(this.listeners[event] ?? [])]) l(arg);
  }
}

/** True if a cell could be interpreted as a formula by spreadsheet apps (CSV injection). */
export function isFormulaLike(value: string): boolean {
  if (value.length === 0) return false;
  const c = value.charCodeAt(0);
  // = + - @ TAB CR
  if (c !== 0x3d && c !== 0x2b && c !== 0x2d && c !== 0x40 && c !== 0x09 && c !== 0x0d) return false;
  // Plain signed numbers such as "-5" or "+3.2" are harmless.
  return !/^[+-]\d+(\.\d+)?([eE][+-]?\d+)?$/.test(value);
}

export async function parseCsv(blob: Blob, name: string, options: CsvParseOptions = {}): Promise<CsvParseResult> {
  if (blob.size === 0) throw new EngineError("empty-file", "This file is empty (0 bytes).");

  const head = new Uint8Array(await blob.slice(0, ENCODING_SAMPLE_BYTES).arrayBuffer());
  const detected = detectEncoding(head, blob.size <= ENCODING_SAMPLE_BYTES);
  const encoding = options.encoding ?? detected.encoding;
  const bomLength = options.encoding && options.encoding !== detected.encoding ? 0 : detected.bomLength;

  const sheet = createSheet(name);
  const rows = sheet.rows;
  let columnCount = 0;
  let replacementChars = 0;
  let formulaLikeCells = 0;
  let crlf = 0;
  let lf = 0;
  let cr = 0;
  let prevEndedWithCR = false;
  let lastChar = "";
  let streamError: unknown = null;
  const seenErrorCodes = new Set<string>();

  let loaded = bomLength;
  const chunks = decodeBlobText(blob, encoding, {
    startByte: bomLength,
    chunkBytes: options.chunkBytes,
    onBytes: (n) => (loaded = n),
  })[Symbol.asyncIterator]();

  // Choose the delimiter from the first ~64 KB of text before parsing starts.
  // Keep pulling chunks until we have a sample of reasonable size.
  const pending: string[] = [];
  let sample = "";
  let exhausted = false;
  while (sample.length < 65536) {
    const next = await chunks.next();
    if (next.done) {
      exhausted = true;
      break;
    }
    pending.push(next.value);
    sample += next.value;
  }
  const guess = options.delimiter
    ? { delimiter: options.delimiter, confident: true, singleColumn: false }
    : detectDelimiter(sample, exhausted);
  sample = "";
  const delimiter = guess.delimiter;

  const stream = new TextChunkStream();

  // Papa's typings don't model the stream input for browsers; the runtime supports it.
  const parseStream = Papa.parse as unknown as (input: unknown, config: Papa.ParseLocalConfig<string[], undefined>) => void;
  parseStream(stream, {
    delimiter,
    // newline omitted: Papa detects \n, \r\n or \r from the first chunk.
    quoteChar: '"',
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    chunk: (results: Papa.ParseResult<string[]>) => {
      const base = rows.length;
      for (const row of results.data) {
        if (row.length > columnCount) columnCount = row.length;
        for (const cell of row) if (isFormulaLike(cell)) formulaLikeCells++;
        rows.push(row as CellValue[]);
      }
      for (const e of results.errors) {
        // Papa reports row indexes relative to the current chunk.
        const row = typeof e.row === "number" ? base + e.row : null;
        if (e.code === "MissingQuotes") {
          addIssue(sheet, {
            row,
            code: "unclosed-quote",
            message: `A quoted value that starts on row ${row !== null ? row + 1 : "?"} is never closed, so the rest of the file may have been read as one cell.`,
          });
        } else if (e.code === "InvalidQuotes") {
          addIssue(sheet, {
            row,
            code: "invalid-quotes",
            message: `Row ${row !== null ? row + 1 : "?"} has a quote character in an unexpected place.`,
          });
        } else if (!seenErrorCodes.has(e.code)) {
          seenErrorCodes.add(e.code);
          addIssue(sheet, { row, code: `papa-${e.code}`, message: e.message });
        }
      }
    },
    error: (err: Error) => {
      streamError = err;
    },
    // Rows are collected in `chunk`; nothing to do on completion.
    complete: () => {},
  });

  const allChunks = async function* () {
    yield* pending.splice(0);
    if (!exhausted) {
      for (let next = await chunks.next(); !next.done; next = await chunks.next()) yield next.value;
    }
  };

  for await (const text of allChunks()) {
    throwIfCancelled(options.cancel);

    // Bookkeeping that needs the raw text (cheap single pass).
    for (let i = 0; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 0xfffd) replacementChars++;
      else if (ch === 0x0a) {
        if (i === 0 ? prevEndedWithCR : text.charCodeAt(i - 1) === 0x0d) {
          crlf++;
          cr--; // that CR was counted as lone; it is part of CRLF
        } else lf++;
      } else if (ch === 0x0d) cr++;
    }
    prevEndedWithCR = text.charCodeAt(text.length - 1) === 0x0d;
    lastChar = text[text.length - 1] ?? lastChar;

    stream.emit("data", text);
    if (streamError) break;
    options.onProgress?.(loaded, blob.size);
    await yieldToEventLoop();
  }
  throwIfCancelled(options.cancel);
  stream.emit("end");
  if (streamError) {
    throw new EngineError("read-failed", "The file could not be read as CSV.", String(streamError));
  }

  // A final line break produces one empty trailing row; it is not data.
  const last = rows[rows.length - 1];
  if ((lastChar === "\n" || lastChar === "\r") && last && last.length === 1 && last[0] === "") rows.pop();

  if (!guess.confident) {
    addIssue(sheet, {
      row: null,
      code: "delimiter-undetected",
      message: "The column separator could not be detected reliably. Check that columns look right, or choose the separator manually.",
    });
  }

  sheet.columnCount = columnCount;
  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  const meta: CsvMeta = {
    encoding,
    hadBom: bomLength > 0,
    delimiter,
    lineEnding: kinds === 0 ? "none" : kinds > 1 ? "mixed" : crlf ? "\r\n" : lf ? "\n" : "\r",
    replacementChars,
    formulaLikeCells,
  };
  return { sheet, meta };
}
