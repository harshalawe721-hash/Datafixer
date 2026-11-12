/** Stage 4, Step 2: safe automatic fixes with preview. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EngineCore } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";
import { EditSession } from "../../src/engine/edit/session.ts";
import { SAFE_FIX_IDS as FIX_IDS, planFix, textToNumber, type FixId } from "../../src/engine/fix/fixes.ts";
import { ArrayGrid } from "../../src/engine/grid.ts";
import { cellKey, createSheet, type CellValue, type SheetModel } from "../../src/engine/types.ts";

const SCAN = new URL("../fixtures/scan/", import.meta.url);

function sheetOf(rows: CellValue[][]): SheetModel {
  const s = createSheet("S");
  s.grid = new ArrayGrid(rows);
  s.columnCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return s;
}

const rowsOf = (s: SheetModel) => Array.from({ length: s.grid.rowCount }, (_, r) => s.grid.row(r));

async function openPack(name: string) {
  const core = new EngineCore();
  const s = await core.open(new File([readFileSync(new URL(name, SCAN))], name), name.endsWith(".xlsx") ? "xlsx" : "csv", {}, () => {});
  return { core, sheet: s.activeSheet };
}

const noop = () => {};

// ---------------------------------------------------------------- test pack: exact counts

for (const file of ["1-problems.csv", "2-problems.xlsx"]) {
  for (const fixId of FIX_IDS) {
    test(`${file}: “${fixId}” previews exactly what the Error Detector reports, then fixes only that`, async () => {
      const { core, sheet } = await openPack(file);
      const before = await core.scan(sheet, { headerRow: true }, noop);
      const reported = before.issues.find((i) => i.id === fixId)!;
      assert.ok(reported, `${fixId} is in the test pack`);
      const grid0 = rowsOf(core.getSheet(sheet)!);

      const preview = await core.previewFix(sheet, fixId as FixId, { headerRow: true }, noop);
      const planned = preview.cellsChanged + preview.rowsRemoved + preview.columnsRemoved;
      assert.equal(planned, reported.count, "preview count = detector count");
      assert.deepEqual(preview.skipped, []);
      assert.equal(core.editStats(sheet).changesApplied, 0, "a preview changes nothing");
      assert.deepEqual(rowsOf(core.getSheet(sheet)!), grid0);
      assert.equal(preview.deletesFromExcel, file.endsWith(".xlsx") && (preview.rowsRemoved > 0 || preview.columnsRemoved > 0));

      const r = core.applyFix(sheet, preview.token);
      assert.equal(r.entry!.label, preview.label);
      const after = await core.scan(sheet, { headerRow: true }, noop);
      assert.equal(after.issues.find((i) => i.id === fixId), undefined, "problem gone after the fix");
      // Other problems are unaffected, except where the removed rows/cells held them.
      // One planned exception: once “1,250” is a real number, the detector can see
      // that it is far above the column's usual range (it was hidden as text).
      for (const i of after.issues) {
        const was = before.issues.find((b) => b.id === i.id)?.count ?? 0;
        // (In the Excel file the text number is “250”, inside the usual range: no change there.)
        if (fixId === "numbers-as-text" && i.id === "unusual-values") assert.equal(i.count, file.endsWith(".csv") ? was + 1 : was);
        else assert.ok(i.count <= was, `${i.id} did not grow`);
      }

      // Undo restores the original data exactly.
      core.undo(sheet);
      assert.deepEqual(rowsOf(core.getSheet(sheet)!), grid0);
    });
  }
}

test("1-problems.csv: the exact cells and rows chosen by each fix", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const spaces = await core.previewFix(sheet, "extra-spaces", { headerRow: true }, noop);
  assert.deepEqual(spaces.examples.map((e) => [e.row, e.col, e.before, e.after]), [
    [3, 1, " Person 3", "Person 3"],
    [18, 4, "London ", "London"],
  ]);
  const dups = await core.previewFix(sheet, "duplicate-rows", { headerRow: true }, noop);
  assert.deepEqual(dups.rows, [
    { row: 26, reason: "Exact copy of row 2" },
    { row: 27, reason: "Exact copy of row 3" },
  ]);
  const empty = await core.previewFix(sheet, "empty-rows", { headerRow: true }, noop);
  assert.equal(empty.rows.length, 1);
  assert.equal(empty.rows[0]!.reason, "Row has no data");
  const cols = await core.previewFix(sheet, "empty-columns", { headerRow: true }, noop);
  assert.deepEqual(cols.columns, [{ index: 7, letter: "H", name: "notes" }]);
  assert.match(cols.description, /with a name in the header row/);
  const nums = await core.previewFix(sheet, "numbers-as-text", { headerRow: true }, noop);
  assert.deepEqual(nums.examples.map((e) => [e.row, e.col, e.before, e.after]), [[11, 5, "1,250", "1250"]]);
  core.applyFix(sheet, nums.token);
  assert.equal(core.getSheet(sheet)!.grid.get(11, 5), "1250", "CSV keeps text (no types), now a plain number");
});

test("applying every safe fix in turn leaves none of those problems; the header row is untouched", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const header = core.getSheet(sheet)!.grid.row(0);
  for (const fixId of ["extra-spaces", "numbers-as-text", "duplicate-rows", "empty-rows", "empty-columns"] as FixId[]) {
    core.applyFix(sheet, (await core.previewFix(sheet, fixId, { headerRow: true }, noop)).token);
  }
  const r = await core.scan(sheet, { headerRow: true }, noop);
  for (const id of FIX_IDS) assert.equal(r.issues.find((i) => i.id === id), undefined, id);
  assert.deepEqual(core.getSheet(sheet)!.grid.row(0), header.slice(0, 7), "header kept (the empty “notes” column was removed)");
  assert.deepEqual(core.editStats(sheet), { cellsEdited: 3, rowsRemoved: 3, columnsRemoved: 1, changesApplied: 5, canUndo: true, canRedo: false, version: 5 });
  const hist = core.history(sheet);
  assert.deepEqual(hist.map((h) => h.label), ["Remove empty columns", "Remove empty rows", "Remove duplicate rows", "Convert numbers stored as text", "Remove extra spaces"]);
});

// ---------------------------------------------------------------- preview safety

test("a preview can only be applied while the data is unchanged, and only once", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const p = await core.previewFix(sheet, "extra-spaces", { headerRow: true }, noop);
  core.editCell(sheet, 1, 1, "X");
  assert.throws(() => core.applyFix(sheet, p.token), (e: unknown) => e instanceof EngineError && e.code === "stale-preview");
  const p2 = await core.previewFix(sheet, "extra-spaces", { headerRow: true }, noop);
  assert.throws(() => core.applyFix(sheet, "fix-999"), (e: unknown) => e instanceof EngineError && e.code === "stale-preview");
  core.applyFix(sheet, p2.token);
  assert.throws(() => core.applyFix(sheet, p2.token), (e: unknown) => e instanceof EngineError && e.code === "stale-preview");
});

test("a fix with nothing to do adds no history entry", async () => {
  const { core, sheet } = await openPack("3-clean.csv");
  for (const fixId of FIX_IDS) {
    const p = await core.previewFix(sheet, fixId, { headerRow: true }, noop);
    assert.equal(p.cellsChanged + p.rowsRemoved + p.columnsRemoved, 0, fixId);
    assert.equal(core.applyFix(sheet, p.token).entry, null);
  }
  assert.equal(core.history(sheet).length, 0);
});

test("duplicate reasons refer to original file rows, even after earlier deletions", async () => {
  const s = new EditSession(sheetOf([["h"], ["a"], [""], ["b"], ["a"], ["b"]]));
  s.apply({ operation: "x", label: "X", deleteRows: [{ row: 2, reason: "r" }] });
  const plan = await planFix(s.view(), "duplicate-rows", { headerRow: true }, { originalRow: (r) => s.grid().baseRow(r) });
  assert.deepEqual(plan.preview.rows, [
    { row: 3, reason: "Exact copy of row 2" },
    { row: 4, reason: "Exact copy of row 4" },
  ]);
});

test("the user can keep named empty columns", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const p = await core.previewFix(sheet, "empty-columns", { headerRow: true, keepColumns: [7] }, noop);
  assert.equal(p.columnsRemoved, 0);
  assert.deepEqual(p.skipped, [{ reason: "Columns you chose to keep.", count: 1 }]);
});

// ---------------------------------------------------------------- formula protection (S1)

test("formula cells are never changed, and rows/columns with formulas are never removed", async () => {
  const base = sheetOf([
    ["name", "qty", "calc", "empty"],
    [" Ann ", "1,250", " total ", null],
    ["Bob", 5, 7, null],
    ["Bob", 5, 7, null],
    [null, null, "", null],
    ["Cy", 2, 3, null],
    ["Dee", 4, 9, null],
    ["Eve", 6, 1, null],
  ]);
  base.formulas.set(cellKey(1, 2), "TRIM(A2)"); // " total " is a formula result
  base.formulas.set(cellKey(3, 2), "B4+2"); // the duplicate row holds a formula
  base.formulas.set(cellKey(4, 2), "IF(B5=\"\",\"\",1)"); // a row that looks empty
  base.formulas.set(cellKey(5, 3), "\"\""); // the empty column holds a formula
  base.formulas.set(cellKey(1, 1), "TEXT(1250,\"#,##0\")"); // "1,250" is a formula result
  const s = new EditSession(base);
  const plan = async (id: FixId) => (await planFix(s.view(), id, { headerRow: true })).preview;
  const spaces = await plan("extra-spaces");
  assert.equal(spaces.cellsChanged, 1, "only “ Ann ” is trimmed");
  assert.deepEqual(spaces.skipped, [{ reason: "Formula cells are never changed automatically. Edit them by hand if needed.", count: 1 }]);
  const dups = await plan("duplicate-rows");
  assert.equal(dups.rowsRemoved, 0);
  assert.equal(dups.skipped[0]!.count, 1);
  const empty = await plan("empty-rows");
  assert.equal(empty.rowsRemoved, 0);
  assert.match(empty.skipped[0]!.reason, /contain formulas/);
  const cols = await plan("empty-columns");
  assert.equal(cols.columnsRemoved, 0);
  assert.match(cols.skipped[0]!.reason, /formulas/);
  const nums = await plan("numbers-as-text");
  assert.equal(nums.cellsChanged, 0);
  assert.equal(nums.skipped[0]!.count, 1);
});

// ---------------------------------------------------------------- no ambiguous conversions

test("number conversion: only values with one clear meaning are converted", () => {
  const ok = (s: string, n: number) => {
    const r = textToNumber(s, false);
    assert.ok("value" in r && r.value === n, s);
  };
  ok("42", 42);
  assert.deepEqual(textToNumber("-€1,200.50", false), { value: -1200.5, text: "-1200.50" });
  assert.deepEqual(textToNumber("'45", false), { value: 45, text: "45" });
  ok(" -3.5 ", -3.5);
  ok("1e3", 1000);
  ok("'45", 45);
  ok("1,250", 1250);
  ok("1,234,567.89", 1234567.89);
  ok("$12", 12);
  ok("-€1,200.50", -1200.5);
  for (const s of ["12%", "(5)", "5-", "1 234", "1.234,56", "12,5", "12€", "1234567890123456"]) {
    assert.ok("skip" in textToNumber(s, false), `${s} is left alone`);
  }
  assert.ok("skip" in textToNumber("1,250", true), "comma-thousands is ambiguous in a decimal-comma column");
  assert.deepEqual(textToNumber("1250", true), { value: 1250, text: "1250" });
});

test("a column that also uses decimal commas keeps its “1,250” values, with the reason shown", async () => {
  const rows: CellValue[][] = [["amount"]];
  for (let i = 0; i < 30; i++) rows.push([i === 3 ? "1,250" : i === 4 ? "12,5" : i === 5 ? "12%" : String(100 + i)]);
  const plan = await planFix(sheetOf(rows), "numbers-as-text", { headerRow: true });
  assert.equal(plan.preview.cellsChanged, 0);
  const reasons = plan.preview.skipped.map((s) => s.reason).join(" ");
  assert.match(reasons, /commas as decimal points/);
  assert.match(reasons, /%, brackets/);
});

test("leading-zero values (IDs, ZIP codes) are never converted", async () => {
  const rows: CellValue[][] = [["qty"]];
  for (let i = 0; i < 30; i++) rows.push([i === 2 ? "007" : i === 3 ? "1,500" : String(10 + i)]);
  const plan = await planFix(sheetOf(rows), "numbers-as-text", { headerRow: true });
  assert.deepEqual(plan.preview.examples.map((e) => e.before), ["1,500"]);
});

test("extra spaces: only edges are trimmed, spaces between words are kept, spaces-only cells are left (they count as missing)", async () => {
  const plan = await planFix(sheetOf([["a"], ["  New  York "], ["\tx"], ["   "], ["ok"]]), "extra-spaces", { headerRow: true });
  assert.deepEqual(plan.preview.examples.map((e) => e.after), ["New  York", "x"]);
});

test("with no header row, the first row is treated as data", async () => {
  const plan = await planFix(sheetOf([[" a "], ["b"]]), "extra-spaces", { headerRow: false });
  assert.equal(plan.preview.cellsChanged, 1);
  const withHeader = await planFix(sheetOf([[" a "], ["b"]]), "extra-spaces", { headerRow: true });
  assert.equal(withHeader.preview.cellsChanged, 0, "column names are never changed");
});

// ---------------------------------------------------------------- larger data

test("larger data: 300,000 rows with planted spaces and duplicates are fixed exactly", async () => {
  const rows: CellValue[][] = [["id", "name", "city", "amount"]];
  let spaces = 0;
  for (let i = 0; i < 300_000; i++) {
    const sp = i % 997 === 0;
    if (sp) spaces++;
    rows.push([String(i), sp ? ` Name ${i}` : `Name ${i}`, ["Paris", "Rome", "Oslo"][i % 3]!, String(i % 1000)]);
  }
  for (let i = 0; i < 1500; i++) {
    const copy = rows[1 + i * 7]!;
    if (String(copy[1]).startsWith(" ")) spaces++;
    rows.push([...copy]);
  }
  const s = new EditSession(sheetOf(rows));
  const t0 = performance.now();
  const sp = await planFix(s.view(), "extra-spaces", { headerRow: true });
  assert.equal(sp.preview.cellsChanged, spaces, "spaces in the copied rows count too");
  s.apply(sp.request!);
  const dup = await planFix(s.view(), "duplicate-rows", { headerRow: true });
  assert.equal(dup.preview.rowsRemoved, 1500);
  s.apply(dup.request!);
  const ms = performance.now() - t0;
  console.log(`  plan+apply spaces and duplicates on 301,500 rows: ${ms.toFixed(0)} ms`);
  assert.equal(s.view().grid.rowCount, 300_001);
  assert.equal((await planFix(s.view(), "duplicate-rows", { headerRow: true })).preview.rowsRemoved, 0);
});

test("Excel: converted values become real numbers", async () => {
  const { core, sheet } = await openPack("2-problems.xlsx");
  const p = await core.previewFix(sheet, "numbers-as-text", { headerRow: true }, noop);
  assert.equal(p.cellsChanged, 1);
  core.applyFix(sheet, p.token);
  const ex = p.examples[0]!;
  assert.equal(typeof core.getSheet(sheet)!.grid.get(ex.row, ex.col), "number");
});

// ---------------------------------------------------------------- Fix all safe problems (Step 4)

test("Fix all (CSV): exact combined preview, applied as one history entry per fix; named empty columns are kept", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const p = await core.previewFixAll(sheet, { headerRow: true }, noop);
  assert.deepEqual(p.steps.map((s) => [s.fixId, s.cellsChanged + s.rowsRemoved + s.columnsRemoved]), [
    ["extra-spaces", 2],
    ["inconsistent-case", 1],
    ["numbers-as-text", 1],
    ["duplicate-rows", 2],
    ["empty-rows", 1],
  ]);
  assert.equal(p.columnsRemoved, 0, "the empty “notes” column has a name, so it is kept");
  assert.ok(p.notes.some((n) => /have a name|has a name/.test(n)));
  assert.equal(core.editStats(sheet).changesApplied, 0, "preview changes nothing");
  const r = core.applyFix(sheet, p.token);
  assert.equal(r.stats.changesApplied, 5);
  const after = await core.scan(sheet, { headerRow: true }, noop);
  for (const id of ["extra-spaces", "inconsistent-case", "numbers-as-text", "duplicate-rows", "empty-rows"]) assert.equal(after.issues.find((i) => i.id === id), undefined, id);
  assert.ok(after.issues.find((i) => i.id === "empty-columns"), "named empty column left for the user");
  for (let i = 0; i < 5; i++) core.undo(sheet);
  const back = await core.scan(sheet, { headerRow: true }, noop);
  assert.equal(back.issues.find((i) => i.id === "duplicate-rows")!.count, 2);
});

test("Fix all (Excel): rows are removed only after the workbook reference check passes", async () => {
  const { core, sheet } = await openPack("2-problems.xlsx");
  const p = await core.previewFixAll(sheet, { headerRow: true }, noop);
  // Nothing in 2-problems.xlsx refers to the duplicate or empty rows (its one formula is above them).
  assert.deepEqual(p.steps.map((s) => s.fixId), ["extra-spaces", "inconsistent-case", "numbers-as-text", "duplicate-rows", "empty-rows"]);
  assert.equal(p.rowsRemoved, 3);
});

test("Fix all positions stay correct when an earlier step changes what a later step finds", async () => {
  // " Ann" and "Ann" become duplicates only after spaces are removed.
  const core = new EngineCore();
  const csv = "name,city\nAnn,Paris\n Ann,Paris\nBob,Rome\n\nCy,Oslo\n";
  const s = await core.open(new File([csv], "t.csv"), "csv", {}, noop);
  const p = await core.previewFixAll(s.activeSheet, { headerRow: true }, noop);
  assert.deepEqual(p.steps.map((x) => x.fixId), ["extra-spaces", "duplicate-rows", "empty-rows"]);
  core.applyFix(s.activeSheet, p.token);
  const rows = core.getRows(s.activeSheet, { offset: 0, limit: 10, headerRow: true }).rows.map((r) => r.cells);
  assert.deepEqual(rows, [["Ann", "Paris"], ["Bob", "Rome"], ["Cy", "Oslo"]]);
});

test("applying several fixes is all-or-nothing: a failure part-way rolls back the earlier steps", async () => {
  const s = new EditSession(sheetOf([["a"], [" x"], [" y"]]));
  s.apply({ operation: "a", label: "A", cells: [{ row: 1, col: 0, value: "x" }] });
  s.apply({ operation: "b", label: "B", cells: [{ row: 2, col: 0, value: "y" }] });
  s.rollback(2);
  assert.deepEqual(s.stats(), { cellsEdited: 0, rowsRemoved: 0, columnsRemoved: 0, changesApplied: 0, canUndo: false, canRedo: false, version: 4 });
  assert.equal(s.history().length, 0, "rolled-back steps leave no history");
});
