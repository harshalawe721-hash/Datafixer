/**
 * Stage 6 large-file test: both converters in Chromium, through the website.
 *  - CSV to Excel at 50, 100 and 150 MB (known contents, so the page's counts
 *    are exact; 100 and 150 MB pass Excel's row limit and must split into 2 sheets).
 *  - Excel to CSV: a 600,000-row workbook (one sheet, values as shown and plain),
 *    and a 3-sheet workbook as a ZIP.
 * Measures time and peak renderer memory, checks every download with Python
 * (openpyxl / zipfile / csv), and that the originals are unchanged (SHA-256).
 * Usage: start the app, then `npm run test:converter-perf` (HEAP_MB=512 imitates
 * a low-memory device; SIZES=50,100 limits the CSV sizes). Linux only.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import { closeSync, createReadStream, mkdirSync, openSync, rmSync, statSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Zip, ZipDeflate, strToU8 } from "fflate";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HEAP_MB = process.env.HEAP_MB ? Number(process.env.HEAP_MB) : null;
const SIZES = (process.env.SIZES ?? "50,100,150").split(",").map(Number).filter(Boolean);
const DIR = path.join(tmpdir(), "datafixer-converter-perf");
const MB = 1024 * 1024;
const PER_SHEET = 1_048_575; // data rows per sheet with column names
mkdirSync(DIR, { recursive: true });

interface CsvPlan {
  dataRows: number;
  numbers: number;
  dates: number;
  text: number;
  empty: number;
}

/**
 * id (number), name (text), phone with a leading zero (text), amount like 12.50 (number),
 * joined as ISO date (date), code like C0001 (text), note empty except every 7th row (text).
 * Whole rows only, never more than `bytes` (the site's limit is inclusive).
 */
function writeCsv(file: string, bytes: number): CsvPlan {
  const fd = openSync(file, "w");
  let written = writeSync(fd, "id,name,phone,amount,joined,code,note\n");
  const p: CsvPlan = { dataRows: 0, numbers: 0, dates: 0, text: 0, empty: 0 };
  let buf: string[] = [];
  let bufBytes = 0;
  for (let i = 1; ; i++) {
    const note = i % 7 === 0 ? "check" : "";
    const line = `${i},Name ${i % 5000},0${7700000000 + (i % 99999999)},${((i % 100000) * 0.25).toFixed(2)},2024-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")},C${String(i % 10000).padStart(4, "0")},${note}\n`;
    if (written + bufBytes + line.length > bytes) break;
    buf.push(line);
    bufBytes += line.length;
    p.dataRows++;
    p.numbers += 2;
    p.dates += 1;
    p.text += note ? 4 : 3;
    p.empty += note ? 0 : 1;
    if (buf.length >= 5000) {
      written += writeSync(fd, buf.join(""));
      buf = [];
      bufBytes = 0;
    }
  }
  if (buf.length) writeSync(fd, buf.join(""));
  closeSync(fd);
  return p;
}

/** An XLSX with `sheets` sheets of `rows` data rows each (id, name, amount with format, date with format, flag). */
function writeXlsx(file: string, sheets: number, rows: number) {
  const fd = openSync(file, "w");
  const zip = new Zip((err, data) => {
    if (err) throw err;
    writeSync(fd, data);
  });
  const add = (name: string, text: string) => {
    const f = new ZipDeflate(name, { level: 6 });
    zip.add(f);
    f.push(strToU8(text), true);
  };
  const names = Array.from({ length: sheets }, (_, i) => `Sheet ${i + 1}`);
  add("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  add("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  add("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${sheets + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add("xl/styles.xml", `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/></numFmts><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>`);
  for (let s = 0; s < sheets; s++) {
    const w = new ZipDeflate(`xl/worksheets/sheet${s + 1}.xml`, { level: 6 });
    zip.add(w);
    w.push(strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="B1" t="inlineStr"><is><t>name</t></is></c><c r="C1" t="inlineStr"><is><t>amount</t></is></c><c r="D1" t="inlineStr"><is><t>date</t></is></c><c r="E1" t="inlineStr"><is><t>flag</t></is></c></row>`));
    for (let i = 0; i < rows; i += 10000) {
      const parts: string[] = [];
      for (let k = i; k < Math.min(rows, i + 10000); k++) {
        const r = k + 2;
        parts.push(`<row r="${r}"><c r="A${r}"><v>${k + 1}</v></c><c r="B${r}" t="inlineStr"><is><t>Name ${k % 5000}</t></is></c><c r="C${r}" s="1"><v>${(k % 10000) * 1.5}</v></c><c r="D${r}" s="2"><v>${45000 + (k % 1000)}</v></c><c r="E${r}" t="b"><v>${k % 2}</v></c></row>`);
      }
      w.push(strToU8(parts.join("")));
    }
    w.push(strToU8("</sheetData></worksheet>"), true);
  }
  zip.end();
  closeSync(fd);
}

const sha256 = (file: string) =>
  new Promise<string>((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
function rendererRssMB(): number {
  let kb = 0;
  for (const line of execSync("ps -eo rss,args").toString().split("\n")) if (line.includes("--type=renderer")) kb += Number(line.trim().split(/\s+/)[0]) || 0;
  return Math.round(kb / 1024);
}
const python = (script: string, file: string) => {
  const r = spawnSync("python3", ["-I", "-c", script, file], { encoding: "utf8", maxBuffer: 1 << 26 });
  return r.status === 0 ? JSON.parse(r.stdout) : { error: r.stderr.slice(0, 200) };
};

interface Row {
  name: string;
  outcome: string;
  openS?: number;
  workS?: number;
  peakMB: number;
  check?: string;
  shaOk: boolean;
}
const browser = await chromium.launch({ args: HEAP_MB ? [`--js-flags=--max-old-space-size=${HEAP_MB}`] : [] });
const results: Row[] = [];
let problems = 0;

// Playwright is loaded at run time from the global install (no type definitions here).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function run(name: string, file: string, pagePath: string, work: (page: any, row: Row) => Promise<void>) {
  const before = await sha256(file);
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  let crashed = false;
  page.on("crash", () => (crashed = true));
  await page.goto(`${BASE}${pagePath}`, { waitUntil: "networkidle" });
  const baseline = rendererRssMB();
  let peak = baseline;
  const poll = setInterval(() => (peak = Math.max(peak, rendererRssMB())), 250);
  const row: Row = { name, outcome: "", peakMB: 0, shaOk: false };
  try {
    const t = Date.now();
    await page.locator("input[type=file]").setInputFiles(file);
    await page.getByText(/Opened on your device in/).first().waitFor({ timeout: 600_000 });
    row.openS = Math.round((Date.now() - t) / 100) / 10;
    await work(page, row);
    row.outcome = crashed ? "CRASHED" : "ok";
  } catch (err) {
    const alert =
      (await page.getByRole("alert").filter({ hasText: /\S/ }).first().textContent({ timeout: 1000 }).catch(() => null)) ||
      (await page.getByText(/too large|couldn.t|can.t be|not enough memory/i).first().textContent({ timeout: 1000 }).catch(() => null));
    row.outcome = crashed ? "CRASHED (tab)" : alert ? `stopped safely: ${alert.trim().slice(0, 140)}` : `failed: ${String(err).slice(0, 160)}`;
    if (crashed || row.outcome.startsWith("failed")) problems++;
  }
  clearInterval(poll);
  row.peakMB = peak - baseline;
  row.shaOk = (await sha256(file)) === before;
  if (!row.shaOk) problems++;
  results.push(row);
  console.log(JSON.stringify(row));
  await context.close();
}
const secs = (t: number) => Math.round((Date.now() - t) / 100) / 10;

console.log(`Chromium headless${HEAP_MB ? `, JS heap capped at ${HEAP_MB} MB` : ""}`);

// ---------------------------------------------------------------- CSV to Excel
for (const size of SIZES) {
  const file = path.join(DIR, `convert-${size}mb.csv`);
  const p = writeCsv(file, size * MB);
  const sheets = Math.ceil(p.dataRows / PER_SHEET);
  await run(`CSV → Excel, ${size} MB (${(p.dataRows + 1).toLocaleString("en-US")} rows)`, file, "/csv-to-excel", async (page, row) => {
    await page.locator("#convert-heading").waitFor({ timeout: 600_000 });
    const t = Date.now();
    const dl = page.waitForEvent("download", { timeout: 900_000 });
    dl.catch(() => {}); // if the work stops safely before a download, the page closes and this wait ends
    await page.getByRole("button", { name: "Convert to Excel (.xlsx)" }).click();
    const d = await dl;
    await page.locator("#converted-heading").waitFor({ timeout: 900_000 });
    row.workS = secs(t);
    const dd = async (label: string) => Number(((await page.locator("dt", { hasText: label }).first().locator("xpath=following-sibling::dd[1]").textContent()) ?? "").replace(/,/g, ""));
    const counts = { numbers: await dd("Numbers"), dates: await dd("Dates"), text: await dd("Text"), empty: await dd("Empty cells") };
    const exact = counts.numbers === p.numbers && counts.dates === p.dates && counts.text === p.text && counts.empty === p.empty;
    const out = path.join(DIR, `out-${size}.xlsx`);
    await d.saveAs(out);
    // Sheets and rows (counting </row> in each sheet's XML), and the types of the first data row (openpyxl).
    const info = python(
      [
        "import zipfile,sys,json,re,openpyxl,datetime",
        "z=zipfile.ZipFile(sys.argv[1]); rows=[]",
        "names=sorted([n for n in z.namelist() if n.startswith('xl/worksheets/sheet')], key=lambda n:int(re.findall(r'\\d+',n)[0]))",
        "for n in names:",
        "  c=0; tail=b''",
        "  with z.open(n) as f:",
        "    while True:",
        "      b=f.read(1<<22)",
        "      if not b: break",
        "      c+=(tail+b).count(b'</row>'); tail=b[-5:]",
        "  rows.append(c)",
        "wb=openpyxl.load_workbook(sys.argv[1], read_only=True)",
        "first=[[c.data_type for c in r] for r in wb.worksheets[0].iter_rows(min_row=2,max_row=2)][0]",
        "print(json.dumps({'sheets':wb.sheetnames,'rows':rows,'types':first}))",
      ].join("\n"),
      out,
    ) as { sheets: string[]; rows: number[]; types: string[] };
    const wantRows = Array.from({ length: sheets }, (_, k) => Math.min(PER_SHEET, p.dataRows - k * PER_SHEET) + 1);
    const fileOk = JSON.stringify(info.rows) === JSON.stringify(wantRows) && JSON.stringify(info.types?.slice(0, 6)) === JSON.stringify(["n", "s", "s", "n", "d", "s"]);
    if (!exact || !fileOk) problems++;
    row.check = `${exact ? "counts exact" : `COUNTS WRONG ${JSON.stringify(counts)}`}; ${info.sheets?.length} sheet(s), rows ${JSON.stringify(info.rows)} (want ${JSON.stringify(wantRows)}); types ${JSON.stringify(info.types?.slice(0, 6))}; ${(statSync(out).size / MB).toFixed(0)} MB`;
    rmSync(out, { force: true });
  });
  rmSync(file, { force: true });
}

// ---------------------------------------------------------------- Excel to CSV
const xlsx1 = path.join(DIR, "big-600k.xlsx");
writeXlsx(xlsx1, 1, 600_000);
await run(`Excel → CSV, ${(statSync(xlsx1).size / MB).toFixed(0)} MB xlsx (600,000 rows): as shown, then plain`, xlsx1, "/excel-to-csv", async (page, row) => {
  await page.locator("#to-csv-heading").waitFor({ timeout: 600_000 });
  const t = Date.now();
  const outs: string[] = [];
  for (const mode of ["shown", "plain"]) {
    if (mode === "plain") {
      await page.getByRole("button", { name: "Change settings or sheet" }).click();
      await page.getByRole("radio", { name: /Plain values/ }).check();
    }
    const dl = page.waitForEvent("download", { timeout: 900_000 });
    dl.catch(() => {}); // if the work stops safely before a download, the page closes and this wait ends
    await page.getByRole("button", { name: "Download this sheet as CSV" }).click();
    const d = await dl;
    await page.locator("#to-csv-done").waitFor({ timeout: 900_000 });
    const out = path.join(DIR, `x2c-${mode}.csv`);
    await d.saveAs(out);
    outs.push(out);
  }
  row.workS = secs(t);
  const script = "import csv,sys,json\nn=0;first=None;last=None\nfor r in csv.reader(open(sys.argv[1],newline='',encoding='utf-8-sig')):\n  n+=1;first=first if first else (r if n==2 else None);last=r\nprint(json.dumps([n,first,last]))";
  const a = python(script, outs[0]!) as [number, string[], string[]];
  const b = python(script, outs[1]!) as [number, string[], string[]];
  const ok = a[0] === 600_001 && b[0] === 600_001 && a[1]?.join("|") === "1|Name 0|0.00|2023-03-15|FALSE" && b[1]?.join("|") === "1|Name 0|0|2023-03-15|FALSE" && b[2]?.[2] === "14998.5";
  if (!ok) problems++;
  row.check = `${ok ? "ok" : "WRONG"}: shown ${a[0]} rows, first ${JSON.stringify(a[1])}; plain ${b[0]} rows, first ${JSON.stringify(b[1])}, last amount ${b[2]?.[2]}`;
  for (const o of outs) rmSync(o, { force: true });
});
rmSync(xlsx1, { force: true });

// Low memory: sheets small enough to open on such a device, so the ZIP itself is tested there.
const ZIP_ROWS = HEAP_MB ? 50_000 : 200_000;
const xlsx3 = path.join(DIR, "three-sheets.xlsx");
writeXlsx(xlsx3, 3, ZIP_ROWS);
await run(`Excel → CSV, ${(statSync(xlsx3).size / MB).toFixed(0)} MB xlsx (3 sheets × ${ZIP_ROWS.toLocaleString("en-US")} rows): all sheets as ZIP`, xlsx3, "/excel-to-csv", async (page, row) => {
  await page.locator("#to-csv-heading").waitFor({ timeout: 600_000 });
  const t = Date.now();
  const dl = page.waitForEvent("download", { timeout: 900_000 });
    dl.catch(() => {}); // if the work stops safely before a download, the page closes and this wait ends
  await page.getByRole("button", { name: /All 3 sheets \(ZIP\)/ }).click();
  const d = await dl;
  await page.locator("#to-csv-done").waitFor({ timeout: 900_000 });
  row.workS = secs(t);
  const out = path.join(DIR, "three.zip");
  await d.saveAs(out);
  const z = python("import zipfile,csv,io,sys,json\nz=zipfile.ZipFile(sys.argv[1])\nok=z.testzip() is None\nprint(json.dumps([ok,[[n,sum(1 for _ in csv.reader(io.TextIOWrapper(z.open(n),encoding='utf-8-sig',newline='')))] for n in z.namelist()]]))", out) as [boolean, [string, number][]];
  const good = z[0] === true && JSON.stringify(z[1]) === JSON.stringify([["Sheet 1.csv", ZIP_ROWS + 1], ["Sheet 2.csv", ZIP_ROWS + 1], ["Sheet 3.csv", ZIP_ROWS + 1]]);
  if (!good) problems++;
  row.check = `${good ? "ok" : "WRONG"}: ${JSON.stringify(z)} , ${(statSync(out).size / MB).toFixed(0)} MB`;
  rmSync(out, { force: true });
});
rmSync(xlsx3, { force: true });

await browser.close();
console.log("\n| Test | Outcome | Open | Convert + check + download | Peak extra memory | Downloaded file (Python) | Original unchanged |\n|---|---|---|---|---|---|---|");
for (const r of results) console.log(`| ${r.name} | ${r.outcome} | ${r.openS ?? "—"}s | ${r.workS ?? "—"}s | ${r.peakMB} MB | ${r.check ?? "—"} | ${r.shaOk ? "yes" : "NO"} |`);
console.log(`\n${problems ? `${problems} problem(s)` : "No problems"}: crashes, wrong counts, wrong files or changed originals count as problems; stopping safely on a low-memory device does not.`);
process.exit(problems ? 1 : 0);
