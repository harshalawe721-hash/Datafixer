/**
 * Engine errors carry a stable code (for tests and future logic) and a
 * plain-language message the UI can show as-is.
 */
export type EngineErrorCode =
  | "cancelled"
  | "empty-file"
  | "unsupported-format"
  | "corrupt-file"
  | "encrypted-file"
  | "zip-bomb"
  | "unsafe-content"
  | "too-large-for-engine"
  | "out-of-memory"
  | "worker-crashed"
  | "sheet-not-found"
  | "not-implemented"
  | "read-failed"
  /** Stage 4: an edit refers to a cell, row or column that doesn't exist. */
  | "invalid-edit"
  /** Stage 4: a manual edit would replace a formula and was not confirmed. */
  | "formula-cell"
  | "internal";

export class EngineError extends Error {
  readonly code: EngineErrorCode;
  /** Technical detail for diagnostics; never contains cell contents. */
  readonly detail?: string;
  constructor(code: EngineErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "EngineError";
    this.code = code;
    this.detail = detail;
  }
}

export interface SerializedEngineError {
  code: EngineErrorCode;
  message: string;
  detail?: string;
}

export const OUT_OF_MEMORY_MESSAGE =
  "This file needs more memory than your browser allowed. Nothing was changed and your file is safe. Try closing other tabs, using a desktop computer, or splitting the file into smaller parts.";

/** Recognise the different ways JavaScript engines report running out of memory. */
export function isOutOfMemory(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const m = `${err.name} ${err.message}`.toLowerCase();
  return (
    (err instanceof RangeError &&
      (m.includes("invalid string length") ||
        m.includes("invalid array length") ||
        m.includes("array buffer allocation failed") ||
        m.includes("allocation failed") ||
        m.includes("out of memory"))) ||
    m.includes("out of memory") ||
    m.includes("allocation size overflow")
  );
}

/** Convert anything thrown into a safe, user-presentable error. */
export function toSerializedError(err: unknown): SerializedEngineError {
  if (err instanceof EngineError) return { code: err.code, message: err.message, detail: err.detail };
  if (isOutOfMemory(err)) {
    return { code: "out-of-memory", message: OUT_OF_MEMORY_MESSAGE, detail: String((err as Error).message) };
  }
  return {
    code: "internal",
    message: "Something went wrong while reading this file. Your file has not been changed. Please try again.",
    detail: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  };
}
