import { test } from "node:test";
import assert from "node:assert/strict";
import { CompactTextGrid, ArrayGrid } from "../../src/engine/grid.ts";

test("compact grid stores and returns cells exactly across chunks", () => {
  const g = new CompactTextGrid();
  g.appendRows([["a", "bb", ""], ["Zürich", "東京😀"]]);
  g.appendRows([[""], ["x", "", "y", "z"]]);
  assert.equal(g.rowCount, 4);
  assert.deepEqual([0, 1, 2, 3].map((r) => g.row(r)), [["a", "bb", ""], ["Zürich", "東京😀"], [""], ["x", "", "y", "z"]]);
  assert.equal(g.rowLength(3), 4);
  assert.equal(g.get(1, 5), null, "missing cell is null");
  assert.equal(g.get(9, 0), null, "missing row is null");
  assert.equal(g.get(0, -1), null);
});

test("dropLastRow within and across chunks", () => {
  const g = new CompactTextGrid();
  g.appendRows([["1"], ["2"]]);
  g.appendRows([[""]]);
  g.dropLastRow();
  assert.equal(g.rowCount, 2);
  assert.deepEqual(g.row(1), ["2"]);
  g.dropLastRow();
  assert.equal(g.rowCount, 1);
  assert.deepEqual(g.row(0), ["1"]);
});

test("many chunks: binary search finds the right row", () => {
  const g = new CompactTextGrid();
  for (let k = 0; k < 200; k++) g.appendRows(Array.from({ length: (k % 7) + 1 }, (_, i) => [`${k}-${i}`]));
  let r = 0;
  for (let k = 0; k < 200; k++) for (let i = 0; i < (k % 7) + 1; i++) assert.equal(g.get(r++, 0), `${k}-${i}`);
  assert.equal(r, g.rowCount);
});

test("approxBytes reflects one/two-byte text", () => {
  const a = new CompactTextGrid();
  a.appendRows([["abcdefghij"]]);
  const b = new CompactTextGrid();
  b.appendRows([["東京東京東京東京東京"]]);
  assert.ok(b.approxBytes > a.approxBytes);
});

test("array grid", () => {
  const g = new ArrayGrid([[1, true, null], ["x"]]);
  assert.equal(g.get(0, 1), true);
  assert.equal(g.get(1, 3), null);
  assert.equal(g.rowLength(0), 3);
});
