/**
 * Stage 3 checks A–D: duplicate rows, empty rows, empty columns, missing cells.
 * Read-only. Cells containing only whitespace are treated as empty, because
 * they look empty to a reader.
 */
import { cellKey, splitCellKey, type CellValue } from "../../types.ts";
import { Cat } from "../classify.ts";
import { cellCat, type CheckFactory, type ColumnProfile, type Finding, type ScanContext } from "../scan.ts";
import { CellList, RowList } from "../hits.ts";

const isBlankCat = (cat: number) => cat === Cat.Empty || cat === Cat.Blank;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
export const columnLabel = (p: ColumnProfile) => (p.name ? `“${p.name}” (column ${p.letter})` : `column ${p.letter}`);

function displayOf(ctx: ScanContext, r: number, c: number): string {
  const g = ctx.sheet.grid;
  if (g.display) return g.display(r, c);
  const v = g.get(r, c);
  return v === null ? "" : String(v);
}

// ---------------------------------------------------------------- A: duplicates

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function fnvString(h: number, s: string): number {
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h;
}

/** Values are equal for duplicate purposes: same type and same value. */
function sameValue(a: CellValue, b: CellValue): boolean {
  return a === b || (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b));
}

/** Exact row comparison (whitespace-only cells count as empty). */
export function rowsEqual(ctx: ScanContext, r1: number, r2: number): boolean {
  const g = ctx.sheet.grid;
  const len = Math.max(g.rowLength(r1), g.rowLength(r2));
  for (let c = 0; c < len; c++) {
    const e1 = isBlankCat(cellCat(ctx, r1, c));
    const e2 = isBlankCat(cellCat(ctx, r2, c));
    if (e1 !== e2) return false;
    if (!e1 && !sameValue(g.get(r1, c), g.get(r2, c))) return false;
  }
  return true;
}

export const duplicateRows: CheckFactory = (ctx) => {
  const dataRows = ctx.rowStart.length - 1;
  const hashes = new Uint32Array(dataRows);
  const hasValue = new Uint8Array(dataRows);
  let h = FNV_OFFSET;
  let any = false;
  return {
    cell(r, c, cat, v) {
      if (isBlankCat(cat)) return;
      any = true;
      // Column index + type tag + value, so ["a","","b"] ≠ ["a","b"] and 1 ≠ "1".
      h = Math.imul(h ^ (c + 1), FNV_PRIME);
      h = Math.imul(h ^ (typeof v === "number" ? 0x6e : typeof v === "boolean" ? 0x62 : 0x73), FNV_PRIME);
      h = fnvString(h, String(v));
      h = Math.imul(h ^ 0x1f, FNV_PRIME);
    },
    endRow(r) {
      const i = r - ctx.startRow;
      hashes[i] = h >>> 0;
      hasValue[i] = any ? 1 : 0;
      h = FNV_OFFSET;
      any = false;
    },
    finish(): Finding[] {
      // Group rows by fingerprint, then confirm every match cell by cell.
      let m = 0;
      for (let i = 0; i < dataRows; i++) if (hasValue[i]) m++;
      const order = new Uint32Array(m);
      for (let i = 0, k = 0; i < dataRows; i++) if (hasValue[i]) order[k++] = i;
      order.sort((a, b) => hashes[a]! - hashes[b]! || a - b);

      const affected: number[] = [];
      const examples: Finding["issue"]["examples"] = [];
      let extraCopies = 0;
      let groups = 0;
      for (let s = 0; s < m; ) {
        let e = s + 1;
        while (e < m && hashes[order[e]!] === hashes[order[s]!]) e++;
        if (e - s > 1) {
          // Partition this fingerprint bucket into truly identical groups (handles collisions).
          const reps: { first: number; members: number[] }[] = [];
          for (let k = s; k < e; k++) {
            const row = order[k]! + ctx.startRow;
            const g = reps.find((x) => rowsEqual(ctx, x.first, row));
            if (g) g.members.push(row);
            else reps.push({ first: row, members: [row] });
          }
          for (const g of reps) {
            if (g.members.length < 2) continue;
            groups++;
            extraCopies += g.members.length - 1;
            for (const row of g.members) affected.push(row);
            for (const row of g.members.slice(1)) {
              if (examples.length < 5) examples.push({ row, col: 0, value: displayOf(ctx, row, 0), note: `Same as row ${g.first + 1}` });
            }
          }
        }
        s = e;
      }
      affected.sort((a, b) => a - b);
      examples.sort((a, b) => a.row - b.row);
      return [
        {
          issue: {
            id: "duplicate-rows",
            severity: "warning",
            title: "Duplicate rows",
            count: extraCopies,
            unit: "rows",
            explanation: `${plural(extraCopies, "row")} ${extraCopies === 1 ? "is an exact copy" : "are exact copies"} of an earlier row (${plural(groups, "group")} of identical rows). Duplicates can double-count totals and skew averages.`,
            howToFix:
              "Check whether the copies are intentional (for example, two genuinely identical orders). If not, delete the extra copies and keep the first one. In Excel: Data → Remove Duplicates. In Google Sheets: Data → Data cleanup → Remove duplicates.",
            examples,
          },
          rows: Uint32Array.from(affected),
        },
      ];
    },
  };
};

// ---------------------------------------------------------------- B: empty rows

export const emptyRows: CheckFactory = () => {
  const rows = new RowList();
  let any = false;
  return {
    cell(_r, _c, cat) {
      if (!isBlankCat(cat)) any = true;
    },
    endRow(r) {
      if (!any) rows.add(r);
      any = false;
    },
    finish(): Finding[] {
      const list = rows.toArray();
      return [
        {
          issue: {
            id: "empty-rows",
            severity: "warning",
            title: "Empty rows",
            count: list.length,
            unit: "rows",
            explanation: `${plural(list.length, "row")} ${list.length === 1 ? "has" : "have"} no data. Empty rows can break sorting and filtering, and some programs stop reading at the first empty row.`,
            howToFix:
              "Delete the empty rows unless they are deliberate separators. To find them in Excel, select the data, then Home → Find & Select → Go To Special → Blanks.",
            examples: Array.from(list.slice(0, 5), (row) => ({ row, col: 0, value: "" })),
          },
          rows: list,
        },
      ];
    },
  };
};

// ---------------------------------------------------------------- C: empty columns

export const emptyColumns: CheckFactory = (ctx) => ({
  cell() {},
  finish(): Finding[] {
    if (ctx.rowStart.length - 1 === 0) return []; // no data rows: nothing to judge
    // Cautious: a column covered by a header cell merged across columns (e.g. one
    // wide title over H:I) reads as part of that heading, so it isn't reported.
    const underMergedHeader = (c: number) =>
      ctx.headerRow && ctx.sheet.merges.some((m) => m.startRow <= 0 && m.endRow >= 0 && c > m.startCol && c <= m.endCol);
    const empty = ctx.profiles.filter((p) => p.nonEmpty === 0 && !underMergedHeader(p.index));
    if (empty.length === 0) return [];
    const named = empty.filter((p) => p.name);
    return [
      {
        issue: {
          id: "empty-columns",
          severity: "warning",
          title: "Empty columns",
          count: empty.length,
          unit: "columns",
          explanation: `${plural(empty.length, "column")} ${empty.length === 1 ? "contains" : "contain"} no data${named.length ? `, including ${named.slice(0, 3).map(columnLabel).join(", ")}${named.length > 3 ? " and others" : ""}, which ${named.length === 1 ? "has a name" : "have names"} but no values` : ""}. Empty columns often come from extra separators at the end of CSV lines, or from columns that were never filled in.`,
          howToFix: "Delete the empty columns if they aren't needed. If a named column should have data, check whether the data ended up in a different column.",
          columns: empty.map((p) => ({ index: p.index, name: p.name ?? `Column ${p.letter}`, count: 0 })),
        },
        columns: empty.map((p) => p.index),
      },
    ];
  },
});

// ---------------------------------------------------------------- D: missing cells

export const missingCells: CheckFactory = (ctx) => {
  const filledColumn = ctx.profiles.map((p) => p.nonEmpty > 0);
  const perColumn = new Float64Array(ctx.columnCount);
  const cells = new CellList();
  const rows = new RowList();
  const pending: number[] = [];
  let any = false;
  let total = 0;
  return {
    cell(_r, c, cat) {
      if (isBlankCat(cat)) {
        if (filledColumn[c]) pending.push(c);
      } else any = true;
    },
    endRow(r, length) {
      if (any) {
        // Columns beyond the end of a short row are missing too.
        for (let c = length; c < ctx.columnCount; c++) if (filledColumn[c]) pending.push(c);
        if (pending.length) {
          rows.add(r);
          for (const c of pending) {
            perColumn[c]!++;
            cells.add(cellKey(r, c));
            total++;
          }
        }
      }
      pending.length = 0;
      any = false;
    },
    finish(): Finding[] {
      const columns = ctx.profiles
        .filter((p) => perColumn[p.index]! > 0)
        .map((p) => ({ index: p.index, name: p.name ?? `Column ${p.letter}`, count: perColumn[p.index]! }))
        .sort((a, b) => b.count - a.count);
      const cellArr = cells.toArray();
      const examples = Array.from(cellArr.slice(0, 5), (key) => {
        const { row, col } = splitCellKey(key);
        return { row, col, value: "" }; // the card already shows the column
      });
      return [
        {
          issue: {
            id: "missing-cells",
            severity: "warning",
            title: "Missing cells",
            count: total,
            unit: "cells",
            explanation: `${plural(total, "blank cell")} in rows that otherwise contain data, across ${plural(columns.length, "column")}. Blank cells can make totals, averages and lookups wrong. Cells containing only spaces count as blank, because they look empty.`,
            howToFix:
              "Fill in values that are known. If a value is intentionally missing, consider marking it clearly (for example “N/A”) so that readers know it isn't a mistake. Some columns, such as optional notes, are fine to leave blank.",
            columns,
            examples,
          },
          rows: rows.toArray(),
          cells: cellArr,
        },
      ];
    },
  };
};
