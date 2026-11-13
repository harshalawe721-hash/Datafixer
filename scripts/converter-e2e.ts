/**
 * Browser test of the Stage 6 converter pages (Step 3: CSV to Excel).
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
  await ctx.close();
}

console.log("\nPrivacy and errors");
check(offsite.length === 0, `no uploads or off-site requests (${offsite.slice(0, 3).join(", ")})`);
check(errors.length === 0, `no console or page errors (${errors.slice(0, 3).join(" | ")})`);

rmSync(DL, { recursive: true, force: true });
await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
