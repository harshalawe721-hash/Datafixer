/** Stage 12, Step 2: opening JSON in the engine, choosing a list, CSV and Excel downloads, upload checks. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineCore } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";
import type { EditSession } from "../../src/engine/edit/session.ts";
import { JSON_MAX_BYTES, validateSpreadsheet } from "../../src/lib/file-validation.ts";

const noop = () => {};
async function open(text: string, name = "data.json", options = {}) {
  const core = new EngineCore();
  const summary = await core.open(new File([text], name), "json", options, noop);
  return { core, summary, sheet: summary.activeSheet };
}
const rowsOf = (core: EngineCore, sheet: string) => {
  const g = (core as unknown as { session(n: string): EditSession }).session(sheet).grid();
  return Array.from({ length: g.rowCount }, (_, r) => g.row(r));
};

const PEOPLE = JSON.stringify([
  { id: "00123", name: "Asha", age: 30, active: true, address: { city: "Pune" }, phones: ["+91 1", "+91 2"] },
  { id: "00124", name: "Ben", age: null, active: false, card: 4111111111111111 },
]);

test("a JSON list opens as a text table with a header row", async () => {
  const { core, summary, sheet } = await open(PEOPLE);
  assert.equal(summary.format, "json");
  assert.equal(summary.headerGuess, true);
  assert.deepEqual(summary.json, { lines: false, lists: [{ path: "", length: 2 }], path: "", records: 2, listsAsText: 1, longNumbers: 1 });
  assert.deepEqual(rowsOf(core, sheet), [
    ["id", "name", "age", "active", "address.city", "phones", "card"],
    ["00123", "Asha", "30", "true", "Pune", '["+91 1","+91 2"]', null],
    ["00124", "Ben", null, "false", null, null, "4111111111111111"],
  ]);
});

test("CSV download: the table as CSV, named after the file", async () => {
  const { core, sheet } = await open(PEOPLE, "people.json");
  const out = await core.exportCsv(sheet, noop);
  assert.equal(out.summary.downloadName, "people.csv");
  const text = (await out.blob.text()).replace(/^﻿/, "");
  assert.equal(
    text,
    'id,name,age,active,address.city,phones,card\r\n00123,Asha,30,true,Pune,"[""+91 1"",""+91 2""]",\r\n00124,Ben,,false,,,4111111111111111\r\n',
  );
});

test("Excel download: codes and long numbers stay text, plain numbers become numbers", async () => {
  const { core, sheet } = await open(PEOPLE, "people.json");
  const out = await core.convertCsvToXlsx(sheet, { headerRow: true }, noop);
  assert.equal(out.summary.downloadName.endsWith(".xlsx"), true);
  const back = new EngineCore();
  const s = await back.open(new File([out.blob], "b.xlsx"), "xlsx", {}, noop);
  const rows = rowsOf(back, s.activeSheet);
  assert.deepEqual(rows[1]!.slice(0, 3), ["00123", "Asha", 30]);
  assert.equal(rows[2]![6], "4111111111111111");
});

test("a list inside an object: the largest list first, another can be chosen", async () => {
  const json = JSON.stringify({ meta: { page: 1 }, results: [{ a: 1 }, { a: 2 }], extra: { items: [{ b: "x" }] } });
  const first = await open(json);
  assert.deepEqual(first.summary.json!.lists, [
    { path: "results", length: 2 },
    { path: "extra.items", length: 1 },
  ]);
  assert.equal(first.summary.json!.path, "results");
  assert.deepEqual(rowsOf(first.core, first.sheet), [["a"], ["1"], ["2"]]);
  const other = await open(json, "data.json", { jsonPath: "extra.items" });
  assert.equal(other.summary.json!.path, "extra.items");
  assert.deepEqual(rowsOf(other.core, other.sheet), [["b"], ["x"]]);
});

test("an object without lists is one row", async () => {
  const { core, summary, sheet } = await open('{"name":"Asha","city":"Pune"}');
  assert.equal(summary.json!.path, null);
  assert.deepEqual(rowsOf(core, sheet), [["name", "city"], ["Asha", "Pune"]]);
});

test("JSON Lines files (.jsonl)", async () => {
  const { core, summary, sheet } = await open('{"a":1}\n{"a":2,"b":"x"}\n', "data.jsonl");
  assert.equal(summary.json!.lines, true);
  assert.deepEqual(rowsOf(core, sheet), [["a", "b"], ["1", null], ["2", "x"]]);
});

test("invalid JSON is refused with the position of the mistake", async () => {
  await assert.rejects(open('[{"a":1},]'), (e: unknown) => e instanceof EngineError && e.code === "corrupt-file" && /isn't valid JSON: There is a comma before “\]”.*line 1, column 10/.test(e.message));
  await assert.rejects(open('{"a":1}\n{"a":}\n', "x.jsonl"), (e: unknown) => e instanceof EngineError && /isn't valid JSON Lines: .*line 2/.test(e.message));
});

test("text that isn't UTF-8 is refused", async () => {
  const core = new EngineCore();
  await assert.rejects(core.open(new File([new Uint8Array([0x5b, 0x22, 0xe9, 0x22, 0x5d])], "x.json"), "json", {}, noop), /isn't UTF-8 text/);
});

test("a JSON file too large for the device's memory is refused before reading", async () => {
  const core = new EngineCore();
  const big = "[" + '"x",'.repeat(30000) + '"x"]';
  await assert.rejects(core.open(new File([big], "x.json"), "json", { memoryBudgetBytes: 1_000_000 }, noop), (e: unknown) => e instanceof EngineError && e.code === "too-large-for-engine" && /JSON Lines/.test(e.message));
});

test("upload check: .json and .jsonl accepted as text; .json limited to 50 MB", () => {
  const text = new TextEncoder().encode('{"a":1}');
  const opts = { accept: [".json", ".jsonl"], maxBytes: 150 * 1024 * 1024 };
  assert.deepEqual(validateSpreadsheet({ name: "a.json", size: 7 }, text, opts), { ok: true, format: "json" });
  assert.deepEqual(validateSpreadsheet({ name: "a.jsonl", size: 7 }, text, opts), { ok: true, format: "json" });
  const big = validateSpreadsheet({ name: "a.json", size: JSON_MAX_BYTES + 1 }, text, opts);
  assert.equal(big.ok, false);
  assert.match(!big.ok ? big.error : "", /up to 50 MB.*\.jsonl/);
  assert.equal(validateSpreadsheet({ name: "a.jsonl", size: JSON_MAX_BYTES + 1 }, text, opts).ok, true);
  assert.equal(validateSpreadsheet({ name: "a.json", size: 4 }, new Uint8Array([0x50, 0x4b, 3, 4]), opts).ok, false);
  assert.equal(validateSpreadsheet({ name: "a.json", size: 7 }, text, { accept: [".csv"], maxBytes: 100 }).ok, false);
});

// ---------------------------------------------------------------- CSV / Excel → JSON

import { parseJson as readJson, parseJsonLines as readLines } from "../../src/engine/json/parse.ts";
import { writeXlsx } from "../../src/engine/export/xlsx-writer.ts";

async function openCsv(text: string, name = "people.csv") {
  const core = new EngineCore();
  const s = await core.open(new File([text], name), "csv", {}, noop);
  return { core, sheet: s.activeSheet };
}
const CSV = "id,name,age,active,note\n00123,Asha,30,true,\n00124,Ben,4.5,FALSE,hi\n";

test("CSV to JSON: text by default, exactly as written; named after the file", async () => {
  const { core, sheet } = await openCsv(CSV);
  const out = await core.exportJson(sheet, { headerRow: true, detect: false, layout: "pretty" }, noop);
  assert.equal(out.summary.downloadName, "people.json");
  assert.equal(out.summary.records, 2);
  assert.deepEqual(readJson(await out.blob.text()), [
    { id: "00123", name: "Asha", age: "30", active: "true", note: "" },
    { id: "00124", name: "Ben", age: "4.5", active: "FALSE", note: "hi" },
  ]);
});

test("CSV to JSON with detection: numbers, booleans and null; codes stay text", async () => {
  const { core, sheet } = await openCsv(CSV);
  const out = await core.exportJson(sheet, { headerRow: true, detect: true, layout: "compact" }, noop);
  const text = await out.blob.text();
  assert.equal(text, '[{"id":"00123","name":"Asha","age":30,"active":true,"note":null},{"id":"00124","name":"Ben","age":4.5,"active":false,"note":"hi"}]\n');
});

test("JSON Lines output: one record per line, .jsonl", async () => {
  const { core, sheet } = await openCsv(CSV);
  const out = await core.exportJson(sheet, { headerRow: true, detect: true, layout: "lines" }, noop);
  assert.equal(out.summary.downloadName, "people.jsonl");
  const text = await out.blob.text();
  assert.equal(text.split("\n").length, 3);
  assert.equal(readLines(text).length, 2);
});

test("no header row: keys column_1, column_2…; empty and repeated names made unique", async () => {
  const a = await openCsv("x,y\n1,2\n");
  const noHeader = await a.core.exportJson(a.sheet, { headerRow: false, detect: false, layout: "compact" }, noop);
  assert.equal(await noHeader.blob.text(), '[{"column_1":"x","column_2":"y"},{"column_1":"1","column_2":"2"}]\n');
  const b = await openCsv("name,,name\na,b,c\n");
  const p = b.core.previewJson(b.sheet, { headerRow: true, detect: false, layout: "compact" });
  assert.deepEqual(p.keys, ["name", "column_2", "name_2"]);
});

test("preview: the first 3 records exactly as written", async () => {
  const { core, sheet } = await openCsv("a\n1\n2\n3\n4\n5\n");
  const p = core.previewJson(sheet, { headerRow: true, detect: true, layout: "pretty" });
  assert.equal(p.records, 5);
  assert.equal(p.sampleRecords, 3);
  assert.deepEqual(readJson(p.sample), [{ a: 1 }, { a: 2 }, { a: 3 }]);
});

test("an empty sheet gives an empty list", async () => {
  const { core, sheet } = await openCsv("a,b\n");
  const out = await core.exportJson(sheet, { headerRow: true, detect: false, layout: "pretty" }, noop);
  assert.equal(await out.blob.text(), "[]\n");
});

test("Excel to JSON: dates as shown; numbers detected; long text numbers stay text", async () => {
  const { blob } = await writeXlsx([
    {
      name: "S",
      rowCount: 2,
      colCount: 3,
      header: true,
      row: (r) => (r === 0 ? [{ t: "s", v: "joined" }, { t: "s", v: "amount" }, { t: "s", v: "card" }] : [{ t: "n", v: 45366, fmt: "yyyy-mm-dd" }, { t: "n", v: 12.5, fmt: "0.00" }, { t: "s", v: "4111111111111111" }]),
    },
  ]);
  const core = new EngineCore();
  const s = await core.open(new File([blob], "book.xlsx"), "xlsx", {}, noop);
  const out = await core.exportJson(s.activeSheet, { headerRow: true, detect: true, layout: "compact" }, noop);
  assert.deepEqual(readJson(await out.blob.text()), [{ joined: "2024-03-15", amount: 12.5, card: "4111111111111111" }]);
  assert.equal(out.summary.downloadName, "book.json");
});

test("many records are written in pieces and still read back as one list", async () => {
  const lines = ["n"];
  for (let i = 0; i < 12_345; i++) lines.push(String(i));
  const { core, sheet } = await openCsv(lines.join("\n"));
  for (const layout of ["pretty", "compact", "lines"] as const) {
    const text = await (await core.exportJson(sheet, { headerRow: true, detect: true, layout }, noop)).blob.text();
    const back = layout === "lines" ? readLines(text) : (readJson(text) as unknown[]);
    assert.equal(back.length, 12_345, layout);
    assert.deepEqual(back[12_344], { n: 12_344 });
  }
});
