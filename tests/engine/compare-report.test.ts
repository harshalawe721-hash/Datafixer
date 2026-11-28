/** Stage 17, Step 2: the difference report (CSV and Excel with coloured cells), with or without unchanged rows; cell colours in the Excel writer. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { EngineCore } from "../../src/engine/core.ts";
import { readEntryText, readZipEntries } from "../../src/engine/xlsx/zip.ts";
import { verifyNewXlsx, writeXlsx, type SheetSource } from "../../src/engine/export/xlsx-writer.ts";

const noop = () => {};
const csv = (name: string, text: string) => ({ file: new File([text], name), format: "csv" as const });
const opts = { ignoreCase: false, ignoreSpaces: false };
const OLD = "id,name,city,price,note\n001,Asha,Pune,10,x\n002,Ben,Oslo,20,y\n003,Cher,Lima,30,z\n004,Dev,Pune,40,w\n";
const NEW = "id,price,name,city,stock\n001,10,Asha,Pune,5\n002,25,Ben,,6\n004,40,Dev,Delhi,7\n005,50,Eva,Rome,8\n";
const text = async (b: Blob) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await b.arrayBuffer());

/** Cell reference → its fill colour (or null), read from the workbook's XML. */
async function colours(blob: Blob): Promise<Map<string, string | null>> {
  const entries = await readZipEntries(blob);
  const get = (n: string) => readEntryText(blob, entries.find((e) => e.name === n)!);
  const styles = await get("xl/styles.xml");
  const fills = (styles.match(/<fills[^>]*>([\s\S]*?)<\/fills>/)![1]!.match(/<fill>[\s\S]*?<\/fill>/g) ?? []).map((f) => /rgb="FF([0-9A-F]{6})"/.exec(f)?.[1] ?? null);
  const xfs = styles.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)![1]!.match(/<xf [^>]*\/>/g)!.map((x) => fills[Number(/fillId="(\d+)"/.exec(x)![1])] ?? null);
  const sheet = await get("xl/worksheets/sheet1.xml");
  const out = new Map<string, string | null>();
  for (const m of sheet.matchAll(/<c r="([A-Z]+\d+)"(?: s="(\d+)")?/g)) out.set(m[1]!, xfs[Number(m[2] ?? 0)] ?? null);
  return out;
}

test("CSV report: newer rows in order, then removed rows; Change and What changed columns; older-only columns last", async () => {
  const core = new EngineCore();
  await core.compareFiles(csv("old.csv", OLD), csv("new.csv", NEW), opts, noop);
  const r = await core.exportCompareReport("csv", { includeUnchanged: true }, noop);
  assert.equal(r.summary.downloadName, "new - differences.csv");
  assert.equal(r.summary.rows, 5);
  assert.equal(
    await text(r.blob),
    "﻿Change,id,price,name,city,stock,note,What changed\r\n" +
      "Unchanged,001,10,Asha,Pune,5,x,\r\n" +
      "Changed,002,25,Ben,,6,y,price: 20 → 25; city: Oslo → (empty)\r\n" +
      "Changed,004,40,Dev,Delhi,7,w,city: Pune → Delhi\r\n" +
      "Added,005,50,Eva,Rome,8,,\r\n" +
      "Removed,003,30,Cher,Lima,,z,\r\n",
  );
  assert.equal(r.summary.verification.rows, 6);
  const only = await core.exportCompareReport("csv", { includeUnchanged: false }, noop);
  assert.equal(only.summary.rows, 4);
  assert.ok(!(await text(only.blob)).includes("Unchanged"));
});

test("Excel report: codes keep their zeros, numbers are numbers, the Change label and changed cells are coloured (also a value that became empty)", async () => {
  const core = new EngineCore();
  await core.compareFiles(csv("old.csv", OLD), csv("new.csv", NEW), opts, noop);
  const r = await core.exportCompareReport("xlsx", { includeUnchanged: true }, noop);
  assert.equal(r.summary.downloadName, "new - differences.xlsx");
  const ws = XLSX.read(new Uint8Array(await r.blob.arrayBuffer())).Sheets.Differences!;
  assert.equal(ws.B2!.v, "001");
  assert.equal(ws.C3!.v, 25);
  assert.equal(ws.H3!.v, "price: 20 → 25; city: Oslo → (empty)");
  const c = await colours(r.blob);
  assert.equal(c.get("A1"), null, "header not coloured");
  assert.equal(c.get("A2"), null, "Unchanged not coloured");
  assert.equal(c.get("A3"), "FFF2CC", "Changed label");
  assert.equal(c.get("C3"), "FFF2CC", "changed price");
  assert.equal(c.get("E3"), "FFF2CC", "a city that became empty is still coloured");
  assert.equal(c.get("D3"), null, "unchanged name");
  assert.equal(c.get("A5"), "E2EFDA", "Added label");
  assert.equal(c.get("A6"), "FCE4D6", "Removed label");
  assert.equal(c.get("C5"), null, "added rows' cells are not coloured");
});

test("repeated keys are marked in the report", async () => {
  const core = new EngineCore();
  await core.compareFiles(csv("a.csv", "id,v\n7,a\n7,b\n"), csv("b.csv", "id,v\n7,a\n7,x\n"), { ...opts, keys: ["id"] }, noop);
  const r = await core.exportCompareReport("csv", { includeUnchanged: true }, noop);
  assert.equal(await text(r.blob), "﻿Change,id,v,What changed\r\nUnchanged (repeated key),7,a,\r\nChanged (repeated key),7,x,v: b → x\r\n");
});

test("a report with no differences left (unchanged rows left out) still has its header", async () => {
  const core = new EngineCore();
  await core.compareFiles(csv("a.csv", "id,v\n1,a\n"), csv("b.csv", "id,v\n1,a\n"), opts, noop);
  const r = await core.exportCompareReport("xlsx", { includeUnchanged: false }, noop);
  assert.equal(r.summary.rows, 0);
  assert.deepEqual(XLSX.utils.sheet_to_json(XLSX.read(new Uint8Array(await r.blob.arrayBuffer())).Sheets.Differences!, { header: 1 }), [["Change", "id", "v", "What changed"]]);
});

test("Excel writer: cell colours are written and checked; a wrong colour fails the check", async () => {
  const sheets: SheetSource[] = [{ name: "S", rowCount: 2, colCount: 3, header: true, row: (r) => (r === 0 ? [{ t: "s", v: "a" }, { t: "s", v: "b" }, { t: "s", v: "c" }] : [{ t: "s", v: "x", fill: "FFF2CC" }, { t: "n", v: 1.5, fmt: "0.00", fill: "E2EFDA" }, { t: "s", v: "", fill: "FCE4D6" }]) }];
  const w = await writeXlsx(sheets);
  assert.deepEqual(await verifyNewXlsx(w.blob, sheets, w.sheetNames), { rows: 2, cells: 6 });
  const c = await colours(w.blob);
  assert.deepEqual([c.get("A2"), c.get("B2"), c.get("C2")], ["FFF2CC", "E2EFDA", "FCE4D6"]);
  const ws = XLSX.read(new Uint8Array(await w.blob.arrayBuffer())).Sheets.S!;
  assert.equal(ws.B2!.w, "1.50", "the number format is kept with the colour");
  const wrong: SheetSource[] = [{ ...sheets[0]!, row: (r) => (r === 0 ? sheets[0]!.row(0) : [{ t: "s", v: "x" }, { t: "n", v: 1.5, fmt: "0.00", fill: "E2EFDA" }, { t: "s", v: "", fill: "FCE4D6" }]) }];
  await assert.rejects(verifyNewXlsx(w.blob, wrong, w.sheetNames), /didn't pass/);
  await assert.rejects(writeXlsx([{ ...sheets[0]!, row: (r) => (r === 0 ? sheets[0]!.row(0) : [{ t: "s", v: "x", fill: "red" }]) }]), /Unknown cell colour/);
});
