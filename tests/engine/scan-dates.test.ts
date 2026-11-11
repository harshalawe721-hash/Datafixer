/** Stage 3, Step 4: check H (dates) with exact expected counts. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runScan, type Finding } from "../../src/engine/scan/scan.ts";
import { ALL_CHECKS } from "../../src/engine/scan/checks/index.ts";
import { inconsistentDates, isPossibleDate } from "../../src/engine/scan/checks/dates.ts";
import { parseCsv } from "../../src/engine/csv/parse-csv.ts";
import { EngineCore } from "../../src/engine/core.ts";
import { createSheet, cellKey } from "../../src/engine/types.ts";
import { WorkbookGrid } from "../../src/engine/grid.ts";

const csv = async (text: string) => (await parseCsv(new Blob([text]), "S")).sheet;
const find = (f: Finding[], id: string) => f.find((x) => x.issue.id === id);

// rows 1..6; columns: 0 id | 1 joined | 2 born | 3 visit | 4 mixed | 5 amb
const PLANTED =
  "id,joined,born,visit,mixed,amb\n" +
  "1,2024-01-31,31/01/1990,2024-01-31,13/01/2024,03/04/2024\n" +
  "2,2024-02-01,15/06/1985,2024-02-30,01/14/2024,05/06/2024\n" +
  "3,31/01/2024,28/02/1999,2024-13-01,14/02/2024,07/08/2024\n" +
  "4,2024-03-01,29/02/2023,2024-03-01,15/03/2024,09/10/2024\n" +
  "5,TBD,01/12/2000,2024-04-01,16/04/2024,11/12/2024\n" +
  "6,2024-04-15,10/10/2010,2024-05-01,17/05/2024,05/05/2024\n";

test("planted file: exact counts for inconsistent, impossible and ambiguous dates", async () => {
  const { findings } = await runScan(await csv(PLANTED), { headerRow: true, checks: [inconsistentDates] });

  const inc = find(findings, "inconsistent-dates")!;
  assert.equal(inc.issue.count, 3, "joined: 31/01/2024 + TBD; mixed: the one month-first date");
  assert.deepEqual(Array.from(inc.cells!), [cellKey(2, 4), cellKey(3, 1), cellKey(5, 1)]);
  assert.deepEqual(inc.issue.columns!.map((c) => [c.name, c.count]), [["joined", 2], ["mixed", 1]]);
  assert.match(inc.issue.explanation, /1 value that isn't a date/);
  assert.match(inc.issue.explanation, /mix day-first and month-first/);
  assert.match(inc.issue.explanation, /joined: 2024-01-31 \(4\), 31\/01\/2024 or 01\/31\/2024 \(1\), not a date \(1\)/);

  const imp = find(findings, "impossible-dates")!;
  assert.equal(imp.issue.severity, "error");
  assert.equal(imp.issue.count, 3, "29/02/2023, 2024-02-30, 2024-13-01");
  assert.deepEqual(Array.from(imp.cells!), [cellKey(2, 3), cellKey(3, 3), cellKey(4, 2)]);

  const amb = find(findings, "ambiguous-dates")!;
  assert.equal(amb.issue.severity, "note");
  assert.equal(amb.issue.count, 5, "05/05/2024 reads the same either way");
  assert.deepEqual(amb.issue.columns!.map((c) => c.name), ["amb"]);
  assert.match(amb.issue.examples![0]!.note!, /day 3 of month 4, or month 3 day 4/);
});

test("a column with proof of day-first order reads its other values day-first (not ambiguous)", async () => {
  const { findings } = await runScan(await csv("d\n31/01/2024\n03/04/2024\n05/06/2024\n"), { headerRow: true, checks: [inconsistentDates] });
  assert.deepEqual(findings, []);
});

test("consistent columns produce nothing; time and month-name variants are one format", async () => {
  const text = "a,b,c\n2024-01-31,Jan 5 2024,31 Jan 2024\n2024-02-01 10:30,January 6 2024,1 February 2024\n2024-02-02T08:00:00Z,Feb 7 2024,2 Feb 2024\n";
  const { findings } = await runScan(await csv(text), { headerRow: true, checks: [inconsistentDates] });
  assert.deepEqual(findings, []);
});

test("columns that aren't mostly dates are not checked", async () => {
  const { findings } = await runScan(await csv("note\n2024-01-01\nhello\nworld\nfoo\nbar\n"), { headerRow: true, checks: [inconsistentDates] });
  assert.deepEqual(findings, []);
});

test("Excel: real dates mixed with dates typed as text", async () => {
  const s = createSheet("X");
  const f = new Uint16Array([1]);
  s.grid = new WorkbookGrid([["d"], [45322], [45323], ["2024-01-05"], [45325], [45326]], [undefined, f, f, undefined, f, f], ["General", "yyyy-mm-dd"], null, 0, (fmt) => fmt.includes("yy"));
  s.columnCount = 1;
  const { findings } = await runScan(s, { headerRow: true, checks: [inconsistentDates] });
  const inc = find(findings, "inconsistent-dates")!;
  assert.equal(inc.issue.count, 1);
  assert.match(inc.issue.examples![0]!.note!, /real Excel dates/);
});

test("possible-date rules: leap years, month lengths, two-digit years", () => {
  assert.equal(isPossibleDate("dm-slash", "29/02/2024", "dmy"), true);
  assert.equal(isPossibleDate("dm-slash", "29/02/2023", "dmy"), false);
  assert.equal(isPossibleDate("iso", "2023-02-29", "unknown"), false);
  assert.equal(isPossibleDate("iso", "2000-02-29", "unknown"), true, "2000 is a leap year");
  assert.equal(isPossibleDate("iso", "1900-02-29", "unknown"), false, "1900 is not");
  assert.equal(isPossibleDate("d-mon-y", "31 Apr 2024", "unknown"), false);
  assert.equal(isPossibleDate("mon-d-y", "Feb 29, 2024", "unknown"), true);
  assert.equal(isPossibleDate("dmy-dot", "31.12.2024", "unknown"), true);
  assert.equal(isPossibleDate("dm-short", "31/12/99", "dmy"), true);
  assert.equal(isPossibleDate("dm-slash", "13/13/2024", "unknown"), false);
  assert.equal(isPossibleDate("dm-slash", "12/31/2024", "unknown"), true, "valid month-first");
  assert.equal(isPossibleDate("dm-slash", "12/31/2024", "dmy"), false, "but not day-first");
});

test("Excel fixture: real dates produce no date issues", async () => {
  const core = new EngineCore();
  await core.open(new File([readFileSync(new URL("../fixtures/excel/lo-features.xlsx", import.meta.url))], "f.xlsx"), "xlsx", {}, () => {});
  const r = await core.scan("Data", { headerRow: true }, () => {});
  assert.ok(!r.issues.some((i) => i.id.includes("dates")));
});

test("registered in ALL_CHECKS", () => {
  assert.ok(ALL_CHECKS.includes(inconsistentDates));
});
