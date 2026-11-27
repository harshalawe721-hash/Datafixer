/**
 * Stage 14: a streaming XML reader for the XML to CSV tool.
 *
 * The browser's own XML reader (DOMParser) isn't available in the worker where
 * MyDataFixer processes files, so this small reader is written for the tool. It
 * is fed text in pieces (`feed`, then `end`) and reports elements, attributes and
 * text in order, so large files never need to be in memory as a whole.
 *
 * It checks that the document is well formed (tags closed in the right order,
 * quoted attributes, one root element) and reports the first mistake with its
 * line and column. For safety it never loads external files and refuses
 * documents that declare their own entities; only &amp; &lt; &gt; &quot; &apos;
 * and character codes such as &#233; are understood.
 */

export class XmlSyntaxError extends Error {
  readonly what: string;
  readonly line: number;
  readonly column: number;
  constructor(what: string, line: number, column: number) {
    super(`${what} (line ${line}, column ${column}).`);
    this.what = what;
    this.line = line;
    this.column = column;
  }
}

export interface XmlHandlers {
  open(name: string, attrs: [string, string][]): void;
  close(name: string): void;
  /** Text inside an element (entities decoded; CDATA as written). */
  text(text: string): void;
}

const NAME = /^[A-Za-z_:À-￿][A-Za-z0-9_:.\-·À-￿]*$/;
const PREDEFINED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const MAX_DEPTH = 1000;

export class XmlReader {
  private readonly h: XmlHandlers;
  private buf = "";
  /** Absolute offset of buf[0] in the document. */
  private base = 0;
  private line = 1;
  /** Absolute offset where the current line starts. */
  private lineStart = 0;
  /** Absolute offset up to which line numbers are counted. */
  private counted = 0;
  private readonly stack: string[] = [];
  private rootSeen = false;
  private rootClosed = false;
  private first = true;

  constructor(handlers: XmlHandlers) {
    this.h = handlers;
  }

  private advanceLines(to: number): void {
    // Count line breaks between `counted` and `to` (absolute offsets inside buf).
    for (let i = this.counted - this.base; i < to - this.base; i++) {
      if (this.buf.charCodeAt(i) === 10) {
        this.line++;
        this.lineStart = this.base + i + 1;
      }
    }
    if (to > this.counted) this.counted = to;
  }

  private fail(what: string, at: number): never {
    this.advanceLines(at);
    throw new XmlSyntaxError(what, this.line, at - this.lineStart + 1);
  }

  private decode(raw: string, at: number): string {
    if (!raw.includes("&")) return raw;
    return raw.replace(/&([^;&\s<]*);?/g, (m, ref: string, off: number) => {
      if (!m.endsWith(";")) this.fail("An “&” must start an entity such as &amp; (write a plain & as &amp;)", at + off);
      if (ref.startsWith("#")) {
        const code = ref[1] === "x" || ref[1] === "X" ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || !/^#(x[0-9a-fA-F]+|[0-9]+)$/i.test(ref)) this.fail(`“&${ref};” is not a valid character code`, at + off);
        return String.fromCodePoint(code);
      }
      const v = PREDEFINED[ref];
      if (v === undefined) this.fail(`“&${ref};” is not a standard XML entity (only &amp; &lt; &gt; &quot; &apos; and codes such as &#233; can be used)`, at + off);
      return v;
    });
  }

  private parseTag(body: string, at: number): { name: string; attrs: [string, string][] } {
    const m = /^([^\s/>=]+)/.exec(body);
    if (!m || !NAME.test(m[1]!)) this.fail(`“<${body.slice(0, 20)}” is not a valid tag name`, at + 1);
    const name = m[1]!;
    const attrs: [string, string][] = [];
    const seen = new Set<string>();
    let i = name.length;
    for (;;) {
      const ws = /^\s*/.exec(body.slice(i))![0].length;
      i += ws;
      if (i >= body.length) break;
      if (ws === 0) this.fail(`Expected a space before the attribute in <${name}>`, at + 1 + i);
      const a = /^([^\s=/>]+)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/.exec(body.slice(i));
      if (!a) this.fail(`An attribute in <${name}> isn't written correctly (attributes look like name="value")`, at + 1 + i);
      const an = a[1]!;
      if (!NAME.test(an)) this.fail(`“${an}” is not a valid attribute name`, at + 1 + i);
      if (seen.has(an)) this.fail(`The attribute “${an}” appears twice in <${name}>`, at + 1 + i);
      seen.add(an);
      attrs.push([an, this.decode(a[2] ?? a[3] ?? "", at + 1 + i)]);
      i += a[0].length;
    }
    return { name, attrs };
  }

  /** Processes as much of the buffer as possible; `final` when no more text will come. */
  private run(final: boolean): void {
    const buf = this.buf;
    let i = 0;
    const n = buf.length;
    if (this.first && n > 0) {
      if (buf.charCodeAt(0) === 0xfeff) i = 1;
      this.first = false;
    }
    while (i < n) {
      const lt = buf.indexOf("<", i);
      if (lt === -1) {
        if (!final) break;
        this.textAt(buf.slice(i), this.base + i);
        i = n;
        break;
      }
      if (lt > i) this.textAt(buf.slice(i, lt), this.base + i);
      i = lt;
      const at = this.base + i;
      const rest = (s: string) => buf.startsWith(s, i);
      // “<!” at the end of a piece: wait for the rest to know what follows (comment, CDATA or DOCTYPE).
      if (!final && n - i < 9 && rest("<!")) break;
      let end: number;
      if (rest("<!--")) {
        end = buf.indexOf("-->", i + 4);
        if (end === -1) {
          if (final) this.fail("A comment (<!--) is not closed with -->", at);
          break;
        }
        i = end + 3;
        continue;
      }
      if (rest("<![CDATA[")) {
        end = buf.indexOf("]]>", i + 9);
        if (end === -1) {
          if (final) this.fail("A CDATA section is not closed with ]]>", at);
          break;
        }
        if (!this.stack.length) this.fail("Text appears outside the main element", at);
        this.h.text(buf.slice(i + 9, end));
        i = end + 3;
        continue;
      }
      if (rest("<?")) {
        end = buf.indexOf("?>", i + 2);
        if (end === -1) {
          if (final) this.fail("A declaration (<?) is not closed with ?>", at);
          break;
        }
        i = end + 2;
        continue;
      }
      if (rest("<!DOCTYPE") || rest("<!doctype")) {
        // Find the end, skipping an internal subset in [ ].
        const open = buf.indexOf("[", i);
        const gt = buf.indexOf(">", i);
        let stop = gt;
        if (open !== -1 && (gt === -1 || open < gt)) {
          const close = buf.indexOf("]", open);
          stop = close === -1 ? -1 : buf.indexOf(">", close);
        }
        if (stop === -1) {
          if (final) this.fail("A <!DOCTYPE> declaration is not closed", at);
          break;
        }
        const decl = buf.slice(i, stop + 1);
        if (/<!ENTITY/i.test(decl)) {
          this.fail("This file defines its own entities in <!DOCTYPE>, which MyDataFixer refuses for safety (they can make a small file grow huge or read other files)", at);
        }
        i = stop + 1;
        continue;
      }
      if (rest("<!")) this.fail("“<!” must start a comment, CDATA section or DOCTYPE", at);
      // Find the closing “>”, allowing “>” inside quoted attribute values.
      end = -1;
      let quote = 0;
      for (let k = i + 1; k < n; k++) {
        const c = buf.charCodeAt(k);
        if (quote) {
          if (c === quote) quote = 0;
        } else if (c === 34 || c === 39) quote = c;
        else if (c === 62) {
          end = k;
          break;
        } else if (c === 60) this.fail("A tag is not closed with “>” before the next “<”", at);
      }
      if (end === -1) {
        if (final) this.fail("A tag is not closed with “>”", at);
        break;
      }
      const raw = buf.slice(i + 1, end);
      if (raw.startsWith("/")) {
        const name = raw.slice(1).trim();
        const top = this.stack.pop();
        if (top === undefined) this.fail(`</${name}> closes an element that was never opened`, at);
        if (top !== name) this.fail(`Expected </${top}> but found </${name}> (tags must be closed in the reverse order they were opened)`, at);
        this.h.close(name);
        if (!this.stack.length) this.rootClosed = true;
      } else {
        const selfClosing = raw.endsWith("/");
        const { name, attrs } = this.parseTag(selfClosing ? raw.slice(0, -1) : raw, at);
        if (this.rootClosed) this.fail(`<${name}> appears after the main element has closed (an XML file has exactly one main element)`, at);
        if (this.stack.length >= MAX_DEPTH) this.fail(`The elements are nested more than ${MAX_DEPTH} levels deep, which MyDataFixer can't open`, at);
        this.rootSeen = true;
        this.h.open(name, attrs);
        if (selfClosing) {
          this.h.close(name);
          if (!this.stack.length) this.rootClosed = true;
        } else this.stack.push(name);
      }
      i = end + 1;
    }
    this.advanceLines(this.base + i);
    this.buf = buf.slice(i);
    this.base += i;
  }

  private textAt(raw: string, at: number): void {
    if (!this.stack.length) {
      if (raw.trim() !== "") this.fail(this.rootClosed ? "Text appears after the main element has closed" : "Text appears before the main element", at + raw.search(/\S/));
      return;
    }
    this.h.text(this.decode(raw, at));
  }

  feed(text: string): void {
    this.buf += text;
    this.run(false);
  }

  end(): void {
    this.run(true);
    if (this.buf.trim() !== "") this.fail("The file ends in the middle of a tag", this.base);
    if (!this.rootSeen) this.fail("The file has no XML elements", this.base);
    if (this.stack.length) this.fail(`The file ends before <${this.stack[this.stack.length - 1]}> is closed`, this.base + this.buf.length);
  }
}

/** Reads a whole XML text (for tests and small inputs). */
export function readXml(text: string, handlers: XmlHandlers): void {
  const r = new XmlReader(handlers);
  r.feed(text);
  r.end();
}
