import { test } from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import { inspectXlsx, dimensionSize, decodeXmlText, parseWorkbookSheets } from "../../src/engine/xlsx/inspect.ts";
import { EngineError } from "../../src/engine/errors.ts";
import { buildXlsx, sheetXml } from "./fixtures.ts";

const b = (u: Uint8Array) => new Blob([u as BlobPart]);
const isCode = (code: string) => (e: unknown) => e instanceof EngineError && e.code === code;

test("lists sheets with names, visibility, dimension and size", async () => {
  const zip = buildXlsx([
    { name: "Sales &amp; Costs", xml: sheetXml([["a", "b"], ["1", "2"], ["3", "4"]]) },
    { name: "Hidden", state: "hidden" },
    { name: "Secret", state: "veryHidden" },
  ]);
  const r = await inspectXlsx(b(zip));
  assert.deepEqual(r.sheets.map((s) => [s.name, s.state, s.kind]), [
    ["Sales & Costs", "visible", "worksheet"],
    ["Hidden", "hidden", "worksheet"],
    ["Secret", "veryHidden", "worksheet"],
  ]);
  assert.equal(r.sheets[0]!.dimension, "A1:B3");
  assert.ok(r.sheets[0]!.uncompressedBytes > 0);
  assert.equal(r.conformance, "transitional");
});

test("detects workbook features", async () => {
  const dv = sheetXml([["a"]], `<dataValidations count="1"><dataValidation type="list" sqref="A1"><formula1>"x,y"</formula1></dataValidation></dataValidations><conditionalFormatting sqref="A1"><cfRule type="cellIs" priority="1"/></conditionalFormatting>`);
  const zip = buildXlsx([{ name: "S", xml: dv }], {
    "xl/charts/chart1.xml": "<c:chartSpace/>",
    "xl/charts/chart2.xml": "<c:chartSpace/>",
    "xl/media/image1.png": new Uint8Array([1, 2, 3]),
    "xl/pivotTables/pivotTable1.xml": "<pivotTableDefinition/>",
    "xl/tables/table1.xml": "<table/>",
    "xl/comments1.xml": "<comments/>",
    "xl/externalLinks/externalLink1.xml": "<externalLink/>",
    "xl/vbaProject.bin": new Uint8Array([0]),
    "xl/embeddings/oleObject1.bin": new Uint8Array([0]),
  });
  const f = (await inspectXlsx(b(zip))).features;
  assert.deepEqual(f, {
    charts: 2, images: 1, pivotTables: 1, tables: 1, comments: 1, externalLinks: 1,
    macros: true, dataValidation: true, conditionalFormatting: true, embeddedObjects: 1,
  });
});

test("cell text mentioning features is not a false positive", async () => {
  const zip = buildXlsx([{ name: "S", xml: sheetXml([["dataValidations conditionalFormatting"]]) }]);
  const f = (await inspectXlsx(b(zip))).features;
  assert.equal(f.dataValidation, false);
  assert.equal(f.conditionalFormatting, false);
});

test("feature markers split across chunks are found", async () => {
  const dv = sheetXml([["x".repeat(5000)]], `<dataValidations count="1"/>`);
  const zip = buildXlsx([{ name: "S", xml: dv }], {}, { level: 0 });
  const r = await inspectXlsx(b(zip), { chunkBytes: 7 });
  assert.equal(r.features.dataValidation, true);
});

test("rejects DOCTYPE / entity declarations (billion laughs)", async () => {
  const evil = `<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;">]><worksheet><sheetData/></worksheet>`;
  await assert.rejects(inspectXlsx(b(buildXlsx([{ name: "S", xml: evil }]))), isCode("unsafe-content"));
});

test("stops a decompression bomb using actual decompressed bytes", async () => {
  const zeros = new Uint8Array(3 * 1024 * 1024); // compresses to a few KB
  const zip = buildXlsx([{ name: "S" }], { "xl/media/big.bin": zeros }, { level: 9 });
  assert.ok(zip.length < 50000, `fixture compresses well (${zip.length} bytes)`);
  await assert.rejects(inspectXlsx(b(zip), { limits: { maxTotalBytes: 1024 * 1024 } }), isCode("zip-bomb"));
  await assert.rejects(inspectXlsx(b(zip), { limits: { maxPartBytes: 1024 * 1024 } }), isCode("too-large-for-engine"));
});

test("rejects too many entries", async () => {
  const extra: Record<string, string> = {};
  for (let i = 0; i < 30; i++) extra[`xl/media/x${i}.bin`] = "x";
  await assert.rejects(inspectXlsx(b(buildXlsx([{ name: "S" }], extra)), { limits: { maxEntries: 20 } }), isCode("zip-bomb"));
});

test("truncated workbook is reported as damaged", async () => {
  const zip = buildXlsx([{ name: "S", xml: sheetXml(Array.from({ length: 200 }, (_, i) => [`row ${i}`])) }]);
  await assert.rejects(inspectXlsx(b(zip.slice(0, Math.floor(zip.length * 0.6)))), isCode("corrupt-file"));
});

test("corrupted compressed data is reported as damaged", async () => {
  const zip = buildXlsx([{ name: "S", xml: sheetXml(Array.from({ length: 300 }, (_, i) => [`value ${i} ${"z".repeat(i % 17)}`])) }]);
  const bad = zip.slice();
  for (let i = 400; i < 900; i++) bad[i] = bad[i]! ^ 0x5a;
  await assert.rejects(inspectXlsx(b(bad)), (e: unknown) => e instanceof EngineError && ["corrupt-file", "unsupported-format"].includes(e.code));
});

test("non-workbook ZIP files get a specific message", async () => {
  const docx = zipSync({
    "[Content_Types].xml": strToU8('<Types><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
    "word/document.xml": strToU8("<w:document/>"),
  });
  await assert.rejects(inspectXlsx(b(docx)), (e: unknown) => e instanceof EngineError && e.code === "unsupported-format" && /Word document/.test(e.message));
  const plain = zipSync({ "readme.txt": strToU8("hi") });
  await assert.rejects(inspectXlsx(b(plain)), isCode("unsupported-format"));
  const xlsb = zipSync({ "[Content_Types].xml": strToU8('<Types><Override PartName="/xl/workbook.bin" ContentType="application/vnd.ms-excel.sheet.binary.macroEnabled.main"/></Types>'), "xl/workbook.bin": new Uint8Array([1]) });
  await assert.rejects(inspectXlsx(b(xlsb)), (e: unknown) => e instanceof EngineError && /xlsb/.test(e.message));
});

test("path traversal entry names are rejected", async () => {
  const zip = buildXlsx([{ name: "S" }], { "xl/../../evil.xml": "<x/>" });
  await assert.rejects(inspectXlsx(b(zip)), isCode("unsafe-content"));
});

test("workbook with no sheets is reported", async () => {
  await assert.rejects(inspectXlsx(b(buildXlsx([]))), isCode("corrupt-file"));
});

test("cancellation", async () => {
  const zip = buildXlsx([{ name: "S", xml: sheetXml(Array.from({ length: 2000 }, (_, i) => [`r${i}`])) }], {}, { level: 0 });
  const token = { cancelled: false };
  await assert.rejects(
    inspectXlsx(b(zip), { chunkBytes: 1000, cancel: token, onProgress: (n) => { if (n > 5000) token.cancelled = true; } }),
    isCode("cancelled"),
  );
});

test("helpers", () => {
  assert.deepEqual(dimensionSize("A1:F2000"), { rows: 2000, columns: 6 });
  assert.deepEqual(dimensionSize("B2"), { rows: 1, columns: 1 });
  assert.deepEqual(dimensionSize("A1:XFD1048576"), { rows: 1048576, columns: 16384 });
  assert.equal(dimensionSize("garbage"), null);
  assert.equal(decodeXmlText("A &amp; B &lt;&#65;&#x42;&gt;"), "A & B <AB>");
  const s = parseWorkbookSheets('<sheets><sheet name="Chart1" sheetId="1" r:id="rId1"/></sheets>', '<Relationships><Relationship Id="rId1" Target="chartsheets/sheet1.xml"/></Relationships>');
  assert.equal(s[0]!.kind, "chartsheet");
});

test("sheet layout (hidden rows/columns, heights, widths) is read even when tags span chunks", async () => {
  const rows = Array.from({ length: 60 }, (_, i) =>
    i === 4 ? `<row r="5" hidden="1"><c r="A5" t="inlineStr"><is><t>x</t></is></c></row>`
    : i === 9 ? `<row r="10" ht="42.5" customHeight="1"><c r="A10"><v>1</v></c></row>`
    : i === 11 ? `<row r="12" ht="15"><c r="A12"><v>1</v></c></row>` // not custom: ignored
    : `<row r="${i + 1}"><c r="A${i + 1}"><v>${i}</v></c></row>`).join("");
  const xml = `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cols><col min="1" max="1" width="30.5" customWidth="1"/><col min="3" max="4" width="9" hidden="1"/><col min="5" max="16384" width="8.43"/></cols><sheetData>${rows}</sheetData></worksheet>`;
  const zip = buildXlsx([{ name: "S", xml }], {}, { level: 0 });
  for (const chunkBytes of [7, 64, 4 * 1024 * 1024]) {
    const l = (await inspectXlsx(b(zip), { chunkBytes })).sheets[0]!.layout;
    assert.deepEqual(l.hiddenRows, [4], `hidden rows @${chunkBytes}`);
    assert.deepEqual(l.rowHeights, [[9, 42.5]], `heights @${chunkBytes}`);
    assert.deepEqual(l.hiddenColumns, [2, 3], `hidden cols @${chunkBytes}`);
    assert.deepEqual(l.columnWidths, [[0, 30.5]], `widths @${chunkBytes}`);
  }
});
