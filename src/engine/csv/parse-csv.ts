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
import { addIssue, createSheet, type CsvMeta, type SheetModel } from "../types.ts";
import { CompactTextGrid } from "../grid.ts";
import { EngineError } from "../errors.ts";
import { throwIfCancelled, yieldToEventLoop, type CancelToken } from "../cancel.ts";
import { decodeBlobText, detectEncoding } from "./encoding.ts";
import { detectDelimiter } from "./delimiter.ts";
import { LineEndingNormaliser } from "./line-endings.ts";

export interface CsvParseOptions {
  /** Force a delimiter; otherwise it is detected from the start of the file. */
  delimiter?: string;
  /** Force an encoding label; otherwise detected. */
  encoding?: string;
  /** Bytes per slice (default 4 MB). */
  chunkBytes?: number;
  cancel?: CancelToken;
  onProgress?: (loadedBytes: number, totalBytes: number) => void;
  /** Stop with a clear error before parsed data would exceed this many bytes. */
  memoryBudgetBytes?: number;
  /**
   * Streaming mode (used to verify downloads): rows are handed to this function
   * chunk by chunk instead of being stored, so no second copy is kept in memory.
   * `firstRow` is the index of rows[0]. The final empty row produced by a trailing
   * line break is passed on too.
   */
  rowSink?: (rows: string[][], firstRow: number) => void;
}

/**
 * Measured in V8: real memory is ~1.5× the grid's own estimate (object headers,
 * GC slack), and parsed CSV data retains ~1.7–2.2× the file size.
 */
const GRID_OVERHEAD_FACTOR = 1.6;

export function tooLargeForDevice(neededBytes: number): EngineError {
  const mb = Math.ceil(neededBytes / (1024 * 1024) / 10) * 10;
  return new EngineError(
    "too-large-for-engine",
    `This file is too large to open safely in this browser on this device (it needs roughly ${mb.toLocaleString("en-US")} MB of memory or more). It was stopped before the browser could run out of memory. Nothing was changed. Try a desktop computer, close other tabs, or split the file into smaller parts.`,
    `estimated ${neededBytes} bytes`,
  );
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
  // Clearly impossible files are refused up front (fast feedback, no wasted work).
  if (options.memoryBudgetBytes && blob.size * 1.2 > options.memoryBudgetBytes) {
    throw tooLargeForDevice(blob.size * 1.7);
  }

  const head = new Uint8Array(await blob.slice(0, ENCODING_SAMPLE_BYTES).arrayBuffer());
  const detected = detectEncoding(head, blob.size <= ENCODING_SAMPLE_BYTES);
  const encoding = options.encoding ?? detected.encoding;
  const bomLength = options.encoding && options.encoding !== detected.encoding ? 0 : detected.bomLength;

  const sheet = createSheet(name);
  const grid = new CompactTextGrid();
  sheet.grid = grid;
  let lastRow: string[] | null = null;
  let columnCount = 0;
  let replacementChars = 0;
  let formulaLikeCells = 0;
  let lastChar = "";
  let streamError: unknown = null;
  const seenErrorCodes = new Set<string>();
  let sunkRows = 0;

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
  const endings = new LineEndingNormaliser(delimiter);

  // Papa's typings don't model the stream input for browsers; the runtime supports it.
  const parseStream = Papa.parse as unknown as (input: unknown, config: Papa.ParseLocalConfig<string[], undefined>) => void;
  parseStream(stream, {
    delimiter,
    // Line breaks outside quoted values are normalised to \n first (line-endings.ts).
    newline: "\n",
    quoteChar: '"',
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    chunk: (results: Papa.ParseResult<string[]>) => {
      const base = options.rowSink ? sunkRows : grid.rowCount;
      for (const row of results.data) {
        if (row.length > columnCount) columnCount = row.length;
        for (const cell of row) if (isFormulaLike(cell)) formulaLikeCells++;
      }
      if (results.data.length) lastRow = results.data[results.data.length - 1]!;
      if (options.rowSink) {
        try {
          options.rowSink(results.data, base);
        } catch (err) {
          streamError = err;
        }
        sunkRows += results.data.length;
      } else {
        // Pack this chunk compactly; Papa's per-cell strings are released.
        grid.appendRows(results.data);
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
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 0xfffd) replacementChars++;
    lastChar = text[text.length - 1] ?? lastChar;

    const normalised = endings.push(text);
    if (normalised) stream.emit("data", normalised);
    if (streamError) break;
    if (options.memoryBudgetBytes) {
      const used = grid.approxBytes * GRID_OVERHEAD_FACTOR;
      if (used > options.memoryBudgetBytes) {
        // Extrapolate the full need from the share of the file read so far.
        throw tooLargeForDevice(used * (blob.size / Math.max(1, loaded)));
      }
    }
    options.onProgress?.(loaded, blob.size);
    await yieldToEventLoop();
  }
  throwIfCancelled(options.cancel);
  const rest = streamError ? "" : endings.push("", true);
  if (rest) stream.emit("data", rest);
  stream.emit("end");
  if (streamError) {
    if (streamError instanceof EngineError) throw streamError;
    throw new EngineError("read-failed", "The file could not be read as CSV.", String(streamError));
  }

  // A final line break produces one empty trailing row; it is not data.
  // Assigned inside Papa's callback, which TypeScript's flow analysis can't see.
  const last = lastRow as string[] | null;
  if ((lastChar === "\n" || lastChar === "\r") && last && last.length === 1 && last[0] === "") grid.dropLastRow();

  // Quotes in the middle of an unquoted value: Papa keeps them without reporting.
  const reported = new Set(sheet.issues.filter((i) => i.code === "invalid-quotes").map((i) => i.row));
  for (const row of endings.strayQuoteRows) {
    if (reported.has(row)) continue;
    addIssue(sheet, { row, code: "invalid-quotes", message: `Row ${row + 1} has a quote character in an unexpected place.` });
  }

  if (!guess.confident) {
    addIssue(sheet, {
      row: null,
      code: "delimiter-undetected",
      message: "The column separator could not be detected reliably. Check that columns look right, or choose the separator manually.",
    });
  }

  sheet.columnCount = columnCount;
  const { crlf, lf, cr } = endings;
  const kinds = [crlf > 0, lf > 0, cr > 0].filter(Boolean).length;
  const meta: CsvMeta = {
    encoding,
    hadBom: bomLength > 0,
    delimiter,
    lineEnding: kinds === 0 ? "none" : kinds > 1 ? "mixed" : crlf ? "\r\n" : lf ? "\n" : "\r",
    replacementChars,
    formulaLikeCells,
    finalLineBreak: lastChar === "\n" || lastChar === "\r",
  };
  return { sheet, meta };
}
