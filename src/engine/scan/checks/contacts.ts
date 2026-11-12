/**
 * Stage 3 checks I–J: email addresses and phone numbers.
 *
 * Generic international rules, no external library (keeps DataFixer light).
 * Cautious: only columns that are clearly email/phone columns are checked
 * (by column name, or because most values look like emails/phones), and the
 * rules accept anything a real address or number can look like.
 */
import { cellKey, MAX_COLUMNS } from "../../types.ts";
import { Cat } from "../classify.ts";
import { cellCat, type CheckFactory, type ColumnProfile, type Finding, type ScanContext, type ScanIssue } from "../scan.ts";
import { CellList, RowList } from "../hits.ts";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const colName = (p: ColumnProfile) => p.name ?? `Column ${p.letter}`;
const isBlank = (cat: number) => cat === Cat.Empty || cat === Cat.Blank;

function finding(list: CellList, issue: ScanIssue): Finding {
  const cells = list.toArray().sort();
  const rows = new RowList();
  for (const k of cells) rows.add(Math.floor(k / MAX_COLUMNS));
  return { issue, cells, rows: rows.toArray() };
}

function textOf(ctx: ScanContext, r: number, c: number): string {
  const v = ctx.sheet.grid.get(r, c);
  return v === null ? "" : typeof v === "string" ? v : String(v);
}

// ---------------------------------------------------------------- I: emails

const EMAIL_HEADER = /(^|[^a-z])e-?mails?([^a-z]|$)/i;
const LOCAL_CHARS = /^[^\s()<>[\]:;,\\"@]+$/;
const DOMAIN_LABEL = /^[\p{L}\p{N}]([\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?$/u;
const TLD = /^(\p{L}{2,63}|xn--[a-z0-9-]{2,59})$/iu;

/**
 * Fast accept for ordinary ASCII addresses (the vast majority): no leading,
 * trailing or double dots before the @, valid domain labels, a letter ending.
 * Anything else goes through the full rules below.
 */
const SIMPLE_VALID_EMAIL = /^[A-Za-z0-9_%+'-]+(\.[A-Za-z0-9_%+'-]+)*@([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/;

/** Why an email address is invalid, or null if it looks valid. */
export function emailProblem(raw: string): string | null {
  const s = raw.trim();
  if (!s) return null;
  if (SIMPLE_VALID_EMAIL.test(s) && s.indexOf("@") <= 64) return null;
  if (/\s/.test(s)) return /[,;\s]\S+@/.test(s) && (s.match(/@/g)?.length ?? 0) > 1 ? "Several addresses in one cell" : "Contains a space";
  const at = s.match(/@/g)?.length ?? 0;
  if (at === 0) return "Missing @";
  if (at > 1) return /[,;]/.test(s) ? "Several addresses in one cell" : "More than one @";
  const [local, domain] = s.split("@") as [string, string];
  if (!local) return "Nothing before the @";
  if (!domain) return "Nothing after the @";
  if (local.length > 64) return "Part before the @ is too long";
  if (!LOCAL_CHARS.test(local)) return "Invalid character before the @";
  if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return "Misplaced dot before the @";
  if (!domain.includes(".")) return "Domain has no dot (e.g. example.com)";
  const labels = domain.split(".");
  if (labels.some((l) => !DOMAIN_LABEL.test(l))) return "Invalid domain";
  if (!TLD.test(labels[labels.length - 1]!)) return "Invalid domain ending";
  return null;
}

export const invalidEmails: CheckFactory = (ctx) => {
  const atCount = new Float64Array(ctx.columnCount);
  return {
    cell(_r, c, cat, v) {
      if (typeof v === "string" && !isBlank(cat) && v.includes("@")) atCount[c]!++;
    },
    finish(): Finding[] {
      const cols = ctx.profiles.filter((p) => p.nonEmpty > 0 && (EMAIL_HEADER.test(p.name ?? "") || atCount[p.index]! >= Math.max(2, p.nonEmpty * 0.5)));
      const list = new CellList();
      const columns: ScanIssue["columns"] = [];
      const examples: ScanIssue["examples"] = [];
      for (const p of cols) {
        let n = 0;
        for (let r = ctx.startRow; r < ctx.rowCount; r++) {
          const cat = cellCat(ctx, r, p.index);
          if (isBlank(cat) || cat === Cat.Error) continue;
          const s = textOf(ctx, r, p.index);
          const why = emailProblem(s);
          if (!why) continue;
          n++;
          list.add(cellKey(r, p.index));
          if (examples.length < 5) examples.push({ row: r, col: p.index, value: s.trim(), note: why });
        }
        if (n) columns.push({ index: p.index, name: colName(p), count: n });
      }
      if (!list.total) return [];
      return [
        finding(list, {
          id: "invalid-emails",
          severity: "warning",
          title: "Invalid email addresses",
          count: list.total,
          unit: "cells",
          explanation: `${plural(list.total, "value")} in email ${columns.length === 1 ? "column" : "columns"} ${columns.map((c) => `“${c.name}”`).join(", ")} ${list.total === 1 ? "isn't a valid email address" : "aren't valid email addresses"} (for example a missing @, a space, or a domain without an ending such as .com). Messages sent to these addresses will fail. Empty cells are counted under “Missing cells”, not here.`,
          howToFix:
            "Correct each address from the original source. Put one address per cell; if a contact has several, use extra columns. Remove spaces and placeholders such as “none”.",
          columns,
          examples: examples.sort((a, b) => a.row - b.row),
        }),
      ];
    },
  };
};

// ---------------------------------------------------------------- J: phones

const PHONE_HEADER = /(^|[^a-z])(phone|phones|mobile|mob|tel|telephone|fax|whatsapp|cellphone|contact ?(no|number))([^a-z]|$)/i;
/** Looks like a phone number (for content-based column detection). */
const PHONE_LIKE = /^\+?[\d\s().\-/]{7,}$/;
export const EXTENSION = /\s*(ext\.?|extension|x|#)\s*\d{1,6}$/i;

function digits(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x30 && c <= 0x39) n++;
  }
  return n;
}

/** Why a phone number is invalid, or null if it looks valid (generic international rules). */
export function phoneProblem(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(EXTENSION, "");
  if (/\p{L}/u.test(s)) return "Contains letters";
  if (!/^[\d\s+().\-/]+$/.test(s)) return "Contains characters that aren't used in phone numbers";
  const plus = s.match(/\+/g)?.length ?? 0;
  if (plus > 1 || (plus === 1 && !s.startsWith("+"))) return "“+” is only allowed at the start";
  if ((s.match(/\(/g)?.length ?? 0) !== (s.match(/\)/g)?.length ?? 0)) return "Unbalanced brackets";
  const n = digits(s);
  if (n < 7) return `Too few digits (${n}; phone numbers have at least 7)`;
  if (n > 15) return `Too many digits (${n}; the international maximum is 15)`;
  return null;
}

/** Layout of a valid number, e.g. "+9 999 999 9999" → "+# # # #". */
export function phoneShape(raw: string): string {
  return raw.trim().replace(EXTENSION, "").replace(/\d+/g, "#");
}

export const invalidPhones: CheckFactory = (ctx) => {
  const phoneLike = new Float64Array(ctx.columnCount);
  const formatted = new Float64Array(ctx.columnCount);
  const contentEligible = ctx.profiles.map((p) => p.kind === "text" || p.kind === "mixed");
  return {
    cell(_r, c, cat, v) {
      if (!contentEligible[c] || typeof v !== "string" || isBlank(cat)) return;
      const s = v.trim();
      if (!PHONE_LIKE.test(s)) return;
      const n = digits(s);
      if (n < 7 || n > 15) return;
      phoneLike[c]!++;
      if (/[\s()+\-./]/.test(s)) formatted[c]!++;
    },
    finish(): Finding[] {
      const cols = ctx.profiles.filter(
        (p) =>
          p.nonEmpty > 0 &&
          (PHONE_HEADER.test(p.name ?? "") || (phoneLike[p.index]! >= Math.max(3, p.nonEmpty * 0.7) && formatted[p.index]! >= phoneLike[p.index]! * 0.5)),
      );
      const invalid = new CellList();
      const shapes = new CellList();
      const invCols: ScanIssue["columns"] = [];
      const shapeCols: ScanIssue["columns"] = [];
      const invEx: ScanIssue["examples"] = [];
      const shapeEx: ScanIssue["examples"] = [];
      const shapeNotes: string[] = [];
      for (const p of cols) {
        const counts = new Map<string, number>();
        const sample = new Map<string, string>(); // first real number of each layout
        let n = 0;
        for (let r = ctx.startRow; r < ctx.rowCount; r++) {
          const cat = cellCat(ctx, r, p.index);
          if (isBlank(cat) || cat === Cat.Error) continue;
          const s = textOf(ctx, r, p.index);
          const why = phoneProblem(s);
          if (why) {
            n++;
            invalid.add(cellKey(r, p.index));
            if (invEx.length < 5) invEx.push({ row: r, col: p.index, value: s.trim(), note: why });
          } else if (typeof ctx.sheet.grid.get(r, p.index) === "string") {
            const shape = phoneShape(s);
            counts.set(shape, (counts.get(shape) ?? 0) + 1);
            if (!sample.has(shape)) sample.set(shape, s.trim());
          }
        }
        if (n) invCols.push({ index: p.index, name: colName(p), count: n });
        if (counts.size > 1) {
          // Note only: the most common layout is the reference.
          let main = "";
          let mainN = -1;
          for (const [k, v] of counts) if (v > mainN) [main, mainN] = [k, v];
          let other = 0;
          for (let r = ctx.startRow; r < ctx.rowCount; r++) {
            const v = ctx.sheet.grid.get(r, p.index);
            if (typeof v !== "string" || !v.trim() || phoneProblem(v)) continue;
            if (phoneShape(v) === main) continue;
            other++;
            shapes.add(cellKey(r, p.index));
            if (shapeEx.length < 5) shapeEx.push({ row: r, col: p.index, value: v.trim(), note: `Most numbers here are written like ${sample.get(main) ?? main}` });
          }
          shapeCols.push({ index: p.index, name: colName(p), count: other });
          shapeNotes.push(`${colName(p)}: ${counts.size} layouts`);
        }
      }
      const out: Finding[] = [];
      if (invalid.total) {
        out.push(
          finding(invalid, {
            id: "invalid-phones",
            severity: "warning",
            title: "Invalid phone numbers",
            count: invalid.total,
            unit: "cells",
            explanation: `${plural(invalid.total, "value")} in phone ${invCols.length === 1 ? "column" : "columns"} ${invCols.map((c) => `“${c.name}”`).join(", ")} can't be a phone number: letters, too few digits (under 7), too many (over 15, the international maximum) or misplaced symbols. These are checked with general international rules, not each country's numbering plan. Empty cells are counted under “Missing cells”.`,
            howToFix:
              "Correct the numbers from the original source. Use digits with spaces, dashes or brackets, a “+” only at the start for the country code (for example +44 20 7946 0958), and put extensions after “ext”. Leave unknown numbers empty instead of writing “N/A”.",
            columns: invCols,
            examples: invEx.sort((a, b) => a.row - b.row),
          }),
        );
      }
      if (shapes.total) {
        out.push(
          finding(shapes, {
            id: "phone-formats",
            severity: "note",
            title: "Phone numbers in different formats",
            count: shapes.total,
            unit: "cells",
            explanation: `${plural(shapes.total, "phone number")} ${shapes.total === 1 ? "is" : "are"} written in a different layout from most numbers in the same column (${shapeNotes.join("; ")}). They are valid, but mixed layouts make sorting, searching and importing harder.`,
            howToFix:
              "If the numbers will be imported into another system, use one layout for all of them, ideally the international format with the country code (for example +1 555 123 4567).",
            columns: shapeCols,
            examples: shapeEx.sort((a, b) => a.row - b.row),
          }),
        );
      }
      return out;
    },
  };
};
