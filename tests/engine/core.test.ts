import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineCore, featureWarnings } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";
import { buildXlsx, sheetXml } from "./fixtures.ts";
import { emptyFeatures } from "../../src/engine/xlsx/inspect.ts";

const noop = () => {};

test("CSV: open, summary and paging", async () => {
  const core = new EngineCore();
  const s = await core.open(new File(["name,qty\nA,1\nB,2\nC,=1+1\n"], "x.csv"), "csv", {}, noop);
  assert.equal(s.fileName, "x.csv");
  assert.equal(s.format, "csv");
  assert.deepEqual(s.sheets.map((x) => x.name), ["Sheet1"]);
  assert.deepEqual(s.sheetStats.Sheet1, { rows: 4, columns: 2 });
  assert.equal(s.headerGuess, true);
  assert.equal(s.csv?.delimiter, ",");
  assert.ok(s.warnings.some((w) => /start with =/.test(w)));
  assert.equal(s.sheetError, null);
  const page = core.getRows("Sheet1", { offset: 0, limit: 10, headerRow: true });
  assert.equal(page.total, 3);
  assert.deepEqual(page.header, ["name", "qty"]);
});

test("progress is reported while parsing CSV", async () => {
  const core = new EngineCore();
  const phases: string[] = [];
  await core.open(new File(["a,b\n" + "1,2\n".repeat(50000)], "x.csv"), "csv", {}, (p) => phases.push(p.phase));
  assert.ok(phases.includes("parsing"));
});

test("XLSX: inspection plus cell reading", async () => {
  const core = new EngineCore();
  const zip = buildXlsx([
    { name: "Data", xml: sheetXml([["a", "b"], ["1", "2"]]) },
    { name: "Old", state: "hidden" },
  ], { "xl/charts/chart1.xml": "<c/>" });
  const s = await core.open(new File([zip as BlobPart], "book.xlsx"), "xlsx", {}, noop);
  assert.deepEqual(s.sheets.map((x) => [x.name, x.state]), [["Data", "visible"], ["Old", "hidden"]]);
  assert.deepEqual(s.sheets[0]!.declared, { rows: 2, columns: 2 });
  assert.equal(s.activeSheet, "Data");
  assert.equal(s.features?.charts, 1);
  assert.ok(s.warnings.some((w) => /1 chart/.test(w)));
  assert.equal(s.sheetError, null);
  assert.deepEqual(s.sheetStats.Data, { rows: 2, columns: 2 });
  const page = core.getRows("Data", { offset: 0, limit: 5, headerRow: true });
  assert.deepEqual(page.header, ["a", "b"]);
  assert.deepEqual(page.rows[0]!.cells, ["1", "2"]);
});

test("XLS: a file with an OLE header but no workbook is reported as unreadable", async () => {
  const core = new EngineCore();
  const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0]);
  await assert.rejects(core.open(new File([ole as BlobPart], "old.xls"), "xls", {}, noop), (e: unknown) => e instanceof EngineError);
});

test("unsafe XLSX is rejected before any parsing", async () => {
  const core = new EngineCore();
  const evil = buildXlsx([{ name: "S", xml: '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "b">]><worksheet/>' }]);
  await assert.rejects(core.open(new File([evil as BlobPart], "e.xlsx"), "xlsx", {}, noop), (e: unknown) => e instanceof EngineError && e.code === "unsafe-content");
});

test("opening a new file releases the previous one", async () => {
  const core = new EngineCore();
  await core.open(new File(["a\n1\n"], "one.csv"), "csv", {}, noop);
  await assert.rejects(core.open(new File([""], "empty.csv"), "csv", {}, noop), (e: unknown) => e instanceof EngineError && e.code === "empty-file");
  assert.equal(core.getSheet("Sheet1"), null);
});

test("cancellation token stops CSV parsing", async () => {
  const core = new EngineCore();
  const token = { cancelled: false };
  const p = core.open(new File(["a,b\n" + "1,2\n".repeat(2_000_000)], "big.csv"), "csv", {}, () => (token.cancelled = true), token);
  await assert.rejects(p, (e: unknown) => e instanceof EngineError && e.code === "cancelled");
});

test("forced delimiter option is applied", async () => {
  const core = new EngineCore();
  const s = await core.open(new File(["a;b,c\n1;2,3\n"], "x.csv"), "csv", { delimiter: "," }, noop);
  assert.equal(s.csv?.delimiter, ",");
  assert.deepEqual(s.sheetStats.Sheet1, { rows: 2, columns: 2 });
});

test("feature warnings wording", () => {
  assert.deepEqual(featureWarnings(emptyFeatures()), []);
  const w = featureWarnings({ ...emptyFeatures(), charts: 2, dataValidation: true, macros: true });
  assert.match(w[0]!, /2 charts and data validation rules/);
  assert.ok(w.some((x) => /never runs macros/.test(x)));
});
