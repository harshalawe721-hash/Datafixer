/**
 * Stage 3 check H: dates. Only date columns (≥ 80% date values) are checked.
 *
 * - Inconsistent dates: several formats in one column, values that aren't
 *   dates, or day-first and month-first values mixed in one column.
 * - Impossible dates: e.g. month 13 or 30 February (error).
 * - Ambiguous dates: a column of values like 03/04/2024 where day-first vs
 *   month-first can't be determined. Reported, never guessed.
 *
 * Read-only. Day/month order is only ever decided from evidence in the
 * column itself (a first number > 12 proves day-first, a second > 12 proves
 * month-first).
 */
import { cellKey, MAX_COLUMNS } from "../../types.ts";
import { Cat, DATE_PATTERNS, type DatePatternId } from "../classify.ts";
import { cellCat, type CheckFactory, type ColumnProfile, type Finding, type ScanContext, type ScanIssue } from "../scan.ts";
import { CellList, RowList } from "../hits.ts";

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const colName = (p: ColumnProfile) => p.name ?? `Column ${p.letter}`;

/** Format families: variants that read the same are one family. */
type Family = "excel" | "iso" | "ymd-slash" | "dm-slash" | "dm-dash" | "dmy-dot" | "dm-short" | "d-mon-y" | "mon-d-y";

const FAMILY_OF: Record<DatePatternId, Family> = {
  iso: "iso",
  "iso-time": "iso", // with or without a time: same format family
  "ymd-slash": "ymd-slash",
  "dmy-or-mdy-slash": "dm-slash",
  "dmy-or-mdy-dash": "dm-dash",
  "dmy-dot": "dmy-dot",
  "short-year-slash": "dm-short",
  "d-mon-y": "d-mon-y",
  "mon-d-y": "mon-d-y",
};

export const FAMILY_LABEL: Record<Family, string> = {
  excel: "real Excel dates",
  iso: "2024-01-31",
  "ymd-slash": "2024/01/31",
  "dm-slash": "31/01/2024 or 01/31/2024",
  "dm-dash": "31-01-2024 or 01-31-2024",
  "dmy-dot": "31.01.2024",
  "dm-short": "31/01/24 or 01/31/24",
  "d-mon-y": "31 Jan 2024",
  "mon-d-y": "Jan 31, 2024",
};

/** Families whose first two numbers may be day/month in either order. */
const ORDER_FAMILIES = new Set<Family>(["dm-slash", "dm-dash", "dm-short"]);

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function validYmd(y: number, m: number, d: number): boolean {
  return y >= 1000 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

function familyOf(cat: number): Family | null {
  if (cat === Cat.Date) return "excel";
  if (cat < Cat.DateTextBase) return null;
  const id = DATE_PATTERNS[cat - Cat.DateTextBase]?.id;
  return id ? FAMILY_OF[id] : null;
}

/** First two numbers of a d/m-or-m/d value, and the year. */
function orderParts(s: string): { a: number; b: number; y: number } | null {
  const m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (!m) return null;
  let y = Number(m[3]);
  if (m[3]!.length === 2) y += y < 50 ? 2000 : 1900;
  return { a: Number(m[1]), b: Number(m[2]), y };
}

export type DayOrder = "dmy" | "mdy" | "unknown" | "mixed";

/**
 * Is this text date possible? For day/month-order families the column's
 * order is used; when unknown, a value is possible if either reading works.
 */
export function isPossibleDate(family: Family, s: string, order: DayOrder): boolean {
  const t = s.trim();
  switch (family) {
    case "excel":
      return true;
    case "iso": {
      const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
      return !!m && validYmd(+m[1]!, +m[2]!, +m[3]!);
    }
    case "ymd-slash": {
      const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(t);
      return !!m && validYmd(+m[1]!, +m[2]!, +m[3]!);
    }
    case "dmy-dot": {
      const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(t);
      return !!m && validYmd(+m[3]!, +m[2]!, +m[1]!);
    }
    case "d-mon-y":
    case "mon-d-y": {
      const day = family === "d-mon-y" ? /^(\d{1,2})/.exec(t)?.[1] : /(\d{1,2}),?\s+\d{2,4}$/.exec(t)?.[1];
      const mon = /([a-z]{3})/i.exec(t)?.[1]?.toLowerCase();
      let year = Number(/(\d{2,4})$/.exec(t)?.[1]);
      if (year < 100) year += year < 50 ? 2000 : 1900;
      const month = mon ? MONTHS[mon] : undefined;
      return !!day && !!month && validYmd(year, month, Number(day));
    }
    default: {
      const p = orderParts(t);
      if (!p) return false;
      const dmy = validYmd(p.y, p.b, p.a);
      const mdy = validYmd(p.y, p.a, p.b);
      if (order === "dmy") return dmy;
      if (order === "mdy") return mdy;
      return dmy || mdy;
    }
  }
}

interface ColumnState {
  families: Map<Family, number>;
  dmyProof: number;
  mdyProof: number;
  ambiguous: number;
  notDate: number;
}

export const inconsistentDates: CheckFactory = (ctx) => {
  const states: (ColumnState | null)[] = ctx.profiles.map((p) =>
    p.kind === "date" ? { families: new Map(), dmyProof: 0, mdyProof: 0, ambiguous: 0, notDate: 0 } : null,
  );
  return {
    cell(_r, c, cat, v) {
      const st = states[c];
      if (!st || cat === Cat.Empty || cat === Cat.Blank || cat === Cat.Error) return;
      const fam = familyOf(cat);
      if (!fam) {
        st.notDate++;
        return;
      }
      st.families.set(fam, (st.families.get(fam) ?? 0) + 1);
      if (ORDER_FAMILIES.has(fam) && typeof v === "string") {
        const p = orderParts(v.trim());
        if (p) {
          if (p.a > 12 && p.b <= 12) st.dmyProof++;
          else if (p.b > 12 && p.a <= 12) st.mdyProof++;
          else if (p.a <= 12 && p.b <= 12) st.ambiguous++;
        }
      }
    },
    finish(): Finding[] {
      return summarize(ctx, states);
    },
  };
};

function summarize(ctx: ScanContext, states: (ColumnState | null)[]): Finding[] {
  const g = ctx.sheet.grid;
  const inconsistent = new CellList();
  const impossible = new CellList();
  const ambiguousCells = new CellList();
  const incCols: ScanIssue["columns"] = [];
  const impCols: ScanIssue["columns"] = [];
  const ambCols: ScanIssue["columns"] = [];
  const incEx: ScanIssue["examples"] = [];
  const impEx: ScanIssue["examples"] = [];
  const ambEx: ScanIssue["examples"] = [];
  const formatNotes: string[] = [];
  let notDateTotal = 0;
  let mixedOrderColumns = 0;

  states.forEach((st, c) => {
    if (!st) return;
    const p = ctx.profiles[c]!;
    // The column's usual format: the most common family.
    let main: Family | null = null;
    let mainCount = -1;
    for (const [f, n] of st.families) if (n > mainCount) [main, mainCount] = [f, n];
    const order: DayOrder = st.dmyProof && st.mdyProof ? "mixed" : st.dmyProof ? "dmy" : st.mdyProof ? "mdy" : "unknown";
    // In a mixed column, the less common proven order is the inconsistent one.
    const minorityOrder = order === "mixed" ? (st.dmyProof >= st.mdyProof ? "mdy" : "dmy") : null;
    if (order === "mixed") mixedOrderColumns++;

    let inc = 0;
    let imp = 0;
    let amb = 0;
    for (let r = ctx.startRow; r < ctx.rowCount; r++) {
      const cat = cellCat(ctx, r, c);
      if (cat === Cat.Empty || cat === Cat.Blank || cat === Cat.Error) continue;
      const fam = familyOf(cat);
      const v = g.get(r, c);
      const shown = g.display ? g.display(r, c) : String(v);
      if (!fam) {
        inc++;
        inconsistent.add(cellKey(r, c));
        if (incEx.length < 5) incEx.push({ row: r, col: c, value: shown, note: `Not a date, in ${colName(p)}` });
        continue;
      }
      if (fam !== main) {
        inc++;
        inconsistent.add(cellKey(r, c));
        if (incEx.length < 5) incEx.push({ row: r, col: c, value: shown, note: `Format differs from the usual ${FAMILY_LABEL[main!]}` });
      } else if (minorityOrder && typeof v === "string") {
        const pr = orderParts(v.trim());
        const isMinority = pr && (minorityOrder === "dmy" ? pr.a > 12 && pr.b <= 12 : pr.b > 12 && pr.a <= 12);
        if (isMinority) {
          inc++;
          inconsistent.add(cellKey(r, c));
          if (incEx.length < 5) incEx.push({ row: r, col: c, value: shown, note: minorityOrder === "dmy" ? "Written day-first; most dates here are month-first" : "Written month-first; most dates here are day-first" });
        }
      }
      if (typeof v === "string" && !isPossibleDate(fam, v, order === "mixed" ? "unknown" : order)) {
        imp++;
        impossible.add(cellKey(r, c));
        if (impEx.length < 5) impEx.push({ row: r, col: c, value: shown, note: "This date doesn't exist" });
      } else if (order === "unknown" && ORDER_FAMILIES.has(fam) && typeof v === "string") {
        const pr = orderParts(v.trim());
        if (pr && pr.a <= 12 && pr.b <= 12 && pr.a !== pr.b) {
          amb++;
          ambiguousCells.add(cellKey(r, c));
          if (ambEx.length < 5) ambEx.push({ row: r, col: c, value: shown, note: `${pr.a}/${pr.b}: day ${pr.a} of month ${pr.b}, or month ${pr.a} day ${pr.b}?` });
        }
      }
    }
    if (inc) {
      incCols.push({ index: c, name: colName(p), count: inc });
      const fams = [...st.families.entries()].sort((a, b) => b[1] - a[1]).map(([f, n]) => `${FAMILY_LABEL[f]} (${n.toLocaleString("en-US")})`);
      formatNotes.push(`${colName(p)}: ${fams.join(", ")}${st.notDate ? `, not a date (${st.notDate.toLocaleString("en-US")})` : ""}`);
      notDateTotal += st.notDate;
    }
    if (imp) impCols.push({ index: c, name: colName(p), count: imp });
    if (amb) ambCols.push({ index: c, name: colName(p), count: amb });
  });

  const findings: Finding[] = [];
  const rowsOf = (list: CellList) => {
    const arr = list.toArray().sort();
    const rows = new RowList();
    for (const k of arr) rows.add(Math.floor(k / MAX_COLUMNS));
    return { cells: arr, rows: rows.toArray() };
  };
  if (inconsistent.total) {
    const { cells, rows } = rowsOf(inconsistent);
    findings.push({
      issue: {
        id: "inconsistent-dates",
        severity: "warning",
        title: "Inconsistent dates",
        count: inconsistent.total,
        unit: "cells",
        explanation: `${plural(inconsistent.total, "date")} in ${plural(incCols.length, "date column")} ${inconsistent.total === 1 ? "doesn't" : "don't"} match the column's usual format${notDateTotal ? ` (including ${plural(notDateTotal, "value")} that ${notDateTotal === 1 ? "isn't a date" : "aren't dates"})` : ""}${mixedOrderColumns ? `, and some columns mix day-first and month-first dates` : ""}. Mixed formats sort in the wrong order, and some programs read them as text or as the wrong day. Formats found: ${formatNotes.join("; ")}.`,
        howToFix:
          "Use one date format per column, ideally real dates rather than text. In Excel, Data → Text to Columns → Date (choose the order the text uses: DMY or MDY) converts text dates. Then apply one display format with Format Cells → Date. Replace placeholders such as “TBD” with an empty cell or a note in another column.",
        columns: incCols,
        examples: incEx.sort((a, b) => a.row - b.row),
      },
      rows,
      cells,
    });
  }
  if (impossible.total) {
    const { cells, rows } = rowsOf(impossible);
    findings.push({
      issue: {
        id: "impossible-dates",
        severity: "error",
        title: "Impossible dates",
        count: impossible.total,
        unit: "cells",
        explanation: `${plural(impossible.total, "date")} can't exist, for example month 13, 31 April or 29 February in a year that isn't a leap year. These are usually typing mistakes, or day and month written in the wrong order.`,
        howToFix: "Check each date against the original source and correct it. If many dates look swapped, the column may use the other day/month order.",
        columns: impCols,
        examples: impEx.sort((a, b) => a.row - b.row),
      },
      rows,
      cells,
    });
  }
  if (ambiguousCells.total) {
    const { cells, rows } = rowsOf(ambiguousCells);
    findings.push({
      issue: {
        id: "ambiguous-dates",
        severity: "note",
        title: "Ambiguous dates",
        count: ambiguousCells.total,
        unit: "cells",
        explanation: `${plural(ambiguousCells.total, "date")} such as 03/04/2024 could mean 3 April or 4 March, and nothing in the column shows which. DataFixer doesn't guess. Different programs (and different countries' settings) may read these differently.`,
        howToFix:
          "Confirm with the source which order the file uses, then convert the dates to an unambiguous format such as 2024-04-03 (year-month-day), or to real Excel dates.",
        columns: ambCols,
        examples: ambEx.sort((a, b) => a.row - b.row),
      },
      rows,
      cells,
    });
  }
  return findings;
}
