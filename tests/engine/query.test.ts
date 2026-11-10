import { test } from "node:test";
import assert from "node:assert/strict";
import { SheetQuery, guessHeaderRow, columnLetter, cellText } from "../../src/engine/query/query.ts";
import { createSheet, cellKey, type CellValue } from "../../src/engine/types.ts";
import { ArrayGrid } from "../../src/engine/grid.ts";

function sheetOf(rows: CellValue[][]) {
  const s = createSheet("S");
  s.grid = new ArrayGrid(rows);
  s.columnCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return s;
}

const dataRows: CellValue[][] = [
  ["name", "amount", "city"],
  ["Bob", "10", "Paris"],
  ["alice", "9", "berlin"],
  ["Carol", "", "Zürich"],
  ["dave", "100", "Ålesund"],
  ["Eve", "abc", "Paris"],
];
const data = sheetOf(dataRows);

test("paging with and without header row, original row indexes kept", () => {
  const q = new SheetQuery(data);
  const p = q.getPage({ offset: 0, limit: 2, headerRow: true });
  assert.equal(p.totalUnfiltered, 5);
  assert.deepEqual(p.header, ["name", "amount", "city"]);
  assert.deepEqual(p.rows.map((r) => r.index), [1, 2]);
  const p2 = q.getPage({ offset: 4, limit: 10, headerRow: true });
  assert.deepEqual(p2.rows.map((r) => r.cells[0]), ["Eve"]);
  const p3 = q.getPage({ offset: 0, limit: 1, headerRow: false });
  assert.equal(p3.header, null);
  assert.equal(p3.rows[0]!.cells[0], "name");
  assert.equal(p3.totalUnfiltered, 6);
});

test("numeric sort: numbers before text, empties last in both directions", () => {
  const q = new SheetQuery(data);
  const asc = q.getPage({ offset: 0, limit: 10, headerRow: true, sort: { column: 1, direction: "asc" } });
  assert.deepEqual(asc.rows.map((r) => r.cells[1]), ["9", "10", "100", "abc", ""]);
  const desc = q.getPage({ offset: 0, limit: 10, headerRow: true, sort: { column: 1, direction: "desc" } });
  assert.deepEqual(desc.rows.map((r) => r.cells[1]), ["abc", "100", "10", "9", ""]);
});

test("text sort is case-insensitive and locale-aware", () => {
  const q = new SheetQuery(data);
  const asc = q.getPage({ offset: 0, limit: 10, headerRow: true, sort: { column: 0, direction: "asc" } });
  assert.deepEqual(asc.rows.map((r) => r.cells[0]), ["alice", "Bob", "Carol", "dave", "Eve"]);
});

test("stable sort keeps original order for ties", () => {
  const q = new SheetQuery(data);
  const p = q.getPage({ offset: 0, limit: 10, headerRow: true, sort: { column: 2, direction: "asc" } });
  const paris = p.rows.filter((r) => r.cells[2] === "Paris").map((r) => r.index);
  assert.deepEqual(paris, [1, 5]);
});

test("search is case-insensitive across columns and combines with sort", () => {
  const q = new SheetQuery(data);
  const p = q.getPage({ offset: 0, limit: 10, headerRow: true, search: "PARIS" });
  assert.equal(p.total, 2);
  assert.equal(p.totalUnfiltered, 5);
  const s = q.getPage({ offset: 0, limit: 10, headerRow: true, search: "e", sort: { column: 0, direction: "desc" } });
  assert.deepEqual(s.rows.map((r) => r.cells[0]), ["Eve", "dave", "Carol", "Bob", "alice"].filter((n) => /e/i.test(n + (dataRows.find((r) => r[0] === n)?.join("") ?? ""))));
  assert.equal(q.getPage({ offset: 0, limit: 10, headerRow: true, search: "name" }).total, 0, "header row is not searched");
});

test("column window and ragged rows", () => {
  const s = sheetOf([["a", "b", "c", "d"], ["1"], ["x", "y", "z", "w"]]);
  const p = new SheetQuery(s).getPage({ offset: 0, limit: 5, headerRow: false, columnOffset: 2, columnLimit: 2 });
  assert.equal(p.columnOffset, 2);
  assert.deepEqual(p.rows.map((r) => r.cells), [["c", "d"], ["", ""], ["z", "w"]]);
});

test("limits are clamped", () => {
  const p = new SheetQuery(data).getPage({ offset: -5, limit: 1e9, headerRow: true, sort: { column: 99, direction: "asc" } });
  assert.equal(p.rows.length, 5);
});

test("formula and error markers are reported per visible cell", () => {
  const s = sheetOf([["=", "x"], [1, "#N/A"]]);
  s.formulas.set(cellKey(1, 0), "SUM(A1:A1)");
  s.errors.set(cellKey(1, 1), "#N/A");
  const p = new SheetQuery(s).getPage({ offset: 0, limit: 5, headerRow: true });
  assert.deepEqual(p.rows[0]!.formulaColumns, [0]);
  assert.deepEqual(p.rows[0]!.errorColumns, [1]);
});

test("header guess", () => {
  assert.equal(guessHeaderRow(data), true);
  assert.equal(guessHeaderRow(sheetOf([["1", "2"], ["3", "4"]])), false);
  assert.equal(guessHeaderRow(sheetOf([["a", ""], ["3", "4"]])), false);
  assert.equal(guessHeaderRow(sheetOf([["x", "x"], ["3", "4"]])), false);
  assert.equal(guessHeaderRow(sheetOf([["only"]])), false);
});

test("helpers", () => {
  assert.equal(columnLetter(0), "A");
  assert.equal(columnLetter(25), "Z");
  assert.equal(columnLetter(26), "AA");
  assert.equal(columnLetter(16383), "XFD");
  assert.equal(cellText(true), "TRUE");
  assert.equal(cellText(null), "");
  assert.equal(cellText(1.5), "1.5");
});

test("sorting 300k rows completes quickly", () => {
  const rows: CellValue[][] = [["v"]];
  for (let i = 0; i < 300000; i++) rows.push([String((i * 7919) % 1000003)]);
  const q = new SheetQuery(sheetOf(rows));
  const t = Date.now();
  const p = q.getPage({ offset: 0, limit: 1000, headerRow: true, sort: { column: 0, direction: "asc" } });
  const ms = Date.now() - t;
  const nums = p.rows.map((r) => Number(r.cells[0]));
  assert.equal(nums[0], 0);
  for (let i = 1; i < nums.length; i++) assert.ok(nums[i - 1]! <= nums[i]!, "ascending");
  const last = q.getPage({ offset: 299999, limit: 1, headerRow: true, sort: { column: 0, direction: "asc" } });
  assert.equal(last.rows.length, 1);
  assert.ok(ms < 3000, `took ${ms} ms`);
});
