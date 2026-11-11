/** Stage 3, Step 2: checks A–D with exact expected counts (planted problems). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runScan, type Finding } from "../../src/engine/scan/scan.ts";
import { ALL_CHECKS } from "../../src/engine/scan/checks/index.ts";
import { duplicateRows, emptyColumns, emptyRows, missingCells } from "../../src/engine/scan/checks/structure.ts";
import { parseCsv } from "../../src/engine/csv/parse-csv.ts";
import { EngineCore } from "../../src/engine/core.ts";
import { createSheet, cellKey, type CellValue } from "../../src/engine/types.ts";
import { ArrayGrid } from "../../src/engine/grid.ts";

const csv = async (text: string) => (await parseCsv(new Blob([text]), "S")).sheet;
const arraySheet = (rows: CellValue[][]) => {
  const s = createSheet("A");
  s.grid = new ArrayGrid(rows);
  s.columnCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return s;
};
const find = (findings: Finding[], id: string) => findings.find((f) => f.issue.id === id);

// Sheet rows (0-based): 0 header | 1 Ann | 2 Bob | 3 empty | 4 Ann (dup) | 5 Cat (no email)
// | 6 Dan (short row: no amount) | 7 empty | 8 Bob (dup) | 9 Ann (dup)
const PLANTED =
  "id,name,email,amount,notes,\n" +
  "1,Ann,a@x.com,10,,\n" +
  "2,Bob,b@x.com,20,,\n" +
  ",,,,,\n" +
  "1,Ann,a@x.com,10,,\n" +
  "3,Cat,,30,,\n" +
  "4,Dan,d@x.com\n" +
  ",,,,,\n" +
  "2,Bob,b@x.com,20,,\n" +
  "1,Ann,a@x.com,10,,\n";

test("planted file: exact counts for A–D", async () => {
  const { result, findings } = await runScan(await csv(PLANTED), { headerRow: true, checks: ALL_CHECKS });
  assert.equal(result.rows, 9);

  const dup = find(findings, "duplicate-rows")!;
  assert.equal(dup.issue.count, 3, "Ann ×3 (2 extra) + Bob ×2 (1 extra)");
  assert.match(dup.issue.explanation, /2 groups/);
  assert.deepEqual(Array.from(dup.rows!), [1, 2, 4, 8, 9], "all members of duplicate groups");
  assert.deepEqual(dup.issue.examples!.map((e) => [e.row, e.note]), [[4, "Same as row 2"], [8, "Same as row 3"], [9, "Same as row 2"]]);

  const er = find(findings, "empty-rows")!;
  assert.equal(er.issue.count, 2);
  assert.deepEqual(Array.from(er.rows!), [3, 7]);

  const ec = find(findings, "empty-columns")!;
  assert.equal(ec.issue.count, 2, "named 'notes' + unnamed trailing column");
  assert.deepEqual(ec.columns, [4, 5]);
  assert.match(ec.issue.explanation, /“notes” \(column E\)/);

  const mc = find(findings, "missing-cells")!;
  assert.equal(mc.issue.count, 2, "Cat's email + Dan's amount (short row); empty rows/columns excluded");
  assert.deepEqual(Array.from(mc.cells!), [cellKey(5, 2), cellKey(6, 3)]);
  assert.deepEqual(Array.from(mc.rows!), [5, 6]);
  assert.deepEqual(mc.issue.columns!.map((c) => [c.name, c.count]).sort(), [["amount", 1], ["email", 1]]);
});

test("issues are ordered by severity then count, and clean checks report nothing", async () => {
  const { result } = await runScan(await csv(PLANTED), { headerRow: true, checks: ALL_CHECKS });
  assert.deepEqual(result.issues.map((i) => i.id), ["duplicate-rows", "empty-rows", "empty-columns", "missing-cells"]);
  const clean = await runScan(await csv("a,b\n1,2\n3,4\n"), { headerRow: true, checks: ALL_CHECKS });
  assert.deepEqual(clean.result.issues, []);
});

test("duplicates: not fooled by column position, types or empty values", async () => {
  // ["a","","b"] vs ["a","b",""] must differ; 1 vs "1" must differ.
  const s = arraySheet([["h1", "h2", "h3"], ["a", null, "b"], ["a", "b", null], [1, "x", null], ["1", "x", null]]);
  const { findings } = await runScan(s, { headerRow: true, checks: [duplicateRows] });
  assert.equal(find(findings, "duplicate-rows"), undefined);
});

test("duplicates: whitespace-only cells count as empty; trailing empties ignored", async () => {
  const s = arraySheet([["h1", "h2"], ["a", "  "], ["a"], ["a", null]]);
  const { findings } = await runScan(s, { headerRow: true, checks: [duplicateRows] });
  assert.equal(find(findings, "duplicate-rows")!.issue.count, 2);
});

test("duplicates: exact match is case- and space-sensitive inside values", async () => {
  const { findings } = await runScan(await csv("n\nAnn\nann\nAnn \n Ann\n"), { headerRow: true, checks: [duplicateRows] });
  assert.equal(find(findings, "duplicate-rows"), undefined);
});

test("duplicates: header row is never compared; without header it is data", async () => {
  const text = "a,b\na,b\n";
  assert.equal(find((await runScan(await csv(text), { headerRow: true, checks: [duplicateRows] })).findings, "duplicate-rows"), undefined);
  assert.equal(find((await runScan(await csv(text), { headerRow: false, checks: [duplicateRows] })).findings, "duplicate-rows")!.issue.count, 1);
});

test("empty rows: whitespace-only rows count; rows with one value don't", async () => {
  const { findings } = await runScan(await csv("a,b\n  ,\t\n,x\n"), { headerRow: true, checks: [emptyRows] });
  assert.deepEqual(Array.from(find(findings, "empty-rows")!.rows!), [1]);
});

test("empty columns: a column under a merged header is not reported (cautious)", async () => {
  const s = arraySheet([["Name", "Contact", null], ["Ann", "a@x.com", null]]);
  s.merges.push({ startRow: 0, startCol: 1, endRow: 0, endCol: 2 });
  const { findings } = await runScan(s, { headerRow: true, checks: [emptyColumns] });
  assert.equal(find(findings, "empty-columns"), undefined);
  s.merges.length = 0;
  assert.equal(find((await runScan(s, { headerRow: true, checks: [emptyColumns] })).findings, "empty-columns")!.issue.count, 1);
});

test("empty columns: a sheet with no data rows reports nothing", async () => {
  const { findings } = await runScan(await csv("a,b\n"), { headerRow: true, checks: ALL_CHECKS });
  assert.deepEqual(findings, []);
});

test("missing cells: whitespace-only cells count; per-column breakdown sorted", async () => {
  const { findings } = await runScan(await csv("a,b,c\n1,,x\n2, ,\n3,4,\n"), { headerRow: true, checks: [missingCells] });
  const mc = find(findings, "missing-cells")!;
  assert.equal(mc.issue.count, 4);
  assert.deepEqual(mc.issue.columns!.map((c) => [c.name, c.count]), [["b", 2], ["c", 2]]);
});

test("Excel fixture: real workbook gives sensible results", async () => {
  const core = new EngineCore();
  await core.open(new File([readFileSync(new URL("../fixtures/excel/lo-features.xlsx", import.meta.url))], "f.xlsx"), "xlsx", {}, () => {});
  const r = await core.scan("Data", { headerRow: true }, () => {});
  const ids = r.issues.map((i) => i.id);
  assert.ok(!ids.includes("duplicate-rows"));
  assert.ok(!ids.includes("empty-rows"));
  // H ('Merged header') has a name but no data below it: a genuine empty column.
  // I sits under the merged header cell, so it is not reported (cautious).
  const ec = r.issues.find((i) => i.id === "empty-columns")!;
  assert.deepEqual(ec.columns!.map((c) => c.name), ["Merged header"]);
  const mc = r.issues.find((i) => i.id === "missing-cells")!;
  // Link (F) and column G have a value in only one of 4 data rows; H is an empty column, so not counted again.
  assert.deepEqual(mc.columns!.map((c) => [c.name, c.count]), [["Link", 3], ["Column G", 3]]);
  assert.equal(mc.count, 6);
});

test("performance: all checks over 1M rows (10% duplicates)", async () => {
  const rows = ["id,name,email,city,amount"];
  for (let i = 0; i < 1_000_000; i++) {
    const k = i % 10 === 9 ? i - 9 : i; // every 10th row repeats the row 9 earlier
    rows.push(`${k},Name ${k},u${k}@example.com,City ${k % 500},${(k * 1.5).toFixed(2)}`);
  }
  const sheet = (await parseCsv(new Blob([rows.join("\n")]), "S")).sheet;
  const t = Date.now();
  const { findings, result } = await runScan(sheet, { headerRow: true, checks: ALL_CHECKS });
  const ms = Date.now() - t;
  console.log(`    1M rows × 5 cols, pass 1 + all checks: ${ms} ms (profile ${result.timings.profileMs} ms, checks ${result.timings.checksMs} ms)`);
  assert.equal(find(findings, "duplicate-rows")!.issue.count, 100_000);
  assert.equal(findings.length, 1);
  assert.ok(ms < 20000, `took ${ms} ms`);
});
