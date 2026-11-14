/**
 * Browser test of the Stage 6 converter pages (Step 3: CSV to Excel; Step 4: Excel to CSV).
 * Usage: start the app (npm run build && npm start), then `npm run test:converter`.
 */
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const CONVERT = new URL("../tests/fixtures/convert/", import.meta.url).pathname;
const VALIDATE = new URL("../tests/fixtures/validate/", import.meta.url).pathname;
const EXCEL = new URL("../tests/fixtures/excel/", import.meta.url).pathname;
const pack = JSON.parse(readFileSync(path.join(CONVERT, "expected.json"), "utf8")) as { customers: { numbers: number; dates: number; text: number; empty: number } };
let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors: string[] = [];
const offsite: string[] = [];
page.on("pageerror", (e: Error) => errors.push(String(e)));
page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
page.on("request", (r: { url(): string; method(): string }) => {
  if (!r.url().startsWith(BASE) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) offsite.push(r.url());
  if (r.method() !== "GET") offsite.push(`${r.method()} ${r.url()}`);
});
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const DL = mkdtempSync(path.join(tmpdir(), "converter-e2e-"));

const openCsv = async (file: string | { name: string; mimeType: string; buffer: Buffer }) => {
  await page.goto(`${BASE}/csv-to-excel`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(file);
  await page.locator("#convert-heading").waitFor({ timeout: 60000 });
};
const convertAndSave = async (name: string, timeout = 60000) => {
  const dl = page.waitForEvent("download", { timeout });
  await page.getByRole("button", { name: "Convert to Excel (.xlsx)" }).click();
  const d = await dl;
  await page.locator("#converted-heading").waitFor({ timeout });
  const file = path.join(DL, name);
  await d.saveAs(file);
  return { file, suggested: d.suggestedFilename() as string };
};
const dd = (label: string) => page.locator("dt", { hasText: label }).first().locator("xpath=following-sibling::dd[1]").textContent();
function py(file: string, script: string): unknown {
  const r = spawnSync("python3", ["-I", "-c", `import openpyxl,sys,json,datetime\nwb=openpyxl.load_workbook(sys.argv[1], read_only=False)\n${script}`, file], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    console.log(r.stderr);
    return null;
  }
  return JSON.parse(r.stdout);
}

console.log("\nCSV to Excel: a realistic file");
await openCsv(path.join(CONVERT, "2-customers.csv"));
check(await visible(page.getByText(/A new .xlsx workbook is created on this device/)), "says it happens on the device");
check(await visible(page.getByRole("combobox", { name: "Text encoding" })), "text encoding choice (as on the Validator)");
check(await visible(page.getByText(/Valid CSV, with 1 warning/)), "structure verdict from the Validator");
check(await page.getByRole("checkbox", { name: "First row contains column names" }).first().isChecked(), "column names ticked");
await page.getByText("Which values become numbers and dates").click();
check(await visible(page.getByText(/leading zeros \(007, phone numbers, ZIP codes\)/)), "explains which values stay text");
const a = await convertAndSave("customers.xlsx");
check(a.suggested === "2-customers.xlsx", `file name ${a.suggested}`);
check(await visible(page.getByText(/read the new file back and checked all 292 cells in 41 rows/)), "says the file was checked (292 cells, 41 rows)");
check(
  (await dd("Numbers"))?.trim() === String(pack.customers.numbers) && (await dd("Dates"))?.trim() === String(pack.customers.dates) && (await dd("Text"))?.trim() === String(pack.customers.text) && (await dd("Empty cells"))?.trim() === String(pack.customers.empty),
  "summary counts match the test pack (80 numbers, 30 dates, 174 text, 36 empty)",
);
check(await visible(page.getByText(/^87$/)), "87 kept as text for leading zeros");
const info = py(
  a.file,
  "ws=wb.worksheets[0]\nprint(json.dumps({'title':ws.title,'freeze':ws.freeze_panes,'filter':ws.auto_filter.ref,'bold':ws['A1'].font.b,'row2':[[c.value if not isinstance(c.value,datetime.datetime) else c.value.isoformat(), c.data_type] for c in ws[2]][:7],'rows':ws.max_row}))",
) as { title: string; freeze: string; filter: string; bold: boolean; row2: [unknown, string][]; rows: number } | null;
check(info?.title === "2-customers" && info.rows === 41, "openpyxl: sheet name and 41 rows");
check(info?.freeze === "A2" && info.filter === "A1:H41" && info.bold === true, "openpyxl: bold header, frozen top row, filter (decision 6)");
check(
  JSON.stringify(info?.row2) === JSON.stringify([["C0001", "s"], ["Ben", "s"], ["07700900001", "s"], ["00037", "s"], ["2024-02-02T00:00:00", "d"], [12.5, "n"], [1, "n"]]),
  `openpyxl: id, phone and ZIP stay text; date, balance and orders become date and numbers (${JSON.stringify(info?.row2)})`,
);
const again = page.waitForEvent("download", { timeout: 15000 });
await page.getByRole("button", { name: "Download again" }).click();
check((await again).suggestedFilename() === "2-customers.xlsx", "Download again works");

console.log("\nColumn names unticked");
await page.getByRole("button", { name: "Change settings and convert again" }).click();
await page.getByRole("checkbox", { name: "First row contains column names" }).first().uncheck();
const b = await convertAndSave("plain.xlsx");
const plain = py(b.file, "ws=wb.worksheets[0]\nprint(json.dumps({'freeze':ws.freeze_panes,'filter':ws.auto_filter.ref,'bold':ws['A1'].font.b}))") as { freeze: string | null; filter: string | null; bold: boolean } | null;
check(plain?.freeze === null && plain.filter === null && plain.bold === false, "no header formatting when the first row is data");

console.log("\nA file with problems: hand-over to the CSV Validator");
await openCsv(path.join(VALIDATE, "1-uneven.csv"));
check(await visible(page.getByText(/1 problem in the file's structure/)), "problems are shown before converting");
await page.getByRole("link", { name: "Check and repair in the CSV Validator" }).click();
await page.waitForURL("**/csv-validator");
check(await visible(page.locator("#validator-heading", { hasText: "Not a valid CSV file: 1 error" }), 30000), "the same file opens in the CSV Validator without choosing it again");

console.log("\nPlanted values (test pack)");
await openCsv(path.join(CONVERT, "1-values.csv"));
const c = await convertAndSave("values.xlsx");
const vals = py(c.file, "ws=wb.worksheets[0]\nprint(json.dumps([[ws.cell(r,2).value if not isinstance(ws.cell(r,2).value,datetime.datetime) else ws.cell(r,2).value.isoformat(), ws.cell(r,2).data_type] for r in range(2, ws.max_row+1)]))") as [unknown, string][] | null;
const expected = (JSON.parse(readFileSync(path.join(CONVERT, "expected.json"), "utf8")) as { planted: { kind: string }[] }).planted;
const kinds = (vals ?? []).map(([v, t]) => (v === null ? "empty" : t === "d" ? "date" : t === "n" ? "number" : "text"));
check(JSON.stringify(kinds) === JSON.stringify(expected.map((p) => p.kind)), "every planted value has the expected type in the downloaded file");

console.log("\nMore rows than one Excel sheet holds (decision 2)");
const big = path.join(DL, "big.csv");
writeFileSync(big, "n\n" + Array.from({ length: 1_048_580 }, (_, i) => String(i + 1)).join("\n") + "\n");
await openCsv(big);
const d = await convertAndSave("big.xlsx", 300000);
check(await visible(page.getByText(/continues on 1 more sheet, each starting with the column names. No row was left out/)), "the split is explained");
check((await page.locator("dd", { hasText: "big (2): 5 rows + column names" }).count()) === 1, "second sheet: 5 rows + column names");
const sheets = spawnSync("python3", ["-I", "-c", "import openpyxl,sys,json\nwb=openpyxl.load_workbook(sys.argv[1], read_only=True)\nprint(json.dumps([[ws.title, ws.max_row] for ws in wb.worksheets]))", d.file], { encoding: "utf8" });
check(sheets.status === 0 && sheets.stdout.trim() === '[["big", 1048576], ["big (2)", 6]]', `openpyxl: ${sheets.stdout.trim()}`);

console.log("\nCancel");
await openCsv(big);
await page.getByRole("button", { name: "Convert to Excel (.xlsx)" }).click();
await page.getByText("Creating your Excel file").waitFor({ timeout: 30000 });
await page.getByRole("button", { name: "Cancel" }).click();
check(await visible(page.getByText("The conversion was cancelled. Nothing was created."), 30000), "Cancel stops the conversion; nothing is downloaded");

console.log("\nExcel to CSV: one sheet");
const openXl = async (f: string) => {
  await page.goto(`${BASE}/excel-to-csv`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(path.join(EXCEL, f));
  await page.locator("#to-csv-heading").waitFor({ timeout: 60000 });
};
const pyCsv = (file: string, delim = ",") => {
  const r = spawnSync("python3", ["-I", "-c", "import csv,sys,json\nb=open(sys.argv[1],'rb').read()\nprint(json.dumps({'bom':b[:3]==b'\\xef\\xbb\\xbf','crlf':b'\\r\\n' in b,'rows':list(csv.reader(open(sys.argv[1],newline='',encoding='utf-8-sig'),delimiter=sys.argv[2]))}))", file, delim], { encoding: "utf8" });
  return r.status === 0 ? (JSON.parse(r.stdout) as { bom: boolean; crlf: boolean; rows: string[][] }) : null;
};
const saveDownload = async (button: RegExp | string, name: string) => {
  const dl = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: button }).click();
  const d = await dl;
  await page.locator("#to-csv-done").waitFor({ timeout: 120000 });
  const file = path.join(DL, name);
  await d.saveAs(file);
  return { file, suggested: d.suggestedFilename() as string };
};
await openXl("lo-features.xlsx");
check(await visible(page.getByText(/Sheet: Data/)), "the open sheet is named");
check(await page.getByRole("radio", { name: /As shown in Excel/ }).isChecked(), "values as shown in Excel is the default (decision 4)");
check(await visible(page.getByText("Separator in the new file")), "Stage 5 format options are offered");
const s1 = await saveDownload("Download this sheet as CSV", "data.csv");
check(s1.suggested === "lo-features - Data.csv", `file name ${s1.suggested}`);
const c1 = pyCsv(s1.file);
check(c1?.bom && c1.crlf && JSON.stringify(c1.rows[1]!.slice(0, 3)) === JSON.stringify(["Ann", "10.50", "2024-01-31"]), "values as shown: 10.50, 2024-01-31 (Python reads the file)");
check(await visible(page.getByText(/Merged cells/)) && (await visible(page.getByText(/Hidden rows and columns \(they are included, unhidden\)/))), "summary lists merged cells and hidden rows/columns (decision 5)");
check(c1?.rows.length === 5 && c1.rows[1]![6] === "hidden column value", "hidden row and column are included");
await page.getByRole("button", { name: "Change settings or sheet" }).click();
await page.getByRole("radio", { name: /Plain values/ }).check();
await page.getByRole("radio", { name: /Semicolon/ }).check();
await page.getByRole("radio", { name: /LF \(Unix, Mac\)/ }).check();
await page.getByRole("radio", { name: /without BOM/ }).check();
const s2 = await saveDownload("Download this sheet as CSV", "plain.csv");
const c2 = pyCsv(s2.file, ";");
check(c2 && !c2.bom && !c2.crlf && JSON.stringify(c2.rows[1]!.slice(0, 4)) === JSON.stringify(["Ann", "10.5", "2024-01-31", "TRUE"]), "plain values with semicolon, LF, no BOM: 10.5, 2024-01-31, TRUE");
check(await visible(page.getByText(/Semicolon \(;\) · LF \(Unix, Mac\) · UTF-8 without BOM · plain values/)), "summary shows the format and plain values");

console.log("\nExcel to CSV: another sheet, and all sheets as a ZIP");
await page.getByRole("button", { name: "Change settings or sheet" }).click();
await page.getByRole("button", { name: "Summary", exact: true }).click();
await page.getByText(/Sheet: Summary/).waitFor({ timeout: 30000 });
check(true, "another sheet can be chosen");
await page.getByRole("radio", { name: /As shown in Excel/ }).check();
await page.getByRole("radio", { name: /Comma/ }).check();
await page.getByRole("radio", { name: /CRLF/ }).check();
await page.getByRole("radio", { name: /UTF-8 with BOM/ }).check();
const z = await saveDownload(/All 5 sheets \(ZIP\)/, "all.zip");
check(z.suggested === "lo-features - all sheets.zip", `ZIP name ${z.suggested}`);
const zipInfo = spawnSync("python3", ["-I", "-c", "import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1])\nprint(json.dumps([z.testzip() is None, z.namelist(), z.read('Summary.csv').decode('utf-8-sig').splitlines()[1]]))", z.file], { encoding: "utf8" });
check(zipInfo.status === 0 && zipInfo.stdout.trim() === '[true, ["Data.csv", "Summary.csv", "Archive.csv", "Secret.csv", "Chart1.csv"], "First name,Ann"]', `Python opens the ZIP: ${zipInfo.stdout.trim()}`);
check(await visible(page.getByText(/Archive.csv \(hidden sheet\)/)), "hidden sheets are marked in the summary");
check(await visible(page.getByText(/read the ZIP back/)), "says every file was checked and the ZIP read back");

console.log("\nExcel to CSV: a chart sheet, and an old .xls file");
await openXl("openpyxl-features.xlsx");
await page.getByRole("button", { name: "Chart1" }).click();
check(await visible(page.getByText(/This sheet has no cells to convert/)), "a chart sheet: says there are no cells");
check((await page.getByRole("button", { name: "Download this sheet as CSV" }).count()) === 0, "no single-sheet download for a chart sheet (no fake button)");
check(await visible(page.getByRole("button", { name: /All 4 sheets \(ZIP\)/ })), "the ZIP of the 4 worksheets is still offered");
await openXl("lo-multisheet.xls");
const x = await saveDownload(/All 3 sheets \(ZIP\)/, "multi.zip");
const multi = spawnSync("python3", ["-I", "-c", "import zipfile,sys,json\nz=zipfile.ZipFile(sys.argv[1])\nprint(json.dumps(z.namelist()))", x.file], { encoding: "utf8" });
check(multi.stdout.trim() === '["January.csv", "F\\u00e9vrier.csv", "\\u4e09\\u6708.csv"]', `.xls workbook, Unicode sheet names: ${multi.stdout.trim()}`);

console.log("\nPhone and tablet layouts");
for (const [name, device] of [["phone", devices["Pixel 7"]], ["tablet", devices["Galaxy Tab S4"]]] as const) {
  const ctx = await browser.newContext({ ...device, deviceScaleFactor: 1, acceptDownloads: true });
  const p = await ctx.newPage();
  p.on("pageerror", (e: Error) => errors.push(String(e)));
  await p.goto(`${BASE}/csv-to-excel`, { waitUntil: "networkidle" });
  await p.locator("input[type=file]").setInputFiles(path.join(CONVERT, "2-customers.csv"));
  await p.locator("#convert-heading").waitFor({ timeout: 30000 });
  const w1 = await p.evaluate(() => document.documentElement.scrollWidth);
  const dl = p.waitForEvent("download");
  await p.getByRole("button", { name: "Convert to Excel (.xlsx)" }).click();
  await dl;
  await p.locator("#converted-heading").waitFor({ timeout: 30000 });
  const w2 = await p.evaluate(() => document.documentElement.scrollWidth);
  check(w1 <= device.viewport.width && w2 <= device.viewport.width, `${name}: fits the screen before and after converting (${w1}, ${w2} ≤ ${device.viewport.width})`);
  await p.goto(`${BASE}/excel-to-csv`, { waitUntil: "networkidle" });
  await p.locator("input[type=file]").setInputFiles(path.join(EXCEL, "lo-features.xlsx"));
  await p.locator("#to-csv-heading").waitFor({ timeout: 30000 });
  const w3 = await p.evaluate(() => document.documentElement.scrollWidth);
  const dl2 = p.waitForEvent("download");
  await p.getByRole("button", { name: "Download this sheet as CSV" }).click();
  await dl2;
  await p.locator("#to-csv-done").waitFor({ timeout: 30000 });
  const w4 = await p.evaluate(() => document.documentElement.scrollWidth);
  check(w3 <= device.viewport.width && w4 <= device.viewport.width, `${name}: Excel to CSV fits the screen before and after (${w3}, ${w4} ≤ ${device.viewport.width})`);
  await ctx.close();
}

console.log("\nPrivacy and errors");
check(offsite.length === 0, `no uploads or off-site requests (${offsite.slice(0, 3).join(", ")})`);
check(errors.length === 0, `no console or page errors (${errors.slice(0, 3).join(" | ")})`);

rmSync(DL, { recursive: true, force: true });
await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
