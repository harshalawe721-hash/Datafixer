/**
 * Stage 3 checks K–L: unusual values (cautious) and formula errors.
 */
import { cellKey, MAX_COLUMNS } from "../../types.ts";
import { Cat } from "../classify.ts";
import { cellCat, type CheckFactory, type ColumnProfile, type Finding, type ScanContext, type ScanIssue } from "../scan.ts";
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

/** Values kept per column for the statistics (deterministic every-k-th sample). */
export const OUTLIER_SAMPLE = 50_000;

class Sample {
  values = new Float64Array(256);
  n = 0;
  push(v: number) {
    if (this.n === this.values.length) {
      const nv = new Float64Array(Math.min(this.n * 2, OUTLIER_SAMPLE + 1));
      nv.set(this.values);
      this.values = nv;
    }
    this.values[this.n++] = v;
  }
}

/** Facts about a numeric column, over ALL its values (the sample is only for quantiles). */
export interface NumericStats {
  count: number;
  min: number;
  max: number;
  allInt: boolean;
  /** Sorted sample (all values when count ≤ OUTLIER_SAMPLE). */
  sorted: Float64Array;
}

/** Why a numeric column is skipped, or null if it can be checked. */
export function outlierSkipReason(p: ColumnProfile, st: NumericStats): string | null {
  if (st.count < OUTLIER_MIN_VALUES) return "too few values";
  if (isIdentifierColumn(p)) return "identifier column";
  if (st.allInt) {
    if (st.min >= 1900 && st.max <= 2100) return "year column";
    const s = st.sorted;
    let unique = true;
    for (let i = 1; i < s.length; i++) if (s[i] === s[i - 1]) { unique = false; break; }
    if (unique && st.max - st.min + 1 <= st.count * 1.5) return "sequential IDs";
  }
  return null;
}

/** Parse a numeric cell for the statistics; null for identifiers (leading zeros) and non-numbers. */
function numericValue(cat: number, v: unknown): number | null {
  if (cat === Cat.Number) return v as number;
  if (cat !== Cat.NumericText) return null; // formatted numbers ("1,234") are ambiguous between countries
  const s = v as string;
  // Leading zeros ("007", "-01") mean an identifier, not a quantity (checked by char codes: hot path).
  let i = 0;
  while (s.charCodeAt(i) <= 0x20 || s.charCodeAt(i) === 0xa0) i++;
  let ch = s.charCodeAt(i);
  if (ch === 0x2b || ch === 0x2d) ch = s.charCodeAt(++i);
  if (ch === 0x30) {
    const next = s.charCodeAt(i + 1);
    if (next >= 0x30 && next <= 0x39) return null;
  }
  return +s; // unary + ignores surrounding whitespace, like Number()
}

/**
 * Memory: only a deterministic sample of at most OUTLIER_SAMPLE values per
 * column is kept for the quartiles (exact for smaller columns); min/max and the
 * whole-number test cover every value. Flagging re-reads the column, so every
 * value outside the fences is found.
 */
export const unusualValues: CheckFactory = (ctx) => {
  const eligible = ctx.profiles.map((p) => p.kind === "number" && !isIdentifierColumn(p));
  const stride = ctx.profiles.map((p) => Math.max(1, Math.ceil((p.counts.number + p.counts.numericText) / OUTLIER_SAMPLE)));
  const samples: (Sample | null)[] = eligible.map((e) => (e ? new Sample() : null));
  const seen = new Float64Array(ctx.columnCount);
  const min = new Float64Array(ctx.columnCount).fill(Infinity);
  const max = new Float64Array(ctx.columnCount).fill(-Infinity);
  const allInt = new Uint8Array(ctx.columnCount).fill(1);
  return {
    cell(_r, c, cat, v) {
      const sample = samples[c];
      if (!sample) return;
      const x = numericValue(cat, v);
      if (x === null || !Number.isFinite(x)) return;
      if (seen[c]! % stride[c]! === 0) sample.push(x);
      seen[c]!++;
      if (x < min[c]!) min[c] = x;
      if (x > max[c]!) max[c] = x;
      if (allInt[c] && !Number.isInteger(x)) allInt[c] = 0;
    },
    finish(): Finding[] {
      const cells = new CellList();
      const columns: ScanIssue["columns"] = [];
      const examples: ScanIssue["examples"] = [];
      const g = ctx.sheet.grid;
      samples.forEach((sample, c) => {
        if (!sample || sample.n === 0) return;
        const p = ctx.profiles[c]!;
        const sorted = sample.values.slice(0, sample.n).sort();
        samples[c] = null; // release
        if (outlierSkipReason(p, { count: seen[c]!, min: min[c]!, max: max[c]!, allInt: allInt[c] === 1, sorted })) return;
        const q1 = quantile(sorted, 0.25);
        const q3 = quantile(sorted, 0.75);
        const iqr = q3 - q1;
        if (!(iqr > 0)) return; // most values identical: no meaningful spread (cautious)
        const low = q1 - OUTLIER_FENCE * iqr;
        const high = q3 + OUTLIER_FENCE * iqr;
        if (min[c]! >= low && max[c]! <= high) return; // nothing outside: skip the re-read
        let count = 0;
        for (let r = ctx.startRow; r < ctx.rowCount; r++) {
          const x = numericValue(cellCat(ctx, r, c), g.get(r, c));
          if (x === null || !Number.isFinite(x) || (x >= low && x <= high)) continue;
          count++;
          cells.add(cellKey(r, c));
          if (examples.length < 5) {
            const shown = g.display ? g.display(r, c) : String(x);
            examples.push({ row: r, col: c, value: shown, note: `${x > high ? "Far above" : "Far below"} the usual range in ${colName(p)}: the middle half of the values is ${fmt(q1)} to ${fmt(q3)}` });
          }
        }
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
