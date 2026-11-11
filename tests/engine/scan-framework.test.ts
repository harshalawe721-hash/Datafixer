/** Stage 3, Step 1: cell classification, column profiles and the scan framework. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Cat, classify, datePatternOf, isDateTextCat } from "../../src/engine/scan/classify.ts";
import { runScan, cellCat, columnKind, type CheckFactory } from "../../src/engine/scan/scan.ts";
import { parseCsv } from "../../src/engine/csv/parse-csv.ts";
import { EngineCore } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";

const csvSheet = async (text: string) => (await parseCsv(new Blob([text]), "S")).sheet;
const noop = () => {};

test("classify: empty, blank and whitespace (incl. non-breaking space)", () => {
  assert.equal(classify(null, false, false), Cat.Empty);
  assert.equal(classify("", false, false), Cat.Empty);
  assert.equal(classify("   ", false, false), Cat.Blank);
  assert.equal(classify("\u00a0\t", false, false), Cat.Blank);
});

test("classify: numbers, numeric text, leading zeros", () => {
  assert.equal(classify(42, false, false), Cat.Number);
  for (const s of ["42", "-3.5", "+7", "1e6", ".5", "007", " 12 "]) assert.equal(classify(s, false, false), Cat.NumericText, s);
});

test("classify: formatted numbers (incl. European) but not phone numbers or codes", () => {
  for (const s of ["1,234", "1,234.56", "1.234,56", "1 234", "$12", "€1,200", "12%", "(5)", "5-", "1,5", "£ 3,000.00"]) {
    assert.equal(classify(s, false, false), Cat.FormattedNumber, s);
  }
  for (const s of ["₹500", "¥1,000", "¢50"]) assert.equal(classify(s, false, false), Cat.FormattedNumber, s);
  for (const s of ["+1 555 123 4567", "A1", "v2.0", "Room 12", "abc", "Über 5", "東京 3", "user12@example.com"]) {
    assert.equal(classify(s, false, false), Cat.Text, s);
  }
});

test("classify: dates (Excel and text patterns)", () => {
  assert.equal(classify(45322, false, true), Cat.Date);
  const cases: [string, string][] = [
    ["2024-01-31", "iso"],
    ["2024-01-31T10:20:30Z", "iso-time"],
    ["2024-01-31 14:30", "iso-time"],
    ["2024/01/31", "ymd-slash"],
    ["31/01/2024", "dmy-or-mdy-slash"],
    ["01-31-2024", "dmy-or-mdy-dash"],
    ["31.01.2024", "dmy-dot"],
    ["31/01/24", "short-year-slash"],
    ["31 Jan 2024", "d-mon-y"],
    ["31-January-2024", "d-mon-y"],
    ["Jan 31, 2024", "mon-d-y"],
    ["September 5 2023", "mon-d-y"],
  ];
  for (const [s, id] of cases) {
    const cat = classify(s, false, false);
    assert.ok(isDateTextCat(cat), s);
    assert.equal(datePatternOf(cat), id, s);
  }
});

test("classify: booleans and errors", () => {
  assert.equal(classify(true, false, false), Cat.Boolean);
  assert.equal(classify("FALSE", false, false), Cat.Boolean);
  assert.equal(classify("true", false, false), Cat.Boolean);
  assert.equal(classify("#N/A", false, false), Cat.Error);
  assert.equal(classify("#DIV/0!", false, false), Cat.Error);
  assert.equal(classify("anything", true, false), Cat.Error);
  assert.equal(classify("#hashtag", false, false), Cat.Text);
});

test("profiles: counts, kinds, leading zeros, examples, header excluded", async () => {
  const sheet = await csvSheet(
    "id,zip,amount,joined,name,mixed\n" +
      "1,00501,10.5,2024-01-31,Ann,x\n" +
      "2,02134,\"1,200\",31/01/2024,Bob,1\n" +
      "3,10001,7,2024-02-01,,2024-01-01\n" +
      "4,94105,-2,2024-03-01,Eve,\n" +
      "5,00601,0,2024-04-01,Zoë,TRUE\n",
  );
  const { result } = await runScan(sheet, { headerRow: true });
  assert.equal(result.rows, 5);
  assert.equal(result.columns, 6);
  const [id, zip, amount, joined, name, mixed] = result.profiles;
  assert.equal(id!.name, "id");
  assert.equal(id!.kind, "number");
  assert.equal(zip!.kind, "number");
  assert.equal(zip!.leadingZero, 3, "00501, 02134, 00601");
  assert.equal(amount!.counts.formattedNumber, 1);
  assert.equal(amount!.counts.numericText, 4);
  assert.equal(joined!.kind, "date");
  assert.deepEqual(joined!.datePatterns, { iso: 4, "dmy-or-mdy-slash": 1 });
  assert.equal(name!.kind, "text");
  assert.equal(name!.nonEmpty, 4);
  assert.equal(name!.empty, 1);
  assert.equal(mixed!.kind, "mixed");
  assert.equal(mixed!.empty, 1);
  assert.deepEqual(name!.examples, ["Ann", "Bob", "Eve"]);
});

test("profiles: without a header row, the first row is checked as data", async () => {
  const sheet = await csvSheet("a,b\n1,2\n3,4\n");
  const { result } = await runScan(sheet, { headerRow: false });
  assert.equal(result.rows, 3);
  assert.equal(result.profiles[0]!.name, null);
  assert.equal(result.profiles[0]!.kind, "mixed", "'a' plus 2 numbers is 67% numeric, below the 80% threshold");
});

test("profiles: short (ragged) rows count as empty, whitespace counts as blank", async () => {
  const sheet = await csvSheet("a,b,c\n1,2,3\n4\n5,  ,6\n");
  const { result, ctx } = await runScan(sheet, { headerRow: true });
  const [, b, c] = result.profiles;
  assert.equal(b!.empty, 1);
  assert.equal(b!.blank, 1);
  assert.equal(c!.empty, 1);
  assert.equal(cellCat(ctx, 2, 2), Cat.Empty, "beyond the end of a short row");
  assert.equal(cellCat(ctx, 3, 1), Cat.Blank);
});

test("column kind thresholds", () => {
  const p = (counts: Partial<Record<string, number>>, nonEmpty: number) =>
    columnKind({ nonEmpty, counts: { number: 0, numericText: 0, formattedNumber: 0, date: 0, dateText: 0, boolean: 0, error: 0, text: 0, ...counts } } as never);
  assert.equal(p({ number: 8, text: 2 }, 10), "number");
  assert.equal(p({ number: 7, text: 3 }, 10), "mixed");
  assert.equal(p({ number: 8, error: 5 }, 13), "number", "errors don't decide the type");
  assert.equal(p({}, 0), "empty");
});

test("Excel profile: real dates, numbers and error cells", async () => {
  const core = new EngineCore();
  await core.open(new File([readFileSync(new URL("../fixtures/excel/lo-features.xlsx", import.meta.url))], "f.xlsx"), "xlsx", {}, noop);
  const result = await core.scan("Data", { headerRow: true }, noop);
  const byName = Object.fromEntries(result.profiles.map((p) => [p.name, p]));
  assert.equal(byName.Amount!.kind, "number");
  assert.equal(byName.Date!.kind, "date");
  assert.equal(byName.Date!.counts.date, 4, "Excel date-formatted numbers");
  assert.equal(byName.Formula!.counts.error, 2, "#DIV/0! and #N/A");
  assert.equal(byName.Active!.kind, "boolean");
});

test("pass 2: every check sees every stored cell once, rows in order", async () => {
  const sheet = await csvSheet("h1,h2\na,b\nc\n,d\n");
  const seen: string[] = [];
  const rowsEnded: number[] = [];
  const check: CheckFactory = () => ({
    cell: (r, c, cat, v) => seen.push(`${r}:${c}:${cat}:${v}`),
    endRow: (r) => rowsEnded.push(r),
    finish: () => [{ issue: { id: "t", severity: "note", title: "t", count: seen.length, unit: "cells", explanation: "", howToFix: "" } }],
  });
  const { result } = await runScan(sheet, { headerRow: true, checks: [check, check] });
  assert.deepEqual(rowsEnded, [1, 1, 2, 2, 3, 3]);
  assert.equal(seen.length, 10, "5 stored cells × 2 checks");
  assert.ok(seen.includes(`3:0:${Cat.Empty}:null`));
  assert.equal(result.issues.length, 2);
});

test("progress is monotonic and reaches the total; cancellation stops the scan", async () => {
  const sheet = await csvSheet("a,b\n" + "1,x\n".repeat(50000));
  const marks: number[] = [];
  let total = 0;
  const noopCheck: CheckFactory = () => ({ cell() {}, finish: () => [] });
  await runScan(sheet, { headerRow: true, checks: [noopCheck], onProgress: (d, t) => { marks.push(d); total = t; } });
  assert.equal(total, 100000);
  assert.equal(marks[marks.length - 1], total);
  for (let i = 1; i < marks.length; i++) assert.ok(marks[i]! >= marks[i - 1]!);

  const token = { cancelled: false };
  await assert.rejects(
    runScan(sheet, { headerRow: true, cancel: token, onProgress: () => (token.cancelled = true) }),
    (e: unknown) => e instanceof EngineError && e.code === "cancelled",
  );
});

test("memory budget: an oversized scan is refused with a clear message", async () => {
  const sheet = await csvSheet("a,b\n" + "1,x\n".repeat(10000));
  await assert.rejects(runScan(sheet, { headerRow: true, memoryBudgetBytes: 1000 }), (e: unknown) => e instanceof EngineError && e.code === "too-large-for-engine");
});

test("engine: scan result, and the scan is released when another sheet loads", async () => {
  const core = new EngineCore();
  await core.open(new File([readFileSync(new URL("../fixtures/excel/lo-multisheet.xlsx", import.meta.url))], "m.xlsx"), "xlsx", {}, noop);
  const r = await core.scan("January", { headerRow: true }, noop);
  assert.equal(r.rows, 100);
  assert.equal(r.cells, 200);
  assert.deepEqual(r.issues, []);
  await core.loadSheet("Février", noop);
  await assert.rejects(core.scan("January", { headerRow: true }, noop), (e: unknown) => e instanceof EngineError && e.code === "sheet-not-found");
});

test("performance: pass 1 over 1M rows × 6 columns", async () => {
  const rows = ["id,name,email,city,amount,date"];
  for (let i = 0; i < 1_000_000; i++) rows.push(`${i},Name ${i},u${i}@example.com,City ${i % 500},${(i * 1.5).toFixed(2)},2024-01-${String((i % 28) + 1).padStart(2, "0")}`);
  const sheet = (await parseCsv(new Blob([rows.join("\n")]), "S")).sheet;
  const t = Date.now();
  const { result } = await runScan(sheet, { headerRow: true });
  const ms = Date.now() - t;
  console.log(`    pass 1, 1M rows × 6 cols: ${ms} ms`);
  assert.equal(result.rows, 1_000_000);
  assert.deepEqual(result.profiles.map((p) => p.kind), ["number", "text", "text", "text", "number", "date"]);
  assert.ok(ms < 15000, `took ${ms} ms`);
});
