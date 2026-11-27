/**
 * Stage 12, Step 2: browser test of the “JSON to CSV” page: open a file, the table
 * (nested columns, notes), CSV and Excel downloads, choosing a list inside an object,
 * JSON Lines, pasting, mistakes shown with line and column, the 50 MB limit, keyboard,
 * axe-core (light and dark), phone layout.
 * Usage: start the app (npm run build && npm start), then `npm run test:json`.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js", { paths: [process.cwd()] }), "utf8");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DL = mkdtempSync(path.join(tmpdir(), "json-"));

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const PEOPLE =
  '[{"id":"00123","name":"Asha","age":30,"active":true,"address":{"city":"Pune"},"phones":["+91 1","+91 2"]},' +
  '{"id":"00124","name":"Ben","age":null,"active":false,"card":4111111111111111}]';
const WRAPPED = '{"meta":{"page":1},"results":[{"a":1},{"a":2}],"extra":{"items":[{"b":"x"}]}}';

const browser = await chromium.launch();
const errors: string[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;
const jsonFile = (name: string, text: string | Buffer) => ({ name, mimeType: "application/json", buffer: Buffer.isBuffer(text) ? text : Buffer.from(text) });

async function openPage(viewport: { width: number; height: number }) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/json-to-csv`, { waitUntil: "networkidle" });
  return page;
}
async function openFile(page: Page, file: { name: string; mimeType: string; buffer: Buffer }) {
  await page.locator("input[type=file]").setInputFiles(file);
  await page.getByRole("heading", { name: "Your JSON as a table" }).waitFor({ timeout: 30000 });
}
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const headers = async (page: Page): Promise<string[]> => (await page.getByRole("columnheader").allTextContents()).map((t: string) => t.trim());

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

// ---------------------------------------------------------------- file, table, downloads
{
  console.log("\nDesktop: open a JSON file, the table, CSV and Excel downloads");
  const page = await openPage({ width: 1280, height: 900 });
  check(await visible(page.getByRole("heading", { level: 1, name: "JSON to CSV Converter" })), "page heading “JSON to CSV Converter”");
  check(await visible(page.getByLabel(/Or paste JSON/)), "a paste box is offered before a file is open");
  const a0 = await axe(page, false);
  check(a0.length === 0, `axe-core before opening a file: ${JSON.stringify(a0)}`);

  await openFile(page, jsonFile("people.json", PEOPLE));
  check(await visible(page.getByText("2 records · 7 columns")), "summary: 2 records · 7 columns");
  check(await visible(page.getByText(/1 cell holds a list from the JSON/)), "note: a list kept as JSON text");
  check(await visible(page.getByText(/1 number longer than 15 digits was kept exactly/)), "note: a long number kept exactly");
  const h = await headers(page);
  check(h.some((t) => t.endsWith("address.city")) && h.some((t) => t.endsWith("phones")), `nested object became the column address.city (${h.join(", ")})`);
  check(await visible(page.getByRole("gridcell", { name: "00123", exact: true })), "the code keeps its leading zeros in the table");

  const a1 = await axe(page, false);
  const a2 = await axe(page, true);
  check(a1.length === 0 && a2.length === 0, `axe-core with the table, light and dark: ${JSON.stringify([a1, a2])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  let dl = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Download CSV" }).click();
  let d = await dl;
  check(d.suggestedFilename() === "people.csv", `CSV named after the file (${d.suggestedFilename()})`);
  const csvPath = path.join(DL, "people.csv");
  await d.saveAs(csvPath);
  const csv = readFileSync(csvPath, "utf8").replace(/^﻿/, "");
  check(
    csv === 'id,name,age,active,address.city,phones,card\r\n00123,Asha,30,true,Pune,"[""+91 1"",""+91 2""]",\r\n00124,Ben,,false,,,4111111111111111\r\n',
    `downloaded CSV: ${JSON.stringify(csv)}`,
  );
  check(await visible(page.getByText(/people\.csv .* was checked and downloaded/)), "done message after the CSV download");

  dl = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Download Excel (.xlsx)" }).click();
  d = await dl;
  const xPath = path.join(DL, "people.xlsx");
  await d.saveAs(xPath);
  const r = spawnSync("python3", ["-I", "-c", "import openpyxl,sys,json; ws=openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps([ws['A2'].value, ws['C2'].value, ws['G3'].value, ws['E2'].value]))", xPath], { encoding: "utf8" });
  check(r.status === 0 && r.stdout.trim() === '["00123", 30, "4111111111111111", "Pune"]', `Excel: code and long number text, age a number: ${r.stdout.trim() || r.stderr.trim()}`);
  check(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
  await page.close();
}

// ---------------------------------------------------------------- lists, JSON Lines, paste, mistakes, limit
{
  console.log("\nLists inside an object, JSON Lines, pasting, mistakes and the size limit");
  let page = await openPage({ width: 1280, height: 900 });
  await openFile(page, jsonFile("wrapped.json", WRAPPED));
  const select = page.getByLabel("Which list to show");
  check(await visible(select), "a choice of lists is offered");
  check((await select.inputValue()) === "results", "the largest list (results) is shown first");
  await select.selectOption("extra.items");
  await page.getByRole("heading", { name: "Your JSON as a table" }).waitFor({ timeout: 30000 });
  await page.getByText("1 record · 1 column").waitFor({ timeout: 15000 }).catch(() => {});
  check((await headers(page)).some((t) => t.endsWith("b")), "choosing extra.items shows its column b");
  await select.focus();
  check(await page.evaluate(() => document.activeElement?.id === "json-list"), "the list choice can be reached with the keyboard");
  await page.close();

  page = await openPage({ width: 1280, height: 900 });
  await openFile(page, jsonFile("events.jsonl", '{"a":1}\n{"a":2,"b":"x"}\n'));
  check(await visible(page.getByText("2 lines · 2 columns · JSON Lines")), "a .jsonl file opens: 2 lines · JSON Lines");
  await page.close();

  page = await openPage({ width: 1280, height: 900 });
  await page.getByLabel(/Or paste JSON/).fill('[{"city":"Lyon"},{"city":"Rome"}]');
  await page.getByRole("button", { name: "Show as a table" }).click();
  await page.getByRole("heading", { name: "Your JSON as a table" }).waitFor({ timeout: 30000 });
  check(await visible(page.getByRole("gridcell", { name: "Lyon", exact: true })), "pasted JSON becomes a table");
  await page.close();

  page = await openPage({ width: 1280, height: 900 });
  await page.locator("input[type=file]").setInputFiles(jsonFile("broken.json", '[\n  {"a": 1},\n  {"a": 2,}\n]'));
  check(await visible(page.getByRole("heading", { name: "This file couldn't be opened" })), "invalid JSON: the file isn't opened");
  check(await visible(page.getByText(/isn't valid JSON: There is a comma before “}” with nothing after it \(line 3, column 11\)/)), "the mistake is explained with its line and column");
  await page.close();

  page = await openPage({ width: 1280, height: 900 });
  // Playwright can't pass more than 50 MB from memory, so the file is written to disk first.
  const huge = path.join(DL, "huge.json");
  writeFileSync(huge, Buffer.alloc(50 * 1024 * 1024 + 10, 0x20));
  await page.locator("input[type=file]").setInputFiles(huge);
  check(await visible(page.getByText(/JSON files can be up to 50 MB here/)), "a .json file over 50 MB is refused with the reason");
  await page.close();
}

// ---------------------------------------------------------------- phone
{
  console.log("\nPhone layout (390 × 844)");
  const page = await openPage({ width: 390, height: 844 });
  await openFile(page, jsonFile("people.json", PEOPLE));
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `no page-level horizontal scroll (${w}px)`);
  const box = await page.getByRole("button", { name: "Download CSV" }).boundingBox();
  check(!!box && box.height >= 40, `download button is a comfortable tap target (${box?.height ?? 0}px)`);
  await page.close();
}

await browser.close();
rmSync(DL, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
