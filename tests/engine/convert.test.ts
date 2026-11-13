/**
 * Stage 6 Step 2: CSV → Excel rules (decision 1) and the split past Excel's
 * row limit (decision 2). Expected results come from
 * scripts/fixtures/make_convert_pack.py (written from the rules).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { EngineCore } from "../../src/engine/core.ts";
import { convertValue, isoToSerial } from "../../src/engine/convert/csv-to-xlsx.ts";
import { inspectXlsx } from "../../src/engine/xlsx/inspect.ts";
import { readExcelSheet } from "../../src/engine/xlsx/read-workbook.ts";
import { parseCsv } from "../../src/engine/csv/parse-csv.ts";

const noop = () => {};
const dir = new URL("../fixtures/convert/", import.meta.url);
const pack = JSON.parse(readFileSync(new URL("expected.json", dir), "utf8")) as {
  planted: { value: string; kind: string; excel: string | number | null; format: string }[];
  customers: { numbers: number; dates: number; text: number; empty: number };
};

async function convert(source: string | Uint8Array, name: string, headerRow = true) {
  const core = new EngineCore();
  const bytes = typeof source === "string" ? new Uint8Array(readFileSync(new URL(source, dir))) : source;
  const s = await core.open(new File([bytes], name), "csv", {}, noop);
  return core.convertCsvToXlsx(s.activeSheet, { headerRow }, noop);
}

function openpyxl(blob: Uint8Array, script: string): unknown {
  const tmp = mkdtempSync(path.join(tmpdir(), "convert-"));
  const file = path.join(tmp, "out.xlsx");
  writeFileSync(file, blob);
  const py = spawnSync("python3", ["-I", "-c", `import openpyxl,sys,json,datetime\nwb=openpyxl.load_workbook(sys.argv[1], read_only=True)\n${script}`, file], { encoding: "utf8", maxBuffer: 1 << 26 });
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(py.status, 0, py.stderr);
  return JSON.parse(py.stdout);
}

test("decision 1: every planted value becomes exactly the expected cell", () => {
  for (const p of pack.planted) {
    const r = convertValue(p.value);
    assert.equal(r.kind, p.kind, JSON.stringify(p.value));
    if (p.kind === "empty") assert.equal(r.cell, null);
    else if (p.kind === "text") assert.deepEqual(r.cell, { t: "s", v: p.excel });
    else assert.deepEqual(r.cell, { t: "n", v: p.excel, ...(p.format ? { fmt: p.format } : {}) }, JSON.stringify(p.value));
  }
});

test("dates: Excel serial numbers are exact, impossible and pre-March-1900 dates are refused", () => {
  assert.equal(isoToSerial(1900, 3, 1), 61);
  assert.equal(isoToSerial(2024, 3, 15), 45366);
  assert.equal(isoToSerial(2024, 2, 29), 45351);
  assert.equal(isoToSerial(2023, 2, 29), null);
  assert.equal(isoToSerial(1900, 2, 28), null);
});

test("the converted pack file: openpyxl reads every planted value with the expected type and format", async () => {
  const { blob, summary } = await convert("1-values.csv", "1-values.csv");
  assert.equal(summary.downloadName, "1-values.xlsx");
  assert.deepEqual(summary.sheets, [{ name: "1-values", rows: pack.planted.length }]);
  const got = openpyxl(
    new Uint8Array(await blob.arrayBuffer()),
    "ws=wb.worksheets[0]\nprint(json.dumps([[ (c.value.isoformat() if isinstance(c.value,datetime.datetime) else c.value, c.data_type, c.number_format) for c in r] for r in ws.iter_rows()]))",
  ) as [unknown, string, string][][];
  assert.deepEqual(got[0]!.map((c) => c[0]), ["id", "value", "note"]);
  pack.planted.forEach((p, i) => {
    const cell = got[i + 1]![1];
    if (p.kind === "empty") return assert.ok(cell === undefined || cell[0] === null, `${i}`);
    if (p.kind === "date") {
      const d = new Date(Date.UTC(1899, 11, 30) + (p.excel as number) * 86_400_000).toISOString().slice(0, 10);
      assert.deepEqual(cell, [`${d}T00:00:00`, "d", p.format], p.value);
    } else if (p.kind === "number") assert.deepEqual(cell, [p.excel, "n", p.format || "General"], p.value);
    else assert.deepEqual([cell![0], cell![1]], [p.excel, "s"], p.value);
  });
  // Ids became numbers; notes stayed text.
  assert.deepEqual(got[1]![0]!.slice(0, 2), [1, "n"]);
});

test("round trip: in Excel, every converted cell shows exactly the text that was in the CSV", async () => {
  for (const f of ["1-values.csv", "2-customers.csv"]) {
    const { blob } = await convert(f, f);
    const inspection = await inspectXlsx(blob);
    const { sheet } = await readExcelSheet(blob, "xlsx", { sheetIndex: 0, inspection });
    const { sheet: csv } = await parseCsv(new Blob([new Uint8Array(readFileSync(new URL(f, dir)))]), "t");
    for (let r = 0; r < csv.grid.rowCount; r++) {
      for (let c = 0; c < csv.grid.rowLength(r); c++) {
        const want = String(csv.grid.get(r, c) ?? "");
        // (SheetJS turns CR LF inside a cell into LF; the pack's line breaks are LF.)
        assert.equal(sheet.grid.display!(r, c), want, `${f} ${r},${c}`);
      }
    }
  }
});

test("a realistic file: exact counts; ids with letters or leading zeros, phones and ZIP codes stay text", async () => {
  const { summary, blob } = await convert("2-customers.csv", "2-customers.csv");
  assert.deepEqual(summary.counts, pack.customers);
  const reasons = Object.fromEntries(summary.keptAsText.map((k) => [k.reason.split(" (")[0]!.split(":")[0], k.count]));
  // ids 00002… on even rows (20), phones 077… on rows not divisible by 3 (40 - 13 = 27), every ZIP code (40)
  assert.equal(reasons["Leading zeros"], 20 + 27 + 40);
  assert.equal(reasons["Dates other than year-month-day"], 10);
  assert.equal(reasons["Numbers with separators, signs, %, currency or exponents"], 13); // +44 phones on rows divisible by 3
  assert.equal(summary.verification.rows, 41);
  const types = openpyxl(new Uint8Array(await blob.arrayBuffer()), "ws=wb.worksheets[0]\nr=list(ws.iter_rows(min_row=2,max_row=3))\nprint(json.dumps([[c.data_type for c in x] for x in r]))") as string[][];
  // Row 2: id C0001, name, phone 077…, ZIP 00037 → text; joined ISO → date; balance, orders → numbers.
  assert.deepEqual(types[0]!.slice(0, 7), ["s", "s", "s", "s", "d", "n", "n"]);
});

test("decision 2: more rows than one sheet holds continue on a second sheet, with the header repeated", async () => {
  const rows = 1_048_580; // data rows
  const text = "n\n" + Array.from({ length: rows }, (_, i) => String(i + 1)).join("\n") + "\n";
  const { blob, summary } = await convert(new TextEncoder().encode(text), "big.csv");
  assert.equal(summary.split, true);
  assert.deepEqual(summary.sheets, [{ name: "big", rows: 1_048_575 }, { name: "big (2)", rows: 5 }]);
  const got = openpyxl(
    new Uint8Array(await blob.arrayBuffer()),
    "out=[]\nfor ws in wb.worksheets:\n  first=None; last=None; n=0\n  for r in ws.iter_rows(values_only=True):\n    n+=1; first=first or r; last=r\n  out.append([ws.title, n, list(first), list(last)])\nprint(json.dumps(out))",
  ) as [string, number, unknown[], unknown[]][];
  assert.deepEqual(got, [
    ["big", 1_048_576, ["n"], [1_048_575]],
    ["big (2)", 6, ["n"], [1_048_580]],
  ]);
});

test("decision 2 without column names: no header row is added; 1,048,576 rows per sheet", async () => {
  const text = Array.from({ length: 1_048_578 }, (_, i) => String(i + 1)).join("\n") + "\n";
  const { summary } = await convert(new TextEncoder().encode(text), "plain.csv", false);
  assert.deepEqual(summary.sheets, [{ name: "plain", rows: 1_048_576 }, { name: "plain (2)", rows: 2 }]);
});

test("only CSV files can be converted; a value too long for an Excel cell is refused with the reason", async () => {
  const core = new EngineCore();
  const xs = await core.open(new File([new Uint8Array(readFileSync(new URL("../fixtures/fix/6-excel-references.xlsx", import.meta.url)))], "w.xlsx"), "xlsx", {}, noop);
  await assert.rejects(core.convertCsvToXlsx(xs.activeSheet, { headerRow: true }, noop), /Only CSV files/);
  await assert.rejects(convert(new TextEncoder().encode(`a\n${"x".repeat(32_768)}\n`), "long.csv"), /Cell A2 .* 32,768 characters/);
});
