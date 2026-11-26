/**
 * Stage 10: turns "Split a column" and "Combine columns" choices into change
 * requests for the edit session. Works on the sheet as it is now (the view),
 * so previews match what Apply will do. Formula cells are never split.
 */
import type { ChangeRequest } from "../edit/session.ts";
import { cellKey, type CellValue, type SheetModel } from "../types.ts";
import {
  EXCEL_MAX_COLUMNS,
  cellText,
  combineValues,
  splitHeaderNames,
  splitText,
  tooLongForCell,
  type CombineOptions,
  type SplitOptions,
} from "./split-combine.ts";

export interface PlanExample {
  row: number;
  before: string[];
  after: string[];
}

export interface SplitPlanInput {
  sheet: SheetModel;
  /** View column to split. */
  column: number;
  /** Row 0 is a header: its new headers are named from the column, and it isn't split. */
  headerRow: boolean;
  options: SplitOptions;
  /** Remove the original column after the split (default: keep it). */
  removeOriginal?: boolean;
}

export interface CombinePlanInput {
  sheet: SheetModel;
  /** View columns to join, in the order the user chose. */
  columns: number[];
  /** Header of the new column (row 0 when headerRow is set). */
  name: string;
  headerRow: boolean;
  options: CombineOptions;
  /** Remove the original columns after combining (default: keep them). */
  removeOriginals?: boolean;
}

export interface SplitCombinePlan {
  /** Requests to apply in order (add first, then removals). Empty when nothing would change. */
  requests: ChangeRequest[];
  /** New columns that will be added. */
  columnsAdded: number;
  /** Cells whose value is written (split parts or combined values). */
  cellsWritten: number;
  /** Things left alone, with a reason and count. */
  skipped: { reason: string; count: number }[];
  /** Up to 5 rows, before and after. */
  examples: PlanExample[];
  /** Set when the change is refused; nothing is applied. */
  refused?: string;
}

const EXAMPLE_ROWS = 5;

function refusedPlan(reason: string): SplitCombinePlan {
  return { requests: [], columnsAdded: 0, cellsWritten: 0, skipped: [], examples: [], refused: reason };
}

function checkColumns(sheet: SheetModel, adding: number, removing: number): string | null {
  const after = sheet.columnCount + adding - removing;
  if (after > EXCEL_MAX_COLUMNS) {
    return `This would make ${after.toLocaleString("en-US")} columns, more than the ${EXCEL_MAX_COLUMNS.toLocaleString("en-US")} an Excel sheet allows. Nothing was changed.`;
  }
  return null;
}

/** Split one column into parts; the parts go into new columns at the right edge. */
export function planSplitColumn(input: SplitPlanInput): SplitCombinePlan {
  const { sheet, column, headerRow, options } = input;
  const g = sheet.grid;
  if (column < 0 || column >= sheet.columnCount) return refusedPlan("That column doesn't exist.");
  const start = headerRow ? 1 : 0;
  const rowCount = g.rowCount;
  if (rowCount === 0) return refusedPlan("This sheet has no rows to split.");

  // Parts per data row. A value with no separator (or a number) becomes the first part,
  // so removing the original column later never loses it. Formula cells are not split.
  const partsByRow = new Map<number, CellValue[]>();
  let formulaSkipped = 0;
  let width = 1;
  let anySplit = false;
  for (let r = start; r < rowCount; r++) {
    const v = g.get(r, column);
    if (sheet.formulas.size && sheet.formulas.has(cellKey(r, column))) {
      formulaSkipped++;
      continue;
    }
    if (v === null || v === "") continue;
    if (typeof v !== "string") {
      partsByRow.set(r, [v]);
      continue;
    }
    const parts = splitText(v, options);
    if (parts.length > 1) anySplit = true;
    partsByRow.set(r, parts);
    if (parts.length > width) width = parts.length;
  }
  if (!anySplit) {
    return {
      requests: [],
      columnsAdded: 0,
      cellsWritten: 0,
      skipped: formulaSkipped ? [{ reason: "Formula cells, left unchanged.", count: formulaSkipped }] : [],
      examples: [],
      refused: `No value contains “${options.separator}”, so there is nothing to split.`,
    };
  }
  const refusal = checkColumns(sheet, width, input.removeOriginal ? 1 : 0);
  if (refusal) return refusedPlan(refusal);

  const name = headerRow ? cellText(g.get(0, column)) || `Column ${column + 1}` : "";
  const headers = splitHeaderNames(name, width);
  const columns: ChangeRequest["addColumns"] = [];
  for (let k = 0; k < width; k++) {
    const values: CellValue[] = new Array(rowCount).fill(null);
    if (headerRow) values[0] = headers[k]!;
    for (const [r, parts] of partsByRow) {
      const p = parts[k];
      if (p !== undefined && p !== "") values[r] = p;
    }
    columns.push({ values, reason: "Split a column" });
  }
  const requests: ChangeRequest[] = [{ operation: "split-column", label: "Split a column", addColumns: columns }];
  if (input.removeOriginal) {
    requests.push({ operation: "split-column-remove", label: "Remove the original column", deleteColumns: [{ col: column, reason: "Split a column" }] });
  }

  const examples: PlanExample[] = [];
  for (const [r, parts] of partsByRow) {
    if (examples.length >= EXAMPLE_ROWS) break;
    if (parts.length < 2) continue;
    const after: string[] = [];
    for (let k = 0; k < width; k++) after.push(cellText(parts[k] ?? null));
    examples.push({ row: r + 1, before: [cellText(g.get(r, column))], after });
  }
  const skipped: SplitCombinePlan["skipped"] = [];
  if (formulaSkipped) skipped.push({ reason: "Formula cells, left unchanged.", count: formulaSkipped });
  return {
    requests,
    columnsAdded: width,
    cellsWritten: [...partsByRow.values()].reduce((n, p) => n + p.filter((x) => x !== null && x !== "").length, 0),
    skipped,
    examples,
  };
}

/** Join several columns into one new column at the right edge. */
export function planCombineColumns(input: CombinePlanInput): SplitCombinePlan {
  const { sheet, columns, headerRow, options } = input;
  const g = sheet.grid;
  if (columns.length < 2) return refusedPlan("Choose at least two columns to combine.");
  const unique = new Set(columns);
  if (unique.size !== columns.length) return refusedPlan("Each column can be chosen only once.");
  for (const c of columns) if (c < 0 || c >= sheet.columnCount) return refusedPlan("One of the chosen columns doesn't exist.");
  const refusal = checkColumns(sheet, 1, input.removeOriginals ? columns.length : 0);
  if (refusal) return refusedPlan(refusal);

  const start = headerRow ? 1 : 0;
  const rowCount = g.rowCount;
  const values: CellValue[] = new Array(rowCount).fill(null);
  if (headerRow) values[0] = input.name.trim() || "Combined";
  let tooLong = 0;
  let written = 0;
  let empty = 0;
  const examples: PlanExample[] = [];
  for (let r = start; r < rowCount; r++) {
    // Values as they appear in the sheet (an Excel date reads 2024-03-15, not its serial number).
    const parts = columns.map((c) => (g.display ? g.display(r, c) : g.get(r, c)));
    const joined = combineValues(parts, options);
    if (tooLongForCell(joined)) {
      tooLong++;
      continue;
    }
    if (joined === "") {
      empty++;
      continue;
    }
    values[r] = joined;
    written++;
    if (examples.length < EXAMPLE_ROWS) examples.push({ row: r + 1, before: parts.map(cellText), after: [joined] });
  }
  const skipped: SplitCombinePlan["skipped"] = [];
  if (empty) skipped.push({ reason: "Rows where every chosen value is empty.", count: empty });
  if (tooLong) skipped.push({ reason: "Combined values longer than an Excel cell allows (32,767 characters), left empty.", count: tooLong });

  const requests: ChangeRequest[] = [{ operation: "combine-columns", label: "Combine columns", addColumns: [{ values, reason: "Combine columns" }] }];
  if (input.removeOriginals) {
    requests.push({
      operation: "combine-columns-remove",
      label: "Remove the original columns",
      deleteColumns: columns.map((c) => ({ col: c, reason: "Combine columns" })),
    });
  }
  return { requests, columnsAdded: 1, cellsWritten: written, skipped, examples };
}
