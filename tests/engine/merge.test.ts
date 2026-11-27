/** Stage 15, Step 1: merging tables. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { TableMerger } from "../../src/engine/merge/merge.ts";

/** Merges in-memory tables; `rows` reads the result back with empty cells as null and rows padded to full width. */
const merge = (inputs: [string, (string | null)[][], boolean][], o = { sourceColumn: false, removeDuplicates: false }) => {
  const m = new TableMerger(o);
  for (const [name, t, header] of inputs) m.add(name, { rowCount: t.length, rowLength: (r) => t[r]!.length, text: (r, c) => t[r]![c] ?? "" }, header);
  const result = m.finish();
  const g = result.grid;
  let width = 0;
  for (let r = 0; r < g.rowCount; r++) width = Math.max(width, g.rowLength(r));
  const rows = Array.from({ length: g.rowCount }, (_, r) => Array.from({ length: width }, (_, c) => (g.get(r, c) === "" ? null : g.get(r, c))));
  return { ...result, rows };
};

test("columns are matched by name, whatever their order", () => {
  const r = merge([
    ["jan.csv", [["id", "name"], ["1", "Asha"]], true],
    ["feb.csv", [["name", "id"], ["Ben", "2"]], true],
  ]);
  assert.deepEqual(r.rows, [["id", "name"], ["1", "Asha"], ["2", "Ben"]]);
  assert.deepEqual(r.columns, [{ name: "id", files: 2 }, { name: "name", files: 2 }]);
});

test("names differing only in capital letters or spaces match; the first spelling is kept", () => {
  const r = merge([
    ["a.csv", [["Email", "City"], ["a@x.com", "Pune"]], true],
    ["b.csv", [[" email ", "CITY"], ["b@x.com", "Rome"]], true],
  ]);
  assert.deepEqual(r.rows, [["Email", "City"], ["a@x.com", "Pune"], ["b@x.com", "Rome"]]);
});

test("a column found in only some files is added at the end and left empty elsewhere", () => {
  const r = merge([
    ["a.csv", [["id", "name"], ["1", "Asha"]], true],
    ["b.csv", [["id", "phone", "name"], ["2", "+39", "Ben"]], true],
  ]);
  assert.deepEqual(r.rows, [["id", "name", "phone"], ["1", "Asha", null], ["2", "Ben", "+39"]]);
  assert.deepEqual(r.columns[2], { name: "phone", files: 1 });
});

test("the Source file column says where each row came from", () => {
  const r = merge(
    [
      ["jan.csv", [["id"], ["1"], ["2"]], true],
      ["feb.xlsx", [["id"], ["3"]], true],
    ],
    { sourceColumn: true, removeDuplicates: false },
  );
  assert.deepEqual(r.rows, [["Source file", "id"], ["jan.csv", "1"], ["jan.csv", "2"], ["feb.xlsx", "3"]]);
});

test("rows that appear more than once are removed when asked (ignoring the source), the first kept", () => {
  const r = merge(
    [
      ["a.csv", [["id", "name"], ["1", "Asha"], ["2", "Ben"]], true],
      ["b.csv", [["name", "id"], ["Asha", "1"], ["Cher", "3"]], true],
    ],
    { sourceColumn: true, removeDuplicates: true },
  );
  assert.equal(r.duplicatesRemoved, 1);
  assert.deepEqual(r.rows, [["Source file", "id", "name"], ["a.csv", "1", "Asha"], ["a.csv", "2", "Ben"], ["b.csv", "3", "Cher"]]);
  const kept = merge([["a.csv", [["x"], ["1"], ["1"]], true]]);
  assert.equal(kept.rows.length, 3, "nothing removed when not asked");
});

test("files without column names are matched by position", () => {
  const r = merge([
    ["a.csv", [["id", "name"], ["1", "Asha"]], true],
    ["b.csv", [["2", "Ben", "extra"]], false],
  ]);
  assert.deepEqual(r.rows, [["id", "name", "Column 3"], ["1", "Asha", null], ["2", "Ben", "extra"]]);
  const none = merge([
    ["a.csv", [["1", "Asha"]], false],
    ["b.csv", [["2", "Ben"]], false],
  ]);
  assert.equal(none.headerRow, false);
  assert.deepEqual(none.rows, [["1", "Asha"], ["2", "Ben"]]);
});

test("empty rows are skipped, empty text becomes an empty cell, a repeated name in one file stays separate", () => {
  const r = merge([["a.csv", [["n", "n"], ["1", ""], [null, ""], ["", "2"]], true]]);
  assert.deepEqual(r.rows, [["n", "n (2)"], ["1", null], [null, "2"]]);
});
