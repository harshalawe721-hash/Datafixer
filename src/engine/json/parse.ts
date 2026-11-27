/**
 * Stage 12: a strict JSON reader for the JSON ↔ CSV tools.
 *
 * The browser's JSON.parse rounds numbers longer than 15 significant digits
 * (12345678901234567890 → 12345678901234567000) and doesn't reliably say where
 * a mistake is. This reader follows the JSON standard exactly, keeps numbers
 * that can't be stored exactly as their original text (a `LongNumber`), and
 * reports the line and column of the first mistake in plain language.
 */

/** A number kept as its exact text because it has more than 15 significant digits. */
export class LongNumber {
  readonly text: string;
  constructor(text: string) {
    this.text = text;
  }
}

export type JsonValue = null | boolean | number | string | LongNumber | JsonValue[] | { [key: string]: JsonValue };

export class JsonSyntaxError extends Error {
  readonly what: string;
  readonly line: number;
  readonly column: number;
  readonly offset: number;
  constructor(what: string, line: number, column: number, offset: number) {
    super(`${what} (line ${line}, column ${column}).`);
    this.what = what;
    this.line = line;
    this.column = column;
    this.offset = offset;
  }
}

const MAX_DEPTH = 500;
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

/** Significant digits of a JSON number's text (leading zeros and the exponent don't count). */
function significantDigits(text: string): number {
  const mantissa = text.replace(/^-/, "").replace(/[eE].*$/, "").replace(".", "");
  const trimmed = mantissa.replace(/^0+/, "").replace(/0+$/, "");
  return trimmed.length;
}

/** Line and column (1-based) of an offset; columns count characters, not bytes. */
export function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = text.indexOf("\n"); i !== -1 && i < offset; i = text.indexOf("\n", i + 1)) {
    line++;
    lineStart = i + 1;
  }
  return { line, column: offset - lineStart + 1 };
}

function describe(ch: string | undefined): string {
  if (ch === undefined) return "the end of the file";
  if (ch === "\n" || ch === "\r") return "a line break";
  if (ch === "\t") return "a tab";
  if (ch === " ") return "a space";
  return `“${ch}”`;
}

/**
 * Parses one JSON text. A byte order mark at the start is allowed. Duplicate
 * keys keep the last value, as in JSON.parse.
 */
export function parseJson(text: string): JsonValue {
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;

  const fail = (what: string, at = i): never => {
    const { line, column } = lineColumn(text, at);
    throw new JsonSyntaxError(what, line, column, at);
  };
  const space = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 32 || c === 10 || c === 13 || c === 9) i++;
      else break;
    }
  };

  const parseString = (): string => {
    // text[i] is the opening quote
    const start = ++i;
    let out = "";
    let chunk = start;
    for (;;) {
      if (i >= n) return fail("A text value is not closed: a closing quote (\") is missing", start - 1);
      const c = text.charCodeAt(i);
      if (c === 34) {
        out += text.slice(chunk, i);
        i++;
        return out;
      }
      if (c === 92) {
        out += text.slice(chunk, i);
        const e = text[i + 1];
        switch (e) {
          case '"':
            out += '"';
            break;
          case "\\":
            out += "\\";
            break;
          case "/":
            out += "/";
            break;
          case "b":
            out += "\b";
            break;
          case "f":
            out += "\f";
            break;
          case "n":
            out += "\n";
            break;
          case "r":
            out += "\r";
            break;
          case "t":
            out += "\t";
            break;
          case "u": {
            const hex = text.slice(i + 2, i + 6);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("A \\u code in a text value must be followed by 4 hexadecimal digits");
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            break;
          }
          default:
            fail(`${describe(e)} can't follow a backslash in a text value`, i + 1);
        }
        i += 2;
        chunk = i;
        continue;
      }
      if (c < 0x20) fail(`A text value can't contain ${describe(text[i])}; write it as \\n or \\t`);
      i++;
    }
  };

  const parseValue = (depth: number): JsonValue => {
    if (depth > MAX_DEPTH) fail(`The data is nested more than ${MAX_DEPTH} levels deep, which MyDataFixer can't open`);
    space();
    const ch = text[i];
    if (ch === "{") {
      i++;
      const obj: { [key: string]: JsonValue } = {};
      space();
      if (text[i] === "}") {
        i++;
        return obj;
      }
      for (;;) {
        space();
        if (text[i] !== '"') fail(text[i] === "}" ? "There is a comma before “}” with nothing after it" : `Expected a name in double quotes, found ${describe(text[i])}`);
        const key = parseString();
        space();
        if (text[i] !== ":") fail(`Expected “:” after the name “${key.slice(0, 40)}”, found ${describe(text[i])}`);
        i++;
        const value = parseValue(depth + 1);
        Object.defineProperty(obj, key, { value, enumerable: true, writable: true, configurable: true });
        space();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "}") {
          i++;
          return obj;
        }
        fail(`Expected “,” or “}”, found ${describe(text[i])}`);
      }
    }
    if (ch === "[") {
      i++;
      const arr: JsonValue[] = [];
      space();
      if (text[i] === "]") {
        i++;
        return arr;
      }
      for (;;) {
        space();
        if (text[i] === "]") fail("There is a comma before “]” with nothing after it");
        arr.push(parseValue(depth + 1));
        space();
        if (text[i] === ",") {
          i++;
          continue;
        }
        if (text[i] === "]") {
          i++;
          return arr;
        }
        fail(`Expected “,” or “]”, found ${describe(text[i])}`);
      }
    }
    if (ch === '"') return parseString();
    if (ch === "t" && text.startsWith("true", i)) {
      i += 4;
      return true;
    }
    if (ch === "f" && text.startsWith("false", i)) {
      i += 5;
      return false;
    }
    if (ch === "n" && text.startsWith("null", i)) {
      i += 4;
      return null;
    }
    if (ch === "-" || (ch !== undefined && ch >= "0" && ch <= "9")) {
      NUMBER.lastIndex = i;
      const m = NUMBER.exec(text);
      if (!m) return fail(`${describe(ch)} doesn't start a valid number`);
      const src = m[0];
      const next = text[i + src.length];
      if (next !== undefined && /[0-9.eE]/.test(next)) fail(`This number is not written correctly (numbers can't start with 0 or end with “.”)`, i);
      i += src.length;
      return significantDigits(src) > 15 ? new LongNumber(src) : Number(src);
    }
    if (ch === "'") return fail("Text values must use double quotes (\"), not single quotes");
    if (ch === undefined) return fail("The file ends where a value was expected");
    return fail(`Expected a value, found ${describe(ch)}${/[A-Za-z]/.test(ch) ? " (text values must be in double quotes)" : ""}`);
  };

  space();
  if (i >= n) fail("The file is empty", i);
  const value = parseValue(0);
  space();
  if (i < n) fail(`Unexpected ${describe(text[i])} after the end of the data (only one value is allowed; for one record per line, use a .jsonl file)`);
  return value;
}

/**
 * Parses JSON Lines: one JSON value per line; blank lines are skipped. Errors
 * name the line in the file.
 */
export function parseJsonLines(text: string): JsonValue[] {
  const out: JsonValue[] = [];
  let start = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let lineNo = 1;
  while (start <= text.length) {
    let end = text.indexOf("\n", start);
    if (end === -1) end = text.length;
    const line = text.slice(start, end).replace(/\r$/, "");
    if (line.trim() !== "") {
      try {
        out.push(parseJson(line));
      } catch (e) {
        if (e instanceof JsonSyntaxError) throw new JsonSyntaxError(e.what, lineNo, e.column, start + e.offset);
        throw e;
      }
    }
    if (end === text.length) break;
    start = end + 1;
    lineNo++;
  }
  return out;
}
