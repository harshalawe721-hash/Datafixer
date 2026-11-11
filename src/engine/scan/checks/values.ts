/**
 * Stage 3 checks K–L: unusual values (cautious) and formula errors.
 */
import { cellKey, MAX_COLUMNS } from "../../types.ts";
import { Cat } from "../classify.ts";
import type { CheckFactory, ColumnProfile, Finding, ScanContext, ScanIssue } from "../scan.ts";
import { CellList, RowList } from "../hits.ts";
import { isIdentifierColumn } from "./text.ts";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const colName = (p: ColumnProfile) => p.name ?? `Column ${p.letter}`;
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 2 });

function rowsFromCells(cells: Float64Array): Uint32Array {
  const rows = new RowList();
  for (const k of cells) rows.add(Math.floor(k / MAX_COLUMNS));
  return rows.toArray();
}

// ---------------------------------------------------------------- K: unusual values

/** Cautious settings: "far out" Tukey fences and a minimum sample size. */
export const OUTLIER_FENCE = 3;
export const OUTLIER_MIN_VALUES = 20;

/** Linear-interpolated quantile of a sorted array. */
export function quantile(sorted: Float64Array, q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

class Growable {
  values = new Float64Array(256);
  rows = new Uint32Array(256);
  n = 0;
  push(v: number, r: number) {
    if (this.n === this.values.length) {
      const nv = new Float64Array(this.n * 2);
      nv.set(this.values);
      this.values = nv;
      const nr = new Uint32Array(this.n * 2);
      nr.set(this.rows);
      this.rows = nr;
    }
    this.values[this.n] = v;
    this.rows[this.n++] = r;
  }
}

/** Why a numeric column is skipped, or null if it can be checked. */
export function outlierSkipReason(p: ColumnProfile, sorted: Float64Array): string | null {
  const n = sorted.length;
  if (n < OUTLIER_MIN_VALUES) return "too few values";
  if (isIdentifierColumn(p)) return "identifier column";
  let allInt = true;
  for (let i = 0; i < n; i++) if (!Number.isInteger(sorted[i]!)) { allInt = false; break; }
  if (allInt) {
    if (sorted[0]! >= 1900 && sorted[n - 1]! <= 2100) return "year column";
    let unique = true;
    for (let i = 1; i < n; i++) if (sorted[i] === sorted[i - 1]) { unique = false; break; }
    if (unique && sorted[n - 1]! - sorted[0]! + 1 <= n * 1.5) return "sequential IDs";
  }
  return null;
}

export const unusualValues: CheckFactory = (ctx) => {
  // Identifier columns are known from the profile already: don't collect their values at all.
  const cols: (Growable | null)[] = ctx.profiles.map((p) => (p.kind === "number" && !isIdentifierColumn(p) ? new Growable() : null));
  return {
    cell(r, c, cat, v) {
      const g = cols[c];
      if (!g) return;
      if (cat === Cat.Number) g.push(v as number, r);
      else if (cat === Cat.NumericText) {
        const s = v as string;
        // Leading zeros ("007", "-01") mean an identifier, not a quantity. Checked by
        // character codes rather than trim + regex: this runs for every number in the column.
        let i = 0;
        while (s.charCodeAt(i) <= 0x20 || s.charCodeAt(i) === 0xa0) i++;
        let ch = s.charCodeAt(i);
        if (ch === 0x2b || ch === 0x2d) ch = s.charCodeAt(++i);
        if (ch === 0x30) {
          const next = s.charCodeAt(i + 1);
          if (next >= 0x30 && next <= 0x39) return;
        }
        g.push(+s, r); // unary + ignores surrounding whitespace, like Number()
      }
      // Formatted numbers ("1,234") are not parsed: separators are ambiguous between countries.
    },
    finish(): Finding[] {
      const cells = new CellList();
      const columns: ScanIssue["columns"] = [];
      const examples: ScanIssue["examples"] = [];
      cols.forEach((g, c) => {
        if (!g || g.n === 0) return;
        const p = ctx.profiles[c]!;
        const sorted = g.values.slice(0, g.n).sort();
        if (outlierSkipReason(p, sorted)) return;
        const q1 = quantile(sorted, 0.25);
        const q3 = quantile(sorted, 0.75);
        const iqr = q3 - q1;
        if (!(iqr > 0)) return; // most values identical: no meaningful spread (cautious)
        const low = q1 - OUTLIER_FENCE * iqr;
        const high = q3 + OUTLIER_FENCE * iqr;
        let count = 0;
        for (let i = 0; i < g.n; i++) {
          const v = g.values[i]!;
          if (v >= low && v <= high) continue;
          count++;
          const r = g.rows[i]!;
          cells.add(cellKey(r, c));
          if (examples.length < 5) {
            const shown = ctx.sheet.grid.display ? ctx.sheet.grid.display(r, c) : String(v);
            examples.push({ row: r, col: c, value: shown, note: `${v > high ? "Far above" : "Far below"} the usual range in ${colName(p)}: the middle half of the values is ${fmt(q1)} to ${fmt(q3)}` });
          }
        }
        cols[c] = null; // release
        if (count) columns.push({ index: c, name: colName(p), count });
      });
      if (!cells.total) return [];
      const arr = cells.toArray().sort();
      return [
        {
          issue: {
            id: "unusual-values",
            severity: "note",
            title: "Unusual values (please check)",
            count: cells.total,
            unit: "cells",
            explanation: `${plural(cells.total, "number")} ${cells.total === 1 ? "is" : "are"} far outside the usual range of ${columns.length === 1 ? "its column" : "their columns"}. They may be correct (a genuinely large order, for example), but values like these are often typing mistakes such as an extra zero, a wrong sign or a value in the wrong unit. Only clear cases are shown: columns with fewer than ${OUTLIER_MIN_VALUES} numbers, IDs, years and columns where most values are the same are not checked.`,
            howToFix: "Compare each value with its source. If it's a mistake, correct it; if it's genuine, no change is needed.",
            columns,
            examples: examples.sort((a, b) => a.row - b.row),
          },
          rows: rowsFromCells(arr),
          cells: arr,
        },
      ];
    },
  };
};

// ---------------------------------------------------------------- L: formula errors

export const ERROR_MEANINGS: Record<string, { meaning: string; fix: string }> = {
  "#DIV/0!": { meaning: "division by zero or by an empty cell", fix: "check the divisor, or wrap the formula in IFERROR(…, \"\")" },
  "#N/A": { meaning: "a lookup didn't find a match", fix: "check that the value exists in the lookup range and that both are spelled the same (extra spaces are a common cause)" },
  "#REF!": { meaning: "the formula refers to cells that were deleted", fix: "rebuild the reference, or undo the deletion" },
  "#NAME?": { meaning: "a misspelled function or an unknown name", fix: "check the function name and any named ranges" },
  "#VALUE!": { meaning: "the wrong type of value, such as text in a calculation", fix: "make sure the cells used hold numbers (see “Numbers stored as text”)" },
  "#NUM!": { meaning: "an impossible number, such as the square root of a negative number", fix: "check the inputs of the calculation" },
  "#NULL!": { meaning: "a range written with a space instead of a colon or comma", fix: "use A1:B2 for a range and a comma between separate ranges" },
  "#SPILL!": { meaning: "a result that needs more room than is free", fix: "clear the cells the result spills into" },
  "#CALC!": { meaning: "a calculation that can't be done, such as an empty array", fix: "check the formula's inputs" },
  "#GETTING_DATA": { meaning: "data that was still loading when the file was saved", fix: "recalculate and save the file again" },
};

export const formulaErrors: CheckFactory = (ctx: ScanContext) => {
  const cells = new CellList();
  const byType = new Map<string, number>();
  const perColumn = new Float64Array(ctx.columnCount);
  const examples: ScanIssue["examples"] = [];
  const isExcel = ctx.sheet.errors.size > 0 || ctx.sheet.formulas.size > 0;
  return {
    cell(r, c, cat, v) {
      if (cat !== Cat.Error) return;
      const key = cellKey(r, c);
      const text = (ctx.sheet.errors.get(key) ?? String(v)).trim();
      byType.set(text, (byType.get(text) ?? 0) + 1);
      perColumn[c]!++;
      cells.add(key);
      if (examples.length < 5) {
        const f = ctx.sheet.formulas.get(key);
        examples.push({ row: r, col: c, value: text, note: f ? `Formula: =${f}` : (ERROR_MEANINGS[text]?.meaning ?? "spreadsheet error") });
      }
    },
    finish(): Finding[] {
      if (!cells.total) return [];
      const types = [...byType.entries()].sort((a, b) => b[1] - a[1]);
      const typeList = types.map(([t, n]) => `${t} ×${n.toLocaleString("en-US")} (${ERROR_MEANINGS[t]?.meaning ?? "spreadsheet error"})`).join("; ");
      const fixes = types
        .filter(([t]) => ERROR_MEANINGS[t])
        .map(([t]) => `${t}: ${ERROR_MEANINGS[t]!.fix}.`)
        .join(" ");
      const columns = ctx.profiles
        .filter((p) => perColumn[p.index]! > 0)
        .map((p) => ({ index: p.index, name: colName(p), count: perColumn[p.index]! }))
        .sort((a, b) => b.count - a.count);
      const arr = cells.toArray();
      return [
        {
          issue: {
            id: "formula-errors",
            severity: "error",
            title: "Formula errors",
            count: cells.total,
            unit: "cells",
            explanation: `${plural(cells.total, "cell")} ${cells.total === 1 ? "shows" : "show"} a spreadsheet error instead of a value: ${typeList}. Totals and charts that include these cells are wrong or fail.${isExcel ? "" : " This is a CSV file, so the original formulas aren't available, only the error text that was exported."}`,
            howToFix: `Open the original spreadsheet and fix the formulas. ${fixes}`,
            columns,
            examples,
          },
          rows: rowsFromCells(arr),
          cells: arr,
        },
      ];
    },
  };
};
