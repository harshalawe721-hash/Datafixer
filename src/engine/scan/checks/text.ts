/**
 * Stage 3 checks E–G: extra spaces, inconsistent capitalization, numbers
 * stored as text. Cautious by design: only clear, reliable cases are reported.
 */
import { cellKey, MAX_COLUMNS } from "../../types.ts";
import { Cat } from "../classify.ts";
import type { CheckFactory, ColumnProfile, Finding, ScanIssue } from "../scan.ts";
import { CellList, RowList } from "../hits.ts";
import { columnLabel } from "./structure.ts";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const colName = (p: ColumnProfile) => p.name ?? `Column ${p.letter}`;

function rowsOf(cells: Float64Array): Uint32Array {
  const rows = new RowList();
  for (const key of cells) rows.add(Math.floor(key / MAX_COLUMNS));
  return rows.toArray();
}

/** Show invisible characters at the edges so the problem can be seen. */
export function revealEdges(s: string): string {
  const show = (ch: string) => (ch === "\t" ? "⇥" : ch === "\u00a0" ? "⍽" : "·");
  const lead = s.match(/^[\s\uFEFF]+/)?.[0] ?? "";
  const trail = s.match(/[\s\uFEFF]+$/)?.[0] ?? "";
  const mid = s.slice(lead.length, s.length - trail.length);
  const shown = `${[...lead].map(show).join("")}${mid.length > 40 ? `${mid.slice(0, 37)}…` : mid}${[...trail].map(show).join("")}`;
  return `“${shown}”`;
}

// ---------------------------------------------------------------- E: extra spaces

const EDGE_SPACE = /^[\s\uFEFF]|[\s\uFEFF]$/;

export const extraSpaces: CheckFactory = (ctx) => {
  const perColumn = new Float64Array(ctx.columnCount);
  const cells = new CellList();
  let nbsp = 0;
  const examples: ScanIssue["examples"] = [];
  return {
    cell(r, c, cat, v) {
      if (typeof v !== "string" || cat === Cat.Empty || cat === Cat.Blank) return;
      if (!EDGE_SPACE.test(v)) return;
      perColumn[c]!++;
      cells.add(cellKey(r, c));
      if (/^[\u00a0\uFEFF]|[\u00a0\uFEFF]$/.test(v)) nbsp++;
      if (examples.length < 5) examples.push({ row: r, col: c, value: revealEdges(v) });
    },
    finish(): Finding[] {
      const total = cells.total;
      const columns = ctx.profiles
        .filter((p) => perColumn[p.index]! > 0)
        .map((p) => ({ index: p.index, name: colName(p), count: perColumn[p.index]! }))
        .sort((a, b) => b.count - a.count);
      const arr = cells.toArray();
      return [
        {
          issue: {
            id: "extra-spaces",
            severity: "warning",
            title: "Extra spaces",
            count: total,
            unit: "cells",
            explanation: `${plural(total, "cell")} ${total === 1 ? "starts or ends" : "start or end"} with spaces${nbsp ? ` (${plural(nbsp, "cell")} with invisible non-breaking spaces, often copied from web pages)` : ""}. “Ann” and “Ann ” look the same but don't match in lookups, filters or duplicate checks. In the examples, · marks a space, ⍽ a non-breaking space and ⇥ a tab.`,
            howToFix:
              "Remove the extra spaces. In Excel or Google Sheets, =TRIM(A2) in a helper column removes ordinary spaces; non-breaking spaces need =TRIM(SUBSTITUTE(A2,CHAR(160),\" \")). Then copy the results back as values.",
            columns,
            examples,
          },
          rows: rowsOf(arr),
          cells: arr,
        },
      ];
    },
  };
};

// ---------------------------------------------------------------- F: capitalization

/** Per-column limit on distinct values tracked (memory safety on small devices). */
export const CASE_MAX_DISTINCT_PER_COLUMN = 20_000;
const CASE_MAX_DISTINCT_TOTAL = 200_000;

/**
 * Counts the spellings of each value per column (lower-case key → exact
 * spelling → count). Shared by the capitalization check and the fix, so both
 * see exactly the same groups. Cells must be added in row-major order.
 */
export class CaseCollector {
  readonly maps: (Map<string, Map<string, number>> | null)[];
  readonly skipped = new Set<number>();
  private tracked = 0;
  constructor(profiles: ColumnProfile[]) {
    this.maps = profiles.map((p) => (p.kind === "text" || p.kind === "mixed" ? new Map() : null));
  }
  add(c: number, cat: number, v: unknown): void {
    if (cat !== Cat.Text) return;
    const map = this.maps[c];
    if (!map) return;
    const s = (v as string).trim();
    if (s.length < 2 || s.length > 200) return; // single letters can be meaningful codes
    const key = s.toLowerCase();
    let variants = map.get(key);
    if (!variants) {
      if (map.size >= CASE_MAX_DISTINCT_PER_COLUMN || this.tracked >= CASE_MAX_DISTINCT_TOTAL) {
        this.maps[c] = null; // too many different values: stop tracking this column
        this.skipped.add(c);
        return;
      }
      variants = new Map();
      map.set(key, variants);
      this.tracked++;
    }
    variants.set(s, (variants.get(s) ?? 0) + 1);
  }
}

export const inconsistentCase: CheckFactory = (ctx) => {
  const collector = new CaseCollector(ctx.profiles);
  const { maps, skipped } = collector;
  return {
    cell(_r, c, cat, v) {
      collector.add(c, cat, v);
    },
    finish(): Finding[] {
      // For each inconsistent group, the most common spelling is the reference.
      const minority = new Map<number, Map<string, { reference: string; refCount: number }>>();
      const perColumn = new Map<number, number>();
      let groups = 0;
      let affected = 0;
      const examplesRaw: { col: number; value: string; note: string }[] = [];
      maps.forEach((map, c) => {
        if (!map) return;
        for (const variants of map.values()) {
          if (variants.size < 2) continue;
          let reference = "";
          let refCount = -1;
          for (const [spelling, n] of variants) if (n > refCount) [reference, refCount] = [spelling, n];
          groups++;
          let m = minority.get(c);
          if (!m) minority.set(c, (m = new Map()));
          for (const [spelling, n] of variants) {
            if (spelling === reference) continue;
            m.set(spelling, { reference, refCount });
            affected += n;
            perColumn.set(c, (perColumn.get(c) ?? 0) + n);
            if (examplesRaw.length < 5) examplesRaw.push({ col: c, value: spelling, note: `Usually written “${reference}” (${refCount.toLocaleString("en-US")}×)` });
          }
        }
      });
      maps.length = 0; // release
      if (groups === 0 && skipped.size === 0) return [];

      // Locate the minority spellings (only in affected columns).
      const cells = new CellList();
      const examples: ScanIssue["examples"] = [];
      if (minority.size) {
        const g = ctx.sheet.grid;
        for (let r = ctx.startRow; r < ctx.rowCount; r++) {
          for (const [c, m] of minority) {
            const v = g.get(r, c);
            if (typeof v !== "string") continue;
            const s = v.trim();
            if (!m.has(s)) continue;
            cells.add(cellKey(r, c));
            const ex = examplesRaw.find((e) => e.col === c && e.value === s);
            if (ex && !examples.some((e) => e.col === c && e.value === s)) examples.push({ row: r, col: c, value: s, note: ex.note });
          }
        }
      }
      const columns = [...perColumn.entries()]
        .map(([index, count]) => ({ index, name: colName(ctx.profiles[index]!), count }))
        .sort((a, b) => b.count - a.count);
      const skippedNote = skipped.size
        ? ` ${[...skipped].map((c) => columnLabel(ctx.profiles[c]!)).slice(0, 3).join(", ")}${skipped.size > 3 ? " and others" : ""} had too many different values to check.`
        : "";
      const arr = cells.toArray();
      return [
        {
          issue: {
            id: "inconsistent-case",
            severity: groups ? "warning" : "note",
            title: "Inconsistent capitalization",
            count: affected,
            unit: "cells",
            explanation: groups
              ? `${plural(groups, "value")} ${groups === 1 ? "is" : "are"} written with different capitalization in the same column (for example “Paris”, “paris” and “PARIS”); ${plural(affected, "cell")} differ from the most common spelling. Filters, pivot tables and some lookups treat these as different values.${skippedNote}`
              : `No capitalization differences were found.${skippedNote}`,
            howToFix:
              "Choose one spelling and use it everywhere: Find & Replace (with “Match case” on) for a few values, or =PROPER(A2), =UPPER(A2) or =LOWER(A2) in a helper column for a whole column. Check names and brands with special capitals (such as “iPhone” or “McDonald”) by hand.",
            columns,
            examples: examples.sort((a, b) => a.row - b.row),
          },
          rows: rowsOf(arr),
          cells: arr,
        },
      ];
    },
  };
};

// ---------------------------------------------------------------- G: numbers stored as text

/** Digit strings longer than this are identifiers (a spreadsheet would lose precision). */
const MAX_NUMBER_DIGITS = 15;
/** A column where this share of numeric text has leading zeros is an identifier column. */
const ID_LEADING_ZERO_SHARE = 0.2;

function digitCount(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x30 && c <= 0x39) n++;
  }
  return n;
}

/** "'45" (apostrophe-forced text, common in CSV exports from Excel). */
const APOSTROPHE_NUMBER = /^'[+-]?(\d+(\.\d*)?|\.\d+)$/;

export function isIdentifierColumn(p: ColumnProfile): boolean {
  const name = (p.name ?? "").toLowerCase();
  // Name words such as "id", "order_id", "ZIP code" (underscores and digits count as separators).
  if (/(^|[^a-z])(id|code|zip|postal|postcode|pin|phone|mobile|tel|account|acct|iban|sku|ean|upc|isbn)([^a-z]|$)/.test(name)) return true;
  return p.counts.numericText > 0 && p.leadingZero / p.counts.numericText >= ID_LEADING_ZERO_SHARE;
}

export const numbersAsText: CheckFactory = (ctx) => {
  // Eligible columns: mostly numbers, not identifiers.
  const eligible = ctx.profiles.map((p) => p.kind === "number" && !isIdentifierColumn(p));
  const candidates: (CellList | null)[] = ctx.profiles.map(() => null);
  const firstExamples = new Map<number, { row: number; value: string }[]>();
  return {
    cell(r, c, cat, v) {
      if (!eligible[c] || typeof v !== "string") return;
      const p = ctx.profiles[c]!;
      const s = v.trim();
      let candidate = false;
      if (p.counts.number > 0) {
        // Excel-like column (has real numbers): any number written as text.
        candidate =
          (cat === Cat.NumericText && !/^[+-]?0\d/.test(s) && digitCount(s) <= MAX_NUMBER_DIGITS) ||
          cat === Cat.FormattedNumber ||
          APOSTROPHE_NUMBER.test(s);
      } else {
        // CSV-like column (all text): formatted values among plain numbers.
        candidate = cat === Cat.FormattedNumber || APOSTROPHE_NUMBER.test(s);
      }
      if (!candidate) return;
      (candidates[c] ??= new CellList()).add(cellKey(r, c));
      const ex = firstExamples.get(c) ?? [];
      if (ex.length < 3) firstExamples.set(c, [...ex, { row: r, value: s }]);
    },
    finish(): Finding[] {
      const cellsAll: number[] = [];
      const columns: { index: number; name: string; count: number }[] = [];
      const examples: ScanIssue["examples"] = [];
      let excelLike = false;
      for (const p of ctx.profiles) {
        const list = candidates[p.index];
        if (!list) continue;
        const flagged = list.total;
        // Majority rule: the column's normal form must be clear (real numbers in
        // Excel, plain numbers in CSV); consistently formatted columns are left alone.
        const plain = p.counts.number > 0 ? p.counts.number : p.counts.numericText;
        if (plain <= flagged) continue;
        if (p.counts.number > 0) excelLike = true;
        columns.push({ index: p.index, name: colName(p), count: flagged });
        for (const key of list.toArray()) cellsAll.push(key);
        for (const e of firstExamples.get(p.index) ?? []) {
          if (examples.length < 5) examples.push({ row: e.row, col: p.index, value: e.value, note: `In ${colName(p)}, which otherwise holds numbers` });
        }
      }
      const total = columns.reduce((n, c) => n + c.count, 0);
      if (total === 0) return [];
      cellsAll.sort((a, b) => a - b);
      const arr = Float64Array.from(cellsAll.slice(0, 1_000_000));
      columns.sort((a, b) => b.count - a.count);
      return [
        {
          issue: {
            id: "numbers-as-text",
            severity: "warning",
            title: "Numbers stored as text",
            count: total,
            unit: "cells",
            explanation: excelLike
              ? `${plural(total, "cell")} in number columns ${total === 1 ? "contains a number saved as text" : "contain numbers saved as text"}. Text numbers are left out of SUM, AVERAGE and charts, and sort in the wrong order. Values with leading zeros (such as IDs and ZIP codes) were not counted.`
              : `${plural(total, "value")} in number columns ${total === 1 ? "is" : "are"} written with formatting (such as “1,234”, “$12” or “'45”) while the rest of the column holds plain numbers. Many programs import these as text, so they are left out of totals. Values with leading zeros (such as IDs and ZIP codes) were not counted.`,
            howToFix: excelLike
              ? "In Excel, select the cells, click the warning icon and choose “Convert to Number”, or use Data → Text to Columns → Finish. In Google Sheets, use Format → Number. Keep identifiers with leading zeros as text."
              : "Remove the formatting so the column holds plain numbers (for example “1234” instead of “1,234”, without currency signs or apostrophes), or apply the same format to every value in the column.",
            columns,
            examples: examples.sort((a, b) => a.row - b.row),
          },
          rows: rowsOf(arr),
          cells: arr,
        },
      ];
    },
  };
};

