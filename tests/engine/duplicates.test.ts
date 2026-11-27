/** Stage 11, Step 1: duplicate rows with options (columns, matching, keep first/last, mark) and the core preview. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { EditSession } from "../../src/engine/edit/session.ts";
import { EngineCore } from "../../src/engine/core.ts";
import { planDuplicates, type DuplicateOptions } from "../../src/engine/fix/duplicates.ts";
import { writeXlsx, type OutCell } from "../../src/engine/export/xlsx-writer.ts";
import { ArrayGrid } from "../../src/engine/grid.ts";
import { cellKey, createSheet, type CellValue, type SheetModel } from "../../src/engine/types.ts";

const noop = () => {};
const opts = (o: Partial<DuplicateOptions> = {}): DuplicateOptions => ({ columns: null, ignoreCase: false, ignoreSpaces: false, keep: "first", action: "remove", ...o });

function sheetOf(rows: CellValue[][]): SheetModel {
  const s = createSheet("S");
  s.grid = new ArrayGrid(rows);
  s.columnCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return s;
}
const rowsOf = (s: EditSession) => Array.from({ length: s.grid().rowCount }, (_, r) => s.grid().row(r));
const apply = (s: EditSession, o: Partial<DuplicateOptions>, headerRow = true) => {
  const plan = planDuplicates({ sheet: s.view(), headerRow, options: opts(o) });
  for (const r of plan.requests) s.apply(r);
  return plan;
};

const PEOPLE: CellValue[][] = [
  ["name", "email", "city"],
  ["Asha", "asha@example.com", "Pune"],
  ["Ben", "ben@example.com", "Rome"],
  ["Asha", "asha@example.com", "Pune"],
  ["Asha P", "asha@example.com", "Mumbai"],
  ["Ben", "ben@example.com", "Rome"],
];

test("all columns, exact: the first copy is kept and later exact copies are removed", () => {
  const s = new EditSession(sheetOf(PEOPLE));
  const plan = apply(s, {});
  assert.equal(plan.groups, 2);
  assert.equal(plan.duplicates, 2);
  assert.deepEqual(plan.removeRows, [3, 5]);
  assert.deepEqual(plan.requests[0]!.deleteRows!.map((d) => d.reason), ["Copy of row 2", "Copy of row 3"]);
  assert.deepEqual(rowsOf(s), [PEOPLE[0], PEOPLE[1], PEOPLE[2], PEOPLE[4]]);
});

test("chosen columns: the same email counts as a duplicate even when other columns differ", () => {
  const s = new EditSession(sheetOf(PEOPLE));
  const plan = apply(s, { columns: [1] });
  assert.equal(plan.duplicates, 3);
  assert.deepEqual(rowsOf(s), [PEOPLE[0], PEOPLE[1], PEOPLE[2]]);
});

test("keep the last copy instead of the first", () => {
  const s = new EditSession(sheetOf(PEOPLE));
  const plan = apply(s, { columns: [1], keep: "last" });
  assert.deepEqual(plan.removeRows, [1, 2, 3]);
  assert.deepEqual(rowsOf(s), [PEOPLE[0], PEOPLE[4], PEOPLE[5]]);
});

test("ignore capital letters and extra spaces only for comparing; kept values are unchanged", () => {
  const rows: CellValue[][] = [["city"], ["  Paris "], ["paris"], ["PARIS"], ["Pa ris"], ["Paris  Nord"], ["paris nord"]];
  assert.equal(planDuplicates({ sheet: sheetOf(rows), headerRow: true, options: opts() }).groups, 0);
  assert.equal(planDuplicates({ sheet: sheetOf(rows), headerRow: true, options: opts({ ignoreCase: true }) }).duplicates, 1);
  assert.equal(planDuplicates({ sheet: sheetOf(rows), headerRow: true, options: opts({ ignoreSpaces: true }) }).duplicates, 0);
  const s = new EditSession(sheetOf(rows));
  const plan = apply(s, { ignoreCase: true, ignoreSpaces: true });
  assert.equal(plan.duplicates, 3); // paris, PARIS (copies of "  Paris "), paris nord (copy of "Paris  Nord")
  assert.deepEqual(rowsOf(s), [["city"], ["  Paris "], ["Pa ris"], ["Paris  Nord"]]);
});

test("mark: adds a “Duplicate” column and removes nothing", () => {
  const s = new EditSession(sheetOf(PEOPLE));
  const plan = apply(s, { action: "mark" });
  assert.equal(plan.duplicates, 2);
  assert.equal(s.view().grid.rowCount, 6);
  assert.deepEqual(rowsOf(s).map((r) => r[3]), ["Duplicate", null, null, "Duplicate of row 2", null, "Duplicate of row 3"]);
  s.undo();
  assert.equal(s.view().columnCount, 3);
});

test("empty rows are never duplicates, and the header row is never compared", () => {
  const rows: CellValue[][] = [["a", "b"], [null, ""], [null, null], ["a", "b"], ["x", "y"]];
  const plan = planDuplicates({ sheet: sheetOf(rows), headerRow: true, options: opts() });
  assert.equal(plan.groups, 0);
  const noHeader = planDuplicates({ sheet: sheetOf(rows), headerRow: false, options: opts() });
  assert.deepEqual(noHeader.removeRows, [3]);
});

test("a number and the same digits as text are different values", () => {
  const plan = planDuplicates({ sheet: sheetOf([["n"], [12], ["12"], [12]]), headerRow: true, options: opts() });
  assert.deepEqual(plan.removeRows, [3]);
});

test("rows with formulas are never removed; when they are all formulas, the user is pointed to Mark", () => {
  const base = sheetOf([["v"], ["x"], ["x"], ["x"]]);
  base.formulas.set(cellKey(2, 0), "\"x\"");
  const plan = planDuplicates({ sheet: base, headerRow: true, options: opts() });
  assert.deepEqual(plan.removeRows, [3]);
  assert.equal(plan.formulaSkipped, 1);
  const only = sheetOf([["v"], ["x"], ["x"]]);
  only.formulas.set(cellKey(2, 0), "\"x\"");
  const p2 = planDuplicates({ sheet: only, headerRow: true, options: opts() });
  assert.equal(p2.requests.length, 0);
  assert.match(p2.refused ?? "", /Use “Mark duplicates” instead/);
  assert.equal(planDuplicates({ sheet: only, headerRow: true, options: opts({ action: "mark" }) }).duplicates, 1);
});

test("nothing to do and wrong columns are explained", () => {
  assert.match(planDuplicates({ sheet: sheetOf([["a"], ["x"], ["y"]]), headerRow: true, options: opts() }).refused ?? "", /every row is different/);
  assert.match(planDuplicates({ sheet: sheetOf(PEOPLE), headerRow: true, options: opts({ columns: [] }) }).refused ?? "", /at least one column/);
  assert.match(planDuplicates({ sheet: sheetOf(PEOPLE), headerRow: true, options: opts({ columns: [9] }) }).refused ?? "", /doesn't exist/);
});

test("examples list the largest groups first with the kept row's values", () => {
  const rows: CellValue[][] = [["k"], ["a"], ["b"], ["b"], ["a"], ["b"]];
  const plan = planDuplicates({ sheet: sheetOf(rows), headerRow: true, options: opts() });
  assert.deepEqual(plan.examples, [
    { kept: 3, copies: [4, 6], copyCount: 2, values: ["b"] },
    { kept: 2, copies: [5], copyCount: 1, values: ["a"] },
  ]);
});

test("the default (all columns, exact) finds the same rows as the Cleaner's duplicate fix", async () => {
  const name = "1-problems.csv";
  const core = new EngineCore();
  const s = await core.open(new File([readFileSync(new URL(`../fixtures/scan/${name}`, import.meta.url))], name), "csv", {}, noop);
  const sheet = s.activeSheet;
  const old = await core.previewFix(sheet, "duplicate-rows", { headerRow: true }, noop);
  const now = await core.previewDuplicates(sheet, { headerRow: true, options: opts() });
  assert.ok(old.rowsRemoved > 0);
  assert.equal(now.duplicates, old.rowsRemoved);
});

// ---------------------------------------------------------------- core: CSV, .xlsx, .xls

async function openFile(file: File, format: "csv" | "xlsx" | "xls") {
  const core = new EngineCore();
  const s = await core.open(file, format, {}, noop);
  return { core, sheet: s.activeSheet };
}
const coreRows = (core: EngineCore, sheet: string) => {
  const g = (core as unknown as { session(n: string): EditSession }).session(sheet).grid();
  return Array.from({ length: g.rowCount }, (_, r) => g.row(r));
};
async function xlsxOf(rows: string[][], header: boolean) {
  const cells = (r: number): OutCell[] => rows[r]!.map((v) => ({ t: "s", v }));
  const { blob } = await writeXlsx([{ name: "S", rowCount: rows.length, colCount: rows[0]!.length, header, row: cells }]);
  return new File([blob], "d.xlsx");
}
const DUP = [["name", "city"], ["Asha", "Pune"], ["Ben", "Rome"], ["Asha", "Pune"]];

test("core, CSV: remove, apply and download", async () => {
  const { core, sheet } = await openFile(new File([DUP.map((r) => r.join(",")).join("\n")], "d.csv"), "csv");
  const p = await core.previewDuplicates(sheet, { headerRow: true, options: opts() });
  assert.deepEqual([p.duplicates, p.blockedBy, p.clearing], [1, [], false]);
  core.applyFix(sheet, p.token!);
  const out = (await (await core.exportCsv(sheet, noop)).blob.text()).replace(/^﻿/, "");
  assert.equal(out, "name,city\nAsha,Pune\nBen,Rome\n");
});

test("core, .xlsx: removal blocked by the header filter; clearing instead works", async () => {
  const { core, sheet } = await openFile(await xlsxOf(DUP, true), "xlsx");
  const p = await core.previewDuplicates(sheet, { headerRow: true, options: opts() });
  assert.ok(p.blockedBy.length > 0);
  assert.equal(p.token, null);
  const c = await core.previewDuplicates(sheet, { headerRow: true, options: opts(), clearInstead: true });
  assert.deepEqual([c.clearing, c.cellsCleared], [true, 2]);
  core.applyFix(sheet, c.token!);
  assert.deepEqual(coreRows(core, sheet)[3], [null, null]);
});

test("core, .xlsx without references: rows removed and the download reads back exactly", async () => {
  const { core, sheet } = await openFile(await xlsxOf(DUP, false), "xlsx");
  const p = await core.previewDuplicates(sheet, { headerRow: true, options: opts() });
  assert.deepEqual(p.blockedBy, []);
  core.applyFix(sheet, p.token!);
  const out = await core.exportXlsx(sheet, noop);
  const back = await openFile(new File([out.blob], "b.xlsx"), "xlsx");
  assert.deepEqual(coreRows(back.core, back.sheet), [["name", "city"], ["Asha", "Pune"], ["Ben", "Rome"]]);
});

test("core, .xls: rows are never removed, but marking works and downloads as Excel", async () => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(DUP), "S");
  const bytes = XLSX.write(wb, { bookType: "biff8", type: "array" }) as ArrayBuffer;
  const { core, sheet } = await openFile(new File([bytes], "d.xls"), "xls");
  const p = await core.previewDuplicates(sheet, { headerRow: true, options: opts() });
  assert.match(p.blockedBy.join(), /can't be checked/);
  assert.equal(p.token, null);
  const m = await core.previewDuplicates(sheet, { headerRow: true, options: opts({ action: "mark" }) });
  core.applyFix(sheet, m.token!);
  const out = await core.exportXlsx(sheet, noop);
  const back = await openFile(new File([out.blob], "b.xlsx"), "xlsx");
  assert.deepEqual(coreRows(back.core, back.sheet).map((r) => r[2] ?? null), ["Duplicate", null, null, "Duplicate of row 2"]);
});
