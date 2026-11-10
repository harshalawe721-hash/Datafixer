/**
 * Upload validation. Checks the extension AND the file's actual leading bytes,
 * so a renamed executable or a corrupt workbook is rejected before parsing.
 * Pure functions (no DOM) so they can be unit-tested and reused in workers.
 */

export type SpreadsheetFormat = "xlsx" | "xls" | "csv";

export const FORMAT_LABELS: Record<SpreadsheetFormat, string> = {
  xlsx: "Excel Workbook (XLSX)",
  xls: "Excel 97–2003 Workbook (XLS)",
  csv: "Comma-Separated Values (CSV)",
};

export type ValidationResult =
  | { ok: true; format: SpreadsheetFormat }
  | { ok: false; error: string };

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot).toLowerCase();
}

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04]; // XLSX is a ZIP container
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // legacy XLS

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((b, i) => bytes[i] === b);
}

/**
 * Heuristic text check for CSV: rejects binary content. UTF-16 files (BOM FF FE
 * or FE FF) legitimately contain NUL bytes, so they are allowed through.
 */
export function looksLikeText(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return true;
  if ((bytes[0] === 0xff && bytes[1] === 0xfe) || (bytes[0] === 0xfe && bytes[1] === 0xff)) return true;
  let control = 0;
  for (const b of bytes) {
    if (b === 0x00) return false;
    // Control characters other than tab, LF, CR, form feed.
    if (b < 0x20 && b !== 0x09 && b !== 0x0a && b !== 0x0d && b !== 0x0c) control++;
  }
  return control / bytes.length < 0.01;
}

/** Validate name/size and the leading bytes of a file. `head` should be the first ~8 KB. */
export function validateSpreadsheet(
  file: { name: string; size: number },
  head: Uint8Array,
  options: { accept: readonly string[]; maxBytes: number },
): ValidationResult {
  const ext = extensionOf(file.name);
  if (!options.accept.includes(ext)) {
    const names = options.accept.map((e) => e.slice(1).toUpperCase());
    const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0];
    return { ok: false, error: `“${file.name}” is not a supported file type. Please choose a file in ${list} format.` };
  }
  if (file.size === 0) {
    return { ok: false, error: `“${file.name}” is empty (0 bytes). Please choose a file that contains data.` };
  }
  if (file.size > options.maxBytes) {
    const mb = Math.round(options.maxBytes / (1024 * 1024));
    return {
      ok: false,
      error: `“${file.name}” is larger than the ${mb} MB limit. Large files are processed on your device, so this limit keeps your browser responsive.`,
    };
  }

  if (ext === ".xlsx") {
    if (!startsWith(head, ZIP_SIGNATURE)) {
      if (startsWith(head, OLE2_SIGNATURE)) {
        return {
          ok: false,
          error: `“${file.name}” looks like an older .xls or password-protected workbook saved with an .xlsx extension. Try re-saving it from Excel as .xlsx, or remove the password.`,
        };
      }
      return { ok: false, error: `“${file.name}” is not a valid XLSX workbook. The file may be damaged or renamed.` };
    }
    return { ok: true, format: "xlsx" };
  }

  if (ext === ".xls") {
    if (startsWith(head, OLE2_SIGNATURE)) return { ok: true, format: "xls" };
    // Excel sometimes saves XLSX content with an .xls name.
    if (startsWith(head, ZIP_SIGNATURE)) return { ok: true, format: "xlsx" };
    // Some systems export HTML or text tables named .xls; those are not real workbooks.
    return {
      ok: false,
      error: `“${file.name}” is not a genuine Excel workbook (it may be an HTML or text export renamed to .xls). Open it in Excel and save it as .xlsx or .csv.`,
    };
  }

  // .csv
  if (startsWith(head, ZIP_SIGNATURE) || startsWith(head, OLE2_SIGNATURE)) {
    return {
      ok: false,
      error: `“${file.name}” is actually an Excel workbook with a .csv name. Rename it to .xlsx (or .xls), or use the Excel to CSV converter.`,
    };
  }
  if (!looksLikeText(head)) {
    return { ok: false, error: `“${file.name}” contains binary data and does not look like a CSV text file.` };
  }
  return { ok: true, format: "csv" };
}

/** Read the first `length` bytes of a browser File. */
export async function readFileHead(file: Blob, length = 8192): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, length).arrayBuffer());
}
