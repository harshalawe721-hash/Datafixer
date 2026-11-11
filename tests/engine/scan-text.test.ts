/** Stage 3, Step 3: checks E–G with exact expected counts and false-alarm guards. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runScan, type Finding } from "../../src/engine/scan/scan.ts";
import { ALL_CHECKS } from "../../src/engine/scan/checks/index.ts";
import { extraSpaces, inconsistentCase, numbersAsText, isIdentifierColumn, revealEdges } from "../../src/engine/scan/checks/text.ts";
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
const find = (f: Finding[], id: string) => f.find((x) => x.issue.id === id);

// rows: 0 header | 1 Ann | 2 Bob | 3 Cat | 4 Dan | 5 Eve | 6 Fay | 7 Gus | 8 Hal | 9 Ivy | 10 Jo
const PLANTED =
  "name,city,amount,zip,qty\n" +
  "Ann ,Paris,10,00501,1\n" +
  'Bob,paris,"1,200",02134,2\n' +
  " Cat,Paris,30,10001,3\n" +
  "Dan,PARIS,40,94105,4\n" +
  "Eve,London,'50,00601,5\n" +
  "Fay,london,60,12345,6\n" +
  "Gus,Berlin,70,54321,7\n" +
  "Hal,Paris,80,11111,8\n" +
  "Ivy,Rome ,90,22222,9\n" +
  "Jo,Paris,100,33333,10\n";

test("planted file: exact counts for E–G", async () => {
  const { findings } = await runScan(await csv(PLANTED), { headerRow: true, checks: ALL_CHECKS });

  const sp = find(findings, "extra-spaces")!;
  assert.equal(sp.issue.count, 3);
  assert.deepEqual(Array.from(sp.cells!), [cellKey(1, 0), cellKey(3, 0), cellKey(9, 1)]);
  assert.match(sp.issue.explanation, /1 cell with invisible non-breaking spaces/);
  assert.deepEqual(sp.issue.examples!.map((e) => e.value), ["“Ann·”", "“·Cat”", "“Rome⍽”"]);

  const cs = find(findings, "inconsistent-case")!;
  assert.equal(cs.issue.count, 3, "paris, PARIS (vs Paris ×4) and london (vs London)");
  assert.match(cs.issue.explanation, /^2 values are written with different capitalization/);
  assert.deepEqual(Array.from(cs.cells!), [cellKey(2, 1), cellKey(4, 1), cellKey(6, 1)]);
  assert.equal(cs.issue.examples!.find((e) => e.value === "paris")!.note, "Usually written “Paris” (4×)");

  const nt = find(findings, "numbers-as-text")!;
  assert.equal(nt.issue.count, 2, '"1,200" and "\'50"; ZIP codes with leading zeros are never flagged');
  assert.deepEqual(Array.from(nt.cells!), [cellKey(2, 2), cellKey(5, 2)]);
  assert.deepEqual(nt.issue.columns!.map((c) => c.name), ["amount"]);
});

test("extra spaces: numbers, blank cells and inner spaces are not flagged", async () => {
  const s = arraySheet([["a", "b"], [5, "two words"], ["   ", "x"]]);
  const { findings } = await runScan(s, { headerRow: true, checks: [extraSpaces] });
  assert.equal(find(findings, "extra-spaces"), undefined);
  assert.equal(revealEdges("\tx "), "“⇥x·”");
});

test("capitalization: single letters, number/date columns and exact repeats are not flagged", async () => {
  const { findings } = await runScan(await csv("grade,code,when\na,10,2024-01-01\nA,20,2024-01-02\nB,30,2024-01-03\nB,40,2024-01-04\n"), { headerRow: true, checks: [inconsistentCase] });
  assert.equal(find(findings, "inconsistent-case"), undefined);
});

test("capitalization: columns with too many different values are skipped (memory safety)", async () => {
  const rows = ["name"];
  for (let i = 0; i < 20_001; i++) rows.push(`person ${String.fromCharCode(97 + (i % 26))}${i}`);
  rows.push("Alice", "alice");
  const { findings } = await runScan(await csv(rows.join("\n")), { headerRow: true, checks: [inconsistentCase] });
  assert.equal(find(findings, "inconsistent-case"), undefined);
});

test("numbers as text (Excel-like): text numbers among real numbers; leading zeros and 16-digit IDs excluded", async () => {
  const s = arraySheet([["amount"], [10], [20], ["30"], [40], [50], ["60"], ["1234567890123456"]]);
  const { findings } = await runScan(s, { headerRow: true, checks: [numbersAsText] });
  const nt = find(findings, "numbers-as-text")!;
  assert.equal(nt.issue.count, 2);
  assert.deepEqual(Array.from(nt.cells!), [cellKey(3, 0), cellKey(6, 0)]);
  assert.match(nt.issue.howToFix, /Convert to Number/);
});

test("numbers as text: identifier columns (by leading zeros or by name) are skipped", async () => {
  const lz = arraySheet([["ref"], [1], [2], [3], ["007"], ["008"], ["9"]]);
  assert.equal(find((await runScan(lz, { headerRow: true, checks: [numbersAsText] })).findings, "numbers-as-text"), undefined);
  const named = arraySheet([["order_id"], [1], [2], [3], [4], ["5"]]);
  assert.equal(find((await runScan(named, { headerRow: true, checks: [numbersAsText] })).findings, "numbers-as-text"), undefined);
  assert.equal(isIdentifierColumn({ name: "Customer ID", counts: { numericText: 0 }, leadingZero: 0 } as never), true);
  assert.equal(isIdentifierColumn({ name: "Paid", counts: { numericText: 10 }, leadingZero: 0 } as never), false);
});

test("numbers as text: consistently formatted columns are left alone (cautious)", async () => {
  const { findings } = await runScan(await csv('price\n"$10.00"\n"$20.00"\n"$30.00"\n'), { headerRow: true, checks: [numbersAsText] });
  assert.equal(find(findings, "numbers-as-text"), undefined);
  const half = await runScan(await csv('n\n"1,000"\n"2,000"\n3\n4\n'), { headerRow: true, checks: [numbersAsText] });
  assert.equal(find(half.findings, "numbers-as-text"), undefined, "no clear majority: not reported");
});

test("Excel fixture: no false alarms from E–G", async () => {
  const core = new EngineCore();
  await core.open(new File([readFileSync(new URL("../fixtures/excel/lo-features.xlsx", import.meta.url))], "f.xlsx"), "xlsx", {}, () => {});
  const r = await core.scan("Data", { headerRow: true }, () => {});
  const ids = r.issues.map((i) => i.id);
  for (const id of ["extra-spaces", "inconsistent-case", "numbers-as-text"]) assert.ok(!ids.includes(id), id);
});
