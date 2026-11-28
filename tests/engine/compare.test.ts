/** Stage 17, Step 1: comparing two files (columns by name, rows by key or whole row, options, repeated keys, limits). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineCore } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";
import { writeXlsx, type OutCell } from "../../src/engine/export/xlsx-writer.ts";

const noop = () => {};
const csv = (name: string, text: string) => ({ file: new File([text], name), format: "csv" as const });
const opts = { ignoreCase: false, ignoreSpaces: false };

const OLD = "id,name,city,price\n1,Asha,Pune,10\n2,Ben,Oslo,20\n3,Cher,Lima,30\n4,Dev,Pune,40\n";
const NEW = "id,price,name,city,stock\n1,10,Asha,Pune,5\n2,25,Ben,Oslo,6\n4,40,Dev,Delhi,7\n5,50,Eva,Rome,8\n";

test("rows matched by the suggested key: added, removed, changed, unchanged; moved columns are not changes", async () => {
  const core = new EngineCore();
  const s = await core.compareFiles(csv("old.csv", OLD), csv("new.csv", NEW), opts, noop);
  assert.equal(s.suggestedKey, "id");
  assert.deepEqual(s.keys, ["id"]);
  assert.deepEqual(s.counts, { added: 1, removed: 1, changed: 2, unchanged: 1, changedCells: 2 });
  assert.deepEqual(s.columns, [
    { name: "id", inOlder: true, inNewer: true },
    { name: "price", inOlder: true, inNewer: true },
    { name: "name", inOlder: true, inNewer: true },
    { name: "city", inOlder: true, inNewer: true },
    { name: "stock", inOlder: false, inNewer: true },
  ]);
  assert.deepEqual([s.older.rows, s.newer.rows, s.older.header, s.newer.header], [4, 4, true, true]);
  const changed = core.compareDetails("changed", 0, 10);
  assert.equal(changed.total, 2);
  assert.deepEqual(changed.items.map((x) => [x.key, x.olderRow, x.newerRow, x.changes]), [
    ["2", 3, 3, [{ column: "price", old: "20", new: "25" }]],
    ["4", 5, 4, [{ column: "city", old: "Pune", new: "Delhi" }]],
  ]);
  const added = core.compareDetails("added", 0, 10).items;
  assert.deepEqual(added.map((x) => [x.key, x.newerRow, x.olderRow]), [["5", 5, null]]);
  assert.deepEqual(added[0]!.values.map((v) => v.value), ["5", "50", "Eva", "Rome", "8"]);
  const removed = core.compareDetails("removed", 0, 10).items;
  assert.deepEqual(removed.map((x) => [x.key, x.olderRow, x.newerRow]), [["3", 4, null]]);
  assert.deepEqual(removed[0]!.values.map((v) => `${v.column}=${v.value}`), ["id=3", "price=30", "name=Cher", "city=Lima"]);
});

test("column names match ignoring capital letters and spaces; a column only in the older file is reported", async () => {
  const core = new EngineCore();
  const s = await core.compareFiles(csv("a.csv", "ID , Email,Notes\n1,a@x.com,hi\n"), csv("b.csv", "id,EMAIL\n1,a@x.com\n"), opts, noop);
  assert.deepEqual(s.columns, [
    { name: "id", inOlder: true, inNewer: true },
    { name: "EMAIL", inOlder: true, inNewer: true },
    { name: "Notes", inOlder: true, inNewer: false },
  ]);
  assert.deepEqual(s.counts, { added: 0, removed: 0, changed: 0, unchanged: 1, changedCells: 0 });
});

test("without a suitable key, whole rows are compared: identical rows unchanged, others added or removed", async () => {
  const core = new EngineCore();
  const s = await core.compareFiles(csv("a.csv", "name,city\nAsha,Pune\nBen,Oslo\nAsha,Pune\n"), csv("b.csv", "name,city\nAsha,Pune\nBen,Rome\nAsha,Pune\n"), opts, noop);
  assert.equal(s.suggestedKey, null);
  assert.equal(s.keys, null);
  assert.deepEqual(s.counts, { added: 1, removed: 1, changed: 0, unchanged: 2, changedCells: 0 });
  assert.deepEqual(s.repeated, { older: 0, newer: 0, examples: [] }, "repeated whole rows aren't reported as repeated keys");
});

test("a chosen key, several key columns, or whole rows on request", async () => {
  const core = new EngineCore();
  const a = csv("a.csv", "first,last,age\nAsha,Rao,30\nAsha,Sen,40\n");
  const b = csv("b.csv", "first,last,age\nAsha,Rao,31\nAsha,Sen,40\n");
  const two = await core.compareFiles(a, b, { ...opts, keys: ["first", "LAST"] }, noop);
  assert.deepEqual(two.keys, ["first", "last"]);
  assert.deepEqual(two.counts, { added: 0, removed: 0, changed: 1, unchanged: 1, changedCells: 1 });
  assert.equal(core.compareDetails("changed", 0, 5).items[0]!.key, "Asha, Rao");
  const whole = await core.compareFiles(a, b, { ...opts, keys: null }, noop);
  assert.deepEqual(whole.counts, { added: 1, removed: 1, changed: 0, unchanged: 1, changedCells: 0 });
  await assert.rejects(core.compareFiles(a, csv("c.csv", "first,age\nAsha,1\n"), { ...opts, keys: ["last"] }, noop), /isn't in both files/);
});

test("ignore capital letters and spaces at the start and end (values and keys)", async () => {
  const core = new EngineCore();
  const a = csv("a.csv", "code,name\nAB1,Asha Rao\nCD2,Ben\n");
  const b = csv("b.csv", "code,name\nab1 ,ASHA RAO\n CD2,Ben \n");
  const exact = await core.compareFiles(a, b, { ...opts, keys: ["code"] }, noop);
  assert.deepEqual([exact.counts.added, exact.counts.removed], [2, 2]);
  const loose = await core.compareFiles(a, b, { ignoreCase: true, ignoreSpaces: true, keys: ["code"] }, noop);
  assert.deepEqual(loose.counts, { added: 0, removed: 0, changed: 0, unchanged: 2, changedCells: 0 });
  const spacesOnly = await core.compareFiles(a, b, { ignoreCase: false, ignoreSpaces: true, keys: ["name"] }, noop);
  assert.deepEqual([spacesOnly.counts.unchanged, spacesOnly.counts.added], [1, 1]);
});

test("repeated keys are reported with examples and matched in order", async () => {
  const core = new EngineCore();
  const s = await core.compareFiles(csv("a.csv", "id,v\n7,a\n7,b\n8,c\n"), csv("b.csv", "id,v\n7,a\n7,x\n8,c\n9,d\n9,e\n"), { ...opts, keys: ["id"] }, noop);
  assert.deepEqual(s.repeated, { older: 1, newer: 2, examples: ["7", "9"] });
  assert.deepEqual(s.counts, { added: 2, removed: 0, changed: 1, unchanged: 2, changedCells: 1 });
  const ch = core.compareDetails("changed", 0, 5).items[0]!;
  assert.deepEqual([ch.olderRow, ch.newerRow, ch.repeated, ch.changes[0]!.new], [3, 3, true, "x"]);
});

test("files without column names are matched by position", async () => {
  const core = new EngineCore();
  const s = await core.compareFiles(csv("a.csv", "1,2\n3,4\n5,6\n"), csv("b.csv", "1,2\n3,9\n5,6\n7,8\n"), opts, noop);
  assert.equal(s.older.header, false);
  assert.deepEqual(s.columns.map((c) => c.name), ["Column A", "Column B"]);
  assert.equal(s.suggestedKey, "Column A");
  assert.deepEqual(s.counts, { added: 1, removed: 0, changed: 1, unchanged: 2, changedCells: 1 });
});

test("a CSV file against an Excel file: values compared as shown; the sheet can be chosen", async () => {
  const sheet = (name: string, rows: (string | number)[][]) => ({ name, rowCount: rows.length, colCount: rows[0]!.length, header: true, row: (r: number): OutCell[] => rows[r]!.map((v) => (typeof v === "number" ? { t: "n", v } : { t: "s", v })) });
  const { blob } = await writeXlsx([sheet("Old", [["id", "amount"], ["001", 1]]), sheet("Prices", [["id", "amount"], ["001", 12.5], ["002", 3]])]);
  const book = { file: new File([blob], "book.xlsx"), format: "xlsx" as const };
  const core = new EngineCore();
  const first = await core.compareFiles(book, csv("new.csv", "id,amount\n001,12.5\n002,4\n"), opts, noop);
  assert.deepEqual([first.older.sheet, first.older.sheets], ["Old", ["Old", "Prices"]]);
  const s = await core.compareFiles({ ...book, sheet: "Prices" }, csv("new.csv", "id,amount\n001,12.5\n002,4\n"), opts, noop);
  assert.equal(s.older.sheet, "Prices");
  assert.deepEqual(s.counts, { added: 0, removed: 0, changed: 1, unchanged: 1, changedCells: 1 });
  assert.equal(s.keys?.[0], "id");
  assert.deepEqual(core.compareDetails("changed", 0, 5).items[0]!.changes, [{ column: "amount", old: "3", new: "4" }]);
});

test("empty lines are left out, and a large comparison finds every change", async () => {
  const core = new EngineCore();
  const s = await core.compareFiles(csv("a.csv", "id,v\n1,a\n\n2,b\n"), csv("b.csv", "id,v\n1,a\n2,b\n\n"), opts, noop);
  assert.deepEqual(s.counts, { added: 0, removed: 0, changed: 0, unchanged: 2, changedCells: 0 });
  const rows = 60_000;
  const make = (f: (i: number) => string) => "id,v\n" + Array.from({ length: rows }, (_, i) => `${i},${f(i)}`).join("\n") + "\n";
  // Newer: rows in reverse order, every 1,000th value changed, the last 10 rows removed, 5 rows added.
  const newer = "id,v\n" + Array.from({ length: rows - 10 }, (_, k) => rows - 11 - k).map((i) => `${i},${i % 1000 === 0 ? "changed" : `v${i}`}`).join("\n") + "\n" + [1, 2, 3, 4, 5].map((k) => `new${k},x`).join("\n") + "\n";
  const big = await core.compareFiles(csv("a.csv", make((i) => `v${i}`)), csv("b.csv", newer), opts, noop);
  assert.deepEqual(big.counts, { added: 5, removed: 10, changed: 60, unchanged: rows - 10 - 60, changedCells: 60 });
});

test("limits: no columns in common, too large together, an empty file, the memory stop", async () => {
  const core = new EngineCore();
  await assert.rejects(core.compareFiles(csv("a.csv", "x\n1\n"), csv("b.csv", "y\n1\n"), opts, noop), /no columns in common/);
  await assert.rejects(core.compareFiles(csv("a.csv", "x\n1\n"), csv("b.csv", ""), opts, noop), (e: unknown) => e instanceof EngineError && /newer file, “b.csv”, is empty/.test(e.message));
  const big = { file: { name: "big.csv", size: 151 * 1024 * 1024, lastModified: 0 } as File, format: "csv" as const };
  await assert.rejects(core.compareFiles(big, csv("b.csv", "x\n1\n"), opts, noop), /up to 150 MB can be compared/);
  const rows = "id,v\n" + Array.from({ length: 5000 }, (_, i) => `${i},value ${i}`).join("\n") + "\n";
  await assert.rejects(core.compareFiles(csv("a.csv", rows), csv("b.csv", rows), { ...opts, memoryBudgetBytes: 200 * 1024 }, noop), /too large to compare safely/);
});

test("the column-names choice per file overrides detection, both ways, without reading the files again", async () => {
  const core = new EngineCore();
  // Years as column names look like data, so detection says “no names”.
  const years = [csv("a.csv", "2024,2025\n10,20\n11,21\n"), csv("b.csv", "2024,2025\n10,20\n11,22\n")] as const;
  const guessed = await core.compareFiles(years[0], years[1], opts, noop);
  assert.deepEqual([guessed.older.header, guessed.older.headerDetected, guessed.columns.map((c) => c.name)], [false, false, ["Column A", "Column B"]]);
  const named = await core.compareFiles({ ...years[0], header: true }, { ...years[1], header: true }, opts, noop);
  assert.deepEqual([named.older.header, named.older.headerDetected, named.older.rows], [true, false, 2]);
  assert.deepEqual(named.columns.map((c) => c.name), ["2024", "2025"]);
  assert.equal(named.keys?.[0], "2024");
  assert.deepEqual(named.counts, { added: 0, removed: 0, changed: 1, unchanged: 1, changedCells: 1 });
  // Names only in the first file, data rows starting with a name: detection takes “Asha, Pune” as names, so Asha's row is lost.
  const people = [csv("p1.csv", "Asha,Pune\nBen,Oslo\n"), csv("p2.csv", "Asha,Pune\nBen,Rome\n")] as const;
  const lost = await core.compareFiles(people[0], people[1], opts, noop);
  assert.deepEqual([lost.older.header, lost.newer.rows], [true, 1]);
  const all = await core.compareFiles({ ...people[0], header: false }, { ...people[1], header: false }, opts, noop);
  assert.deepEqual([all.older.header, all.older.headerDetected, all.newer.rows], [false, true, 2]);
  assert.deepEqual(all.counts, { added: 0, removed: 0, changed: 1, unchanged: 1, changedCells: 1 });
  assert.deepEqual(core.compareDetails("changed", 0, 5).items[0]!.changes, [{ column: "Column B", old: "Oslo", new: "Rome" }]);
  // One file with names and one without: matched by position, names taken from the file that has them.
  const mixed = await core.compareFiles({ ...years[0], header: true }, years[1], opts, noop);
  assert.deepEqual([mixed.older.header, mixed.newer.header, mixed.columns.map((c) => c.name)], [true, false, ["2024", "2025"]]);
  assert.deepEqual(mixed.counts, { added: 1, removed: 0, changed: 1, unchanged: 1, changedCells: 1 }, "the newer file's first row (2024, 2025) is now a data row, so it is added");
});
