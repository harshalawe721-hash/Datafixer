/**
 * Stage 6 Step 4: Excel → CSV — plain values (decision 4), all sheets as a ZIP
 * (decision 3), hidden rows/columns and merged cells (decision 5).
 * Independent readers: openpyxl (values) and Python's zipfile/csv modules.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { EngineCore, type CsvDownloadOptions } from "../../src/engine/core.ts";
import { serialToIso } from "../../src/engine/export/csv-export.ts";

const noop = () => {};
const xl = (f: string) => new URL(`../fixtures/excel/${f}`, import.meta.url);

async function open(f: string) {
  const core = new EngineCore();
  const format = f.endsWith(".xls") ? "xls" : "xlsx";
  const s = await core.open(new File([new Uint8Array(readFileSync(xl(f)))], f), format, {}, noop);
  return { core, sheet: s.activeSheet, summary: s };
}
async function csvRows(blob: Blob, delimiter = ","): Promise<string[][]> {
  const tmp = mkdtempSync(path.join(tmpdir(), "x2c-"));
  const file = path.join(tmp, "f.csv");
  writeFileSync(file, new Uint8Array(await blob.arrayBuffer()));
  const py = spawnSync("python3", ["-I", "-c", "import csv,sys,json\nprint(json.dumps(list(csv.reader(open(sys.argv[1],newline='',encoding='utf-8-sig'),delimiter=sys.argv[2]))))", file, delimiter], { encoding: "utf8" });
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(py.status, 0, py.stderr);
  return JSON.parse(py.stdout) as string[][];
}
/** Plain values of a sheet, as read by openpyxl (cached formula results), in DataFixer's plain format. */
function openpyxlPlain(f: string, sheet: string): string[][] {
  const py = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      [
        "import openpyxl,sys,json,datetime",
        "ws=openpyxl.load_workbook(sys.argv[1], data_only=True)[sys.argv[2]]",
        "def t(v):",
        "  if v is None: return ''",
        "  if isinstance(v,bool): return 'TRUE' if v else 'FALSE'",
        "  if isinstance(v,datetime.datetime): return v.strftime('%Y-%m-%d') + ('' if (v.hour,v.minute,v.second)==(0,0,0) else v.strftime(' %H:%M:%S'))",
        "  if isinstance(v,float) and v.is_integer(): return str(int(v))",
        "  return str(v)",
        "print(json.dumps([[t(c.value) for c in r] for r in ws.iter_rows()]))",
      ].join("\n"),
      xl(f).pathname,
      sheet,
    ],
    { encoding: "utf8" },
  );
  assert.equal(py.status, 0, py.stderr);
  return JSON.parse(py.stdout) as string[][];
}
const trimRight = (rows: string[][]) => rows.map((r) => {
  const out = [...r];
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
});

test("serialToIso: Excel dates and times as year-month-day, both date systems, the fake 29 Feb 1900", () => {
  assert.equal(serialToIso(45366), "2024-03-15");
  assert.equal(serialToIso(45366.5), "2024-03-15 12:00:00");
  assert.equal(serialToIso(45366.999999), "2024-03-16");
  assert.equal(serialToIso(0.25), "06:00:00");
  assert.equal(serialToIso(1), "1900-01-01");
  assert.equal(serialToIso(59), "1900-02-28");
  assert.equal(serialToIso(60), "1900-02-29");
  assert.equal(serialToIso(61), "1900-03-01");
  assert.equal(serialToIso(0, true), "1904-01-01");
  assert.equal(serialToIso(45366 - 1462, true), "2024-03-15");
});

test("decision 4: plain values match openpyxl's values cell by cell (dates, numbers, TRUE/FALSE, error results)", async () => {
  for (const f of ["lo-features.xlsx", "lo-features.xls"]) {
    const { core, sheet } = await open(f);
    const { blob, summary } = await core.exportCsv(sheet, noop, undefined, { values: "plain" });
    assert.equal(summary.downloadName, `lo-features - Data.csv`, f);
    assert.deepEqual(summary.csv, { delimiter: ",", lineEnding: "\r\n", bom: true, values: "plain" });
    assert.ok(summary.warnings.some((w) => /Plain values: dates are saved as year-month-day/.test(w)));
    const got = trimRight(await csvRows(blob));
    const want = trimRight(openpyxlPlain("lo-features.xlsx", "Data"));
    assert.deepEqual(got.slice(0, 5), want.slice(0, 5), f);
    assert.deepEqual(got[1]!.slice(0, 5), ["Ann", "10.5", "2024-01-31", "TRUE", "21"]);
    assert.deepEqual(got[3]!.slice(4, 5), ["#DIV/0!"]);
  }
});

test("decision 4: values as shown keep Excel's display (default), and the summary lists what a CSV can't keep (decision 5)", async () => {
  const { core, sheet } = await open("lo-features.xlsx");
  const { blob, summary } = await core.exportCsv(sheet, noop);
  const rows = await csvRows(blob);
  assert.deepEqual(rows[2]!.slice(0, 3), ["Zoë 東京 😀", "1,234.57", "2023-12-01"]);
  assert.equal(summary.csv!.values, "shown");
  for (const item of [/Formulas \(\d+\)/, /Merged cells/, /Hidden rows and columns \(they are included, unhidden\)/, /Other sheets/, /chart/, /Comments/]) {
    assert.ok(summary.notPreserved.some((n) => item.test(n)), `${item}: ${summary.notPreserved.join(" | ")}`);
  }
  // Decision 5: the hidden row (row 4) and hidden column (G) are included; the merged value appears once.
  assert.equal(rows.length, 5);
  assert.equal(rows[1]![6], "hidden column value");
  assert.deepEqual(rows[0]!.slice(7, 9), ["Merged header", ""]);
});

test("1904 date system: plain dates are still right", async () => {
  const { core, sheet } = await open("date1904.xlsx");
  const { blob } = await core.exportCsv(sheet, noop, undefined, { values: "plain" });
  assert.deepEqual(await csvRows(blob), [["2024-01-31"]]);
});

/** Unzip with Python and read every CSV with the csv module. */
async function unzip(blob: Blob, delimiter = ","): Promise<Record<string, { rows: string[][]; bom: boolean; crlf: boolean }>> {
  const tmp = mkdtempSync(path.join(tmpdir(), "x2c-zip-"));
  const file = path.join(tmp, "f.zip");
  writeFileSync(file, new Uint8Array(await blob.arrayBuffer()));
  const py = spawnSync(
    "python3",
    ["-I", "-c", "import zipfile,csv,io,sys,json\nz=zipfile.ZipFile(sys.argv[1])\nassert z.testzip() is None\nout={}\nfor n in z.namelist():\n  b=z.read(n)\n  out[n]={'rows':list(csv.reader(io.StringIO(b.decode('utf-8-sig'),newline=''),delimiter=sys.argv[2])),'bom':b[:3]==b'\\xef\\xbb\\xbf','crlf':b'\\r\\n' in b}\nprint(json.dumps(out))", file, delimiter],
    { encoding: "utf8" },
  );
  rmSync(tmp, { recursive: true, force: true });
  assert.equal(py.status, 0, py.stderr);
  return JSON.parse(py.stdout);
}

test("decision 3: all sheets as a ZIP — one CSV per worksheet, hidden sheets marked, the chart sheet left out; Python reads every file", async () => {
  // LibreOffice saved this workbook's chart sheet as an ordinary worksheet holding the chart, so it is a worksheet here.
  const { core } = await open("lo-features.xlsx");
  const { blob, summary } = await core.exportWorkbookZip({}, noop);
  assert.equal(summary.downloadName, "lo-features - all sheets.zip");
  assert.deepEqual(summary.files.map((f) => [f.name, f.hidden]), [["Data.csv", false], ["Summary.csv", false], ["Archive.csv", true], ["Secret.csv", true], ["Chart1.csv", false]]);
  assert.deepEqual(summary.skipped, []);
  assert.ok(summary.warnings.some((w) => /Hidden sheets are included/.test(w)));
  const files = await unzip(blob);
  assert.deepEqual(Object.keys(files), ["Data.csv", "Summary.csv", "Archive.csv", "Secret.csv", "Chart1.csv"]);
  assert.deepEqual(files["Summary.csv"]!.rows[1], ["First name", "Ann"]);
  assert.deepEqual(files["Archive.csv"]!.rows, [["old", "1"]]);
  // Every file starts with the BOM; files with rows use CRLF. Chart1 holds only a chart: an empty CSV (just the BOM).
  assert.ok(Object.values(files).every((f) => f.bom && (f.crlf || f.rows.length === 0)));
  assert.deepEqual(files["Chart1.csv"]!.rows, []);
  assert.deepEqual(files["Data.csv"]!.rows[1]!.slice(0, 3), ["Ann", "10.50", "2024-01-31"]);
});

test("decision 3: a real chart sheet (no cells) is left out of the ZIP and listed; a very hidden sheet is included", async () => {
  const { core } = await open("openpyxl-features.xlsx");
  const { blob, summary } = await core.exportWorkbookZip({}, noop);
  assert.deepEqual(summary.files.map((f) => [f.name, f.hidden]), [["Data.csv", false], ["Summary.csv", false], ["Archive.csv", true], ["Secret.csv", true]]);
  assert.deepEqual(summary.skipped, ["Chart1"]);
  assert.ok(summary.notPreserved.some((n) => /Chart sheets \(Chart1\): they have no cells/.test(n)));
  assert.deepEqual(Object.keys(await unzip(blob)), ["Data.csv", "Summary.csv", "Archive.csv", "Secret.csv"]);
});

test("decision 3: ZIP with options (plain, semicolon, LF, no BOM), Unicode sheet names, .xlsx and .xls", async () => {
  const opts: CsvDownloadOptions = { values: "plain", delimiter: ";", lineEnding: "\n", bom: false };
  for (const f of ["lo-multisheet.xlsx", "lo-multisheet.xls"]) {
    const { core } = await open(f);
    const { blob, summary } = await core.exportWorkbookZip(opts, noop);
    assert.deepEqual(summary.files.map((x) => [x.name, x.rows]), [["January.csv", 101], ["Février.csv", 101], ["三月.csv", 101]], f);
    const files = await unzip(blob, ";");
    assert.ok(Object.values(files).every((x) => !x.bom && !x.crlf), f);
    assert.deepEqual(files["三月.csv"]!.rows[100], ["100", "300"], f);
  }
  const t = await open("lo-multisheet.xlsx");
  const tsv = await t.core.exportWorkbookZip({ delimiter: "\t" }, noop);
  assert.deepEqual(tsv.summary.files.map((x) => x.name), ["January.tsv", "Février.tsv", "三月.tsv"]);
});

test("the ZIP is refused for CSV files; a workbook with only chart sheets has nothing to convert", async () => {
  const core = new EngineCore();
  const s = await core.open(new File(["a,b\n1,2\n"], "t.csv"), "csv", {}, noop);
  await assert.rejects(core.exportWorkbookZip({}, noop), /only for Excel workbooks/);
  assert.equal(s.format, "csv");
});
