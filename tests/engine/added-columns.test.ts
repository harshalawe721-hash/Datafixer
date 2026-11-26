/** Stage 10, Step 1: columns added after the kept columns, with undo and redo. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EditSession } from "../../src/engine/edit/session.ts";
import { cellOutText } from "../../src/engine/export/csv-export.ts";
import { ArrayGrid } from "../../src/engine/grid.ts";
import { createSheet, type CellValue, type SheetModel } from "../../src/engine/types.ts";
import { EngineError } from "../../src/engine/errors.ts";

function sheetOf(rows: CellValue[][]): SheetModel {
  const s = createSheet("S");
  s.grid = new ArrayGrid(rows);
  s.columnCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return s;
}

const throwsCode = (fn: () => unknown, code: string) => assert.throws(fn, (e: unknown) => e instanceof EngineError && e.code === code);

function sample(): EditSession {
  return new EditSession(
    sheetOf([
      ["name", "city"],
      ["Asha Patil", "Pune"],
      ["Ben", "Rome"],
    ]),
  );
}

test("an added column follows the kept columns and includes the header row", () => {
  const s = sample();
  s.apply({ operation: "split", label: "Split", addColumns: [{ values: ["name (1)", "Asha", "Ben"], reason: "Split a column" }] });
  const v = s.view();
  assert.equal(v.columnCount, 3);
  assert.equal(s.grid().get(0, 2), "name (1)");
  assert.equal(s.grid().get(1, 2), "Asha");
  assert.equal(s.grid().get(2, 2), "Ben");
  assert.equal(s.grid().rowLength(1), 3);
  assert.deepEqual(s.grid().row(1), ["Asha Patil", "Pune", "Asha"]);
});

test("added columns are reported in stats, history and the download plan", () => {
  const s = sample();
  s.apply({ operation: "split", label: "Split", addColumns: [{ values: [null, "x", null], reason: "Split a column" }] });
  assert.equal(s.stats().columnsAdded, 1);
  assert.equal(s.exportPlan().addedColumns, 1);
  assert.equal(s.history()[0]!.columnsAdded, 1);
  const details = s.historyDetails(s.history()[0]!.id);
  assert.equal(details.total, 1);
  assert.deepEqual(details.items[0], { kind: "added", column: "C", cells: 1, reason: "Split a column" });
});

test("undo removes the added columns and redo brings them back", () => {
  const s = sample();
  s.apply({ operation: "combine", label: "Combine", addColumns: [{ values: ["full", "Asha Patil", "Ben Rome"], reason: "Combine" }] });
  assert.equal(s.view().columnCount, 3);
  s.undo();
  assert.equal(s.view().columnCount, 2);
  assert.equal(s.stats().columnsAdded, 0);
  s.redo();
  assert.equal(s.grid().get(2, 2), "Ben Rome");
});

test("two added columns are undone one step at a time, last first", () => {
  const s = sample();
  s.apply({ operation: "split", label: "A", addColumns: [{ values: ["a", "1", "2"], reason: "r" }] });
  s.apply({ operation: "split", label: "B", addColumns: [{ values: ["b", "3", "4"], reason: "r" }] });
  assert.equal(s.view().columnCount, 4);
  s.undo();
  assert.equal(s.view().columnCount, 3);
  assert.equal(s.grid().get(1, 2), "1");
  s.undo();
  assert.equal(s.view().columnCount, 2);
});

test("cells in an added column can't be edited or removed", () => {
  const s = sample();
  s.apply({ operation: "split", label: "Split", addColumns: [{ values: ["x", "y", "z"], reason: "r" }] });
  throwsCode(() => s.apply({ operation: "edit-cell", label: "Edit", cells: [{ row: 1, col: 2, value: "q" }] }), "invalid-edit");
  throwsCode(() => s.apply({ operation: "remove", label: "Remove", deleteColumns: [{ col: 2, reason: "r" }] }), "invalid-edit");
  assert.equal(s.grid().get(1, 2), "y");
});

test("a request that adds columns can't also change cells", () => {
  const s = sample();
  assert.throws(
    () => s.apply({ operation: "mixed", label: "Mixed", cells: [{ row: 1, col: 0, value: "x" }], addColumns: [{ values: [null, null, null], reason: "r" }] }),
    /can't add columns and change cells/,
  );
  assert.equal(s.view().columnCount, 2);
});

test("an added column needs one value per row", () => {
  const s = sample();
  assert.throws(() => s.apply({ operation: "split", label: "S", addColumns: [{ values: ["only one"], reason: "r" }] }), /one value per row/);
});

test("removing an original column keeps the added columns at the right edge", () => {
  const s = sample();
  s.apply({ operation: "combine", label: "Combine", addColumns: [{ values: ["all", "Asha Patil Pune", "Ben Rome"], reason: "Combine" }] });
  s.apply({ operation: "remove", label: "Remove name", deleteColumns: [{ col: 0, reason: "Combine" }] });
  assert.equal(s.view().columnCount, 2);
  assert.equal(s.grid().get(0, 0), "city");
  assert.equal(s.grid().get(1, 0), "Pune");
  assert.equal(s.grid().get(1, 1), "Asha Patil Pune");
  assert.equal(s.grid().rowLength(2), 2);
  s.undo();
  assert.equal(s.view().columnCount, 3);
  assert.equal(s.grid().get(0, 0), "name");
  assert.equal(s.grid().get(1, 2), "Asha Patil Pune");
});

test("CSV text of an added column is plain", () => {
  const s = sample();
  s.apply({ operation: "split", label: "Split", addColumns: [{ values: ["n", 12, true], reason: "r" }] });
  const v = s.view();
  assert.equal(cellOutText(v, 1, 2, false), "12");
  assert.equal(cellOutText(v, 2, 2, false), "TRUE");
});

test("an added column with no values still adds the column", () => {
  const s = sample();
  assert.notEqual(s.apply({ operation: "split", label: "Split", addColumns: [{ values: [null, null, null], reason: "r" }] }), null);
  assert.equal(s.view().columnCount, 3);
});
