/**
 * Line-ending normaliser for the CSV reader (Stage 5).
 *
 * Papa Parse uses one line-ending type for the whole file (detected from the
 * first chunk). In a file that mixes CRLF, LF and CR, the other types were
 * kept inside values: rows were merged ("2\nc") or values kept a stray "\r".
 * This streaming pass converts every line break OUTSIDE quoted values to "\n"
 * before Papa reads the text, so Papa can always use "\n". Line breaks inside
 * quoted values are part of the data and are left exactly as they are.
 *
 * Quote rules follow Papa Parse: a quote opens a quoted value only at the start
 * of a field; inside, "" is an escaped quote, and a quote closes the value when
 * followed by the separator, a line break or the end of the file (spaces in
 * between are allowed). Any other quote inside stays part of the value.
 *
 * While doing this it counts the line-ending types (outside quotes only) and
 * notes rows with a quote in the middle of an unquoted value ("stray quotes",
 * which Papa accepts without reporting).
 */
export class LineEndingNormaliser {
  crlf = 0;
  lf = 0;
  cr = 0;
  /** Rows (0-based) with a quote inside an unquoted value; each row once. */
  readonly strayQuoteRows: number[] = [];
  /** First row (0-based) that ends with each line-ending type. */
  readonly firstRow: { crlf?: number; lf?: number; cr?: number } = {};
  /** Line breaks inside quoted values so far (a row then covers several lines of the file). */
  quotedBreaks = 0;
  /**
   * Optional: called at every row end with the row, the absolute text offset of
   * its line break and the offset just after it (offsets count the text pushed so far).
   */
  onRowEnd: ((row: number, breakAt: number, nextRowAt: number) => void) | null = null;
  private consumed = 0;
  private quotedCR = false;
  /** The current row (0-based): the number of row ends seen so far. */
  row = 0;
  private inQuoted = false;
  private fieldStart = true;
  private unquotedQuote = false;
  private carry = "";

  private readonly delimiter: string;

  constructor(delimiter: string) {
    this.delimiter = delimiter;
  }

  /** Normalise the next piece of text. `final` marks the end of the file. */
  push(chunk: string, final = false): string {
    const text = this.carry + chunk;
    this.carry = "";
    const d = this.delimiter;
    const d0 = d.charCodeAt(0);
    const out: string[] = [];
    let seg = 0;
    const n = text.length;
    let i = 0;
    while (i < n) {
      const ch = text.charCodeAt(i);
      if (this.inQuoted) {
        if (ch !== 0x22) {
          // Line breaks inside the value: CRLF counts once.
          if (ch === 0x0d) {
            this.quotedBreaks++;
            this.quotedCR = true;
          } else {
            if (ch === 0x0a && !this.quotedCR) this.quotedBreaks++;
            this.quotedCR = false;
          }
          i++;
          continue;
        }
        this.quotedCR = false;
        // A quote inside a quoted value: escaped, closing or literal?
        if (i + 1 >= n && !final) break; // need the next character
        if (text.charCodeAt(i + 1) === 0x22) {
          i += 2;
          continue;
        }
        let j = i + 1;
        while (j < n && text.charCodeAt(j) === 0x20) j++;
        if (j >= n && !final) break; // spaces up to the end: decide with more text
        const next = text.charCodeAt(j);
        if (j >= n || next === 0x0a || next === 0x0d || (next === d0 && text.startsWith(d, j))) {
          this.inQuoted = false;
          this.fieldStart = false;
          i = j; // the separator / line break is handled below
        } else i++; // a literal quote (Papa reports it as an invalid quote)
        continue;
      }
      if (ch === 0x0a || ch === 0x0d) {
        const at = i;
        if (ch === 0x0d) {
          if (i + 1 >= n && !final) break; // is it CRLF? decide with more text
          if (text.charCodeAt(i + 1) === 0x0a) {
            if (this.crlf++ === 0) this.firstRow.crlf = this.row;
            out.push(text.slice(seg, i), "\n");
            i += 2;
          } else {
            if (this.cr++ === 0) this.firstRow.cr = this.row;
            out.push(text.slice(seg, i), "\n");
            i++;
          }
          seg = i;
        } else {
          if (this.lf++ === 0) this.firstRow.lf = this.row;
          i++;
        }
        if (this.onRowEnd) this.onRowEnd(this.row, this.consumed + at, this.consumed + i);
        this.row++;
        this.fieldStart = true;
        this.unquotedQuote = false;
        continue;
      }
      if (ch === d0 && text.startsWith(d, i)) {
        this.fieldStart = true;
        i += d.length;
        continue;
      }
      if (ch === 0x22) {
        if (this.fieldStart) {
          this.inQuoted = true;
          this.quotedCR = false;
        }
        else if (!this.unquotedQuote) {
          this.unquotedQuote = true;
          this.strayQuoteRows.push(this.row);
        }
      }
      this.fieldStart = false;
      i++;
    }
    if (i < n) this.carry = text.slice(i);
    this.consumed += i;
    out.push(text.slice(seg, i));
    return out.join("");
  }
}
