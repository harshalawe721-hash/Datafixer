/** Stage 15, Step 1: merging files in the engine (CSV, semicolon CSV, Excel), downloads, limits. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { EngineCore, MERGE_MAX_FILES } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";
import type { EditSession } from "../../src/engine/edit/session.ts";
import { writeXlsx, type OutCell } from "../../src/engine/export/xlsx-writer.ts";

const noop = () => {};
const csv = (name: string, text: string) => ({ file: new File([text], name), format: "csv" as const });
async function xlsx(name: string, rows: (string | number)[][], hiddenFirst = false) {
  if (hiddenFirst) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["hidden"], ["x"]]), "Hidden");
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), "Data");
    wb.Workbook = { Sheets: [{ Hidden: 1 }, { Hidden: 0 }] };
    return { file: new File([XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer], name), format: "xlsx" as const };
  }
  const cells = (r: number): OutCell[] => rows[r]!.map((v) => (typeof v === "number" ? { t: "n", v } : { t: "s", v }));
  const { blob } = await writeXlsx([{ name: "S", rowCount: rows.length, colCount: rows[0]!.length, header: true, row: cells }]);
  return { file: new File([blob], name), format: "xlsx" as const };
}
/** Rows with empty cells as null, padded to full width (merged rows store empty cells compactly). */
const rowsOf = (core: EngineCore, sheet: string) => {
  const g = (core as unknown as { session(n: string): EditSession }).session(sheet).grid();
  let width = 0;
  for (let r = 0; r < g.rowCount; r++) width = Math.max(width, g.rowLength(r));
  return Array.from({ length: g.rowCount }, (_, r) => Array.from({ length: width }, (_, c) => (g.get(r, c) === "" ? null : g.get(r, c))));
};
const opts = { sourceColumn: true, removeDuplicates: false };

test("a comma CSV, a semicolon CSV and an Excel file merge into one table", async () => {
  const core = new EngineCore();
  const book = await xlsx("mar.xlsx", [["ID", "Name", "amount"], ["00125", "Cher", 12.5]]);
  const t = await core.openMerge([csv("jan.csv", "id,name,city\n00123,Asha,Pune\n"), csv("feb.csv", "name;id\nBen;00124\n"), book], opts, noop);
  assert.equal(t.fileName, "merged.csv");
  assert.equal(t.headerGuess, true);
  assert.deepEqual(rowsOf(core, t.activeSheet), [
    ["Source file", "id", "name", "city", "amount"],
    ["jan.csv", "00123", "Asha", "Pune", null],
    ["feb.csv", "00124", "Ben", null, null],
    ["mar.xlsx", "00125", "Cher", null, "12.5"],
  ]);
  assert.deepEqual(t.merge!.columns, [
    { name: "id", files: 3 },
    { name: "name", files: 3 },
    { name: "city", files: 1 },
    { name: "amount", files: 1 },
  ]);
  assert.deepEqual(t.merge!.files.map((f) => [f.name, f.rows, f.header, f.sheet]), [
    ["jan.csv", 1, true, null],
    ["feb.csv", 1, true, null],
    ["mar.xlsx", 1, true, "S"],
  ]);
  assert.equal(t.merge!.records, 3);
});

test("an Excel file uses its first visible sheet", async () => {
  const core = new EngineCore();
  const t = await core.openMerge([csv("a.csv", "id\n1\n"), await xlsx("b.xlsx", [["id"], ["2"]], true)], opts, noop);
  assert.deepEqual(rowsOf(core, t.activeSheet).map((r) => r[1]), ["id", "1", "2"]);
  assert.equal(t.merge!.files[1]!.sheet, "Data");
});

test("duplicates across files are removed when asked; without the source column", async () => {
  const core = new EngineCore();
  const t = await core.openMerge([csv("a.csv", "id,name\n1,Asha\n2,Ben\n"), csv("b.csv", "id,name\n1,Asha\n3,Cher\n")], { sourceColumn: false, removeDuplicates: true }, noop);
  assert.equal(t.merge!.duplicatesRemoved, 1);
  assert.deepEqual(rowsOf(core, t.activeSheet), [["id", "name"], ["1", "Asha"], ["2", "Ben"], ["3", "Cher"]]);
});

test("downloads: merged.csv and merged.xlsx; codes keep their zeros in Excel", async () => {
  const core = new EngineCore();
  const t = await core.openMerge([csv("a.csv", "id,n\n00123,1\n"), csv("b.csv", "id,n\n00124,2\n")], opts, noop);
  const out = await core.exportCsv(t.activeSheet, noop, undefined, { delimiter: ",", lineEnding: "\r\n", bom: false });
  assert.equal(out.summary.downloadName, "merged.csv");
  assert.equal(await out.blob.text(), "Source file,id,n\r\na.csv,00123,1\r\nb.csv,00124,2\r\n");
  const x = await core.convertCsvToXlsx(t.activeSheet, { headerRow: true }, noop);
  assert.equal(x.summary.downloadName, "merged.xlsx");
  const back = new EngineCore();
  const s = await back.open(new File([x.blob], "m.xlsx"), "xlsx", {}, noop);
  assert.deepEqual(rowsOf(back, s.activeSheet)[1], ["a.csv", "00123", 1]);
});

test("a file without column names is matched by position", async () => {
  const core = new EngineCore();
  const t = await core.openMerge([csv("a.csv", "id,name\n1,Asha\n"), csv("b.csv", "2,Ben\n3,Cher\n")], { sourceColumn: false, removeDuplicates: false }, noop);
  assert.deepEqual(rowsOf(core, t.activeSheet), [["id", "name"], ["1", "Asha"], ["2", "Ben"], ["3", "Cher"]]);
});

test("limits: at least two files, at most 50, 150 MB in total; problems name the file", async () => {
  const core = new EngineCore();
  await assert.rejects(core.openMerge([csv("a.csv", "a\n1\n")], opts, noop), /at least two files/);
  const many = Array.from({ length: MERGE_MAX_FILES + 1 }, (_, i) => csv(`${i}.csv`, "a\n1\n"));
  await assert.rejects(core.openMerge(many, opts, noop), /Up to 50 files/);
  const big = { file: { name: "big.csv", size: 151 * 1024 * 1024 } as File, format: "csv" as const };
  await assert.rejects(core.openMerge([csv("a.csv", "a\n1\n"), big], opts, noop), /up to 150 MB can be merged/);
  await assert.rejects(core.openMerge([csv("a.csv", "a\n1\n"), csv("empty.csv", "")], opts, noop), /“empty\.csv” is empty/);
  await assert.rejects(
    core.openMerge([csv("a.csv", "a\n1\n"), { file: new File([new Uint8Array([1, 2, 3])], "bad.xlsx"), format: "xlsx" }], opts, noop),
    (e: unknown) => e instanceof EngineError && /^“bad\.xlsx”: /.test(e.message),
  );
});

test("the memory stop applies to the merged table", async () => {
  const core = new EngineCore();
  const rows = ["id,text"];
  for (let i = 0; i < 20_000; i++) rows.push(`${i},${"x".repeat(60)}`);
  await assert.rejects(
    core.openMerge([csv("a.csv", rows.join("\n")), csv("b.csv", rows.join("\n"))], { ...opts, memoryBudgetBytes: 4_000_000 }, noop),
    (e: unknown) => e instanceof EngineError && (e.code === "too-large-for-engine" || e.code === "out-of-memory"),
  );
});
