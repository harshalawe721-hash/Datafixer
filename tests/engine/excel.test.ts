/**
 * Excel reader tests. Fixtures in tests/fixtures/excel were produced by
 * openpyxl and LibreOffice (independent of SheetJS); see
 * scripts/fixtures/make_excel_fixtures.py.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EngineCore } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";
import { cellKey, type WorkbookSummary } from "../../src/engine/types.ts";
import { buildXlsx, sheetXml } from "./fixtures.ts";

const FIX = new URL("../fixtures/excel/", import.meta.url);
const fixture = (name: string) => new File([readFileSync(new URL(name, FIX))], name);
const noop = () => {};
const isCode = (code: string) => (e: unknown) => e instanceof EngineError && e.code === code;

async function open(name: string, format: "xlsx" | "xls", budget?: number) {
  const core = new EngineCore();
  const summary = await core.open(fixture(name), format, budget ? { memoryBudgetBytes: budget } : {}, noop);
  return { core, summary };
}

function page(core: EngineCore, s: WorkbookSummary, limit = 10) {
  return core.getRows(s.activeSheet, { offset: 0, limit, headerRow: false }).rows.map((r) => r.cells);
}

for (const [name, format] of [["lo-features.xlsx", "xlsx"], ["lo-features.xls", "xls"]] as const) {
  test(`${name}: values, number formats, booleans, errors and formulas`, async () => {
    const { core, summary } = await open(name, format);
    assert.equal(summary.sheetError, null);
    assert.equal(summary.activeSheet, "Data");
    assert.deepEqual(summary.sheetStats.Data, { rows: 5, columns: 9 });
    const rows = page(core, summary);
    assert.deepEqual(rows[0]!.slice(0, 6), ["Name", "Amount", "Date", "Active", "Formula", "Link"]);
    assert.deepEqual(rows[1]!.slice(0, 7), ["Ann", "10.50", "2024-01-31", "TRUE", "21", "Example", "hidden column value"]);
    assert.deepEqual(rows[2]!.slice(0, 5), ["Zoë 東京 😀", "1,234.57", "2023-12-01", "FALSE", "1245.067"]);
    assert.deepEqual(rows[3]!.slice(0, 5), ["Bob", "0.00", "2022-06-15", "TRUE", "#DIV/0!"]);
    assert.deepEqual(rows[4]!.slice(0, 5), ["Eve", "-5.00", "2021-02-28", "FALSE", "#N/A"]);
    const sheet = core.getSheet("Data")!;
    assert.equal(sheet.grid.get(1, 1), 10.5, "raw value kept as a number");
    assert.equal(sheet.grid.get(1, 2), 45322, "date kept as its serial number");
    assert.equal(sheet.formulas.get(cellKey(1, 4)), "B2*2");
    assert.equal(sheet.formulas.get(cellKey(2, 4)), "SUM(B2:B3)");
    assert.equal(sheet.errors.get(cellKey(3, 4)), "#DIV/0!");
    assert.equal(sheet.errors.get(cellKey(4, 4)), "#N/A");
  });

  test(`${name}: hyperlinks, merged cells, hidden rows/columns, sizes`, async () => {
    const { core } = await open(name, format);
    const sheet = core.getSheet("Data")!;
    assert.equal(sheet.hyperlinks.get(cellKey(1, 5)), "https://example.com/");
    assert.deepEqual(sheet.merges, [{ startRow: 0, startCol: 7, endRow: 0, endCol: 8 }]);
    assert.ok(sheet.hiddenRows.has(3), "row 4 hidden");
    assert.ok(sheet.hiddenColumns.has(6), "column G hidden");
    const w = sheet.columnWidths.get(0) ?? 0;
    assert.ok(w > 24 && w < 25.5, `column A width as stored in the file (${w})`);
    assert.equal(sheet.rowHeights.get(1), 30);
  });

  test(`${name}: sheet list with hidden sheets, cross-sheet formulas`, async () => {
    const { core, summary } = await open(name, format);
    assert.deepEqual(summary.sheets.map((s) => [s.name, s.state]), [
      ["Data", "visible"],
      ["Summary", "visible"],
      ["Archive", "hidden"],
      ["Secret", "hidden"], // LibreOffice saves "very hidden" as hidden
      ["Chart1", "visible"], // LibreOffice turns the chartsheet into a sheet with a chart
    ]);
    const s2 = await core.loadSheet("Summary", noop);
    const rows = page(core, s2);
    assert.deepEqual(rows[0], ["Total", "1240.067"]); // 10.5 + 1234.567 + 0 - 5
    assert.deepEqual(rows[1], ["First name", "Ann"]);
    assert.equal(core.getSheet("Summary")!.formulas.get(cellKey(0, 1)), "SUM(Data!B2:B5)");
    assert.equal(core.getSheet("Data"), null, "only one Excel sheet is kept in memory");
  });
}

test("lo-features.xlsx: feature warnings", async () => {
  const { summary } = await open("lo-features.xlsx", "xlsx");
  assert.ok(summary.features!.charts >= 1);
  assert.equal(summary.features!.dataValidation, true);
  assert.equal(summary.features!.conditionalFormatting, true);
  assert.ok(summary.warnings.some((w) => /chart/.test(w) && /data validation/.test(w)));
});

test("openpyxl file: emoji written as numeric references are restored, and the user is told", async () => {
  const { core, summary } = await open("openpyxl-features.xlsx", "xlsx");
  assert.equal(page(core, summary)[2]![0], "Zoë 東京 😀");
  assert.ok(summary.warnings.some((w) => /restored/.test(w)));
});

test("openpyxl file: formulas without saved results are kept and reported", async () => {
  const { core, summary } = await open("openpyxl-features.xlsx", "xlsx");
  const sheet = core.getSheet("Data")!;
  assert.equal(sheet.formulas.get(cellKey(1, 4)), "B2*2");
  assert.equal(sheet.grid.get(1, 4), null);
  assert.ok(summary.warnings.some((w) => /4 formula cells have no saved result/.test(w)));
});

test("openpyxl file: very hidden sheet and chartsheet", async () => {
  const { core, summary } = await open("openpyxl-features.xlsx", "xlsx");
  assert.deepEqual(summary.sheets.find((s) => s.name === "Secret")?.state, "veryHidden");
  assert.equal(summary.sheets.find((s) => s.name === "Chart1")?.kind, "chartsheet");
  const s = await core.loadSheet("Chart1", noop);
  assert.equal(s.sheetError?.code, "chartsheet");
});

test("1904 date system is honoured", async () => {
  const { core, summary } = await open("date1904.xlsx", "xlsx");
  assert.equal(page(core, summary)[0]![0], "2024-01-31");
});

for (const [name, format] of [["empty.xlsx", "xlsx"], ["empty.xls", "xls"]] as const) {
  test(`${name}: empty workbook opens with no rows`, async () => {
    const { summary } = await open(name, format);
    assert.equal(summary.sheetError, null);
    assert.equal(summary.sheetStats[summary.activeSheet]?.rows, 0);
  });
}

for (const [name, format] of [["lo-multisheet.xlsx", "xlsx"], ["lo-multisheet.xls", "xls"]] as const) {
  test(`${name}: Unicode sheet names and switching sheets`, async () => {
    const { core, summary } = await open(name, format);
    assert.deepEqual(summary.sheets.map((s) => s.name), ["January", "Février", "三月"]);
    const s = await core.loadSheet("三月", noop);
    assert.deepEqual(s.sheetStats["三月"], { rows: 101, columns: 2 });
    const last = core.getRows("三月", { offset: 99, limit: 1, headerRow: true }).rows[0]!;
    assert.deepEqual(last.cells, ["100", "300"]);
  });
}

test("password-protected workbook gets a clear message", async () => {
  await assert.rejects(open("encrypted.xlsx", "xlsx"), (e: unknown) => isCode("encrypted-file")(e) && /password-protected/.test((e as Error).message));
});

test("damaged XLS files are reported, not crashed on", async () => {
  const buf = readFileSync(new URL("lo-features.xls", FIX));
  const core = new EngineCore();
  await assert.rejects(core.open(new File([buf.subarray(0, 3000)], "cut.xls"), "xls", {}, noop), (e: unknown) => e instanceof EngineError && ["corrupt-file", "encrypted-file"].includes(e.code));
  const garbage = Buffer.concat([buf.subarray(0, 512), Buffer.alloc(4096, 0x41)]);
  await assert.rejects(core.open(new File([garbage], "bad.xls"), "xls", {}, noop), (e: unknown) => e instanceof EngineError);
});

test("memory budget: XLS refused before parsing; XLSX keeps file info and explains", async () => {
  await assert.rejects(open("lo-features.xls", "xls", 50_000), isCode("too-large-for-engine"));
  const { summary } = await open("lo-features.xlsx", "xlsx", 30_000);
  assert.equal(summary.sheetError?.code, "too-large-for-engine");
  assert.equal(summary.sheets.length, 5, "sheet list still available");
});

test("numeric references in sheet names and cells; ambiguous ones are not 'repaired'", async () => {
  const xml = sheetXml([["Smile &#128512;", "plain"]]);
  const zip = buildXlsx([{ name: "Data &#128512;", xml }]);
  const core = new EngineCore();
  const s = await core.open(new File([zip as BlobPart], "refs.xlsx"), "xlsx", {}, noop);
  assert.equal(s.activeSheet, "Data 😀");
  assert.equal(page(core, s)[0]![0], "Smile 😀");

  // The private-use character U+F600 also appears raw: restoring would be a guess.
  const amb = buildXlsx([{ name: "S", xml: sheetXml([["&#128512;", ""]]) }]);
  const s2 = await core.open(new File([amb as BlobPart], "amb.xlsx"), "xlsx", {}, noop);
  assert.equal(page(core, s2)[0]![1], "", "raw character untouched");
  assert.ok(s2.warnings.some((w) => /could not be decoded reliably/.test(w)));
});

test("security: prototype-polluting names in comments and sheets (CVE-2023-30533 class)", async () => {
  const xml = sheetXml([["a"]]);
  const zip = buildXlsx([{ name: "__proto__", xml }, { name: "constructor", xml }], {
    "xl/worksheets/_rels/sheet1.xml.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="../comments1.xml"/></Relationships>`,
    "xl/comments1.xml": `<?xml version="1.0"?><comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><authors><author>x</author></authors><commentList><comment ref="__proto__" authorId="0"><text><t>polluted</t></text></comment><comment ref="constructor" authorId="0"><text><t>x</t></text></comment></commentList></comments>`,
  });
  const core = new EngineCore();
  const before = Object.getOwnPropertyNames(Object.prototype).sort().join();
  await core.open(new File([zip as BlobPart], "proto.xlsx"), "xlsx", {}, noop).catch(() => {});
  assert.equal(Object.getOwnPropertyNames(Object.prototype).sort().join(), before);
  assert.equal(({} as Record<string, unknown>).t, undefined);
  assert.equal(({} as Record<string, unknown>).polluted, undefined);
});

test("security: pathological XML does not hang the parser (CVE-2024-22363 class)", async () => {
  const xml = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"${" ".repeat(200000)}><is><t>${"<".replace("<", "&lt;").repeat(50000)}</t></is></c></row></sheetData></worksheet>`;
  const zip = buildXlsx([{ name: "S", xml }]);
  const t = Date.now();
  const core = new EngineCore();
  await core.open(new File([zip as BlobPart], "redos.xlsx"), "xlsx", {}, noop).catch(() => {});
  assert.ok(Date.now() - t < 5000, `took ${Date.now() - t} ms`);
});

test("formulas are text only: nothing is evaluated", async () => {
  // A formula that would be dangerous if evaluated as code must stay inert text.
  const xml = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1"><f>globalThis.__dfx=1</f><v>0</v></c><c r="B1" t="str"><f>HYPERLINK("javascript:alert(1)","x")</f><v>x</v></c></row></sheetData></worksheet>`;
  const core = new EngineCore();
  await core.open(new File([buildXlsx([{ name: "S", xml }]) as BlobPart], "f.xlsx"), "xlsx", {}, noop);
  assert.equal((globalThis as Record<string, unknown>).__dfx, undefined);
  assert.equal(core.getSheet("S")!.formulas.get(cellKey(0, 0)), "globalThis.__dfx=1");
});
