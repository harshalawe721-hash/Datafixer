/**
 * Stage 14: XML → table.
 *
 * Pass 1 (RecordFinder) counts which elements repeat under the same parent and
 * suggests the most repeated one as the records (decision 2A). Pass 2
 * (XmlTableBuilder) turns each record into a row:
 * - child elements and attributes become columns, in the order they first appear;
 * - nested elements become dotted columns (address.city);
 * - repeated children inside one record are joined with “; ” (decision 3A);
 * - an attribute's column is named after it, or @name when an element has the
 *   same name (decision 4A);
 * - text mixed with child elements is joined into the element's own column;
 * - data outside the records (for example a feed's title) is not included.
 * Values are kept exactly as written (entities decoded); empty elements give empty cells.
 */
import type { XmlHandlers } from "./parse.ts";
import type { CellValue } from "../types.ts";

/** Namespace and schema declarations (xmlns, xmlns:g, xsi:…) describe the file, not its data. */
const isNamespace = (attr: string) => attr === "xmlns" || attr.startsWith("xmlns:") || attr.startsWith("xsi:");

export interface XmlRecordChoice {
  /** Element path from the root, e.g. "catalog/products/product". */
  path: string;
  /** How many there are. */
  count: number;
}

/** Pass 1: which elements repeat. */
export class RecordFinder implements XmlHandlers {
  private readonly stack: { path: string; children: Map<string, number> }[] = [];
  private readonly totals = new Map<string, number>();
  /** Elements that have child elements or attributes somewhere (records usually do). */
  private readonly complex = new Set<string>();
  private readonly repeated = new Set<string>();
  private root = "";

  open(name: string, attrs: [string, string][]): void {
    const parent = this.stack[this.stack.length - 1];
    const path = parent ? `${parent.path}/${name}` : name;
    if (!parent) this.root = path;
    if (parent) {
      parent.children.set(name, (parent.children.get(name) ?? 0) + 1);
      this.complex.add(parent.path);
    }
    if (attrs.some(([a]) => !isNamespace(a))) this.complex.add(path);
    this.totals.set(path, (this.totals.get(path) ?? 0) + 1);
    this.stack.push({ path, children: new Map() });
  }

  close(): void {
    const frame = this.stack.pop()!;
    for (const [child, n] of frame.children) if (n >= 2) this.repeated.add(`${frame.path}/${child}`);
  }

  text(): void {}

  /**
   * Repeating elements (at most 10): those with child elements or attributes first (records
   * usually have fields), most numerous first; then repeated simple values. The root element
   * when nothing repeats.
   */
  choices(): XmlRecordChoice[] {
    const out = [...this.repeated].map((path) => ({ path, count: this.totals.get(path) ?? 0, complex: this.complex.has(path) }));
    out.sort((a, b) => Number(b.complex) - Number(a.complex) || b.count - a.count || a.path.split("/").length - b.path.split("/").length);
    if (out.length === 0 && this.root) return [{ path: this.root, count: 1 }];
    return out.slice(0, 10).map(({ path, count }) => ({ path, count }));
  }
}

export interface XmlTable {
  rows: CellValue[][];
  records: number;
  /** Cells holding values joined from repeated children. */
  joinedCells: number;
  /** The file has data outside the records (not included). */
  outside: boolean;
}

interface Frame {
  name: string;
  path: string;
  /** Dotted path inside the record ("" for the record element), or null outside records. */
  rel: string | null;
  text: string;
  children: boolean;
}

/** Pass 2: builds the rows for the records at `recordPath`. */
export class XmlTableBuilder implements XmlHandlers {
  bytes = 0;
  joinedCells = 0;
  outside = false;
  private readonly recordPath: string;
  private readonly stack: Frame[] = [];
  private readonly keys: string[] = [];
  private readonly index = new Map<string, number>();
  private readonly rows: CellValue[][] = [];
  private row: CellValue[] | null = null;
  private joined: Set<number> | null = null;

  constructor(recordPath: string) {
    this.recordPath = recordPath;
  }

  private col(key: string): number {
    let c = this.index.get(key);
    if (c === undefined) {
      c = this.keys.length;
      this.index.set(key, c);
      this.keys.push(key);
    }
    return c;
  }

  private set(key: string, value: string): void {
    const c = this.col(key);
    const row = this.row!;
    const v = value === "" ? null : value;
    const old = row[c];
    if (old === undefined) row[c] = v;
    else {
      // A repeated child: join the values with “; ” (empty ones are left out).
      if (v !== null) row[c] = old === null ? v : `${old}; ${v}`;
      if (!this.joined!.has(c)) {
        this.joined!.add(c);
        this.joinedCells++;
      }
    }
    this.bytes += 16 + value.length * 2;
  }

  open(name: string, attrs: [string, string][]): void {
    const parent = this.stack[this.stack.length - 1];
    const path = parent ? `${parent.path}/${name}` : name;
    let rel: string | null = null;
    if (parent && parent.rel !== null) {
      parent.children = true;
      rel = parent.rel ? `${parent.rel}.${name}` : name;
    } else if (path === this.recordPath) {
      rel = "";
      this.row = [];
      this.joined = new Set();
    } else if (attrs.some(([a]) => !isNamespace(a))) this.outside = true;
    this.stack.push({ name, path, rel, text: "", children: false });
    if (rel !== null) for (const [a, v] of attrs) this.set(`a:${rel ? `${rel}.` : ""}${a}`, v);
  }

  text(text: string): void {
    const top = this.stack[this.stack.length - 1];
    if (!top) return;
    if (top.rel === null) {
      if (text.trim() !== "") this.outside = true;
      return;
    }
    top.text += text;
  }

  close(): void {
    const f = this.stack.pop()!;
    if (f.rel === null) return;
    const key = `e:${f.rel || f.name}`;
    if (!f.children) this.set(key, f.text);
    else if (f.text.trim() !== "") this.set(key, f.text.trim());
    if (f.rel === "") {
      this.bytes += 32 + this.keys.length * 8;
      this.rows.push(this.row!);
      this.row = null;
      this.joined = null;
    }
  }

  finish(): XmlTable {
    const elements = new Set(this.keys.filter((k) => k.startsWith("e:")).map((k) => k.slice(2)));
    const header = this.keys.map((k) => {
      const name = k.slice(2);
      if (k.startsWith("e:")) return name;
      if (!elements.has(name)) return name;
      const dot = name.lastIndexOf(".");
      return dot === -1 ? `@${name}` : `${name.slice(0, dot)}.@${name.slice(dot + 1)}`;
    });
    const width = header.length;
    for (const row of this.rows) for (let c = 0; c < width; c++) if (row[c] === undefined) row[c] = null;
    return { rows: this.rows.length ? [header, ...this.rows] : [], records: this.rows.length, joinedCells: this.joinedCells, outside: this.outside };
  }
}
