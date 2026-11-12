/**
 * Text-encoding detection for CSV files.
 * Order: byte-order mark → strict UTF-8 check on the first part of the file →
 * Windows-1252 fallback (what Excel on Windows usually writes).
 */

export interface DetectedEncoding {
  /** WHATWG encoding label accepted by TextDecoder. */
  encoding: "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";
  /** Number of BOM bytes to skip. */
  bomLength: number;
}

export function detectEncoding(head: Uint8Array, isWholeFile = false): DetectedEncoding {
  if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return { encoding: "utf-8", bomLength: 3 };
  if (head[0] === 0xff && head[1] === 0xfe) return { encoding: "utf-16le", bomLength: 2 };
  if (head[0] === 0xfe && head[1] === 0xff) return { encoding: "utf-16be", bomLength: 2 };
  return { encoding: isValidUtf8(head, !isWholeFile) ? "utf-8" : "windows-1252", bomLength: 0 };
}

/**
 * Strict UTF-8 validation. When `allowTruncatedEnd` is true, an incomplete
 * multi-byte sequence at the very end is accepted (the sample was cut there).
 */
export function isValidUtf8(bytes: Uint8Array, allowTruncatedEnd = true): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes, { stream: allowTruncatedEnd });
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads a Blob in slices and yields correctly decoded text. Uses a streaming
 * TextDecoder, so characters split across slice boundaries are reassembled
 * (unlike decoding each slice separately).
 */
export async function* decodeBlobText(
  blob: Blob,
  encoding: string,
  options: { startByte?: number; chunkBytes?: number; onBytes?: (loaded: number) => void } = {},
): AsyncGenerator<string> {
  const chunkBytes = options.chunkBytes ?? 4 * 1024 * 1024;
  // Browsers decode the label "iso-8859-1" as Windows-1252 (WHATWG Encoding standard),
  // which shows bytes 0x80–0x9F as € ‚ ƒ … instead of ISO-8859-1's control codes.
  // Real ISO-8859-1 maps every byte to the character with the same number.
  const decoder: { decode(bytes?: Uint8Array, options?: { stream?: boolean }): string } = isLatin1(encoding)
    ? new Latin1Decoder()
    : new TextDecoder(encoding, { fatal: false, ignoreBOM: true });
  let offset = options.startByte ?? 0;
  while (offset < blob.size) {
    const end = Math.min(offset + chunkBytes, blob.size);
    const buf = await blob.slice(offset, end).arrayBuffer();
    offset = end;
    const text = decoder.decode(new Uint8Array(buf), { stream: true });
    options.onBytes?.(offset);
    if (text) yield text;
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

export function isLatin1(encoding: string): boolean {
  return /^(iso-8859-1|iso8859-1|latin1|l1)$/i.test(encoding);
}

/** Exact ISO-8859-1: byte n → U+00nn (single-byte, so streaming needs no state). */
class Latin1Decoder {
  decode(bytes?: Uint8Array): string {
    if (!bytes || bytes.length === 0) return "";
    let out = "";
    for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return out;
  }
}
