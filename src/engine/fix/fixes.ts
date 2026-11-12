/**
 * Stage 4, Step 2: safe automatic fixes.
 *
 * Each fix PLANS its changes against the sheet as it currently looks (the
 * edited view) and returns a preview plus a change request. Nothing changes
 * until the request is applied through the edit session. The cells and rows
 * chosen are exactly the ones the Error Detector reports, because the fixes
 * use the same classification and the same shared helpers as the checks.
 *
 * Safeguards:
 * - Formula cells are never changed. Rows/columns containing formulas are never
 *   deleted. Both are counted in the preview as skipped.
 * - Ambiguous values are never converted (e.g. "1,250" in a column that also
 *   uses decimal commas, "12%", "(5)"). They are counted as skipped with the reason.
 */
import { EngineError } from "../errors.ts";
import type { CancelToken } from "../cancel.ts";
import { cellKey, splitCellKey, type CellValue, type SheetModel } from "../types.ts";
import { cellCat, runScan, type ScanContext } from "../scan/scan.ts";
import { Cat, PLAIN_NUMBER } from "../scan/classify.ts";
import { numbersAsText } from "../scan/checks/text.ts";
import { duplicateGroups, emptyColumnProfiles, rowFingerprints } from "../scan/checks/structure.ts";
import { columnLetter } from "../query/query.ts";
import type { ChangeRequest } from "../edit/session.ts";
import { invalidPhones } from "../scan/checks/contacts.ts";
import { planCase, planDates, planPhones } from "./choice-fixes.ts";

export { SAFE_FIX_IDS, CHOICE_FIX_IDS, FIX_IDS, FIX_LABELS, type FixId } from "./fix-ids.ts";
import { FIX_LABELS, type AnyFixId, type FixId } from "./fix-ids.ts";

/** Target formats for the date fix: text formats (CSV) or real Excel dates with a display format (Excel). */
export type DateTarget = "iso" | "dmy-slash" | "mdy-slash" | "dmy-dot" | "d-mon-y" | "mon-d-y" | "excel-iso" | "excel-dmy" | "excel-mdy" | "excel-d-mon-y";

/** A decision the user must make (or can change) before a fix converts these values. */
export type FixChoice =
  | {
      kind: "spelling";
      column: number;
      columnName: string;
      /** Pass back in options.caseChoices[key]. */
      key: string;
      options: { value: string; count: number }[];
      chosen: string | null;
    }
  | {
      kind: "date-format";
      column: number;
      columnName: string;
      formats: { label: string; count: number }[];
      notDates: number;
      /** Day/month order proven by the column's own values. */
      evidence: "dmy" | "mdy" | "unknown" | "mixed";
      /** Some values could be day-first or month-first: the user must choose the order to convert them. */
      needsOrder: boolean;
      targets: { id: DateTarget; label: string }[];
      suggested: DateTarget;
      chosen: { target: DateTarget; order: "dmy" | "mdy" | null } | null;
    }
  | {
      kind: "phone-layout";
      column: number;
      columnName: string;
      layouts: { template: string; example: string; count: number }[];
      suggested: string;
      chosen: string | null;
    };

export interface FixOptions {
  /** Treat the first row as column names (never changed or removed by fixes). */
  headerRow: boolean;
  /** Empty columns (view indexes) the user chose to keep. */
  keepColumns?: number[];
  /**
   * CSV files have no cell types: converted numbers are written as plain number
   * text ("1250") so the column stays consistent. Excel files get real numbers.
   */
  textOnly?: boolean;
  /** Capitalization ties: choice key → spelling to use. */
  caseChoices?: Record<string, string>;
  /** Date columns (view index) → target format, and the day/month order when the column can't tell. */
  dateChoices?: Record<number, { target: DateTarget; order?: "dmy" | "mdy" }>;
  /** Phone columns (view index) → layout template (from the preview's choices). */
  phoneChoices?: Record<number, string>;
  /**
   * Excel files where removing rows/columns would break references (S2): clear
   * the cells instead, so every position stays where it is.
   */
  clearInsteadOfRemove?: boolean;
  /** Stage 5 (CSV Validator): the file's separator, to recognise an Excel “sep=” line. */
  delimiter?: string;
}

/** What a fix would do, shown to the user before anything changes. Positions are view positions. */
export interface FixPreview {
  fixId: AnyFixId;
  label: string;
  description: string;
  cellsChanged: number;
  rowsRemoved: number;
  columnsRemoved: number;
  /** Up to 20 cell changes. */
  examples: { row: number; col: number; before: string; after: string }[];
  /** Up to 20 removed rows, with the reason. */
  rows: { row: number; reason: string }[];
  /** Every column that would be removed (empty-columns). */
  columns: { index: number; letter: string; name: string | null }[];
  /** Things deliberately left alone, with the reason. */
  skipped: { reason: string; count: number }[];
  /** Decisions for the user (Step 3 fixes); empty for the safe fixes. */
  choices: FixChoice[];
  /** Stage 5: rows that will be made shorter (empty extra fields removed). */
  rowsShortened?: number;
  /** Stage 5: whole rows before and after (fields), up to 20, for row-length repairs. */
  lines?: { row: number; before: string[]; after: string[] }[];
  /** Stage 5: something the user must know before applying (shown prominently). */
  warning?: string;
}

export interface FixPlan {
  preview: FixPreview;
  /** null when there is nothing to change. */
  request: ChangeRequest | null;
}

export interface PlanContext {
  cancel?: CancelToken;
  memoryBudgetBytes?: number;
  onProgress?: (done: number, total: number) => void;
  /** Original file row (zero-based) of a view row, for reasons such as "Exact copy of row 3". */
  originalRow?: (viewRow: number) => number;
}

const MAX_EXAMPLES = 20;
const EDGE_SPACE = /^[\s﻿]|[\s﻿]$/;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function shown(v: CellValue): string {
  if (v === null) return "";
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  return String(v);
}

/** Rows and columns that contain at least one formula (never deleted by fixes). */
function formulaRowsAndCols(sheet: SheetModel): { rows: Set<number>; cols: Set<number> } {
  const rows = new Set<number>();
  const cols = new Set<number>();
  for (const key of sheet.formulas.keys()) {
    const { row, col } = splitCellKey(key);
    rows.add(row);
    cols.add(col);
  }
  return { rows, cols };
}

function emptyPlan(fixId: FixId, description: string): FixPreview {
  return { fixId, label: FIX_LABELS[fixId], description, cellsChanged: 0, rowsRemoved: 0, columnsRemoved: 0, examples: [], rows: [], columns: [], skipped: [], choices: [] };
}

function addSkip(skipped: FixPreview["skipped"], reason: string, count: number) {
  if (count > 0) skipped.push({ reason, count });
}

const FORMULA_CELLS_SKIPPED = "Formula cells are never changed automatically. Edit them by hand if needed.";

// ---------------------------------------------------------------- number conversion

const APOSTROPHE = /^'([+-]?(\d+(\.\d*)?|\.\d+))$/;
/** Optional sign, optional leading currency sign, digits with comma thousands separators, optional dot decimals. */
const SIMPLE_FORMATTED = /^([+-]?)([$€£¥₹¢]?)\s?(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?$/;
/** Decimal-comma values ("12,5", "1.234,56") make comma-thousands values ambiguous in that column. */
const DECIMAL_COMMA = /^[+-]?[$€£¥₹¢]?\s?(\d+,\d{1,2}|\d{1,3}(\.\d{3})+,\d+)\s?[$€£¥₹¢]?$/;

function digitCount(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0x30 && c <= 0x39) n++;
  }
  return n;
}

/**
 * The number a text value clearly means, or a reason why it isn't clear.
 * Only unambiguous forms are converted: plain numbers, "'45", "1,234.5" (when
 * the column doesn't also use decimal commas) and a leading currency sign.
 */
export function textToNumber(raw: string, commaIsAmbiguous: boolean): { value: number; text: string } | { skip: string } {
  const s = raw.trim();
  if (digitCount(s) > 15) return { skip: "Numbers with more than 15 digits would lose precision in a spreadsheet, so they were left as text." };
  if (PLAIN_NUMBER.test(s)) return { value: Number(s), text: s };
  const a = APOSTROPHE.exec(s);
  if (a) return { value: Number(a[1]), text: a[1]! };
  const m = SIMPLE_FORMATTED.exec(s);
  if (m) {
    if (m[3]!.includes(",") && commaIsAmbiguous) {
      return { skip: "This column also uses commas as decimal points, so a value like “1,250” could mean 1250 or 1.25. These were left for you to check." };
    }
    const text = `${m[1] === "-" ? "-" : ""}${m[3]!.replace(/,/g, "")}${m[4] ?? ""}`;
    const n = Number(text);
    if (Number.isFinite(n)) return { value: n, text };
  }
  return { skip: "Formatting such as %, brackets, a trailing minus, spaces or a decimal comma can mean different things, so these were left for you to check." };
}

// ---------------------------------------------------------------- planner

export async function planFix(sheet: SheetModel, fixId: FixId, options: FixOptions, pc: PlanContext = {}): Promise<FixPlan> {
  const { ctx, findings } = await runScan(sheet, {
    headerRow: options.headerRow,
    cancel: pc.cancel,
    memoryBudgetBytes: pc.memoryBudgetBytes,
    onProgress: pc.onProgress,
    checks: fixId === "numbers-as-text" ? [numbersAsText] : fixId === "phone-formats" ? [invalidPhones] : [],
  });
  const originalRow = pc.originalRow ?? ((r: number) => r);
  switch (fixId) {
    case "extra-spaces":
      return planSpaces(ctx);
    case "duplicate-rows":
      return planDuplicates(ctx, originalRow);
    case "empty-rows":
      return planEmptyRows(ctx);
    case "empty-columns":
      return planEmptyColumns(ctx, options.keepColumns ?? []);
    case "inconsistent-case":
      return planCase(ctx, options);
    case "inconsistent-dates":
      return planDates(ctx, options, !options.textOnly && typeof sheet.grid.formatNumber === "function");
    case "phone-formats":
      return planPhones(ctx, options, findings.find((f) => f.issue.id === "phone-formats"));
    case "numbers-as-text":
      return planNumbers(ctx, findings.find((f) => f.issue.id === "numbers-as-text")?.cells ?? null, findings.find((f) => f.issue.id === "numbers-as-text")?.issue.count ?? 0, options.textOnly ?? false);
    default:
      throw new EngineError("internal", `Unknown fix “${String(fixId)}”.`);
  }
}

function cellPlan(fixId: FixId, description: string, keys: number[], values: CellValue[], before: string[], skipped: FixPreview["skipped"]): FixPlan {
  const preview = emptyPlan(fixId, description);
  preview.cellsChanged = keys.length;
  preview.skipped = skipped;
  for (let i = 0; i < Math.min(MAX_EXAMPLES, keys.length); i++) {
    const { row, col } = splitCellKey(keys[i]!);
    preview.examples.push({ row, col, before: before[i]!, after: shown(values[i]!) });
  }
  return {
    preview,
    request: keys.length ? { operation: fixId, label: FIX_LABELS[fixId], cellKeys: Float64Array.from(keys), cellValues: values } : null,
  };
}

function planSpaces(ctx: ScanContext): FixPlan {
  const g = ctx.sheet.grid;
  const formulas = ctx.sheet.formulas;
  const keys: number[] = [];
  const values: CellValue[] = [];
  const before: string[] = [];
  let formulaSkipped = 0;
  for (let r = ctx.startRow; r < ctx.rowCount; r++) {
    const len = g.rowLength(r);
    for (let c = 0; c < len; c++) {
      const cat = cellCat(ctx, r, c);
      if (cat === Cat.Empty || cat === Cat.Blank) continue; // spaces-only cells count as missing, not as extra spaces
      const v = g.get(r, c);
      if (typeof v !== "string" || !EDGE_SPACE.test(v)) continue;
      const key = cellKey(r, c);
      if (formulas.size && formulas.has(key)) {
        formulaSkipped++;
        continue;
      }
      keys.push(key);
      values.push(v.trim());
      if (before.length < MAX_EXAMPLES) before.push(v);
    }
  }
  const skipped: FixPreview["skipped"] = [];
  addSkip(skipped, FORMULA_CELLS_SKIPPED, formulaSkipped);
  return cellPlan(
    "extra-spaces",
    `Removes spaces, tabs and invisible non-breaking spaces from the start and end of ${plural(keys.length, "cell")}. Spaces between words are kept.`,
    keys,
    values,
    before,
    skipped,
  );
}

function rowPlan(fixId: FixId, description: string, rows: { row: number; reason: string }[], skipped: FixPreview["skipped"]): FixPlan {
  const preview = emptyPlan(fixId, description);
  preview.rowsRemoved = rows.length;
  preview.rows = rows.slice(0, MAX_EXAMPLES);
  preview.skipped = skipped;
  return { preview, request: rows.length ? { operation: fixId, label: FIX_LABELS[fixId], deleteRows: rows } : null };
}

function planDuplicates(ctx: ScanContext, originalRow: (r: number) => number): FixPlan {
  const { hashes, hasValue } = rowFingerprints(ctx);
  const formulaRows = ctx.sheet.formulas.size ? formulaRowsAndCols(ctx.sheet).rows : null;
  const rows: { row: number; reason: string }[] = [];
  let formulaSkipped = 0;
  for (const g of duplicateGroups(ctx, hashes, hasValue)) {
    // Keep the first copy (owner decision 1); remove the later exact copies.
    for (const row of g.members.slice(1)) {
      if (formulaRows?.has(row)) {
        formulaSkipped++;
        continue;
      }
      rows.push({ row, reason: `Exact copy of row ${originalRow(g.first) + 1}` });
    }
  }
  rows.sort((a, b) => a.row - b.row);
  const skipped: FixPreview["skipped"] = [];
  addSkip(skipped, "Rows containing formulas are never removed automatically. Remove them by hand if needed.", formulaSkipped);
  return rowPlan(
    "duplicate-rows",
    `Removes ${plural(rows.length, "row")} that ${rows.length === 1 ? "is an exact copy" : "are exact copies"} of an earlier row. The first copy of each row is kept.`,
    rows,
    skipped,
  );
}

function planEmptyRows(ctx: ScanContext): FixPlan {
  const formulaRows = ctx.sheet.formulas.size ? formulaRowsAndCols(ctx.sheet).rows : null;
  const rows: { row: number; reason: string }[] = [];
  let formulaSkipped = 0;
  for (let r = ctx.startRow; r < ctx.rowCount; r++) {
    const i = r - ctx.startRow;
    let empty = true;
    for (let k = ctx.rowStart[i]!; k < ctx.rowStart[i + 1]!; k++) {
      if (ctx.cats[k] !== Cat.Empty && ctx.cats[k] !== Cat.Blank) {
        empty = false;
        break;
      }
    }
    if (!empty) continue;
    if (formulaRows?.has(r)) {
      formulaSkipped++; // e.g. formulas that show an empty result
      continue;
    }
    rows.push({ row: r, reason: "Row has no data" });
  }
  const skipped: FixPreview["skipped"] = [];
  addSkip(skipped, "Rows that look empty but contain formulas are never removed automatically.", formulaSkipped);
  return rowPlan("empty-rows", `Removes ${plural(rows.length, "row")} with no data. Rows containing only spaces count as empty.`, rows, skipped);
}

function planEmptyColumns(ctx: ScanContext, keep: number[]): FixPlan {
  const keepSet = new Set(keep);
  const formulaCols = ctx.sheet.formulas.size ? formulaRowsAndCols(ctx.sheet).cols : null;
  const preview = emptyPlan("empty-columns", "");
  const remove: { col: number; reason: string }[] = [];
  let kept = 0;
  let formulaSkipped = 0;
  for (const p of emptyColumnProfiles(ctx)) {
    if (keepSet.has(p.index)) {
      kept++;
      continue;
    }
    if (formulaCols?.has(p.index)) {
      formulaSkipped++;
      continue;
    }
    remove.push({ col: p.index, reason: p.name ? `Column “${p.name}” has no data` : "Column has no data" });
    preview.columns.push({ index: p.index, letter: columnLetter(p.index), name: p.name });
  }
  preview.columnsRemoved = remove.length;
  const named = preview.columns.filter((c) => c.name).length;
  preview.description = `Removes ${plural(remove.length, "column")} with no data${named ? `, including ${plural(named, "column")} with a name in the header row (untick any you want to keep)` : ""}.`;
  addSkip(preview.skipped, "Columns you chose to keep.", kept);
  addSkip(preview.skipped, "Columns containing formulas are never removed automatically.", formulaSkipped);
  return { preview, request: remove.length ? { operation: "empty-columns", label: FIX_LABELS["empty-columns"], deleteColumns: remove } : null };
}

function planNumbers(ctx: ScanContext, cells: Float64Array | null, reported: number, textOnly: boolean): FixPlan {
  if (!cells || cells.length === 0) return cellPlan("numbers-as-text", "No numbers stored as text were found.", [], [], [], []);
  if (reported > cells.length) {
    throw new EngineError(
      "too-large-for-engine",
      `This sheet has ${reported.toLocaleString("en-US")} numbers stored as text, more than can be converted in one go on this device. Nothing was changed.`,
    );
  }
  const g = ctx.sheet.grid;
  const formulas = ctx.sheet.formulas;
  // Columns that also use decimal commas: comma-thousands values there are ambiguous.
  const cols = new Set<number>();
  for (const key of cells) cols.add(splitCellKey(key).col);
  const commaAmbiguous = new Set<number>();
  for (const c of cols) {
    for (let r = ctx.startRow; r < ctx.rowCount; r++) {
      const v = g.get(r, c);
      if (typeof v === "string" && v.includes(",") && DECIMAL_COMMA.test(v.trim())) {
        commaAmbiguous.add(c);
        break;
      }
    }
  }
  const keys: number[] = [];
  const values: CellValue[] = [];
  const before: string[] = [];
  const skips = new Map<string, number>();
  let formulaSkipped = 0;
  for (const key of cells) {
    if (formulas.size && formulas.has(key)) {
      formulaSkipped++;
      continue;
    }
    const { row, col } = splitCellKey(key);
    const v = g.get(row, col);
    if (typeof v !== "string") continue;
    const res = textToNumber(v, commaAmbiguous.has(col));
    if ("skip" in res) {
      skips.set(res.skip, (skips.get(res.skip) ?? 0) + 1);
      continue;
    }
    keys.push(key);
    values.push(textOnly ? res.text : res.value);
    if (before.length < MAX_EXAMPLES) before.push(v);
  }
  const skipped: FixPreview["skipped"] = [];
  addSkip(skipped, FORMULA_CELLS_SKIPPED, formulaSkipped);
  for (const [reason, count] of skips) addSkip(skipped, reason, count);
  return cellPlan(
    "numbers-as-text",
    `Turns ${plural(keys.length, "value")} written as text (such as “1,250”, “'45” or “$12”) into real numbers, so totals and sorting work. Values with leading zeros, such as IDs and ZIP codes, are never changed.`,
    keys,
    values,
    before,
    skipped,
  );
}
