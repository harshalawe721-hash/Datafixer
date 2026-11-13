/**
 * Stage 5, Step 4: CSV Validator repairs.
 *
 * Like the Stage 4 fixes, each repair PLANS its changes against the sheet as it
 * currently looks (view positions) and returns a preview plus a change request;
 * nothing changes until the request is applied through the edit session, so
 * Undo/Redo, the history and the stale-preview check all apply.
 *
 * The rows and cells chosen are exactly the ones the validator reports, because
 * both use the same layout rule (layoutOf) and the same definitions.
 *
 * Owner decisions:
 * 1. Short rows: “Add empty cells” is only offered with a before/after preview,
 *    never in “Fix all”, and the preview warns that short rows can mean shifted data.
 * 2. Column names: empty → “Column C”, duplicates → “email (2)”. Every rename is
 *    shown first; cell data is never overwritten; a new name never creates another
 *    duplicate (the next free number is used).
 * Owner request (13 November 2026): an optional “Add apostrophes” repair for values
 * that start like formulas (=, +, -, @), never in Fix all.
 * Extra fields that contain data, unclosed quotes and unreadable characters are
 * never repaired automatically (the right result can't be known).
 */
import { cellKey, type CellValue, type SheetModel } from "../types.ts";
import { throwIfCancelled, yieldToEventLoop } from "../cancel.ts";
import { columnLetter } from "../query/query.ts";
import type { ChangeRequest } from "../edit/session.ts";
import type { FixPlan, FixPreview, PlanContext } from "../fix/fixes.ts";
import { REPAIR_LABELS, type RepairId } from "../fix/fix-ids.ts";
import { cellText, isBlankLine, layoutOf, sepLine, visibleControls } from "./validate.ts";
import { isFormulaLike } from "../csv/parse-csv.ts";

export interface RepairOptions {
  headerRow: boolean;
  /** The file's separator (to recognise an Excel “sep=” line). */
  delimiter: string;
}

const MAX_EXAMPLES = 20;
const BATCH = 16_384;
const CONTROL_ALL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const CONTROL_ONE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/;
const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

function emptyPreview(id: RepairId, description: string): FixPreview {
  return { fixId: id, label: REPAIR_LABELS[id], description, cellsChanged: 0, rowsRemoved: 0, columnsRemoved: 0, examples: [], rows: [], columns: [], skipped: [], choices: [] };
}

function rowFields(sheet: SheetModel, r: number, len = sheet.grid.rowLength(r)): string[] {
  return Array.from({ length: len }, (_, c) => cellText(sheet, r, c));
}

/** Cell changes collected compactly (view cell keys). */
class Changes {
  keys: number[] = [];
  values: CellValue[] = [];
  add(r: number, c: number, v: CellValue) {
    this.keys.push(cellKey(r, c));
    this.values.push(v);
  }
  request(id: RepairId): ChangeRequest | null {
    return this.keys.length ? { operation: id, label: REPAIR_LABELS[id], cellKeys: Float64Array.from(this.keys), cellValues: this.values } : null;
  }
}

export async function planRepair(sheet: SheetModel, id: RepairId, options: RepairOptions, pc: PlanContext = {}): Promise<FixPlan> {
  const g = sheet.grid;
  const rows = g.rowCount;
  const sep = sepLine(sheet, options.delimiter);
  const headerRow = options.headerRow && rows > 0;
  const { headerIndex, firstData, expectedFields } = layoutOf(sheet, sep, headerRow);
  const preview = emptyPreview(id, "");
  const tick = async (r: number) => {
    if ((r & (BATCH - 1)) === BATCH - 1) {
      throwIfCancelled(pc.cancel);
      pc.onProgress?.(r + 1, rows);
      await yieldToEventLoop();
    }
  };

  switch (id) {
    // ------------------------------------------------------------ decision 1
    case "pad-short-rows": {
      const ch = new Changes();
      let rowsPadded = 0;
      for (let r = firstData; r < rows; r++) {
        await tick(r);
        const len = g.rowLength(r);
        if (len >= expectedFields || isBlankLine(sheet, r)) continue;
        rowsPadded++;
        for (let c = len; c < expectedFields; c++) ch.add(r, c, "");
        if ((preview.lines ??= []).length < MAX_EXAMPLES) {
          const before = rowFields(sheet, r, len);
          preview.lines.push({ row: r, before, after: [...before, ...new Array<string>(expectedFields - len).fill("")] });
        }
      }
      preview.cellsChanged = ch.keys.length;
      preview.description = rowsPadded
        ? `Adds ${plural(ch.keys.length, "empty cell")} at the end of ${plural(rowsPadded, "short row")}, so every row has ${plural(expectedFields, "field")}. Existing values are not moved or changed.`
        : `Every row already has at least ${plural(expectedFields, "field")}.`;
      if (rowsPadded) {
        preview.warning =
          "Check these rows first. A short row can be a row with missing values at the end, but it can also mean a value is missing in the middle, so the values after it have shifted into the wrong columns. Adding empty cells at the end does not fix shifted values: edit those rows by tapping the cells instead.";
      }
      return { preview, request: ch.request(id) };
    }

    case "trim-extra-fields": {
      const trims: NonNullable<ChangeRequest["trimRows"]> = [];
      let withData = 0;
      const reason = `Empty fields after column ${columnLetter(expectedFields - 1)} removed`;
      for (let r = firstData; r < rows; r++) {
        await tick(r);
        const len = g.rowLength(r);
        if (len <= expectedFields) continue;
        let empty = true;
        for (let c = expectedFields; c < len && empty; c++) if (cellText(sheet, r, c) !== "") empty = false;
        if (!empty) {
          withData++;
          continue;
        }
        trims.push({ row: r, length: expectedFields, reason });
        if ((preview.lines ??= []).length < MAX_EXAMPLES) preview.lines.push({ row: r, before: rowFields(sheet, r, len), after: rowFields(sheet, r, expectedFields) });
      }
      preview.rowsShortened = trims.length;
      preview.description = trims.length
        ? `Removes the empty fields at the end of ${plural(trims.length, "row")} that have more than ${plural(expectedFields, "field")}. Only empty fields are removed, so no data is lost.`
        : "No row has empty extra fields to remove.";
      if (withData) {
        preview.skipped.push({
          count: withData,
          reason:
            "Rows whose extra fields contain data were left alone. This usually means a value contains the separator without quotes, so the right fix can't be known. Edit these rows by tapping the cells, or fix the program that created the file.",
        });
      }
      return { preview, request: trims.length ? { operation: id, label: REPAIR_LABELS[id], trimRows: trims } : null };
    }

    // ------------------------------------------------------------ decision 2
    case "fix-header-names": {
      if (!headerRow) {
        preview.description = "Tick “First row contains column names” to check and fix column names.";
        return { preview, request: null };
      }
      const names = rowFields(sheet, headerIndex);
      const key = (n: string) => n.trim().toLowerCase();
      const used = new Set(names.map(key).filter((k) => k !== ""));
      const nextFree = (base: string) => {
        let name = base;
        for (let n = 2; used.has(key(name)); n++) name = `${base} (${n})`;
        used.add(key(name));
        return name;
      };
      // An empty last name caused by a separator at the end of every line is the empty-last-column note, not a missing name.
      const last = names.length - 1;
      let trailingOnly = false;
      if (last > 0 && names[last]!.trim() === "") {
        trailingOnly = true;
        let seen = 0;
        for (let r = firstData; r < rows && trailingOnly; r++) {
          if (g.rowLength(r) !== names.length || isBlankLine(sheet, r)) continue;
          seen++;
          if (cellText(sheet, r, last) !== "") trailingOnly = false;
        }
        if (seen === 0) trailingOnly = false;
      }
      const ch = new Changes();
      const seen = new Set<string>();
      let emptyCount = 0;
      let dupCount = 0;
      names.forEach((n, c) => {
        const k = key(n);
        let name: string | null = null;
        if (k === "") {
          if (c === last && trailingOnly) return;
          name = nextFree(`Column ${columnLetter(c)}`);
          emptyCount++;
        } else if (seen.has(k)) {
          name = nextFree(n.trim());
          dupCount++;
        } else seen.add(k);
        if (name !== null) {
          ch.add(headerIndex, c, name);
          if (preview.examples.length < MAX_EXAMPLES) preview.examples.push({ row: headerIndex, col: c, before: n, after: name });
        }
      });
      if (trailingOnly) {
        preview.skipped.push({
          count: 1,
          reason: `Column ${columnLetter(last)} has no name because every line ends with a separator. It is an empty column rather than a missing name, so it was not named.`,
        });
      }
      preview.cellsChanged = ch.keys.length;
      preview.description = ch.keys.length
        ? [
            emptyCount ? `${plural(emptyCount, "column")} without a name get${emptyCount === 1 ? "s" : ""} a name after ${emptyCount === 1 ? "its" : "their"} column letter.` : "",
            dupCount ? `${plural(dupCount, "duplicate name")} ${dupCount === 1 ? "is" : "are"} made unique by adding a number; the first column with each name keeps it.` : "",
            "Only the column names change; no other cell is touched, and no new name repeats an existing one.",
          ]
            .filter(Boolean)
            .join(" ")
        : "Every column has a unique name.";
      return { preview, request: ch.request(id) };
    }

    case "trim-header-spaces": {
      if (!headerRow) {
        preview.description = "Tick “First row contains column names” to check column names.";
        return { preview, request: null };
      }
      const ch = new Changes();
      rowFields(sheet, headerIndex).forEach((n, c) => {
        const t = n.trim();
        if (t === n || t === "") return;
        ch.add(headerIndex, c, t);
        if (preview.examples.length < MAX_EXAMPLES) preview.examples.push({ row: headerIndex, col: c, before: n, after: t });
      });
      preview.cellsChanged = ch.keys.length;
      preview.description = ch.keys.length ? `Removes the spaces at the start and end of ${plural(ch.keys.length, "column name")}.` : "No column name has spaces at its edges.";
      return { preview, request: ch.request(id) };
    }

    case "remove-blank-lines": {
      const del: NonNullable<ChangeRequest["deleteRows"]> = [];
      for (let r = firstData; r < rows; r++) {
        await tick(r);
        if (!isBlankLine(sheet, r)) continue;
        del.push({ row: r, reason: "Blank line" });
        if (preview.rows.length < MAX_EXAMPLES) preview.rows.push({ row: pc.originalRow?.(r) ?? r, reason: "Blank line" });
      }
      preview.rowsRemoved = del.length;
      preview.description = del.length ? `Removes ${plural(del.length, "blank line")}. No row with data is removed.` : "There are no blank lines.";
      return { preview, request: del.length ? { operation: id, label: REPAIR_LABELS[id], deleteRows: del } : null };
    }

    case "protect-formulas": {
      const ch = new Changes();
      for (let r = firstData; r < rows; r++) {
        await tick(r);
        const len = g.rowLength(r);
        for (let c = 0; c < len; c++) {
          const s = cellText(sheet, r, c);
          if (!isFormulaLike(s)) continue;
          const after = `'${s}`;
          ch.add(r, c, after);
          if (preview.examples.length < MAX_EXAMPLES) preview.examples.push({ row: r, col: c, before: visibleControls(s), after: visibleControls(after) });
        }
      }
      preview.cellsChanged = ch.keys.length;
      preview.description = ch.keys.length
        ? `Puts an apostrophe (') in front of ${plural(ch.keys.length, "value")} that start with =, +, - or @, so spreadsheet apps treat them as text and never run them as formulas. Nothing else in the value changes.`
        : "No value starts like a formula.";
      if (ch.keys.length) {
        preview.warning =
          "The apostrophe is saved as part of each value. Spreadsheet apps won't run these values as formulas, but some show the apostrophe, and databases and scripts will see it. Phone numbers such as “+44 …” also start with +, so check the examples first. Only do this if the file will be opened in a spreadsheet app.";
      }
      return { preview, request: ch.request(id) };
    }

    case "remove-control-chars": {
      const ch = new Changes();
      let c1 = false;
      for (let r = 0; r < rows; r++) {
        await tick(r);
        const len = g.rowLength(r);
        for (let c = 0; c < len; c++) {
          const s = cellText(sheet, r, c);
          if (!CONTROL_ONE.test(s)) continue;
          if (/[\u0080-\u009f]/.test(s)) c1 = true;
          const cleaned = s.replace(CONTROL_ALL, "");
          ch.add(r, c, cleaned);
          if (preview.examples.length < MAX_EXAMPLES) preview.examples.push({ row: r, col: c, before: visibleControls(s), after: cleaned });
        }
      }
      preview.cellsChanged = ch.keys.length;
      preview.description = ch.keys.length
        ? `Removes invisible control characters from ${plural(ch.keys.length, "cell")}. The visible text stays the same. In the examples, symbols such as ␀ show where they are.`
        : "No cell contains hidden control characters.";
      if (c1) {
        preview.warning =
          "Some of these are codes between U+0080 and U+009F (shown as ▯), which usually means the file was read with the wrong text encoding. Try another encoding in the “Text encoding” box first: removing them would also remove what may be real letters.";
      }
      return { preview, request: ch.request(id) };
    }
  }
}
