/**
 * Stage 4, Step 7: Excel download.
 * Every export is verified by DataFixer's reader inside exportXlsx (V1/V2) and
 * here, independently, with openpyxl (V4): untouched parts byte-identical (V5),
 * formulas, formatting, merged cells, charts and other features kept (V6).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { EngineCore } from "../../src/engine/core.ts";
import { EngineError } from "../../src/engine/errors.ts";
import { ooxmlText, withFullCalcOnLoad } from "../../src/engine/xlsx/patch.ts";
import { formulaRefs } from "../../src/engine/xlsx/references.ts";

const SCAN = new URL("../fixtures/scan/", import.meta.url);
const EXCEL = new URL("../fixtures/excel/", import.meta.url);
const noop = () => {};
const DIR = mkdtempSync(path.join(tmpdir(), "df-xlsx-"));
process.on("exit", () => rmSync(DIR, { recursive: true, force: true }));

function py(script: string, ...args: string[]): unknown {
  const r = spawnSync("python3", ["-I", "-c", script, ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

async function open(file: string, bytes: Uint8Array<ArrayBuffer>, format: "xlsx" | "xls" = "xlsx") {
  const core = new EngineCore();
  const s = await core.open(new File([bytes], file), format, {}, noop);
  return { core, sheet: s.activeSheet };
}
const fixture = (url: URL) => new Uint8Array(readFileSync(url));

async function save(blob: Blob, name: string): Promise<string> {
  const p = path.join(DIR, name);
  writeFileSync(p, Buffer.from(await blob.arrayBuffer()));
  return p;
}

/** Parts that differ between two packages (V5): changed, added, removed. */
const DIFF_PARTS = `
import zipfile, json, sys
a, b = zipfile.ZipFile(sys.argv[1]), zipfile.ZipFile(sys.argv[2])
assert b.testzip() is None
an, bn = set(a.namelist()), set(b.namelist())
print(json.dumps({"changed": sorted(n for n in an & bn if a.read(n) != b.read(n)), "removed": sorted(an - bn), "added": sorted(bn - an)}))
`;

/** Everything openpyxl sees in a workbook that the download must keep (V6). */
const FEATURES = `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1])
out = {"sheets": [[s.title, s.sheet_state] for s in wb.worksheets], "names": sorted(wb.defined_names.keys())}
for ws in wb.worksheets:
    cells = {}
    for row in ws.iter_rows():
        for c in row:
            if c.value is not None:
                v = c.value
                cells[c.coordinate] = [str(v), c.number_format, bool(c.font.b), c.fill.fgColor.rgb if c.fill and c.fill.fgColor.type == "rgb" else None]
    out[ws.title] = {
        "cells": cells,
        "merges": sorted(str(r) for r in ws.merged_cells.ranges),
        "cf": sorted(str(r.sqref) for r in ws.conditional_formatting),
        "dv": sorted(str(d.sqref) for d in ws.data_validations.dataValidation),
        "comments": sorted(c.coordinate for row in ws.iter_rows() for c in row if c.comment),
        "links": sorted(c.coordinate for row in ws.iter_rows() for c in row if c.hyperlink),
        "widths": {k: v.width for k, v in ws.column_dimensions.items() if v.width},
        "hidden_rows": sorted(k for k, v in ws.row_dimensions.items() if v.hidden),
        "images": len(ws._images), "charts": len(ws._charts),
    }
print(json.dumps(out))
`;

type Features = Record<string, { cells: Record<string, [string, string, boolean, string | null]> } & Record<string, unknown>> & { sheets: unknown; names: unknown };

test("2-problems.xlsx: all fixes, a real date, a manual edit and a replaced formula; only the changed parts differ", async () => {
  const src = fixture(new URL("2-problems.xlsx", SCAN));
  const { core, sheet } = await open("2-problems.xlsx", src);
  core.applyFix(sheet, (await core.previewFixAll(sheet, { headerRow: true }, noop)).token);
  core.applyFix(sheet, (await core.previewFix(sheet, "inconsistent-dates", { headerRow: true, dateChoices: { 6: { target: "excel-dmy" } } }, noop)).token);
  core.editCell(sheet, 7, 2, "person7@example.com");
  const fkey = [...core.getSheet(sheet)!.formulas.keys()][0]!;
  core.editCell(sheet, Math.floor(fkey / 16384), fkey % 16384, "0", { replaceFormula: true });
  const phases = new Set<string>();
  const { blob, summary } = await core.exportXlsx(sheet, (p) => phases.add(p.phase));
  assert.ok(phases.has("verifying"));
  assert.equal(summary.format, "xlsx");
  assert.equal(summary.downloadName, "2-problems-cleaned.xlsx");
  assert.equal(summary.rowsRemoved, 3, "duplicates and the empty row were removed (nothing refers to them)");
  assert.deepEqual(summary.notPreserved, []);
  assert.equal(summary.verification.reader, "DataFixer's Excel reader");
  const out = await save(blob, "a.xlsx");
  const srcPath = path.join(DIR, "a-src.xlsx");
  writeFileSync(srcPath, src);
  const diff = py(DIFF_PARTS, srcPath, out) as { changed: string[]; removed: string[]; added: string[] };
  assert.deepEqual(diff, { changed: ["xl/styles.xml", "xl/workbook.xml", "xl/worksheets/sheet1.xml"], removed: [], added: [] });
  assert.deepEqual([...summary.changedParts!].sort(), diff.changed);
  const v = py(
    `
import openpyxl, json, sys
ws = openpyxl.load_workbook(sys.argv[1]).active
rows = [[c.value if not hasattr(c.value, "isoformat") else c.value.isoformat() for c in r] for r in ws.iter_rows()]
print(json.dumps({"rows": rows, "fmt": [c.number_format for c in ws["G"]], "calc": open(sys.argv[1], "rb") and None}))
`,
    out,
  ) as { rows: unknown[][]; fmt: string[] };
  assert.equal(v.rows.length, 25, "28 rows minus 3 removed");
  assert.deepEqual(v.rows[3]!.slice(0, 2), [3, "Person 3"], "spaces removed");
  assert.equal(v.rows[5]![4], "Paris", "capitalization fixed");
  assert.equal(v.rows[7]![2], "person7@example.com", "manual edit");
  assert.equal(v.rows[13]![5], 0, "formula replaced by the typed value");
  assert.equal(v.rows[14]![6], "2024-01-31T00:00:00", "text date became a real date");
  assert.equal(v.fmt[14], "dd/mm/yyyy");
  assert.ok(!v.rows.some((r) => r[0] === 1 && r !== v.rows[1]), "duplicate rows gone");
});

test("lo-features.xlsx (LibreOffice): formatting, rules, charts, comments, images, links, names and hidden sheets are all kept", async () => {
  const src = fixture(new URL("lo-features.xlsx", EXCEL));
  const srcPath = path.join(DIR, "lo-src.xlsx");
  writeFileSync(srcPath, src);
  const before = py(FEATURES, srcPath) as Features;
  const { core, sheet } = await open("lo-features.xlsx", src);
  // Change a text cell and a number cell (positions found from the data).
  const view = core.getSheet(sheet)!;
  let textCell: [number, number] | null = null;
  let numCell: [number, number] | null = null;
  for (let r = 1; r < view.grid.rowCount && (!textCell || !numCell); r++) {
    for (let c = 0; c < view.grid.rowLength(r); c++) {
      const val = view.grid.get(r, c);
      if (view.formulas.has(r * 16384 + c) || view.hyperlinks.has(r * 16384 + c)) continue;
      if (!textCell && typeof val === "string" && val.trim()) textCell = [r, c];
      if (!numCell && typeof val === "number" && !view.grid.isDate!(r, c)) numCell = [r, c];
    }
  }
  core.editCell(sheet, textCell![0], textCell![1], "Edited & <checked>");
  core.editCell(sheet, numCell![0], numCell![1], "4242");
  const { blob, summary } = await core.exportXlsx(sheet, noop);
  const out = await save(blob, "lo.xlsx");
  const diff = py(DIFF_PARTS, srcPath, out) as { changed: string[]; removed: string[]; added: string[] };
  assert.deepEqual(diff.removed, []);
  assert.deepEqual(diff.added, []);
  assert.deepEqual(diff.changed.sort(), ["xl/workbook.xml", "xl/worksheets/sheet1.xml"], "charts, drawings, comments, styles, other sheets: byte-identical");
  const after = py(FEATURES, out) as Features;
  assert.deepEqual(after.sheets, before.sheets, "sheets and hidden states");
  assert.deepEqual(after.names, before.names, "named ranges");
  for (const name of Object.keys(before).filter((k) => k !== "sheets" && k !== "names")) {
    const b = before[name]!;
    const a = after[name]!;
    for (const k of ["merges", "cf", "dv", "comments", "links", "widths", "hidden_rows", "images", "charts"]) assert.deepEqual(a[k], b[k], `${name}: ${k}`);
    if (name !== sheet) assert.deepEqual(a.cells, b.cells, `${name}: every cell unchanged`);
  }
  const ref = (rc: [number, number]) => `${String.fromCharCode(65 + rc[1])}${rc[0] + 1}`;
  const a = after[sheet]!.cells;
  const b = before[sheet]!.cells;
  assert.equal(a[ref(textCell!)]![0], "Edited & <checked>");
  assert.equal(a[ref(numCell!)]![0], "4242");
  assert.deepEqual(a[ref(textCell!)]!.slice(1), b[ref(textCell!)]!.slice(1), "edited cell keeps its style");
  for (const k of Object.keys(b)) if (k !== ref(textCell!) && k !== ref(numCell!)) assert.deepEqual(a[k], b[k], `cell ${k} unchanged (value, format, bold, fill)`);
  assert.ok(summary.warnings.some((w) => /recalculate/.test(w)));
});

/** A workbook made with openpyxl: data with duplicates, an empty column, and optionally a formula/chart that refers to the rows. */
function makeWorkbook(name: string, withReferences: boolean): string {
  const p = path.join(DIR, name);
  py(
    `
import openpyxl, json, sys
from openpyxl.chart import BarChart, Reference
wb = openpyxl.Workbook(); ws = wb.active; ws.title = "Data"
ws.append(["id", "name", "", "amount"])
for i in range(1, 9): ws.append([i, f"Name {i}", None, i * 10])
ws.append([2, "Name 2", None, 20]); ws.append([3, "Name 3", None, 30])
ws.column_dimensions["D"].width = 31
ws["B2"].font = openpyxl.styles.Font(bold=True)
if sys.argv[2] == "1":
    s = wb.create_sheet("Summary"); s["A1"] = "=SUM(Data!D2:D11)"
    ch = BarChart(); ch.add_data(Reference(ws, min_col=4, min_row=1, max_row=11), titles_from_data=True); ws.add_chart(ch, "F2")
wb.save(sys.argv[1]); print("null")
`,
    p,
    withReferences ? "1" : "0",
  );
  return p;
}

test("safe removal: duplicate rows and an empty column are removed; cells, widths and styles move with them", async () => {
  const p = makeWorkbook("plain.xlsx", false);
  const { core, sheet } = await open("plain.xlsx", new Uint8Array(readFileSync(p)));
  const dup = await core.previewFix(sheet, "duplicate-rows", { headerRow: true }, noop);
  assert.deepEqual(dup.excelCheck, { affected: [], clearing: false });
  core.applyFix(sheet, dup.token);
  const col = await core.previewFix(sheet, "empty-columns", { headerRow: true, keepColumns: [] }, noop);
  assert.equal(col.columnsRemoved, 1);
  core.applyFix(sheet, col.token);
  const { blob } = await core.exportXlsx(sheet, noop);
  const v = py(
    `
import openpyxl, json, sys
ws = openpyxl.load_workbook(sys.argv[1]).active
print(json.dumps({"rows": [[c.value for c in r] for r in ws.iter_rows()], "widthC": ws.column_dimensions["C"].width, "bold": ws["B2"].font.b, "dim": ws.dimensions}))
`,
    await save(blob, "plain-out.xlsx"),
  ) as { rows: unknown[][]; widthC: number; bold: boolean; dim: string };
  assert.equal(v.rows.length, 9);
  assert.deepEqual(v.rows[0], ["id", "name", "amount"]);
  assert.deepEqual(v.rows[8], [8, "Name 8", 80]);
  assert.equal(v.widthC, 31, "column D's width moved to C");
  assert.equal(v.bold, true);
  assert.equal(v.dim, "A1:C9");
});

test("removal that would break references is refused; clearing the cells instead keeps every position", async () => {
  const p = makeWorkbook("refs.xlsx", true);
  const { core, sheet } = await open("refs.xlsx", new Uint8Array(readFileSync(p)));
  const blocked = await core.previewFix(sheet, "duplicate-rows", { headerRow: true }, noop);
  assert.ok(blocked.excelCheck!.affected.some((a) => /sheet “Summary”/.test(a)), JSON.stringify(blocked.excelCheck));
  assert.ok(blocked.excelCheck!.affected.some((a) => /Chart/.test(a)));
  assert.equal(core.applyFix(sheet, blocked.token).entry, null, "nothing is removed");
  // Fix all leaves them too, with a note.
  const all = await core.previewFixAll(sheet, { headerRow: true }, noop);
  assert.ok(!all.steps.some((s) => s.fixId === "duplicate-rows"));
  assert.ok(all.notes.some((n) => /would break/.test(n)));
  // A removal applied anyway (e.g. by an older preview) is caught at download.
  core.applyChange(sheet, { operation: "x", label: "X", deleteRows: [{ row: 9, reason: "test" }] });
  await assert.rejects(core.exportXlsx(sheet, noop), (e: unknown) => e instanceof EngineError && e.code === "would-break-references");
  core.undo(sheet);
  const clear = await core.previewFix(sheet, "duplicate-rows", { headerRow: true, clearInsteadOfRemove: true }, noop);
  assert.deepEqual([clear.cellsChanged, clear.rowsRemoved], [6, 0]);
  core.applyFix(sheet, clear.token);
  const { blob } = await core.exportXlsx(sheet, noop);
  const v = py(
    `
import openpyxl, json, sys
wb = openpyxl.load_workbook(sys.argv[1]); ws = wb["Data"]
print(json.dumps({"n": ws.max_row, "r10": [c.value for c in ws[10]], "sum": wb["Summary"]["A1"].value, "charts": len(ws._charts)}))
`,
    await save(blob, "refs-out.xlsx"),
  ) as { n: number; r10: unknown[]; sum: string; charts: number };
  assert.equal(v.sum, "=SUM(Data!D2:D11)", "the formula on another sheet is untouched");
  assert.deepEqual(v.r10, [null, null, null, null], "duplicate row cleared, still in place");
  assert.equal(v.charts, 1);
});

test("calcChain (Excel's formula order cache) is removed only when a formula is replaced", async () => {
  // Add a calcChain to the test file, as Excel would.
  const withChain = path.join(DIR, "chain.xlsx");
  writeFileSync(path.join(DIR, "chain-src.xlsx"), fixture(new URL("2-problems.xlsx", SCAN)));
  py(
    `
import zipfile, sys
src, dst = sys.argv[1], sys.argv[2]
zin = zipfile.ZipFile(src); zout = zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED)
for i in zin.infolist():
    data = zin.read(i.filename)
    if i.filename == "[Content_Types].xml": data = data.replace(b"</Types>", b'<Override PartName="/xl/calcChain.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.calcChain+xml"/></Types>')
    if i.filename == "xl/_rels/workbook.xml.rels": data = data.replace(b"</Relationships>", b'<Relationship Id="rIdCC" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/calcChain" Target="calcChain.xml"/></Relationships>')
    zout.writestr(i, data)
zout.writestr("xl/calcChain.xml", '<?xml version="1.0"?><calcChain xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><c r="F14" i="1"/></calcChain>')
zout.close(); print("null")
`,
    path.join(DIR, "chain-src.xlsx"),
    withChain,
  );
  const bytes = new Uint8Array(readFileSync(withChain));
  const a = await open("chain.xlsx", bytes);
  a.core.editCell(a.sheet, 1, 1, "Someone");
  const keep = await a.core.exportXlsx(a.sheet, noop);
  assert.ok(!keep.summary.changedParts!.includes("xl/calcChain.xml"));
  const b = await open("chain.xlsx", bytes);
  const fkey = [...b.core.getSheet(b.sheet)!.formulas.keys()][0]!;
  b.core.editCell(b.sheet, Math.floor(fkey / 16384), fkey % 16384, "1", { replaceFormula: true });
  const drop = await b.core.exportXlsx(b.sheet, noop);
  assert.ok(drop.summary.changedParts!.includes("xl/calcChain.xml"));
  const diff = py(DIFF_PARTS, withChain, await save(drop.blob, "chain-out.xlsx")) as { changed: string[]; removed: string[] };
  assert.deepEqual(diff.removed, ["xl/calcChain.xml"]);
  assert.ok(diff.changed.includes("[Content_Types].xml") && diff.changed.includes("xl/_rels/workbook.xml.rels"));
  py(`import openpyxl, sys; openpyxl.load_workbook(sys.argv[1]); print("null")`, path.join(DIR, "chain-out.xlsx"));
});

test("a shared formula's first cell can't be replaced on its own (other cells would break); the others can", async () => {
  const shared = path.join(DIR, "shared.xlsx");
  writeFileSync(path.join(DIR, "shared-src.xlsx"), fixture(new URL("2-problems.xlsx", SCAN)));
  py(
    `
import zipfile, sys, re
zin = zipfile.ZipFile(sys.argv[1]); zout = zipfile.ZipFile(sys.argv[2], "w", zipfile.ZIP_DEFLATED)
for i in zin.infolist():
    data = zin.read(i.filename)
    if i.filename == "xl/worksheets/sheet1.xml":
        s = data.decode()
        s = re.sub(r'<c r="F2"[^>]*?(/>|>.*?</c>)', '<c r="F2"><f t="shared" ref="F2:F3" si="0">A2*113</f><v>113</v></c>', s, count=1)
        s = re.sub(r'<c r="F3"[^>]*?(/>|>.*?</c>)', '<c r="F3"><f t="shared" si="0"/><v>226</v></c>', s, count=1)
        data = s.encode()
    zout.writestr(i, data)
zout.close(); print("null")
`,
    path.join(DIR, "shared-src.xlsx"),
    shared,
  );
  const bytes = new Uint8Array(readFileSync(shared));
  const a = await open("shared.xlsx", bytes);
  a.core.editCell(a.sheet, 1, 5, "5", { replaceFormula: true });
  await assert.rejects(a.core.exportXlsx(a.sheet, noop), (e: unknown) => e instanceof EngineError && /shares with other cells/.test(e.message));
  const b = await open("shared.xlsx", bytes);
  b.core.editCell(b.sheet, 2, 5, "5", { replaceFormula: true });
  const { blob } = await b.core.exportXlsx(b.sheet, noop);
  const v = py(`import openpyxl, json, sys; ws = openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps([ws["F2"].value, ws["F3"].value]))`, await save(blob, "shared-out.xlsx"));
  assert.deepEqual(v, ["=A2*113", 5]);
});

test("old .xls files are rebuilt as .xlsx; the summary lists what that can't keep", async () => {
  const { core, sheet } = await open("lo-features.xls", fixture(new URL("lo-features.xls", EXCEL)), "xls");
  core.editCell(sheet, 2, 1, "From xls");
  const { blob, summary } = await core.exportXlsx(sheet, noop);
  assert.equal(summary.downloadName, "lo-features-cleaned.xlsx");
  assert.ok(summary.notPreserved.some((n) => /Conditional formatting/.test(n)));
  assert.ok(summary.notPreserved.some((n) => /fonts, colours/.test(n)));
  const v = py(
    `import openpyxl, json, sys; wb = openpyxl.load_workbook(sys.argv[1]); print(json.dumps([wb.sheetnames, wb.worksheets[0]["B3"].value, [c.value for c in wb.worksheets[0]["D"] if isinstance(c.value, str) and c.value.startswith("=")][:1]]))`,
    await save(blob, "xls-out.xlsx"),
  ) as [string[], string, string[]];
  assert.deepEqual(v[0], ["Data", "Summary", "Archive", "Secret", "Chart1"]);
  assert.equal(v[1], "From xls");
  // Removing rows from .xls is never offered (references can't be checked); clearing is.
  const blocked = await core.previewFix(sheet, "empty-rows", { headerRow: true }, noop);
  if (blocked.deletesFromExcel) assert.ok(blocked.excelCheck!.affected.length > 0);
});

test("text with special characters survives exactly (XML escaping and Excel's _xHHHH_ escapes)", async () => {
  const { core, sheet } = await open("2-problems.xlsx", fixture(new URL("2-problems.xlsx", SCAN)));
  const tricky = `a & b < c > "q" 'x' _x0041_ tab\there ${String.fromCharCode(1)} end  `;
  core.editCell(sheet, 1, 7, tricky);
  const { blob } = await core.exportXlsx(sheet, noop); // DataFixer's reader compared the value exactly
  const v = py(`import openpyxl, json, sys; ws = openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps(ws["H2"].value))`, await save(blob, "tricky.xlsx")) as string;
  assert.ok(v.startsWith('a & b < c > "q" \'x\''), v);
  assert.equal(ooxmlText("_x0041_"), "_x005F_x0041_");
  assert.equal(ooxmlText(String.fromCharCode(1)), "_x0001_");
});

test("helpers: references in formulas, and the recalculate-on-open flag", () => {
  assert.deepEqual(
    formulaRefs("SUM(A1:B5)+'My Sheet'!C10+LOG10(2)+COUNT(D:D)+\"Z9\"").map((r) => [r.sheet, r.maxRow, r.maxCol]),
    [
      [null, 4, 1],
      ["My Sheet", 9, 2],
      [null, Infinity, 3],
    ],
  );
  assert.ok(formulaRefs("INDIRECT(\"A\"&B1)").some((r) => r.dynamic));
  assert.equal(withFullCalcOnLoad('<workbook><sheets/><calcPr calcId="1"/></workbook>'), '<workbook><sheets/><calcPr calcId="1" fullCalcOnLoad="1"/></workbook>');
  assert.equal(withFullCalcOnLoad("<workbook><sheets></sheets></workbook>"), '<workbook><sheets></sheets><calcPr fullCalcOnLoad="1"/></workbook>');
});

test("a blocked removal previews no changes (no Apply), until clearing is chosen", async () => {
  const p = makeWorkbook("refs2.xlsx", true);
  const { core, sheet } = await open("refs2.xlsx", new Uint8Array(readFileSync(p)));
  const blocked = await core.previewFix(sheet, "duplicate-rows", { headerRow: true }, noop);
  assert.deepEqual([blocked.cellsChanged, blocked.rowsRemoved, blocked.columnsRemoved, blocked.rows.length], [0, 0, 0, 0]);
});
