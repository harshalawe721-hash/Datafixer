/**
 * Stage 12, Step 3: browser test of the “CSV to JSON” page: preview, values as text or
 * detected, pretty/compact/JSON Lines, column names on and off, downloads read back,
 * an Excel file with a date, keyboard, axe-core (light and dark), phone layout.
 * Usage: start the app (npm run build && npm start), then `npm run test:csv-json`.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js", { paths: [process.cwd()] }), "utf8");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DL = mkdtempSync(path.join(tmpdir(), "csvjson-"));

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const CSV = "id,name,age,active,note\n00123,Asha,30,true,\n00124,Ben,4.5,FALSE,hi\n";

const browser = await chromium.launch();
const errors: string[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function openPage(viewport: { width: number; height: number }, file: { name: string; mimeType: string; buffer: Buffer }) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/csv-to-json`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(file);
  await page.getByRole("heading", { name: "Convert to JSON" }).waitFor({ timeout: 30000 });
  return page;
}
const csvFile = { name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) };
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const previewText = async (page: Page): Promise<string> => (await page.getByLabel("Preview of the JSON").textContent()) ?? "";
const waitPreview = (page: Page, needle: string) =>
  page.waitForFunction((n: string) => document.querySelector("[aria-label='Preview of the JSON']")?.textContent?.includes(n), needle, { timeout: 15000 }).then(() => true, () => false);

async function axe(page: Page, dark: boolean) {
  await page.evaluate((d: boolean) => document.documentElement.classList.toggle("dark", d), dark);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(150);
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    // @ts-expect-error axe is injected
    const r = await window.axe.run(document.querySelector("main"), { resultTypes: ["violations"] });
    return r.violations.map((v: { id: string }) => v.id);
  });
}
async function download(page: Page, button: RegExp, name: string) {
  const dl = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: button }).click();
  const d = await dl;
  const file = path.join(DL, name);
  await d.saveAs(file);
  return { name: d.suggestedFilename(), text: readFileSync(file, "utf8") };
}

{
  console.log("\nDesktop CSV: preview, options, downloads");
  const page = await openPage({ width: 1280, height: 900 }, csvFile);
  check(await visible(page.getByRole("heading", { level: 1, name: "CSV to JSON Converter" })), "page heading “CSV to JSON Converter”");
  check(await visible(page.getByText("Preview: the first 2 records of 2")), "preview heading: the first 2 records of 2");
  check(await waitPreview(page, '"id": "00123"') && (await previewText(page)).includes('"age": "30"'), "default: values as text, exactly as shown");

  const a1 = await axe(page, false);
  const a2 = await axe(page, true);
  check(a1.length === 0 && a2.length === 0, `axe-core with the preview, light and dark: ${JSON.stringify([a1, a2])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  await page.getByRole("radio", { name: /Detect numbers/ }).check();
  check(await waitPreview(page, '"age": 30'), "detect: age becomes a number");
  const t = await previewText(page);
  check(t.includes('"note": null') && t.includes('"active": true') && t.includes('"id": "00123"'), "detect: empty → null, true → true, the code stays text");

  let d = await download(page, /^Download \.json$/, "people.json");
  check(d.name === "people.json", `named after the file (${d.name})`);
  check(
    JSON.stringify(JSON.parse(d.text)) ===
      JSON.stringify([
        { id: "00123", name: "Asha", age: 30, active: true, note: null },
        { id: "00124", name: "Ben", age: 4.5, active: false, note: "hi" },
      ]),
    "downloaded pretty JSON reads back to the right records",
  );
  check(d.text.startsWith("[\n  {\n    \"id\": \"00123\""), "pretty layout is indented");
  check(await visible(page.getByText(/people\.json .* was checked and downloaded/)), "done message after the download");

  await page.getByRole("radio", { name: /^Compact/ }).check();
  check(await waitPreview(page, '[{"id":"00123"'), "compact preview has no spaces");
  await page.getByRole("radio", { name: /^JSON Lines/ }).check();
  d = await download(page, /^Download \.jsonl$/, "people.jsonl");
  const lines = d.text.trim().split("\n");
  check(d.name === "people.jsonl" && lines.length === 2 && JSON.parse(lines[1]!).name === "Ben", `JSON Lines: one record per line (${d.name})`);

  await page.getByRole("checkbox", { name: /First row contains column names They become the keys/ }).uncheck();
  check(await waitPreview(page, '"column_1":"id"'), "without column names the keys are column_1, column_2 …");

  await page.getByRole("radio", { name: /As text, exactly as shown/ }).focus();
  await page.keyboard.press("ArrowDown");
  check(await page.getByRole("radio", { name: /Detect numbers/ }).isChecked(), "options work with the arrow keys");
  check(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
  await page.close();
}

{
  console.log("\nExcel workbook with a date");
  const xf = path.join(DL, "book.xlsx");
  const gen = spawnSync(
    "python3",
    ["-I", "-c", "import openpyxl,sys,datetime\nwb=openpyxl.Workbook(); ws=wb.active\nws.append(['joined','amount','card'])\nws.append([datetime.date(2024,3,15),12.5,'4111111111111111'])\nws['A2'].number_format='yyyy-mm-dd'\nwb.save(sys.argv[1])", xf],
    { encoding: "utf8" },
  );
  check(gen.status === 0, "test workbook created");
  const page = await openPage({ width: 1280, height: 900 }, { name: "book.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: readFileSync(xf) });
  await page.getByRole("radio", { name: /Detect numbers/ }).check();
  await waitPreview(page, '"amount": 12.5');
  const d = await download(page, /^Download \.json$/, "book.json");
  check(JSON.stringify(JSON.parse(d.text)) === JSON.stringify([{ joined: "2024-03-15", amount: 12.5, card: "4111111111111111" }]), `Excel: the date as shown, the amount a number, the long number text: ${d.text.replace(/\s+/g, " ")}`);
  await page.close();
}

{
  console.log("\nPhone layout (390 × 844)");
  const page = await openPage({ width: 390, height: 844 }, csvFile);
  await waitPreview(page, '"id"');
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `no page-level horizontal scroll (${w}px)`);
  const box = await page.getByRole("button", { name: /^Download \.json$/ }).boundingBox();
  check(!!box && box.height >= 40, `download button is a comfortable tap target (${box?.height ?? 0}px)`);
  await page.close();
}

await browser.close();
rmSync(DL, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
