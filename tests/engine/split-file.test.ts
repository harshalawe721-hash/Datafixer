/** Stage 16, Step 1: splitting one file into several (rows per part, equal parts, by column value), CSV and Excel parts, the ZIP. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { EngineCore } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";
import { readZipEntries, streamEntry } from "../../src/engine/xlsx/zip.ts";
import { writeXlsx, type OutCell } from "../../src/engine/export/xlsx-writer.ts";
import { safeFileNamePart, SPLIT_MAX_VALUES } from "../../src/engine/split/split-file.ts";

const noop = () => {};
async function openCsv(name: string, text: string) {
  const core = new EngineCore();
  const t = await core.open(new File([text], name), "csv", {}, noop);
  return { core, sheet: t.activeSheet };
}
const people = (n: number, sep = ",", eol = "\n") =>
  ["id", "name", "city"].join(sep) + eol + Array.from({ length: n }, (_, i) => [`00${i + 1}`, `P${i + 1}`, ["Pune", "Oslo", "Lima"][i % 3]].join(sep)).join(eol) + eol;
const text = async (b: Blob) => new TextDecoder("utf-8", { ignoreBOM: true }).decode(await b.arrayBuffer());
const lines = async (b: Blob) => (await text(b)).replace(/^﻿/, "").split(/\r?\n/).filter((l) => l !== "");
const rowsMode = (rowsPerPart: number) => ({ mode: "rows" as const, rowsPerPart, headerRow: true });

test("rows per part: the header is repeated, rows stay in order, the last part has the rest", async () => {
  const { core, sheet } = await openCsv("people.csv", people(10));
  const p = await core.previewSplitFile(sheet, rowsMode(4), "csv");
  assert.deepEqual(p.parts.map((x) => [x.fileName, x.rows, x.firstRow, x.lastRow]), [
    ["people-part-01.csv", 4, 2, 5],
    ["people-part-02.csv", 4, 6, 9],
    ["people-part-03.csv", 2, 10, 11],
  ]);
  assert.equal(p.dataRows, 10);
  assert.deepEqual(p.csv, { delimiter: ",", lineEnding: "\n", bom: true });
  const last = await core.exportSplitPart(sheet, rowsMode(4), 2, "csv", noop);
  assert.equal(last.fileName, "people-part-03.csv");
  assert.deepEqual(await lines(last.blob), ["id,name,city", "009,P9,Lima", "0010,P10,Pune"]);
  assert.equal(last.verification.rows, 3);
  assert.ok((await text(last.blob)).startsWith("﻿"));
});

test("equal parts differ by at most one row; without column names no header is added", async () => {
  const { core, sheet } = await openCsv("n.csv", "1\n2\n3\n4\n5\n6\n7\n");
  const input = { mode: "parts" as const, parts: 3, headerRow: false };
  const p = await core.previewSplitFile(sheet, input, "csv");
  assert.deepEqual(p.parts.map((x) => x.rows), [3, 2, 2]);
  assert.deepEqual(await lines((await core.exportSplitPart(sheet, input, 0, "csv", noop)).blob), ["1", "2", "3"]);
  assert.deepEqual(await lines((await core.exportSplitPart(sheet, input, 2, "csv", noop)).blob), ["6", "7"]);
});

test("by column value: one part per value in order of appearance, empty values last, names safe for files", async () => {
  const csv = "id,city\n1,Pune\n2,Oslo\n3,\n4,Pune\n5,a/b:c\n6,Oslo\n";
  const { core, sheet } = await openCsv("orders.csv", csv);
  const input = { mode: "column" as const, column: 1, headerRow: true };
  const p = await core.previewSplitFile(sheet, input, "csv");
  assert.equal(p.columnName, "city");
  assert.deepEqual(p.parts.map((x) => [x.fileName, x.value, x.rows]), [
    ["orders-Pune.csv", "Pune", 2],
    ["orders-Oslo.csv", "Oslo", 2],
    ["orders-a_b_c.csv", "a/b:c", 1],
    ["orders-empty.csv", "(empty)", 1],
  ]);
  assert.deepEqual(await lines((await core.exportSplitPart(sheet, input, 0, "csv", noop)).blob), ["id,city", "1,Pune", "4,Pune"]);
  assert.deepEqual(await lines((await core.exportSplitPart(sheet, input, 3, "csv", noop)).blob), ["id,city", "3,"]);
});

test("by column value: values are exact (Pune and pune are two parts) and same-named files are told apart", async () => {
  const { core, sheet } = await openCsv("t.csv", "k\nPune\npune\nPUNE?\nPUNE*\n");
  const p = await core.previewSplitFile(sheet, { mode: "column", column: 0, headerRow: true }, "csv");
  assert.deepEqual(p.parts.map((x) => x.fileName), ["t-Pune.csv", "t-pune (2).csv", "t-PUNE_.csv", "t-PUNE_ (2).csv"]);
});

test("refusals: one part, too many parts, too many values, the same value everywhere", async () => {
  const { core, sheet } = await openCsv("p.csv", people(10));
  const refused = async (input: Parameters<EngineCore["previewSplitFile"]>[1], re: RegExp) =>
    assert.rejects(core.previewSplitFile(sheet, input, "csv"), (e: unknown) => e instanceof EngineError && re.test(e.message));
  await refused(rowsMode(10), /just one part/);
  await refused(rowsMode(0), /whole number/);
  await refused({ mode: "parts", parts: 11, headerRow: true }, /at most 10 parts/);
  await refused({ mode: "parts", parts: 1001, headerRow: true }, /Up to 1,000/);
  await refused({ mode: "parts", parts: 1, headerRow: true }, /from 2 to 1,000/);
  const many = await openCsv("m.csv", "id\n" + Array.from({ length: 1100 }, (_, i) => i).join("\n") + "\n");
  await assert.rejects(many.core.previewSplitFile(many.sheet, rowsMode(1), "csv"), /1,100 parts; up to 1,000.*at least 2/);
  await assert.rejects(many.core.previewSplitFile(many.sheet, { mode: "column", column: 0, headerRow: true }, "csv"), new RegExp(`more than ${SPLIT_MAX_VALUES} different values`));
  const same = await openCsv("s.csv", "k,v\na,1\na,2\n");
  await assert.rejects(same.core.previewSplitFile(same.sheet, { mode: "column", column: 0, headerRow: true }, "csv"), /same value in “k” \(a\)/);
  const tiny = await openCsv("one.csv", "k\na\n");
  await assert.rejects(tiny.core.previewSplitFile(tiny.sheet, rowsMode(1), "csv"), /fewer than 2 rows/);
});

test("a semicolon file with Windows line endings keeps its separator and line endings; quotes stay right", async () => {
  const { core, sheet } = await openCsv("de.csv", 'a;b\r\n1;"x;y"\r\n2;"say ""hi"""\r\n3;z\r\n');
  const part = await core.exportSplitPart(sheet, { mode: "parts", parts: 2, headerRow: true }, 0, "csv", noop);
  assert.equal(await text(part.blob), '﻿a;b\r\n1;"x;y"\r\n2;"say ""hi"""\r\n');
});

test("a TSV file gives .tsv parts", async () => {
  const { core, sheet } = await openCsv("t.tsv", people(4, "\t"));
  const p = await core.previewSplitFile(sheet, rowsMode(2), "csv");
  assert.deepEqual(p.parts.map((x) => x.fileName), ["t-part-01.tsv", "t-part-02.tsv"]);
  assert.deepEqual(await lines((await core.exportSplitPart(sheet, rowsMode(2), 1, "csv", noop)).blob), ["id\tname\tcity", "003\tP3\tLima", "004\tP4\tPune"]);
});

test("Excel parts from a CSV file: codes keep their zeros, numbers become numbers, header bold row", async () => {
  const { core, sheet } = await openCsv("p.csv", "code,amount\n00123,12.50\n00124,3\n00125,7\n");
  const part = await core.exportSplitPart(sheet, rowsMode(2), 0, "xlsx", noop);
  assert.equal(part.fileName, "p-part-01.xlsx");
  const wb = XLSX.read(new Uint8Array(await part.blob.arrayBuffer()));
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  assert.equal(ws.A2!.v, "00123");
  assert.equal(ws.A2!.t, "s");
  assert.equal(ws.B2!.v, 12.5);
  assert.equal(ws.B2!.w, "12.50");
  assert.equal(XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 }).length, 3);
});

test("an Excel file: parts keep values as shown, as CSV or Excel", async () => {
  const rows: (string | number)[][] = [["id", "when", "n"], ["001", "x", 1], ["002", "y", 2], ["003", "z", 3]];
  const cells = (r: number): OutCell[] => rows[r]!.map((v, c) => (r > 0 && c === 1 ? { t: "n", v: 45000 + r, fmt: "yyyy-mm-dd" } : typeof v === "number" ? { t: "n", v } : { t: "s", v }));
  const { blob } = await writeXlsx([{ name: "Data", rowCount: rows.length, colCount: 3, header: true, row: cells }]);
  const core = new EngineCore();
  const t = await core.open(new File([blob], "book.xlsx"), "xlsx", {}, noop);
  const input = { mode: "rows" as const, rowsPerPart: 2, headerRow: true };
  const p = await core.previewSplitFile(t.activeSheet, input, "xlsx");
  assert.deepEqual(p.parts.map((x) => x.fileName), ["book - Data-part-01.xlsx", "book - Data-part-02.xlsx"]);
  const csvPart = await core.exportSplitPart(t.activeSheet, input, 0, "csv", noop);
  assert.equal(csvPart.fileName, "book - Data-part-01.csv");
  assert.deepEqual(await lines(csvPart.blob), ["id,when,n", "001,2023-03-16,1", "002,2023-03-17,2"]);
  const x = await core.exportSplitPart(t.activeSheet, input, 1, "xlsx", noop);
  const ws = XLSX.read(new Uint8Array(await x.blob.arrayBuffer())).Sheets.Data!;
  assert.equal(ws.A2!.v, "003");
  assert.equal(ws.B2!.w, "2023-03-18");
  assert.equal(ws.C2!.v, 3);
});

test("the ZIP holds every part, each exactly as downloaded on its own", async () => {
  const { core, sheet } = await openCsv("people.csv", people(25));
  const input = { mode: "column" as const, column: 2, headerRow: true };
  const zip = await core.exportSplitZip(sheet, input, "csv", noop);
  assert.equal(zip.summary.downloadName, "people - split.zip");
  assert.equal(zip.blob.type, "application/zip");
  assert.deepEqual(zip.summary.files.map((f) => [f.name, f.rows]), [["people-Pune.csv", 9], ["people-Oslo.csv", 8], ["people-Lima.csv", 8]]);
  assert.equal(zip.summary.verification.rows, 25 + 3);
  const entries = await readZipEntries(zip.blob);
  for (let k = 0; k < entries.length; k++) {
    const chunks: Uint8Array[] = [];
    await streamEntry(zip.blob, entries[k]!, (d) => chunks.push(d.slice()));
    const single = await core.exportSplitPart(sheet, input, k, "csv", noop);
    assert.deepEqual(Buffer.concat(chunks), Buffer.from(await single.blob.arrayBuffer()), entries[k]!.name);
  }
  // Excel parts in a ZIP open as workbooks.
  const xz = await core.exportSplitZip(sheet, rowsMode(10), "xlsx", noop);
  assert.deepEqual(xz.summary.files.map((f) => f.name), ["people-part-01.xlsx", "people-part-02.xlsx", "people-part-03.xlsx"]);
});

test("the whole file is covered exactly once, whichever way it is split", async () => {
  const { core, sheet } = await openCsv("p.csv", people(1001));
  const body = (await lines(new Blob([people(1001)]))).slice(1);
  for (const input of [rowsMode(97), { mode: "parts" as const, parts: 7, headerRow: true }, { mode: "column" as const, column: 2, headerRow: true }]) {
    const zip = await core.exportSplitZip(sheet, input, "csv", noop);
    const entries = await readZipEntries(zip.blob);
    const got: string[] = [];
    for (const e of entries) {
      const chunks: Uint8Array[] = [];
      await streamEntry(zip.blob, e, (d) => chunks.push(d.slice()));
      const ls = await lines(new Blob([Buffer.concat(chunks)]));
      assert.equal(ls[0], "id,name,city");
      got.push(...ls.slice(1));
    }
    assert.deepEqual([...got].sort(), [...body].sort(), input.mode);
    if (input.mode !== "column") assert.deepEqual(got, body, "order kept");
  }
});

test("the memory check stops before splitting a table too large for the device", async () => {
  const core = new EngineCore();
  const t = await core.open(new File([people(2000)], "big.csv"), "csv", { memoryBudgetBytes: 10 * 1024 * 1024 }, noop);
  const st = (core as unknown as { state: { memoryBudgetBytes: number } }).state;
  st.memoryBudgetBytes = 1024;
  await assert.rejects(core.exportSplitZip(t.activeSheet, rowsMode(100), "csv", noop), /too large to split safely/);
});

test("file name parts: unsafe characters replaced, long names cut, no trailing dots", () => {
  assert.equal(safeFileNamePart('a\\b/c:d*e?f"g<h>i|j'), "a_b_c_d_e_f_g_h_i_j");
  assert.equal(safeFileNamePart("x".repeat(80)).length, 60);
  assert.equal(safeFileNamePart("end..."), "end");
  assert.equal(safeFileNamePart("  "), "_");
});
