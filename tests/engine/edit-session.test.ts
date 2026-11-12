/** Stage 4, Step 1: change layer, edited view, history, Undo/Redo. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EditSession } from "../../src/engine/edit/session.ts";
import { EngineCore } from "../../src/engine/core.ts";
import { ArrayGrid } from "../../src/engine/grid.ts";
import { cellKey, createSheet, type CellValue, type SheetModel } from "../../src/engine/types.ts";
import { EngineError } from "../../src/engine/errors.ts";

const SCAN = new URL("../fixtures/scan/", import.meta.url);

function sheetOf(rows: CellValue[][]): SheetModel {
  const s = createSheet("S");
  s.grid = new ArrayGrid(rows);
  s.columnCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return s;
}

const rowsOf = (s: SheetModel) => Array.from({ length: s.grid.rowCount }, (_, r) => s.grid.row(r));

function sample(): SheetModel {
  return sheetOf([
    ["id", "name", "city"],
    [1, " Ann ", "Paris"],
    [2, "Bob", "paris"],
    [3, "Cy", "Rome"],
    [2, "Bob", "paris"],
  ]);
}

async function openPack(name: string) {
  const core = new EngineCore();
  const s = await core.open(new File([readFileSync(new URL(name, SCAN))], name), name.endsWith(".xlsx") ? "xlsx" : "csv", {}, () => {});
  return { core, sheet: s.activeSheet };
}

const throwsCode = (fn: () => unknown, code: string) => assert.throws(fn, (e: unknown) => e instanceof EngineError && e.code === code);

// ---------------------------------------------------------------- edits

test("edits: the view shows new values; the original sheet is never changed", () => {
  const base = sample();
  const before = JSON.stringify(rowsOf(base));
  const s = new EditSession(base);
  const e = s.apply({ operation: "remove-extra-spaces", label: "Remove extra spaces", cells: [{ row: 1, col: 1, value: "Ann" }] })!;
  assert.equal(e.cells, 1);
  const v = s.view();
  assert.equal(v.grid.get(1, 1), "Ann");
  assert.equal(v.grid.display!(1, 1), "Ann");
  assert.equal(s.grid().isEdited(1, 1), true);
  assert.equal(s.grid().isEdited(1, 2), false);
  assert.equal(base.grid.get(1, 1), " Ann ", "original untouched");
  assert.equal(JSON.stringify(rowsOf(base)), before);
});

test("edits: unchanged values are skipped, the last value for a cell wins, and no-op changes add no history", () => {
  const s = new EditSession(sample());
  assert.equal(s.apply({ operation: "x", label: "X", cells: [{ row: 2, col: 1, value: "Bob" }] }), null);
  assert.equal(s.history().length, 0);
  const e = s.apply({ operation: "x", label: "X", cells: [{ row: 2, col: 2, value: "Lyon" }, { row: 2, col: 2, value: "Paris" }, { row: 3, col: 1, value: "Cy" }] })!;
  assert.equal(e.cells, 1);
  assert.equal(s.view().grid.get(2, 2), "Paris");
});

test("edits: cleared cells read as empty; a cell set back to its original value no longer counts as edited", () => {
  const s = new EditSession(sample());
  s.apply({ operation: "clear", label: "Clear", cells: [{ row: 3, col: 2, value: null }] });
  assert.equal(s.view().grid.get(3, 2), null);
  assert.equal(s.view().grid.display!(3, 2), "");
  assert.equal(s.stats().cellsEdited, 1);
  s.apply({ operation: "edit-cell", label: "Edit cell", cells: [{ row: 3, col: 2, value: "Rome" }] });
  assert.equal(s.stats().cellsEdited, 0, "back to the original value");
  assert.equal(s.stats().changesApplied, 2);
});

test("edits beyond the end of a short (ragged) row extend that row; undo restores it", () => {
  const s = new EditSession(sheetOf([["a", "b", "c"], ["x"]]));
  s.apply({ operation: "edit-cell", label: "Edit cell", cells: [{ row: 1, col: 2, value: "z" }] });
  assert.equal(s.view().grid.rowLength(1), 3);
  assert.deepEqual(s.view().grid.row(1), ["x", null, "z"]);
  s.undo();
  assert.equal(s.view().grid.rowLength(1), 1);
});

test("edits outside the sheet are refused with a clear error", () => {
  const s = new EditSession(sample());
  throwsCode(() => s.apply({ operation: "x", label: "X", cells: [{ row: 9, col: 0, value: 1 }] }), "invalid-edit");
  throwsCode(() => s.apply({ operation: "x", label: "X", cells: [{ row: 1, col: 3, value: 1 }] }), "invalid-edit");
  throwsCode(() => s.apply({ operation: "x", label: "X", deleteRows: [{ row: 5, reason: "r" }] }), "invalid-edit");
  assert.equal(s.history().length, 0);
});

// ---------------------------------------------------------------- deletions

test("deleting rows and columns: view positions shift, edits stay with their original cells", () => {
  const s = new EditSession(sample());
  s.apply({ operation: "edit-cell", label: "Edit cell", cells: [{ row: 3, col: 2, value: "Roma" }] });
  s.apply({ operation: "remove-duplicates", label: "Remove duplicate rows", deleteRows: [{ row: 4, reason: "Exact copy of row 3" }, { row: 2, reason: "Test" }] });
  s.apply({ operation: "remove-empty-columns", label: "Remove empty columns", deleteColumns: [{ col: 0, reason: "Not needed" }] });
  const v = s.view();
  assert.equal(v.columnCount, 2);
  assert.deepEqual(rowsOf(v), [["name", "city"], [" Ann ", "Paris"], ["Cy", "Roma"]]);
  assert.equal(s.toBase(2, 1).row, 3);
  assert.equal(s.toBase(2, 1).col, 2);
  // Editing at a view position lands on the right original cell.
  s.apply({ operation: "edit-cell", label: "Edit cell", cells: [{ row: 2, col: 0, value: "Cyd" }] });
  assert.equal(s.view().grid.get(2, 0), "Cyd");
  s.undo(); s.undo(); s.undo();
  assert.deepEqual(rowsOf(s.view()), [["id", "name", "city"], [1, " Ann ", "Paris"], [2, "Bob", "paris"], [3, "Cy", "Roma"], [2, "Bob", "paris"]]);
});

test("deleting rows remaps formulas, errors, merges, hidden rows and row heights", () => {
  const base = sheetOf([["a", "b"], [1, 2], [3, 4], [5, 6]]);
  base.formulas.set(cellKey(3, 1), "A4+1");
  base.errors.set(cellKey(2, 0), "#N/A");
  base.merges.push({ startRow: 1, endRow: 3, startCol: 0, endCol: 0 });
  base.hiddenRows.add(3);
  base.rowHeights.set(3, 30);
  const s = new EditSession(base);
  s.apply({ operation: "x", label: "X", deleteRows: [{ row: 2, reason: "r" }] });
  const v = s.view();
  assert.deepEqual([...v.formulas], [[cellKey(2, 1), "A4+1"]]);
  assert.equal(v.errors.size, 0, "the error cell's row was removed");
  assert.deepEqual(v.merges, [{ startRow: 1, endRow: 2, startCol: 0, endCol: 0 }]);
  assert.deepEqual([...v.hiddenRows], [2]);
  assert.deepEqual([...v.rowHeights], [[2, 30]]);
  assert.equal(base.formulas.get(cellKey(3, 1)), "A4+1", "original tables untouched");
});

test("a cell given a new value no longer counts as a formula or error cell", () => {
  const base = sheetOf([["a"], [1], ["#DIV/0!"]]);
  base.formulas.set(cellKey(1, 0), "B1*2");
  base.errors.set(cellKey(2, 0), "#DIV/0!");
  const s = new EditSession(base);
  s.apply({ operation: "edit-cell", label: "Edit cell", cells: [{ row: 1, col: 0, value: 5 }, { row: 2, col: 0, value: 0 }] });
  assert.equal(s.view().formulas.size, 0);
  assert.equal(s.view().errors.size, 0);
  s.undo();
  assert.equal(s.view().formulas.size, 1);
  assert.equal(s.view().errors.size, 1);
});

// ---------------------------------------------------------------- undo / redo / history

test("undo and redo step through changes; stats stay exact", () => {
  const s = new EditSession(sample());
  s.apply({ operation: "remove-extra-spaces", label: "Remove extra spaces", cells: [{ row: 1, col: 1, value: "Ann" }] });
  s.apply({ operation: "fix-capitalization", label: "Fix capitalization", cells: [{ row: 2, col: 2, value: "Paris" }, { row: 4, col: 2, value: "Paris" }] });
  s.apply({ operation: "remove-duplicates", label: "Remove duplicate rows", deleteRows: [{ row: 4, reason: "Exact copy of row 3" }] });
  assert.deepEqual(s.stats(), { cellsEdited: 3, rowsRemoved: 1, columnsRemoved: 0, rowsShortened: 0, changesApplied: 3, canUndo: true, canRedo: false, version: 3 });

  s.undo();
  assert.equal(s.view().grid.rowCount, 5);
  s.undo();
  assert.equal(s.view().grid.get(2, 2), "paris");
  assert.deepEqual(
    s.history().map((h) => [h.label, h.status]),
    [["Remove duplicate rows", "undone"], ["Fix capitalization", "undone"], ["Remove extra spaces", "applied"]],
  );
  assert.equal(s.stats().canRedo, true);
  s.redo();
  assert.equal(s.view().grid.get(2, 2), "Paris");
  assert.equal(s.history()[1]!.status, "applied");
  s.redo();
  assert.equal(s.view().grid.rowCount, 4);
  assert.equal(s.redo(), null, "nothing left to redo");
  s.undo(); s.undo(); s.undo();
  assert.equal(s.undo(), null, "nothing left to undo");
  assert.deepEqual(rowsOf(s.view()), rowsOf(sample()));
  assert.equal(s.stats().cellsEdited, 0);
});

test("a new change after undo ends the redo chain; undone entries stay in the history, marked undone", () => {
  const s = new EditSession(sample());
  s.apply({ operation: "a", label: "A", cells: [{ row: 1, col: 1, value: "Ann" }] });
  s.apply({ operation: "b", label: "B", cells: [{ row: 3, col: 1, value: "Cyd" }] });
  s.undo();
  s.apply({ operation: "c", label: "C", cells: [{ row: 3, col: 2, value: "Roma" }] });
  assert.equal(s.stats().canRedo, false);
  assert.deepEqual(
    s.history().map((h) => [h.label, h.status, h.redoable]),
    [["C", "applied", true], ["B", "undone", false], ["A", "applied", true]],
  );
  assert.equal(s.view().grid.get(3, 1), "Cy");
});

test("undo restores the value from before an edit of an already edited cell", () => {
  const s = new EditSession(sample());
  s.apply({ operation: "a", label: "A", cells: [{ row: 1, col: 1, value: "Ann" }] });
  s.apply({ operation: "b", label: "B", cells: [{ row: 1, col: 1, value: "Anne" }] });
  s.undo();
  assert.equal(s.view().grid.get(1, 1), "Ann");
  s.undo();
  assert.equal(s.view().grid.get(1, 1), " Ann ");
});

test("history details: cell, original value, new value, operation, status; removed rows and columns with reasons", () => {
  const s = new EditSession(sample());
  const e1 = s.apply({ operation: "remove-extra-spaces", label: "Remove extra spaces", cells: [{ row: 1, col: 1, value: "Ann" }] })!;
  const e2 = s.apply({ operation: "remove-duplicates", label: "Remove duplicate rows", deleteRows: [{ row: 4, reason: "Exact copy of row 3" }] })!;
  const e3 = s.apply({ operation: "remove-empty-columns", label: "Remove empty columns", deleteColumns: [{ col: 0, reason: "Column has no data" }] })!;
  assert.deepEqual(s.historyDetails(e1.id).items, [{ kind: "cell", cell: "B2", row: 2, column: "B", original: " Ann ", newValue: "Ann" }]);
  assert.deepEqual(s.historyDetails(e2.id).items, [{ kind: "row", row: 5, reason: "Exact copy of row 3" }]);
  assert.deepEqual(s.historyDetails(e3.id).items, [{ kind: "column", column: "A", reason: "Column has no data" }]);
  assert.equal(e2.rowsRemoved, 1);
  assert.equal(e3.columnsRemoved, 1);
  // After columns are removed, positions in the history still refer to the original file.
  const e4 = s.apply({ operation: "edit-cell", label: "Edit cell", cells: [{ row: 2, col: 0, value: "Rob" }] })!;
  assert.deepEqual(s.historyDetails(e4.id).items[0], { kind: "cell", cell: "B3", row: 3, column: "B", original: "Bob", newValue: "Rob" });
  s.undo();
  assert.equal(s.history()[0]!.status, "undone");
});

test("history details are paged", () => {
  const rows: CellValue[][] = [["v"]];
  for (let i = 0; i < 250; i++) rows.push([` ${i}`]);
  const s = new EditSession(sheetOf(rows));
  const e = s.apply({ operation: "trim", label: "Remove extra spaces", cells: rows.slice(1).map((r, i) => ({ row: i + 1, col: 0, value: String(r[0]).trim() })) })!;
  const p1 = s.historyDetails(e.id, 0, 100);
  const p3 = s.historyDetails(e.id, 200, 100);
  assert.equal(p1.total, 250);
  assert.equal(p1.items.length, 100);
  assert.equal(p3.items.length, 50);
  assert.deepEqual(p3.items.at(-1), { kind: "cell", cell: "A251", row: 251, column: "A", original: " 249", newValue: "249" });
});

test("memory budget: a change that doesn't fit is refused and nothing changes", () => {
  const base = sample();
  const s = new EditSession(base, { memoryBudgetBytes: base.grid.approxBytes + 300 });
  throwsCode(() => s.apply({ operation: "x", label: "X", cells: [{ row: 1, col: 1, value: "Ann" }, { row: 2, col: 1, value: "B" }, { row: 3, col: 1, value: "C" }] }), "out-of-memory");
  assert.equal(s.history().length, 0);
  assert.equal(s.view().grid.get(1, 1), " Ann ");
});

// ---------------------------------------------------------------- through the engine (preview, search, sort, scan)

test("engine: preview, search and sort read the edited data; edited cells are marked", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  // Row 6 (index 5) has "paris"; row 4 (index 3) has " Person 3".
  core.applyChange(sheet, { operation: "fix-capitalization", label: "Fix capitalization", cells: [{ row: 5, col: 4, value: "Paris" }] });
  core.applyChange(sheet, { operation: "remove-extra-spaces", label: "Remove extra spaces", cells: [{ row: 3, col: 1, value: "Person 3" }] });
  const page = core.getRows(sheet, { offset: 0, limit: 5, headerRow: true });
  const r6 = page.rows.find((r) => r.index === 5)!;
  assert.equal(r6.cells[4], "Paris");
  assert.deepEqual(r6.editedColumns, [4]);
  assert.equal(page.rows.find((r) => r.index === 1)!.editedColumns, undefined);
  assert.equal(core.getRows(sheet, { offset: 0, limit: 50, headerRow: true, search: "paris" }).rows.every((r) => r.cells[4] === "Paris"), true);
  const sorted = core.getRows(sheet, { offset: 0, limit: 3, headerRow: true, sort: { column: 1, direction: "asc" } });
  assert.equal(sorted.rows[0]!.cells[1], "Person 1");
  assert.ok(core.getRows(sheet, { offset: 0, limit: 50, headerRow: true, sort: { column: 1, direction: "asc" } }).rows.some((r) => r.cells[1] === "Person 3"));
  core.undo(sheet);
  core.undo(sheet);
  assert.equal(core.getRows(sheet, { offset: 0, limit: 6, headerRow: true }).rows.find((r) => r.index === 5)!.cells[4], "paris");
});

test("engine: checking again after changes reflects the edited data; undo brings the problems back", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const before = await core.scan(sheet, { headerRow: true }, () => {});
  const count = (r: typeof before, id: string) => r.issues.find((i) => i.id === id)?.count ?? 0;
  assert.equal(count(before, "duplicate-rows"), 2);
  assert.equal(count(before, "extra-spaces"), 2);
  // Rows 27 and 28 (indexes 26, 27) are exact copies of rows 2 and 3.
  const r = core.applyChange(sheet, {
    operation: "remove-duplicates",
    label: "Remove duplicate rows",
    deleteRows: [{ row: 26, reason: "Exact copy of row 2" }, { row: 27, reason: "Exact copy of row 3" }],
  });
  assert.equal(r.stats.rowsRemoved, 2);
  const after = await core.scan(sheet, { headerRow: true }, () => {});
  assert.equal(count(after, "duplicate-rows"), 0);
  assert.equal(after.rows, before.rows - 2);
  core.undo(sheet);
  const again = await core.scan(sheet, { headerRow: true }, () => {});
  assert.deepEqual(again.issues.map((i) => [i.id, i.count]), before.issues.map((i) => [i.id, i.count]));
});

test("engine: view affected data is cleared by a change (the old scan no longer matches)", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  await core.scan(sheet, { headerRow: true }, () => {});
  assert.ok(core.getRows(sheet, { offset: 0, limit: 5, headerRow: true, issue: "duplicate-rows" }).total > 0);
  core.applyChange(sheet, { operation: "edit-cell", label: "Edit cell", cells: [{ row: 1, col: 1, value: "P1" }] });
  assert.equal(core.getRows(sheet, { offset: 0, limit: 5, headerRow: true, issue: "duplicate-rows" }).total, 27, "no stale filter is applied");
});

test("engine: CSV edits stay text; Excel edits turn typed numbers into numbers (but keep leading zeros)", async () => {
  const csv = await openPack("1-problems.csv");
  csv.core.editCell(csv.sheet, 1, 5, "250");
  assert.equal(csv.core.getSheet(csv.sheet)!.grid.get(1, 5), "250");
  const xl = await openPack("2-problems.xlsx");
  xl.core.editCell(xl.sheet, 1, 5, "250");
  assert.equal(xl.core.getSheet(xl.sheet)!.grid.get(1, 5), 250);
  xl.core.editCell(xl.sheet, 1, 0, "007");
  assert.equal(xl.core.getSheet(xl.sheet)!.grid.get(1, 0), "007");
  xl.core.editCell(xl.sheet, 1, 7, "  ");
  assert.equal(xl.core.getSheet(xl.sheet)!.grid.get(1, 7), null);
});

test("engine: editing a formula cell needs confirmation; the formula is then replaced and other formulas are kept", async () => {
  const { core, sheet } = await openPack("2-problems.xlsx");
  const view = core.getSheet(sheet)!;
  const formulaCells = [...view.formulas.keys()];
  const target = formulaCells[0]!;
  const row = Math.floor(target / 16384);
  const col = target % 16384;
  assert.throws(
    () => core.editCell(sheet, row, col, "0"),
    (e: unknown) => e instanceof EngineError && e.code === "formula-cell" && /contains the formula =/.test(e.message) && /replaces the formula/.test(e.message),
  );
  assert.equal(core.editStats(sheet).changesApplied, 0, "nothing changed without confirmation");
  core.editCell(sheet, row, col, "0", { replaceFormula: true });
  const after = core.getSheet(sheet)!;
  assert.equal(after.formulas.has(target), false);
  assert.equal(after.formulas.size, formulaCells.length - 1, "all other formulas kept");
  core.undo(sheet);
  assert.equal(core.getSheet(sheet)!.formulas.has(target), true);
});

test("engine: hasEdits and editStats", async () => {
  const { core, sheet } = await openPack("3-clean.csv");
  assert.equal(core.hasEdits(), false);
  assert.equal(core.editStats(sheet).changesApplied, 0);
  core.editCell(sheet, 1, 1, "X");
  assert.equal(core.hasEdits(), true);
  core.undo(sheet);
  assert.equal(core.hasEdits(), false);
  assert.equal(core.history(sheet).length, 1);
});

test("performance: 200,000 rows, 20,000 deleted rows and 50,000 edits, then a full scan", async () => {
  const rows: CellValue[][] = [["id", "name", "city", "amount"]];
  for (let i = 0; i < 200_000; i++) rows.push([String(i), `Name ${i % 5000}`, ["Paris", "Rome", "Oslo"][i % 3]!, String((i * 7) % 1000)]);
  const s = new EditSession(sheetOf(rows));
  const t0 = performance.now();
  s.apply({ operation: "x", label: "X", cells: Array.from({ length: 50_000 }, (_, i) => ({ row: i * 4 + 1, col: 1, value: `N${i}` })) });
  s.apply({ operation: "y", label: "Y", deleteRows: Array.from({ length: 20_000 }, (_, i) => ({ row: i * 9 + 2, reason: "test" })) });
  const v = s.view();
  const tApply = performance.now() - t0;
  assert.equal(v.grid.rowCount, 180_001);
  const { runScan } = await import("../../src/engine/scan/scan.ts");
  const { ALL_CHECKS } = await import("../../src/engine/scan/checks/index.ts");
  const t1 = performance.now();
  await runScan(v, { headerRow: true, checks: ALL_CHECKS });
  const tScan = performance.now() - t1;
  console.log(`  apply ${tApply.toFixed(0)} ms, scan over edited view ${tScan.toFixed(0)} ms`);
  assert.ok(tApply < 3000, `apply took ${tApply} ms`);
  s.undo();
  s.undo();
  assert.equal(s.view().grid.rowCount, 200_001);
  assert.equal(s.view().grid.get(1, 1), "Name 0");
});

// ---------------------------------------------------------------- Step 5: manual editing

test("cell info: value to edit, formula, date and edited flags", async () => {
  const csv = await openPack("1-problems.csv");
  const i = csv.core.cellInfo(csv.sheet, 3, 1);
  assert.deepEqual(i, { row: 3, col: 1, ref: "B4", display: " Person 3", editText: " Person 3", formula: null, isDate: false, edited: false });
  csv.core.editCell(csv.sheet, 3, 1, "Person 3");
  assert.equal(csv.core.cellInfo(csv.sheet, 3, 1).edited, true);
  throwsCode(() => csv.core.cellInfo(csv.sheet, 999, 0), "invalid-edit");

  const xl = await openPack("2-problems.xlsx");
  const view = xl.core.getSheet(xl.sheet)!;
  const fkey = [...view.formulas.keys()][0]!;
  const fi = xl.core.cellInfo(xl.sheet, Math.floor(fkey / 16384), fkey % 16384);
  assert.ok(fi.formula && fi.formula.length > 0, "formula reported before editing");
  const d = xl.core.cellInfo(xl.sheet, 1, 6);
  assert.equal(d.isDate, true);
  assert.equal(d.editText, d.display, "dates are edited as shown, not as serial numbers");
});

test("manual edits: each is a history entry named after the cell; results report every entry", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const r = core.editCell(sheet, 7, 2, "person7@example.com");
  assert.equal(r.entry!.label, "Edit cell C8");
  assert.deepEqual(r.entries.map((e) => e.label), ["Edit cell C8"]);
  const scan = await core.scan(sheet, { headerRow: true }, () => {});
  assert.equal(scan.issues.find((i) => i.id === "invalid-emails")!.count, 1, "one invalid email left after correcting row 8");
  const d = core.historyDetails(sheet, r.entry!.id);
  assert.deepEqual(d.items, [{ kind: "cell", cell: "C8", row: 8, column: "C", original: "person7example.com", newValue: "person7@example.com" }]);
  const u = core.undo(sheet);
  assert.deepEqual(u.entries.map((e) => e.status), ["undone"]);
});

test("Excel: a clear date typed into a date cell stays a real date with the cell's format; an ambiguous one is kept as text", async () => {
  const { core, sheet } = await openPack("2-problems.xlsx");
  const before = core.cellInfo(sheet, 1, 6);
  core.editCell(sheet, 1, 6, "2024-03-15");
  const v = core.getSheet(sheet)!;
  assert.equal(typeof v.grid.get(1, 6), "number");
  assert.equal(v.grid.isDate!(1, 6), true);
  assert.equal(core.cellInfo(sheet, 1, 6).display.includes("2024") || core.cellInfo(sheet, 1, 6).display.includes("24"), true);
  core.editCell(sheet, 2, 6, "03/04/2024");
  assert.equal(core.getSheet(sheet)!.grid.get(2, 6), "03/04/2024", "ambiguous: kept exactly as typed");
  assert.ok(before.display.length > 0);
});

test("Fix all reports every applied fix", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const p = await core.previewFixAll(sheet, { headerRow: true }, () => {});
  const r = core.applyFix(sheet, p.token);
  assert.equal(r.entries.length, 5);
  assert.deepEqual(r.entries.map((e) => e.label), ["Remove extra spaces", "Fix capitalization", "Convert numbers stored as text", "Remove duplicate rows", "Remove empty rows"]);
});
