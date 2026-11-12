/**
 * Stage 5 Step 4: CSV Validator repairs (previews, apply, undo, history) and
 * the edit session's row shortening.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EngineCore } from "../../src/engine/core.ts";
import { parseCsv } from "../../src/engine/csv/parse-csv.ts";
import { EditSession } from "../../src/engine/edit/session.ts";
import type { RepairId } from "../../src/engine/fix/fix-ids.ts";

const noop = () => {};
const dir = new URL("../fixtures/validate/", import.meta.url);
async function open(source: string, { file = true } = {}) {
  const core = new EngineCore();
  const bytes = file ? new Uint8Array(readFileSync(new URL(source, dir))) : new TextEncoder().encode(source);
  const s = await core.open(new File([bytes], file ? source : "t.csv"), "csv", {}, noop);
  return { core, sheet: s.activeSheet };
}
const rows = (core: EngineCore, sheet: string) => {
  const g = core.getSheet(sheet)!.grid;
  return Array.from({ length: g.rowCount }, (_, r) => g.row(r).map((v) => (v === null ? "" : String(v))));
};
const issues = async (core: EngineCore, sheet: string, headerRow = true) =>
  Object.fromEntries((await core.validate(sheet, { headerRow }, noop)).issues.map((i) => [i.id, i.count]));
async function repair(core: EngineCore, sheet: string, id: RepairId, headerRow = true) {
  const p = await core.previewFix(sheet, id, { headerRow }, noop);
  if (p.cellsChanged + p.rowsRemoved + (p.rowsShortened ?? 0)) core.applyFix(sheet, p.token);
  return p;
}
/** The downloaded CSV, read back as rows (BOM removed). */
async function download(core: EngineCore, sheet: string) {
  const { blob } = await core.exportCsv(sheet, noop);
  const { sheet: back } = await parseCsv(blob, "t");
  return Array.from({ length: back.grid.rowCount }, (_, r) => back.grid.row(r).map((v) => (v === null ? "" : String(v))));
}

// ---------------------------------------------------------------- decision 1: short rows

test("decision 1: “Add empty cells” previews before/after rows, warns about shifted data, and only adds cells", async () => {
  const { core, sheet } = await open("1-uneven.csv");
  const before = rows(core, sheet);
  const p = await core.previewFix(sheet, "pad-short-rows", { headerRow: true }, noop);
  assert.equal(p.cellsChanged, 3);
  assert.deepEqual(p.lines!.map((l) => [l.row, l.before.length, l.after.length]), [[5, 3, 4], [12, 3, 4], [26, 3, 4]]);
  assert.deepEqual(p.lines![0]!.after, [...p.lines![0]!.before, ""]);
  assert.match(p.warning!, /shifted into the wrong columns/);
  core.applyFix(sheet, p.token);
  const after = rows(core, sheet);
  for (const r of [5, 12, 26]) assert.deepEqual(after[r], [...before[r]!, ""], `row ${r}`);
  for (let r = 0; r < before.length; r++) if (![5, 12, 26].includes(r)) assert.deepEqual(after[r], before[r]);
  // The two long rows (with data in the extra fields) are still reported; short rows are gone.
  assert.equal((await issues(core, sheet))["uneven-rows"], 2);
  const file = await download(core, sheet);
  assert.deepEqual(file[5], [...before[5]!, ""]);
  core.undo(sheet);
  assert.deepEqual(rows(core, sheet), before);
});

test("decision 1: short rows are never part of the Validator's Fix all", async () => {
  const { core, sheet } = await open("a,b,c\r\n1,2\r\n3,4,5,,\r\n\r\n6,7,8\r\n", { file: false });
  const all = await core.previewFixAll(sheet, { headerRow: true, set: "validator" }, noop);
  assert.deepEqual(all.steps.map((s) => s.fixId), ["trim-extra-fields", "remove-blank-lines"]);
  assert.equal(all.rowsShortened, 1);
  assert.equal(all.rowsRemoved, 1);
  core.applyFix(sheet, all.token);
  assert.deepEqual(rows(core, sheet), [["a", "b", "c"], ["1", "2"], ["3", "4", "5"], ["6", "7", "8"]]);
  assert.equal((await issues(core, sheet))["uneven-rows"], 1);
});

// ---------------------------------------------------------------- empty extra fields

test("empty extra fields: rows are shortened (no data lost); rows with data in the extras are left alone", async () => {
  const { core, sheet } = await open("a,b\r\n1,2,,\r\n3,4\r\n5,6,\r\n7,8,x\r\n", { file: false });
  const p = await core.previewFix(sheet, "trim-extra-fields", { headerRow: true }, noop);
  assert.equal(p.rowsShortened, 2);
  assert.deepEqual(p.lines!.map((l) => [l.row, l.before, l.after]), [[1, ["1", "2", "", ""], ["1", "2"]], [3, ["5", "6", ""], ["5", "6"]]]);
  assert.equal(p.skipped[0]!.count, 1);
  assert.match(p.skipped[0]!.reason, /contain data were left alone/);
  const r = core.applyFix(sheet, p.token);
  assert.equal(r.stats.rowsShortened, 2);
  assert.equal(r.entry!.rowsShortened, 2);
  assert.deepEqual(rows(core, sheet), [["a", "b"], ["1", "2"], ["3", "4"], ["5", "6"], ["7", "8", "x"]]);
  assert.deepEqual(await download(core, sheet), [["a", "b"], ["1", "2"], ["3", "4"], ["5", "6"], ["7", "8", "x"]]);
  const details = core.historyDetails(sheet, r.entry!.id, 0, 10);
  assert.deepEqual(details.items, [
    { kind: "trim", row: 2, from: 4, to: 2, reason: "Empty fields after column B removed" },
    { kind: "trim", row: 4, from: 3, to: 2, reason: "Empty fields after column B removed" },
  ]);
  core.undo(sheet);
  assert.deepEqual(rows(core, sheet)[1], ["1", "2", "", ""]);
  assert.equal(core.editStats(sheet).rowsShortened, 0);
  core.redo(sheet);
  assert.deepEqual(rows(core, sheet)[1], ["1", "2"]);
});

test("edit session: shortening works with removed rows and columns, and only ever shortens", async () => {
  const { sheet } = await parseCsv(new Blob(["a,b,c,d\n1,2,3,,\n4,5,6,7\n"]), "t");
  const s = new EditSession(sheet);
  s.apply({ operation: "x", label: "Remove column B", deleteColumns: [{ col: 1, reason: "test" }] });
  s.apply({ operation: "x", label: "Remove row 1", deleteRows: [{ row: 0, reason: "test" }] });
  // View row 0 is ["1","3","",""] (column B removed); 2 view columns = original columns A..C.
  const e = s.apply({ operation: "t", label: "Trim", trimRows: [{ row: 0, length: 2, reason: "r" }, { row: 1, length: 9, reason: "longer: ignored" }] });
  assert.equal(e!.rowsShortened, 1);
  const g = s.view().grid;
  assert.deepEqual(g.row(0), ["1", "3"]);
  assert.deepEqual(g.row(1), ["4", "6", "7"]);
  assert.equal(g.get(0, 2), null);
  s.undo();
  assert.deepEqual(s.view().grid.row(0), ["1", "3", "", ""]);
});

// ---------------------------------------------------------------- decision 2: column names

test("decision 2: empty names → “Column C”, duplicates → “email (2)”; only header cells change", async () => {
  const { core, sheet } = await open("2-header.csv");
  const before = rows(core, sheet);
  const p = await core.previewFix(sheet, "fix-header-names", { headerRow: true }, noop);
  assert.deepEqual(p.examples.map((e) => [e.col, e.before, e.after]), [[2, "", "Column C"], [4, "email ", "email (2)"]]);
  core.applyFix(sheet, p.token);
  const after = rows(core, sheet);
  assert.deepEqual(after[0], ["id", "name", "Column C", "Email", "email (2)", " phone", before[0]![6]]);
  assert.deepEqual(after.slice(1), before.slice(1), "cell data is never overwritten");
  const left = await issues(core, sheet);
  assert.equal(left["empty-header"], undefined);
  assert.equal(left["duplicate-header"], undefined);
});

test("decision 2: a new name never creates another duplicate (the next free number is used)", async () => {
  const { core, sheet } = await open("id,email,email,email (2),,Column E,EMAIL\r\n1,a,b,c,d,e,f\r\n", { file: false });
  const p = await core.previewFix(sheet, "fix-header-names", { headerRow: true }, noop);
  assert.deepEqual(p.examples.map((e) => [e.col, e.after]), [[2, "email (3)"], [4, "Column E (2)"], [6, "EMAIL (4)"]]);
  core.applyFix(sheet, p.token);
  const names = rows(core, sheet)[0]!.map((n) => n.trim().toLowerCase());
  assert.equal(new Set(names).size, names.length);
});

test("column names: not offered without a header row (decision 5); the empty last column from trailing separators is not named", async () => {
  const a = await open("2-header.csv");
  const p = await a.core.previewFix(a.sheet, "fix-header-names", { headerRow: false }, noop);
  assert.equal(p.cellsChanged, 0);
  assert.match(p.description, /Tick “First row contains column names”/);
  const b = await open("7-trailing.csv");
  const t = await b.core.previewFix(b.sheet, "fix-header-names", { headerRow: true }, noop);
  assert.equal(t.cellsChanged, 0);
  assert.equal(t.skipped[0]!.count, 1);
});

test("spaces around names are trimmed", async () => {
  const { core, sheet } = await open("2-header.csv");
  const p = await repair(core, sheet, "trim-header-spaces");
  assert.deepEqual(p.examples.map((e) => [e.before, e.after]), [["email ", "email"], [" phone", "phone"]]);
  assert.equal((await issues(core, sheet))["header-spaces"], undefined);
});

// ---------------------------------------------------------------- blank lines, hidden characters

test("blank lines: exactly the reported lines are removed (rows of separators are kept)", async () => {
  const { core, sheet } = await open("5-line-endings.csv");
  const p = await repair(core, sheet, "remove-blank-lines");
  assert.deepEqual(p.rows.map((r) => r.row), [6, 11, 17]);
  assert.equal((await issues(core, sheet))["blank-lines"], undefined);
  const s2 = await open("a,b\r\n,\r\n\r\n1,2\r\n", { file: false });
  const q = await repair(s2.core, s2.sheet, "remove-blank-lines");
  assert.equal(q.rowsRemoved, 1);
  assert.deepEqual(rows(s2.core, s2.sheet), [["a", "b"], ["", ""], ["1", "2"]]);
});

test("hidden characters: removed from cells, visible text unchanged; C1 codes come with an encoding warning", async () => {
  const { core, sheet } = await open("6-control.csv");
  const p = await repair(core, sheet, "remove-control-chars");
  assert.deepEqual(p.examples.map((e) => [e.before, e.after]), [["Ben␀", "Ben"], ["Le␀eds", "Leeds"], ["Gus␇", "Gus"]]);
  assert.equal(p.warning, undefined);
  assert.equal((await issues(core, sheet))["control-characters"], undefined);
  const file = await download(core, sheet);
  assert.equal(file[3]![1], "Ben");
  const core2 = new EngineCore();
  const bytes = new Uint8Array([...new TextEncoder().encode("a,b\r\nx"), 0x80, ...new TextEncoder().encode(",y\r\n")]);
  const o = await core2.open(new File([bytes], "t.csv"), "csv", { encoding: "iso-8859-1" }, noop);
  const q = await core2.previewFix(o.activeSheet, "remove-control-chars", { headerRow: true }, noop);
  assert.match(q.warning!, /wrong text encoding/);
});

// ---------------------------------------------------------------- Stage 4 safeguards carry over

test("a repair preview is refused after any other change (stale preview), and repairs are CSV-only", async () => {
  const { core, sheet } = await open("6-control.csv");
  const p = await core.previewFix(sheet, "remove-control-chars", { headerRow: true }, noop);
  core.editCell(sheet, 1, 1, "Asha!");
  assert.throws(() => core.applyFix(sheet, p.token), /data changed after this preview/);
  const x = new EngineCore();
  const xs = await x.open(new File([new Uint8Array(readFileSync(new URL("../fixtures/fix/6-excel-references.xlsx", import.meta.url)))], "w.xlsx"), "xlsx", {}, noop);
  await assert.rejects(x.previewFix(xs.activeSheet, "pad-short-rows", { headerRow: true }, noop), /CSV files only/);
});

test("all repairs in turn make the test files valid (except problems that can't be repaired automatically)", async () => {
  const want: Record<string, string[]> = {
    "1-uneven.csv": ["uneven-rows"], // 2 rows with data in the extra fields: never automatic
    "2-header.csv": ["long-header"],
    "5-line-endings.csv": ["mixed-line-endings", "no-final-line-break"], // fixed by the download
    "6-control.csv": ["formula-like"],
  };
  for (const [f, left] of Object.entries(want)) {
    const { core, sheet } = await open(f);
    for (const id of ["trim-header-spaces", "fix-header-names", "pad-short-rows", "trim-extra-fields", "remove-blank-lines", "remove-control-chars"] as RepairId[]) await repair(core, sheet, id);
    assert.deepEqual(Object.keys(await issues(core, sheet)).sort(), left.sort(), f);
  }
});
