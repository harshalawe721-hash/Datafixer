/** Stage 10, Step 1: split and combine through EngineCore: preview, apply, undo, CSV and Excel downloads. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { EngineCore } from "../../src/engine/core.ts";
import type { EditSession } from "../../src/engine/edit/session.ts";
import { writeXlsx, type OutCell } from "../../src/engine/export/xlsx-writer.ts";
import { readEntryText, readZipEntries } from "../../src/engine/xlsx/zip.ts";
import { EngineError } from "../../src/engine/errors.ts";
import type { CellValue } from "../../src/engine/types.ts";

const space = { separator: " ", mode: "first" as const, maxParts: null, trim: false, respectQuotes: false };
const noop = () => {};

function rowsOf(core: EngineCore, sheet: string): CellValue[][] {
  const g = (core as unknown as { session(n: string): EditSession }).session(sheet).grid();
  return Array.from({ length: g.rowCount }, (_, r) => g.row(r));
}

async function openCsv(text: string) {
  const core = new EngineCore();
  const s = await core.open(new File([text], "people.csv"), "csv", {}, noop);
  return { core, sheet: s.activeSheet };
}

async function xlsxOf(rows: (string | number | null)[][], header = true): Promise<File> {
  const cells = (r: number): OutCell[] => rows[r]!.map((v) => (v === null ? null : typeof v === "number" ? { t: "n", v } : { t: "s", v }));
  const { blob } = await writeXlsx([{ name: "People", rowCount: rows.length, colCount: Math.max(...rows.map((r) => r.length)), header, row: cells }]);
  return new File([blob], "people.xlsx");
}

async function openXlsx(file: File) {
  const core = new EngineCore();
  const s = await core.open(file, "xlsx", {}, noop);
  return { core, sheet: s.activeSheet };
}

test("CSV: split preview, apply, undo and download", async () => {
  const { core, sheet } = await openCsv("name,city\nAsha Patil,Pune\nBen Rome,Rome\n");
  const p = await core.previewSplit(sheet, { column: 0, headerRow: true, options: space });
  assert.equal(p.columnsAdded, 2);
  assert.deepEqual(p.examples[0], { row: 2, before: ["Asha Patil"], after: ["Asha", "Patil"] });
  assert.ok(p.token);
  core.applyFix(sheet, p.token!);
  assert.deepEqual(rowsOf(core, sheet)[1], ["Asha Patil", "Pune", "Asha", "Patil"]);
  const out = await core.exportCsv(sheet, noop);
  const text = (await out.blob.text()).replace(/^﻿/, "");
  // The download keeps the file's own line endings.
  assert.equal(text, "name,city,name (1),name (2)\nAsha Patil,Pune,Asha,Patil\nBen Rome,Rome,Ben,Rome\n");
  core.undo(sheet);
  assert.equal(rowsOf(core, sheet)[0]!.length, 2);
});

test("CSV: combine with the originals removed", async () => {
  const { core, sheet } = await openCsv("first,last,city\nAsha,Patil,Pune\n");
  const p = await core.previewCombine(sheet, { columns: [0, 1], name: "full name", headerRow: true, options: { separator: " ", skipEmpty: true }, removeOriginals: true });
  assert.deepEqual(p.originalsKept, []);
  core.applyFix(sheet, p.token!);
  assert.deepEqual(rowsOf(core, sheet), [["city", "full name"], ["Pune", "Asha Patil"]]);
});

test("a preview with nothing to change has no token", async () => {
  const { core, sheet } = await openCsv("city\nPune\n");
  const p = await core.previewSplit(sheet, { column: 0, headerRow: true, options: space });
  assert.equal(p.token, null);
  assert.match(p.refused ?? "", /nothing to split/);
});

test("a preview is refused when the data changed before Apply", async () => {
  const { core, sheet } = await openCsv("name\nAsha Patil\n");
  const p = await core.previewSplit(sheet, { column: 0, headerRow: true, options: space });
  core.editCell(sheet, 1, 0, "Ben Rome");
  assert.throws(() => core.applyFix(sheet, p.token!), (e: unknown) => e instanceof EngineError && e.code === "stale-preview");
});

test("Excel: added columns are written into the workbook and read back exactly", async () => {
  const { core, sheet } = await openXlsx(await xlsxOf([["name", "city"], ["Asha Patil", "Pune"], ["Ben", "Rome"]]));
  const p = await core.previewSplit(sheet, { column: 0, headerRow: true, options: space });
  core.applyFix(sheet, p.token!);
  const out = await core.exportXlsx(sheet, noop);

  const back = await openXlsx(new File([out.blob], "back.xlsx"));
  assert.deepEqual(rowsOf(back.core, back.sheet), [
    ["name", "city", "name (1)", "name (2)"],
    ["Asha Patil", "Pune", "Asha", "Patil"],
    ["Ben", "Rome", "Ben"],
  ]);
  const entries = await readZipEntries(out.blob);
  const sheetXml = await readEntryText(out.blob, entries.find((e) => /worksheets\/sheet1\.xml$/.test(e.name))!);
  assert.match(sheetXml, /<dimension ref="A1:D3"/);
});

test("Excel: combine with the originals removed shifts the new column into place", async () => {
  // No header filter here, so nothing in the workbook refers to the columns.
  const { core, sheet } = await openXlsx(await xlsxOf([["first", "last", "city"], ["Asha", "Patil", "Pune"]], false));
  const p = await core.previewCombine(sheet, { columns: [0, 1], name: "full name", headerRow: true, options: { separator: " ", skipEmpty: true }, removeOriginals: true });
  assert.deepEqual(p.originalsKept, []);
  core.applyFix(sheet, p.token!);
  const out = await core.exportXlsx(sheet, noop);
  const back = await openXlsx(new File([out.blob], "back.xlsx"));
  assert.deepEqual(rowsOf(back.core, back.sheet), [["city", "full name"], ["Pune", "Asha Patil"]]);
});

test("Excel: originals are kept when removing them would break something in the workbook", async () => {
  // The header filter covers the columns, so removing them is not offered.
  const { core, sheet } = await openXlsx(await xlsxOf([["first", "last", "city"], ["Asha", "Patil", "Pune"]]));
  const p = await core.previewCombine(sheet, { columns: [0, 1], name: "full name", headerRow: true, options: { separator: " ", skipEmpty: true }, removeOriginals: true });
  assert.ok(p.originalsKept.length > 0);
  core.applyFix(sheet, p.token!);
  assert.deepEqual(rowsOf(core, sheet), [["first", "last", "city", "full name"], ["Asha", "Patil", "Pune", "Asha Patil"]]);
});

test("old .xls files are refused for split and combine", async () => {
  const core = new EngineCore();
  (core as unknown as { state: { format: string } | null }).state = { format: "xls" };
  await assert.rejects(core.previewSplit("S", { column: 0, headerRow: true, options: space }), /old \.xls files/);
});
