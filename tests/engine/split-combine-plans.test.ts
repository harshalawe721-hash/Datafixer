/** Stage 10, Step 1: split and combine plans, applied through the edit session. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EditSession } from "../../src/engine/edit/session.ts";
import { planCombineColumns, planSplitColumn } from "../../src/engine/fix/split-combine-plans.ts";
import { ArrayGrid } from "../../src/engine/grid.ts";
import { EXCEL_MAX_CELL_CHARS } from "../../src/engine/fix/split-combine.ts";
import { cellKey, createSheet, type CellValue, type SheetModel } from "../../src/engine/types.ts";

function sheetOf(rows: CellValue[][]): SheetModel {
  const s = createSheet("S");
  s.grid = new ArrayGrid(rows);
  s.columnCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return s;
}

const space = { separator: " ", mode: "first" as const, maxParts: null, trim: false, respectQuotes: false };

function applyAll(session: EditSession, requests: ReturnType<typeof planSplitColumn>["requests"]) {
  for (const r of requests) session.apply(r);
  return session;
}

test("split adds one column per part, named from the header", () => {
  const session = new EditSession(sheetOf([["name", "city"], ["Asha Patil", "Pune"], ["Ben", "Rome"]]));
  const plan = planSplitColumn({ sheet: session.view(), column: 0, headerRow: true, options: space });
  assert.equal(plan.refused, undefined);
  assert.equal(plan.columnsAdded, 2);
  applyAll(session, plan.requests);
  const g = session.grid();
  assert.deepEqual([g.get(0, 2), g.get(0, 3)], ["name (1)", "name (2)"]);
  assert.deepEqual([g.get(1, 0), g.get(1, 2), g.get(1, 3)], ["Asha Patil", "Asha", "Patil"]);
  assert.deepEqual([g.get(2, 2), g.get(2, 3)], ["Ben", null]);
  assert.equal(g.get(2, 0), "Ben");
});

test("split with the original removed applies the add first, then the removal", () => {
  const session = new EditSession(sheetOf([["name", "city"], ["Asha Patil", "Pune"]]));
  const plan = planSplitColumn({ sheet: session.view(), column: 0, headerRow: true, options: space, removeOriginal: true });
  assert.equal(plan.requests.length, 2);
  applyAll(session, plan.requests);
  assert.equal(session.view().columnCount, 3);
  assert.deepEqual(session.grid().row(1), ["Pune", "Asha", "Patil"]);
});

test("split uses the most parts any value has, and leaves short values blank", () => {
  const session = new EditSession(sheetOf([["x"], ["a b c"], ["d e"]]));
  const plan = planSplitColumn({ sheet: session.view(), column: 0, headerRow: true, options: { ...space, mode: "every" } });
  assert.equal(plan.columnsAdded, 3);
  applyAll(session, plan.requests);
  assert.deepEqual(session.grid().row(2), ["d e", "d", "e", null]);
});

test("split reports a refusal when no value contains the separator", () => {
  const session = new EditSession(sheetOf([["city"], ["Pune"], ["Rome"]]));
  const plan = planSplitColumn({ sheet: session.view(), column: 0, headerRow: true, options: space });
  assert.match(plan.refused ?? "", /nothing to split/);
  assert.equal(plan.requests.length, 0);
});

test("split never changes formula cells", () => {
  const base = sheetOf([["name"], ["Asha Patil"], ["Ben Rome"]]);
  base.formulas.set(cellKey(2, 0), "CONCAT(A2,A3)");
  const session = new EditSession(base);
  const plan = planSplitColumn({ sheet: session.view(), column: 0, headerRow: true, options: space });
  assert.deepEqual(plan.skipped, [{ reason: "Formula cells, left unchanged.", count: 1 }]);
  applyAll(session, plan.requests);
  assert.equal(session.grid().get(2, 1), null);
});

test("split keeps numbers and single values as the first part, so removing the original loses nothing", () => {
  const session = new EditSession(sheetOf([["n"], [12], ["5 6"]]));
  const plan = planSplitColumn({ sheet: session.view(), column: 0, headerRow: true, options: space, removeOriginal: true });
  applyAll(session, plan.requests);
  assert.equal(session.grid().get(1, 0), 12);
  assert.equal(session.grid().get(1, 1), null);
  assert.deepEqual([session.grid().get(2, 0), session.grid().get(2, 1)], ["5", "6"]);
});

test("split is refused when it would pass the Excel column limit", () => {
  const sheet = sheetOf([["x"], ["a b"]]);
  sheet.columnCount = 16384;
  const plan = planSplitColumn({ sheet, column: 0, headerRow: true, options: space });
  assert.match(plan.refused ?? "", /more than the 16,384/);
});

test("combine joins columns in the chosen order with the chosen separator", () => {
  const session = new EditSession(sheetOf([["first", "last", "city"], ["Asha", "Patil", "Pune"], ["Ben", "", "Rome"]]));
  const plan = planCombineColumns({ sheet: session.view(), columns: [1, 0], name: "full name", headerRow: true, options: { separator: " ", skipEmpty: true } });
  applyAll(session, plan.requests);
  assert.equal(session.grid().get(0, 3), "full name");
  assert.equal(session.grid().get(1, 3), "Patil Asha");
  assert.equal(session.grid().get(2, 3), "Ben");
  assert.equal(session.stats().columnsAdded, 1);
});

test("combine keeps the originals by default and can remove them", () => {
  const keep = new EditSession(sheetOf([["a", "b"], ["x", "y"]]));
  applyAll(keep, planCombineColumns({ sheet: keep.view(), columns: [0, 1], name: "ab", headerRow: true, options: { separator: "-", skipEmpty: true } }).requests);
  assert.deepEqual(keep.grid().row(1), ["x", "y", "x-y"]);

  const drop = new EditSession(sheetOf([["a", "b", "c"], ["x", "y", "z"]]));
  const plan = planCombineColumns({ sheet: drop.view(), columns: [0, 1], name: "ab", headerRow: true, options: { separator: ", ", skipEmpty: true }, removeOriginals: true });
  assert.equal(plan.requests.length, 2);
  applyAll(drop, plan.requests);
  assert.deepEqual(drop.grid().row(1), ["z", "x, y"]);
});

test("combine with no separator and empty values keeps the text tidy", () => {
  const session = new EditSession(sheetOf([["a", "b", "c"], ["x", null, "z"]]));
  applyAll(session, planCombineColumns({ sheet: session.view(), columns: [0, 1, 2], name: "all", headerRow: true, options: { separator: "", skipEmpty: true } }).requests);
  assert.equal(session.grid().get(1, 3), "xz");
});

test("combine needs at least two different columns", () => {
  const session = new EditSession(sheetOf([["a", "b"], ["x", "y"]]));
  assert.match(planCombineColumns({ sheet: session.view(), columns: [0], name: "n", headerRow: true, options: { separator: " ", skipEmpty: true } }).refused ?? "", /at least two/);
  assert.match(planCombineColumns({ sheet: session.view(), columns: [0, 0], name: "n", headerRow: true, options: { separator: " ", skipEmpty: true } }).refused ?? "", /only once/);
});

test("combined values longer than an Excel cell are left empty and counted", () => {
  const long = "x".repeat(EXCEL_MAX_CELL_CHARS);
  const session = new EditSession(sheetOf([["a", "b"], [long, "y"], ["p", "q"]]));
  const plan = planCombineColumns({ sheet: session.view(), columns: [0, 1], name: "n", headerRow: true, options: { separator: " ", skipEmpty: true } });
  assert.deepEqual(plan.skipped, [{ reason: "Combined values longer than an Excel cell allows (32,767 characters), left empty.", count: 1 }]);
  applyAll(session, plan.requests);
  assert.equal(session.grid().get(1, 2), null);
  assert.equal(session.grid().get(2, 2), "p q");
});

test("combine examples show before and after for the first rows", () => {
  const session = new EditSession(sheetOf([["a", "b"], ["x", "y"]]));
  const plan = planCombineColumns({ sheet: session.view(), columns: [0, 1], name: "n", headerRow: true, options: { separator: ", ", skipEmpty: true } });
  assert.deepEqual(plan.examples, [{ row: 2, before: ["x", "y"], after: ["x, y"] }]);
});
