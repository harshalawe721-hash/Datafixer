/**
 * Stage 4, Step 3: fixes that need the user's choice.
 *
 * - Capitalization: the most common spelling wins (owner decision 2). When two
 *   or more spellings are equally common, the user is asked; nothing in that
 *   group changes until they choose.
 * - Dates: the user chooses the format for each date column. Day/month order
 *   comes from evidence in the column (31/01 can only be day-first); when the
 *   column can't tell (03/04/2024), the user is asked. Impossible dates,
 *   two-digit years, values with time zones and values that aren't dates are
 *   never converted.
 * - Phone layouts: the user chooses the layout. A number is only re-laid-out
 *   when it has exactly the digits the layout needs (same count, and a "+"
 *   country code on both or neither), so a country code is never invented.
 *
 * Formula cells are never changed by any of them.
 */
import { cellKey, splitCellKey, type CellValue } from "../types.ts";
import { cellCat, type ColumnProfile, type ScanContext, type Finding } from "../scan/scan.ts";
import { Cat } from "../scan/classify.ts";
import { CaseCollector } from "../scan/checks/text.ts";
import { FAMILY_LABEL, ORDER_FAMILIES, familyOf, orderParts, type Family } from "../scan/checks/dates.ts";
import { EXTENSION, phoneProblem } from "../scan/checks/contacts.ts";
import type { FixChoice, FixOptions, FixPlan, FixPreview, DateTarget } from "./fixes.ts";
import { FIX_LABELS, type FixId } from "./fix-ids.ts";

const MAX_EXAMPLES = 20;
const MAX_CHOICES = 200;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;
const colName = (p: ColumnProfile) => p.name ?? `Column ${p.letter}`;
const FORMULA_CELLS_SKIPPED = "Formula cells are never changed automatically. Edit them by hand if needed.";

function shown(v: CellValue): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

class Skips {
  private readonly m = new Map<string, number>();
  add(reason: string, n = 1) {
    if (n > 0) this.m.set(reason, (this.m.get(reason) ?? 0) + n);
  }
  list(): FixPreview["skipped"] {
    return [...this.m].map(([reason, count]) => ({ reason, count }));
  }
}

interface CellChanges {
  keys: number[];
  values: CellValue[];
  formats: (string | null)[] | null;
  before: string[];
}

function newChanges(withFormats = false): CellChanges {
  return { keys: [], values: [], formats: withFormats ? [] : null, before: [] };
}

function finishPlan(fixId: FixId, description: string, ch: CellChanges, skips: Skips, choices: FixChoice[], displayAfter?: (i: number) => string): FixPlan {
  const preview: FixPreview = {
    fixId,
    label: FIX_LABELS[fixId],
    description,
    cellsChanged: ch.keys.length,
    rowsRemoved: 0,
    columnsRemoved: 0,
    examples: [],
    rows: [],
    columns: [],
    skipped: skips.list(),
    choices,
  };
  for (let i = 0; i < Math.min(MAX_EXAMPLES, ch.keys.length); i++) {
    const { row, col } = splitCellKey(ch.keys[i]!);
    preview.examples.push({ row, col, before: ch.before[i]!, after: displayAfter ? displayAfter(i) : shown(ch.values[i]!) });
  }
  return {
    preview,
    request: ch.keys.length
      ? { operation: fixId, label: FIX_LABELS[fixId], cellKeys: Float64Array.from(ch.keys), cellValues: ch.values, cellFormats: ch.formats ?? undefined }
      : null,
  };
}

/** Keep the spaces around a value while replacing the value itself. */
function replaceCore(v: string, core: string): string {
  const lead = v.length - v.trimStart().length;
  const trail = v.length - v.trimEnd().length;
  return v.slice(0, lead) + core + v.slice(v.length - trail);
}

// ---------------------------------------------------------------- capitalization

export function caseChoiceKey(column: number, value: string): string {
  return `${column}:${value.trim().toLowerCase()}`;
}

export function planCase(ctx: ScanContext, options: FixOptions): FixPlan {
  const g = ctx.sheet.grid;
  const collector = new CaseCollector(ctx.profiles);
  for (let r = ctx.startRow; r < ctx.rowCount; r++) {
    const len = g.rowLength(r);
    for (let c = 0; c < len; c++) {
      const cat = cellCat(ctx, r, c);
      if (cat === Cat.Text) collector.add(c, cat, g.get(r, c));
    }
  }
  const skips = new Skips();
  const choices: FixChoice[] = [];
  /** Per column: minority spelling → the spelling to use. */
  const replace = new Map<number, Map<string, string>>();
  let tooManyChoices = 0;
  collector.maps.forEach((map, c) => {
    if (!map) return;
    const p = ctx.profiles[c]!;
    for (const [key, variants] of map) {
      if (variants.size < 2) continue;
      let max = 0;
      let total = 0;
      for (const n of variants.values()) {
        total += n;
        if (n > max) max = n;
      }
      const top = [...variants].filter(([, n]) => n === max).map(([s]) => s);
      let reference: string | null = top.length === 1 ? top[0]! : null;
      if (!reference) {
        // A tie: ask the user (owner decision 2). Nothing in this group changes until they choose.
        const chosen = options.caseChoices?.[`${c}:${key}`];
        if (chosen !== undefined && variants.has(chosen)) reference = chosen;
        if (choices.length < MAX_CHOICES) {
          choices.push({
            kind: "spelling",
            column: c,
            columnName: colName(p),
            key: `${c}:${key}`,
            options: [...variants].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([value, count]) => ({ value, count })),
            chosen: reference,
          });
        } else if (!reference) tooManyChoices++;
        if (!reference) {
          skips.add("Spellings that are equally common need your choice before they are changed.", total - max);
          continue;
        }
      }
      let m = replace.get(c);
      if (!m) replace.set(c, (m = new Map()));
      for (const s of variants.keys()) if (s !== reference) m.set(s, reference);
    }
  });
  if (tooManyChoices) skips.add("There are too many equally common spellings to list. Fix the rest by hand or one column at a time.", tooManyChoices);
  for (const c of collector.skipped) skips.add(`${colName(ctx.profiles[c]!)} has too many different values to check (more than 20,000), so it was left as it is.`, 1);

  const ch = newChanges();
  const formulas = ctx.sheet.formulas;
  let formulaSkipped = 0;
  if (replace.size) {
    for (let r = ctx.startRow; r < ctx.rowCount; r++) {
      for (const [c, m] of replace) {
        const v = g.get(r, c);
        if (typeof v !== "string") continue;
        const to = m.get(v.trim());
        if (to === undefined) continue;
        const key = cellKey(r, c);
        if (formulas.size && formulas.has(key)) {
          formulaSkipped++;
          continue;
        }
        ch.keys.push(key);
        ch.values.push(replaceCore(v, to));
        if (ch.before.length < MAX_EXAMPLES) ch.before.push(v);
      }
    }
  }
  skips.add(FORMULA_CELLS_SKIPPED, formulaSkipped);
  return finishPlan(
    "inconsistent-case",
    `Changes ${plural(ch.keys.length, "cell")} to the most common spelling in its column (for example “paris” → “Paris”). When two spellings are equally common, you choose.`,
    ch,
    skips,
    choices,
  );
}

// ---------------------------------------------------------------- dates

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NUM: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

export const TEXT_DATE_TARGETS: { id: DateTarget; label: string }[] = [
  { id: "iso", label: "2024-01-31 (year-month-day)" },
  { id: "dmy-slash", label: "31/01/2024 (day/month/year)" },
  { id: "mdy-slash", label: "01/31/2024 (month/day/year)" },
  { id: "dmy-dot", label: "31.01.2024" },
  { id: "d-mon-y", label: "31 Jan 2024" },
  { id: "mon-d-y", label: "Jan 31, 2024" },
];

export const EXCEL_DATE_TARGETS: { id: DateTarget; label: string; format: string }[] = [
  { id: "excel-iso", label: "Real Excel dates, shown as 2024-01-31", format: "yyyy-mm-dd" },
  { id: "excel-dmy", label: "Real Excel dates, shown as 31/01/2024", format: "dd/mm/yyyy" },
  { id: "excel-mdy", label: "Real Excel dates, shown as 01/31/2024", format: "mm/dd/yyyy" },
  { id: "excel-d-mon-y", label: "Real Excel dates, shown as 31 Jan 2024", format: "d mmm yyyy" },
];

const pad = (n: number) => String(n).padStart(2, "0");

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function validYmd(y: number, m: number, d: number): boolean {
  return y >= 1000 && y <= 9999 && m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

interface ParsedDate {
  y: number;
  m: number;
  d: number;
  /** "14:30" or "14:30:15" (no time zone). */
  time: string | null;
}

type ParseResult = { ok: ParsedDate } | { skip: string } | { needsOrder: true };

const SKIP_IMPOSSIBLE = "Impossible dates (such as 30 February) are never changed automatically. Correct them by hand.";
const SKIP_SHORT_YEAR = "Two-digit years (such as ’24) could mean 1924 or 2024, so these were left for you to check.";
const SKIP_TIMEZONE = "Dates with a time zone were left as they are, so no time information is lost.";
const SKIP_TIME_TEXT = "Dates that include a time were left as they are, because the chosen format has no time. Choose 2024-01-31 or real Excel dates to keep the time.";
const SKIP_NOT_DATE = "Values that aren't dates (such as “TBD”) were left as they are.";
const SKIP_ORDER = "These dates could be day-first or month-first. Choose the order this column uses to convert them.";
const SKIP_BEFORE_1900 = "Dates before 1 March 1900 can't be stored correctly as Excel dates, so they were left as text.";

/** Read a text date of a known family. `order` is the column's day/month order (or the user's choice). */
export function parseTextDate(family: Family, raw: string, order: "dmy" | "mdy" | null): ParseResult {
  const s = raw.trim();
  let y: number, m: number, d: number;
  let time: string | null = null;
  switch (family) {
    case "iso": {
      const mm = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?)?$/.exec(s);
      if (!mm) return { skip: SKIP_NOT_DATE };
      if (mm[5]) return { skip: SKIP_TIMEZONE };
      [y, m, d] = [+mm[1]!, +mm[2]!, +mm[3]!];
      time = mm[4] ?? null;
      break;
    }
    case "ymd-slash": {
      const mm = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
      if (!mm) return { skip: SKIP_NOT_DATE };
      [y, m, d] = [+mm[1]!, +mm[2]!, +mm[3]!];
      break;
    }
    case "dmy-dot": {
      const mm = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
      if (!mm) return { skip: SKIP_NOT_DATE };
      [y, m, d] = [+mm[3]!, +mm[2]!, +mm[1]!];
      break;
    }
    case "d-mon-y":
    case "mon-d-y": {
      const mm =
        family === "d-mon-y"
          ? /^(\d{1,2})[ -]([a-z]+)\.?[\s,-]+(\d{2,4})$/i.exec(s)
          : /^([a-z]+)\.? (\d{1,2}),? (\d{4})$/i.exec(s);
      if (!mm) return { skip: SKIP_NOT_DATE };
      const [dayS, monS, yearS] = family === "d-mon-y" ? [mm[1]!, mm[2]!, mm[3]!] : [mm[2]!, mm[1]!, mm[3]!];
      if (yearS.length === 2) return { skip: SKIP_SHORT_YEAR };
      const mon = MONTH_NUM[monS.toLowerCase().slice(0, 3)];
      if (!mon) return { skip: SKIP_NOT_DATE };
      [y, m, d] = [+yearS, mon, +dayS];
      break;
    }
    case "dm-slash":
    case "dm-dash":
    case "dm-short": {
      const p = orderParts(s);
      if (!p) return { skip: SKIP_NOT_DATE };
      if (family === "dm-short") return { skip: SKIP_SHORT_YEAR };
      // Evidence in the value itself wins: 31/01 is day-first, 01/31 is month-first.
      let o: "dmy" | "mdy" | null = p.a > 12 && p.b <= 12 ? "dmy" : p.b > 12 && p.a <= 12 ? "mdy" : p.a === p.b ? "dmy" : order;
      if (p.a > 12 && p.b > 12) return { skip: SKIP_IMPOSSIBLE };
      if (!o) return { needsOrder: true };
      if (p.a === p.b) o = "dmy"; // same either way
      [y, m, d] = o === "dmy" ? [p.y, p.b, p.a] : [p.y, p.a, p.b];
      break;
    }
    default:
      return { skip: SKIP_NOT_DATE };
  }
  if (!validYmd(y, m, d)) return { skip: SKIP_IMPOSSIBLE };
  return { ok: { y, m, d, time } };
}

export function renderTextDate(p: ParsedDate, target: DateTarget): string | null {
  const date = (() => {
    switch (target) {
      case "iso":
        return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
      case "dmy-slash":
        return `${pad(p.d)}/${pad(p.m)}/${p.y}`;
      case "mdy-slash":
        return `${pad(p.m)}/${pad(p.d)}/${p.y}`;
      case "dmy-dot":
        return `${pad(p.d)}.${pad(p.m)}.${p.y}`;
      case "d-mon-y":
        return `${p.d} ${MON[p.m - 1]} ${p.y}`;
      case "mon-d-y":
        return `${MON[p.m - 1]} ${p.d}, ${p.y}`;
      default:
        return null;
    }
  })();
  if (date === null) return null;
  if (p.time) return target === "iso" ? `${date} ${p.time}` : null;
  return date;
}

/** Excel serial number of a date (1900 or 1904 date system), or null if it can't be stored correctly. */
export function excelSerial(p: ParsedDate, date1904: boolean): number | null {
  const day = Date.UTC(p.y, p.m - 1, p.d);
  let serial: number;
  if (date1904) {
    serial = (day - Date.UTC(1904, 0, 1)) / 86_400_000;
    if (serial < 0) return null;
  } else {
    if (day < Date.UTC(1900, 2, 1)) return null; // Excel's 1900 leap-year bug makes earlier serials wrong
    serial = (day - Date.UTC(1899, 11, 30)) / 86_400_000;
  }
  if (p.time) {
    const [h, mi, sec] = p.time.split(":").map(Number);
    serial += ((h ?? 0) * 3600 + (mi ?? 0) * 60 + (sec ?? 0)) / 86_400;
  }
  return serial;
}

interface DateColumnState {
  families: Map<Family, number>;
  dmyProof: number;
  mdyProof: number;
  ambiguous: number;
  notDate: number;
}

const SUGGESTED_TEXT: Record<Family, DateTarget | null> = {
  excel: "iso",
  iso: "iso",
  "ymd-slash": "iso",
  "dmy-dot": "dmy-dot",
  "d-mon-y": "d-mon-y",
  "mon-d-y": "mon-d-y",
  "dm-slash": null,
  "dm-dash": null,
  "dm-short": null,
};

export function planDates(ctx: ScanContext, options: FixOptions, excel: boolean): FixPlan {
  const g = ctx.sheet.grid;
  const date1904 = ctx.sheet.date1904 ?? false;
  const formulas = ctx.sheet.formulas;
  const skips = new Skips();
  const choices: FixChoice[] = [];
  const ch = newChanges(excel);
  const afterShown: string[] = [];
  let formulaSkipped = 0;
  let unchosen = 0;
  const targets = excel ? EXCEL_DATE_TARGETS.map(({ id, label }) => ({ id, label })) : TEXT_DATE_TARGETS;

  for (const p of ctx.profiles) {
    if (p.kind !== "date") continue;
    const c = p.index;
    // Profile the column exactly as the date check does.
    const st: DateColumnState = { families: new Map(), dmyProof: 0, mdyProof: 0, ambiguous: 0, notDate: 0 };
    for (let r = ctx.startRow; r < ctx.rowCount; r++) {
      const cat = cellCat(ctx, r, c);
      if (cat === Cat.Empty || cat === Cat.Blank || cat === Cat.Error) continue;
      const fam = familyOf(cat);
      if (!fam) {
        st.notDate++;
        continue;
      }
      st.families.set(fam, (st.families.get(fam) ?? 0) + 1);
      const v = g.get(r, c);
      if (ORDER_FAMILIES.has(fam) && typeof v === "string") {
        const pr = orderParts(v.trim());
        if (pr) {
          if (pr.a > 12 && pr.b <= 12) st.dmyProof++;
          else if (pr.b > 12 && pr.a <= 12) st.mdyProof++;
          else if (pr.a <= 12 && pr.b <= 12 && pr.a !== pr.b) st.ambiguous++;
        }
      }
    }
    const evidence = st.dmyProof && st.mdyProof ? "mixed" : st.dmyProof ? "dmy" : st.mdyProof ? "mdy" : "unknown";
    const needsOrder = st.ambiguous > 0 && (evidence === "unknown" || evidence === "mixed");
    const consistent = st.families.size <= 1 && st.notDate === 0 && evidence !== "mixed" && !needsOrder;
    if (consistent) continue; // nothing to fix in this column

    let main: Family | null = null;
    let mainCount = -1;
    for (const [f, n] of st.families) if (n > mainCount) [main, mainCount] = [f, n];
    const suggestedText = main ? (SUGGESTED_TEXT[main] ?? (evidence === "dmy" ? "dmy-slash" : evidence === "mdy" ? "mdy-slash" : "iso")) : "iso";
    const suggested: DateTarget = excel
      ? suggestedText === "dmy-slash" || suggestedText === "dmy-dot"
        ? "excel-dmy"
        : suggestedText === "mdy-slash"
          ? "excel-mdy"
          : suggestedText === "d-mon-y" || suggestedText === "mon-d-y"
            ? "excel-d-mon-y"
            : "excel-iso"
      : suggestedText;
    const choice = options.dateChoices?.[c];
    const target = choice && targets.some((t) => t.id === choice.target) ? choice.target : null;
    const order: "dmy" | "mdy" | null = evidence === "dmy" || evidence === "mdy" ? evidence : (choice?.order ?? null);
    choices.push({
      kind: "date-format",
      column: c,
      columnName: colName(p),
      formats: [...st.families].sort((a, b) => b[1] - a[1]).map(([f, n]) => ({ label: FAMILY_LABEL[f], count: n })),
      notDates: st.notDate,
      evidence,
      needsOrder,
      targets,
      suggested,
      chosen: target ? { target, order: needsOrder ? (choice?.order ?? null) : null } : null,
    });
    if (!target) {
      unchosen++;
      continue;
    }

    const excelFormat = excel ? EXCEL_DATE_TARGETS.find((t) => t.id === target)!.format : null;
    for (let r = ctx.startRow; r < ctx.rowCount; r++) {
      const cat = cellCat(ctx, r, c);
      if (cat === Cat.Empty || cat === Cat.Blank || cat === Cat.Error) continue;
      const fam = familyOf(cat);
      if (fam === "excel") continue; // already a real Excel date
      const v = g.get(r, c);
      if (!fam || typeof v !== "string") {
        skips.add(SKIP_NOT_DATE);
        continue;
      }
      const key = cellKey(r, c);
      if (formulas.size && formulas.has(key)) {
        formulaSkipped++;
        continue;
      }
      const res = parseTextDate(fam, v, order);
      if ("needsOrder" in res) {
        skips.add(SKIP_ORDER);
        continue;
      }
      if ("skip" in res) {
        skips.add(res.skip);
        continue;
      }
      if (excelFormat) {
        const serial = excelSerial(res.ok, date1904);
        if (serial === null) {
          skips.add(SKIP_BEFORE_1900);
          continue;
        }
        const fmt = res.ok.time ? `${excelFormat} hh:mm${res.ok.time.split(":").length > 2 ? ":ss" : ""}` : excelFormat;
        ch.keys.push(key);
        ch.values.push(serial);
        ch.formats!.push(fmt);
        if (ch.before.length < MAX_EXAMPLES) {
          ch.before.push(v);
          afterShown.push(g.formatNumber ? g.formatNumber(fmt, serial) : String(serial));
        }
      } else {
        const out = renderTextDate(res.ok, target);
        if (out === null) {
          skips.add(SKIP_TIME_TEXT);
          continue;
        }
        if (out === v.trim()) continue; // already in the chosen format
        ch.keys.push(key);
        ch.values.push(out);
        if (ch.before.length < MAX_EXAMPLES) {
          ch.before.push(v);
          afterShown.push(out);
        }
      }
    }
  }
  if (unchosen) skips.add("Choose a format for each date column to convert it.", unchosen);
  skips.add(FORMULA_CELLS_SKIPPED, formulaSkipped);
  return finishPlan(
    "inconsistent-dates",
    excel
      ? `Turns ${plural(ch.keys.length, "date")} written as text into real Excel dates, shown in the format you choose. Existing real dates are kept as they are.`
      : `Rewrites ${plural(ch.keys.length, "date")} in the format you choose for each date column.`,
    ch,
    skips,
    choices,
    (i) => afterShown[i]!,
  );
}

// ---------------------------------------------------------------- phone layouts

/** Exact layout of a phone number: every digit becomes "#" (extension removed). */
export function phoneTemplate(raw: string): string {
  return raw.trim().replace(EXTENSION, "").replace(/\d/g, "#");
}

export function planPhones(ctx: ScanContext, options: FixOptions, phoneFinding: Finding | undefined): FixPlan {
  const g = ctx.sheet.grid;
  const formulas = ctx.sheet.formulas;
  const skips = new Skips();
  const choices: FixChoice[] = [];
  const ch = newChanges();
  let formulaSkipped = 0;
  let unchosen = 0;
  for (const col of phoneFinding?.issue.columns ?? []) {
    const c = col.index;
    const p = ctx.profiles[c]!;
    const layouts = new Map<string, { count: number; example: string }>();
    for (let r = ctx.startRow; r < ctx.rowCount; r++) {
      const v = g.get(r, c);
      if (typeof v !== "string" || !v.trim() || phoneProblem(v)) continue;
      const t = phoneTemplate(v);
      const l = layouts.get(t);
      if (l) l.count++;
      else layouts.set(t, { count: 1, example: v.trim().replace(EXTENSION, "") });
    }
    const sorted = [...layouts].sort((a, b) => b[1].count - a[1].count).slice(0, 10);
    const chosenTemplate = options.phoneChoices?.[c];
    const chosen = chosenTemplate !== undefined && layouts.has(chosenTemplate) ? chosenTemplate : null;
    choices.push({
      kind: "phone-layout",
      column: c,
      columnName: colName(p),
      layouts: sorted.map(([template, l]) => ({ template, example: l.example, count: l.count })),
      suggested: sorted[0]?.[0] ?? "",
      chosen,
    });
    if (!chosen) {
      unchosen++;
      continue;
    }
    const slots = (chosen.match(/#/g) ?? []).length;
    const plus = chosen.startsWith("+");
    for (let r = ctx.startRow; r < ctx.rowCount; r++) {
      const v = g.get(r, c);
      if (typeof v !== "string" || !v.trim() || phoneProblem(v)) continue;
      if (phoneTemplate(v) === chosen) continue;
      const key = cellKey(r, c);
      if (formulas.size && formulas.has(key)) {
        formulaSkipped++;
        continue;
      }
      if (EXTENSION.test(v.trim())) {
        skips.add("Numbers with an extension were left as they are.");
        continue;
      }
      const digits = v.replace(/\D/g, "");
      if (digits.length !== slots || v.trim().startsWith("+") !== plus) {
        skips.add("These numbers have a different number of digits or no country code (+), so they can't be re-laid-out without guessing. Check them by hand.");
        continue;
      }
      let i = 0;
      const out = chosen.replace(/#/g, () => digits[i++]!);
      ch.keys.push(key);
      ch.values.push(out);
      if (ch.before.length < MAX_EXAMPLES) ch.before.push(v);
    }
  }
  if (unchosen) skips.add("Choose a layout for each phone column to convert it.", unchosen);
  skips.add(FORMULA_CELLS_SKIPPED, formulaSkipped);
  return finishPlan(
    "phone-formats",
    `Rewrites ${plural(ch.keys.length, "phone number")} in the layout you choose. Only the spacing and punctuation change; the digits stay exactly the same.`,
    ch,
    skips,
    choices,
  );
}
