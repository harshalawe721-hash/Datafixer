/** Stage 4, Step 3: fixes that need the user's choice (capitalization, dates, phone layouts). */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EngineCore } from "../../src/engine/core.ts";
import { EditSession } from "../../src/engine/edit/session.ts";
import { planFix, type FixChoice } from "../../src/engine/fix/fixes.ts";
import { excelSerial, parseTextDate, phoneTemplate } from "../../src/engine/fix/choice-fixes.ts";
import { ArrayGrid } from "../../src/engine/grid.ts";
import { cellKey, createSheet, type CellValue, type SheetModel } from "../../src/engine/types.ts";

const SCAN = new URL("../fixtures/scan/", import.meta.url);
const noop = () => {};

function sheetOf(rows: CellValue[][]): SheetModel {
  const s = createSheet("S");
  s.grid = new ArrayGrid(rows);
  s.columnCount = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return s;
}

async function openPack(name: string) {
  const core = new EngineCore();
  const s = await core.open(new File([readFileSync(new URL(name, SCAN))], name), name.endsWith(".xlsx") ? "xlsx" : "csv", {}, () => {});
  return { core, sheet: s.activeSheet };
}

const count = async (core: EngineCore, sheet: string, id: string) =>
  (await core.scan(sheet, { headerRow: true }, noop)).issues.find((i) => i.id === id)?.count ?? 0;

/** A text column of `n` filler values plus the given ones. */
function textColumn(name: string, values: string[], filler = 30): CellValue[][] {
  const rows: CellValue[][] = [[name]];
  for (let i = 0; i < filler; i++) rows.push([`Value ${i}`]);
  for (const v of values) rows.push([v]);
  return rows;
}

// ---------------------------------------------------------------- capitalization

for (const file of ["1-problems.csv", "2-problems.xlsx"]) {
  test(`${file}: capitalization uses the most common spelling (“paris” → “Paris”)`, async () => {
    const { core, sheet } = await openPack(file);
    assert.equal(await count(core, sheet, "inconsistent-case"), 1);
    const p = await core.previewFix(sheet, "inconsistent-case", { headerRow: true }, noop);
    assert.deepEqual(p.examples.map((e) => [e.row, e.col, e.before, e.after]), [[5, 4, "paris", "Paris"]]);
    assert.deepEqual(p.choices, []);
    core.applyFix(sheet, p.token);
    assert.equal(await count(core, sheet, "inconsistent-case"), 0);
  });
}

test("capitalization tie: nothing changes until the user chooses; then the chosen spelling is used", async () => {
  const base = sheetOf(textColumn("city", ["Rome", "Rome", "ROME", "ROME", "rome", "Oslo", "Oslo", "OSLO"]));
  const p1 = (await planFix(base, "inconsistent-case", { headerRow: true })).preview;
  assert.equal(p1.cellsChanged, 1, "only the clear case (OSLO → Oslo) changes");
  assert.deepEqual(p1.examples.map((e) => e.after), ["Oslo"]);
  assert.deepEqual(p1.skipped, [{ reason: "Spellings that are equally common need your choice before they are changed.", count: 3 }]);
  const choice = p1.choices[0] as Extract<FixChoice, { kind: "spelling" }>;
  assert.equal(choice.kind, "spelling");
  assert.equal(choice.columnName, "city");
  assert.equal(choice.chosen, null);
  assert.deepEqual(choice.options, [{ value: "ROME", count: 2 }, { value: "Rome", count: 2 }, { value: "rome", count: 1 }]);

  const p2 = (await planFix(base, "inconsistent-case", { headerRow: true, caseChoices: { [choice.key]: "Rome" } })).preview;
  assert.equal(p2.cellsChanged, 4);
  assert.deepEqual(p2.skipped, []);
  assert.equal((p2.choices[0] as Extract<FixChoice, { kind: "spelling" }>).chosen, "Rome");

  const p3 = (await planFix(base, "inconsistent-case", { headerRow: true, caseChoices: { [choice.key]: "RoMe" } })).preview;
  assert.equal(p3.cellsChanged, 1, "a choice that isn't one of the spellings is ignored");
});

test("capitalization keeps the spaces around a value and never changes formula cells", async () => {
  const base = sheetOf(textColumn("city", ["Paris", "Paris", " paris ", "PARIS"]));
  base.formulas.set(cellKey(34, 0), "UPPER(\"paris\")");
  const p = (await planFix(base, "inconsistent-case", { headerRow: true })).preview;
  assert.deepEqual(p.examples.map((e) => e.after), [" Paris "]);
  assert.deepEqual(p.skipped, [{ reason: "Formula cells are never changed automatically. Edit them by hand if needed.", count: 1 }]);
});

// ---------------------------------------------------------------- dates (CSV)

test("1-problems.csv dates: a format must be chosen first; converting to 2024-01-31 fixes the odd one out, and the impossible date is left alone", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const p0 = await core.previewFix(sheet, "inconsistent-dates", { headerRow: true }, noop);
  assert.equal(p0.cellsChanged, 0);
  const choice = p0.choices[0] as Extract<FixChoice, { kind: "date-format" }>;
  assert.equal(choice.columnName, "joined");
  assert.equal(choice.evidence, "dmy", "31/01/2024 proves day-first");
  assert.equal(choice.needsOrder, false);
  assert.equal(choice.suggested, "iso");
  assert.deepEqual(choice.formats, [{ label: "2024-01-31", count: 25 }, { label: "31/01/2024 or 01/31/2024", count: 1 }]);

  const p = await core.previewFix(sheet, "inconsistent-dates", { headerRow: true, dateChoices: { 6: { target: "iso" } } }, noop);
  assert.deepEqual(p.examples.map((e) => [e.before, e.after]), [["31/01/2024", "2024-01-31"]]);
  assert.deepEqual(p.skipped, [{ reason: "Impossible dates (such as 30 February) are never changed automatically. Correct them by hand.", count: 1 }]);
  core.applyFix(sheet, p.token);
  assert.equal(await count(core, sheet, "inconsistent-dates"), 0);
  assert.equal(await count(core, sheet, "impossible-dates"), 1, "impossible date untouched");
});

test("dates: converting a whole column to another format", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const p = await core.previewFix(sheet, "inconsistent-dates", { headerRow: true, dateChoices: { 6: { target: "dmy-slash" } } }, noop);
  assert.equal(p.cellsChanged, 24, "24 valid ISO dates; 31/01/2024 is already in this format; the impossible one is left");
  assert.deepEqual(p.examples[0], { row: 1, col: 6, before: "2024-01-01", after: "01/01/2024" });
});

function dateSheet(values: string[]): SheetModel {
  return sheetOf([["when"], ...values.map((v) => [v])]);
}

test("ambiguous dates (03/04/2024): never converted until the user says day-first or month-first", async () => {
  const base = dateSheet(["03/04/2024", "05/06/2024", "07/07/2024", "2024-01-15", "01/02/2024"]);
  const p0 = (await planFix(base, "inconsistent-dates", { headerRow: true, dateChoices: { 0: { target: "iso" } } })).preview;
  const ch = p0.choices[0] as Extract<FixChoice, { kind: "date-format" }>;
  assert.equal(ch.evidence, "unknown");
  assert.equal(ch.needsOrder, true);
  assert.deepEqual(p0.examples.map((e) => e.after), ["2024-07-07"], "07/07 is the same either way");
  assert.deepEqual(p0.skipped, [{ reason: "These dates could be day-first or month-first. Choose the order this column uses to convert them.", count: 3 }]);
  const dmy = (await planFix(base, "inconsistent-dates", { headerRow: true, dateChoices: { 0: { target: "iso", order: "dmy" } } })).preview;
  assert.deepEqual(dmy.examples.map((e) => e.after), ["2024-04-03", "2024-06-05", "2024-07-07", "2024-02-01"]);
  const mdy = (await planFix(base, "inconsistent-dates", { headerRow: true, dateChoices: { 0: { target: "iso", order: "mdy" } } })).preview;
  assert.deepEqual(mdy.examples.map((e) => e.after), ["2024-03-04", "2024-05-06", "2024-07-07", "2024-01-02"]);
});

test("dates: values with their own proof (31/01, 01/31) use it, whatever order is chosen", async () => {
  const base = dateSheet(["31/01/2024", "01/31/2024", "03/04/2024", "2024-01-01", "2024-01-02"]);
  const p = (await planFix(base, "inconsistent-dates", { headerRow: true, dateChoices: { 0: { target: "iso", order: "mdy" } } })).preview;
  assert.equal((p.choices[0] as Extract<FixChoice, { kind: "date-format" }>).evidence, "mixed");
  assert.deepEqual(p.examples.map((e) => e.after), ["2024-01-31", "2024-01-31", "2024-03-04"]);
});

test("dates: two-digit years, time zones, non-dates and times that a format can't hold are left alone", async () => {
  const base = dateSheet(["2024-01-31", "2024-02-01", "31/01/24", "2024-01-31T10:00Z", "TBD", "2024-03-01 14:30", "2024-03-02"]);
  const iso = (await planFix(base, "inconsistent-dates", { headerRow: true, dateChoices: { 0: { target: "iso" } } })).preview;
  assert.equal(iso.cellsChanged, 0, "the ISO values are already in this format (time kept)");
  const reasons = iso.skipped.map((s) => s.reason).join(" | ");
  assert.match(reasons, /Two-digit years/);
  assert.match(reasons, /time zone/);
  assert.match(reasons, /aren't dates/);
  const dmy = (await planFix(base, "inconsistent-dates", { headerRow: true, dateChoices: { 0: { target: "dmy-slash" } } })).preview;
  assert.match(dmy.skipped.map((s) => s.reason).join(" "), /include a time/);
  assert.ok(!dmy.examples.some((e) => e.before.includes("14:30")));
});

test("date parsing and Excel serial numbers", () => {
  assert.deepEqual(parseTextDate("d-mon-y", "31 Jan 2024", null), { ok: { y: 2024, m: 1, d: 31, time: null } });
  assert.deepEqual(parseTextDate("mon-d-y", "Sept 5, 2024", null), { ok: { y: 2024, m: 9, d: 5, time: null } });
  assert.deepEqual(parseTextDate("dmy-dot", "29.02.2023", null), { skip: "Impossible dates (such as 30 February) are never changed automatically. Correct them by hand." });
  assert.equal(excelSerial({ y: 2024, m: 1, d: 31, time: null }, false), 45322);
  assert.equal(excelSerial({ y: 2024, m: 1, d: 31, time: null }, true), 45322 - 1462);
  assert.equal(excelSerial({ y: 1900, m: 2, d: 28, time: null }, false), null);
  assert.equal(excelSerial({ y: 2024, m: 1, d: 31, time: "12:00" }, false), 45322.5);
});

// ---------------------------------------------------------------- dates (Excel)

test("2-problems.xlsx dates: text dates become real Excel dates with the chosen display format", async () => {
  const { core, sheet } = await openPack("2-problems.xlsx");
  assert.equal(await count(core, sheet, "inconsistent-dates"), 2);
  const p0 = await core.previewFix(sheet, "inconsistent-dates", { headerRow: true }, noop);
  const ch = p0.choices[0] as Extract<FixChoice, { kind: "date-format" }>;
  assert.deepEqual(ch.targets.map((t) => t.id), ["excel-iso", "excel-dmy", "excel-mdy", "excel-d-mon-y"]);
  const p = await core.previewFix(sheet, "inconsistent-dates", { headerRow: true, dateChoices: { 6: { target: "excel-dmy" } } }, noop);
  // The other inconsistent value is the impossible text date 2024-02-30: never converted.
  assert.equal(p.cellsChanged, 1);
  assert.deepEqual(p.examples.map((e) => [e.before, e.after]), [["31/01/2024", "31/01/2024"]]);
  assert.deepEqual(p.skipped.map((x) => x.count), [1]);
  core.applyFix(sheet, p.token);
  const view = core.getSheet(sheet)!;
  const ex = p.examples[0]!;
  assert.equal(view.grid.get(ex.row, ex.col), 45322);
  assert.equal(view.grid.display!(ex.row, ex.col), "31/01/2024");
  assert.equal(view.grid.isDate!(ex.row, ex.col), true);
  assert.equal(view.numberFormats.get(cellKey(ex.row, ex.col)), "dd/mm/yyyy");
  assert.equal(await count(core, sheet, "inconsistent-dates"), 1, "only the impossible text date remains");
  assert.equal(await count(core, sheet, "impossible-dates"), 1);
  // History and undo
  const h = core.historyDetails(sheet, core.history(sheet)[0]!.id);
  assert.equal(h.items[0]!.kind, "cell");
  core.undo(sheet);
  assert.equal(typeof core.getSheet(sheet)!.grid.get(ex.row, ex.col), "string");
  assert.equal(core.getSheet(sheet)!.numberFormats.has(cellKey(ex.row, ex.col)), false);
  assert.equal(await count(core, sheet, "inconsistent-dates"), 2);
});

// ---------------------------------------------------------------- phone layouts

test("1-problems.csv phones: a 10-digit number can't take a 12-digit layout, so it is left (no country code is invented)", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const p0 = await core.previewFix(sheet, "phone-formats", { headerRow: true }, noop);
  const ch = p0.choices[0] as Extract<FixChoice, { kind: "phone-layout" }>;
  assert.deepEqual(ch.layouts, [
    { template: "+# ### #### ####", example: "+1 555 0101 0000", count: 24 },
    { template: "(###) ###-####", example: "(555) 010-1000", count: 1 },
  ]);
  assert.equal(ch.suggested, "+# ### #### ####");
  const p = await core.previewFix(sheet, "phone-formats", { headerRow: true, phoneChoices: { 3: "+# ### #### ####" } }, noop);
  assert.equal(p.cellsChanged, 0);
  assert.equal(p.skipped.length, 1);
  assert.match(p.skipped[0]!.reason, /different number of digits or no country code/);
});

test("phones: numbers with the same digits are re-laid-out; the digits never change", async () => {
  const rows: CellValue[][] = [["phone"]];
  for (let i = 0; i < 6; i++) rows.push([`+44 20 7946 09${50 + i}`]);
  rows.push(["+44-20-7946-0960"], ["+442079460961"], ["020 7946 0962"], ["+44-20-7946-0963 ext 12"], ["+44 20 7946 0964 ext 7"]);
  const base = sheetOf(rows);
  const p = (await planFix(base, "phone-formats", { headerRow: true, phoneChoices: { 0: "+## ## #### ####" } })).preview;
  assert.deepEqual(p.examples.map((e) => [e.before, e.after]), [
    ["+44-20-7946-0960", "+44 20 7946 0960"],
    ["+442079460961", "+44 20 7946 0961"],
  ]);
  const reasons = p.skipped.map((s) => s.reason).join(" | ");
  assert.match(reasons, /no country code/);
  assert.match(reasons, /extension/);
  const s = new EditSession(base);
  const plan = await planFix(s.view(), "phone-formats", { headerRow: true, phoneChoices: { 0: "+## ## #### ####" } });
  s.apply(plan.request!);
  for (let r = 1; r < s.view().grid.rowCount; r++) {
    assert.equal(String(s.view().grid.get(r, 0)).replace(/\D/g, ""), String(base.grid.get(r, 0)).replace(/\D/g, ""), "same digits");
  }
});

test("phone templates", () => {
  assert.equal(phoneTemplate(" +1 (555) 010-1000 "), "+# (###) ###-####");
  assert.equal(phoneTemplate("020 7946 0958 ext 12"), "### #### ####");
});

test("a choice for a layout that doesn't exist is ignored", async () => {
  const { core, sheet } = await openPack("1-problems.csv");
  const p = await core.previewFix(sheet, "phone-formats", { headerRow: true, phoneChoices: { 3: "##" } }, noop);
  assert.equal((p.choices[0] as Extract<FixChoice, { kind: "phone-layout" }>).chosen, null);
  assert.equal(p.cellsChanged, 0);
});
