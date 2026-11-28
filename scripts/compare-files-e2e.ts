/**
 * Stage 17, Step 3: browser test of the “Compare Spreadsheets” page: choosing the older and
 * newer files, swapping, the suggested key, the summary and notes, the differences list and
 * its filter, two key columns and whole rows, the options, repeated keys, a CSV against a
 * chosen Excel sheet, files with no columns in common, the Excel report (values and colours
 * read with openpyxl) and the CSV report, keyboard, axe-core (light and dark), phone layout.
 * Usage: start the app (npm run build && npm start), then `npm run test:compare`.
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
const DL = mkdtempSync(path.join(tmpdir(), "compare-"));

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const file = (name: string, text: string) => ({ name, mimeType: "text/csv", buffer: Buffer.from(text) });
const MARCH = file("march.csv", "id,name,city,price,note\n001,Asha,Pune,10,x\n002,Ben,Oslo,20,y\n003,Cher,Lima,30,z\n004,Dev,Pune,40,w\n");
const APRIL = file("april.csv", "id,price,name,city,stock\n001,10,Asha,Pune,5\n002,25,Ben,,6\n004,40,Dev,Delhi,7\n005,50,Eva,Rome,8\n");
const xlsxPath = path.join(DL, "book.xlsx");
const gen = spawnSync(
  "python3",
  ["-I", "-c", "import openpyxl,sys\nwb=openpyxl.Workbook(); ws=wb.active; ws.title='Notes'\nws.append(['x'])\nws2=wb.create_sheet('Prices')\nws2.append(['id','amount'])\nws2.append(['001',12.5])\nws2.append(['002',3])\nwb.save(sys.argv[1])", xlsxPath],
  { encoding: "utf8" },
);
const readXlsx = (f: string) =>
  spawnSync(
    "python3",
    ["-I", "-c", "import openpyxl,sys,json\nws=openpyxl.load_workbook(sys.argv[1]).active\nprint(json.dumps([[[c.value, c.fill.fgColor.rgb[2:] if c.fill.fill_type=='solid' else None] for c in r] for r in ws.iter_rows()], separators=(',',':')))", f],
    { encoding: "utf8" },
  );

const browser = await chromium.launch();
const errors: string[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function openPage(viewport: { width: number; height: number }) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/compare-files`, { waitUntil: "networkidle" });
  return page;
}
async function pick(page: Page, older: { name: string; mimeType: string; buffer: Buffer }, newer: { name: string; mimeType: string; buffer: Buffer }) {
  await page.getByLabel("Choose the older file").setInputFiles(older);
  await page.getByLabel("Choose the newer file").setInputFiles(newer);
  await page.getByText(newer.name, { exact: true }).waitFor({ timeout: 15000 });
}
async function compare(page: Page) {
  await page.getByRole("button", { name: "Compare files" }).click();
  await page.getByRole("heading", { name: "Comparison" }).waitFor({ timeout: 30000 });
}
/** The four counts: changed, added, removed, unchanged. */
async function counts(page: Page): Promise<number[]> {
  await page.getByText("Comparing again…").waitFor({ state: "hidden", timeout: 30000 }).catch(() => {});
  return Promise.all(["Changed rows", "Added rows", "Removed rows", "Unchanged rows"].map(async (l) => Number(await page.locator(`dt:text-is("${l}") + dd`).textContent())));
}
async function waitCounts(page: Page, want: number[]) {
  for (let i = 0; i < 60; i++) {
    if (JSON.stringify(await counts(page)) === JSON.stringify(want)) return true;
    await page.waitForTimeout(250);
  }
  return false;
}
async function download(page: Page, button: string, save: string) {
  const dl = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: button }).click();
  const d = await dl;
  const p = path.join(DL, save);
  await d.saveAs(p);
  return { name: d.suggestedFilename(), bytes: readFileSync(p), path: p };
}
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
const listText = async (page: Page) => (await page.locator("main ul[aria-label$='rows'] > li").allTextContents()).map((t: string) => t.replace(/\s+/g, " ").trim());

{
  console.log("\nDesktop: choose, swap, compare, differences");
  check(gen.status === 0, "test workbook created");
  const page = await openPage({ width: 1280, height: 900 });
  check((await page.getByRole("button", { name: "Compare files" }).isDisabled()) && (await page.getByText("Choose both files to compare them.").isVisible()), "Compare waits for both files");
  await pick(page, APRIL, MARCH);
  const a1 = await axe(page, false);
  const a2 = await axe(page, true);
  check(a1.length === 0 && a2.length === 0, `axe-core on the file choice, light and dark: ${JSON.stringify([a1, a2])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.getByRole("button", { name: "Swap the older and newer files" }).click();
  const olderName = await page.getByRole("region", { name: "Older file" }).locator(".font-medium").textContent();
  check(olderName === "march.csv", `Swap puts march.csv first (${olderName})`);

  await compare(page);
  check(JSON.stringify(await counts(page)) === JSON.stringify([2, 1, 1, 1]), "summary: 2 changed, 1 added, 1 removed, 1 unchanged");
  check(await page.getByText("3 values", { exact: true }).isVisible(), "the number of changed values");
  check((await page.getByLabel("Match rows by").inputValue()) === "id" && (await page.getByRole("option", { name: "id (suggested)" }).count()) === 1, "id is suggested and used");
  check(await page.getByText(/Columns only in the newer file: stock\. Columns only in the older file: note\./).isVisible(), "columns in only one file are named");
  const changed = await listText(page);
  check(changed.length === 2 && changed[0] === "002 row 3price: 20 → 25city: Oslo → (empty)" && changed[1] === "004 row 5 → 4city: Pune → Delhi", `changed rows with old → new (${JSON.stringify(changed)})`);
  await page.getByRole("button", { name: "Added (1)" }).click();
  await page.locator("main ul[aria-label='Added rows']").waitFor();
  check((await listText(page))[0]!.startsWith("005 row 5 of the newer file"), "the added row");
  await page.getByRole("button", { name: "Removed (1)" }).click();
  await page.locator("main ul[aria-label='Removed rows']").waitFor();
  check((await listText(page))[0]!.startsWith("003 row 4 of the older file"), "the removed row");
  check((await page.getByRole("button", { name: "Removed (1)" }).getAttribute("aria-pressed")) === "true", "the filter says which kind is shown");
  const a3 = await axe(page, false);
  const a4 = await axe(page, true);
  check(a3.length === 0 && a4.length === 0, `axe-core on the result, light and dark: ${JSON.stringify([a3, a4])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  console.log("\nReports");
  const x = await download(page, "Download Excel report (.xlsx)", "r.xlsx");
  check(x.name === "april - differences.xlsx", `Excel report named after the newer file (${x.name})`);
  const xr = readXlsx(x.path);
  const rows = xr.status === 0 ? (JSON.parse(xr.stdout) as [unknown, string | null][][]) : [];
  check(JSON.stringify(rows[0]?.map((c) => c[0])) === JSON.stringify(["Change", "id", "price", "name", "city", "stock", "note", "What changed"]), "report columns: Change, every column, What changed");
  check(rows[2]?.[0]?.[0] === "Changed" && rows[2]?.[0]?.[1] === "FFF2CC" && rows[2]?.[2]?.[0] === 25 && rows[2]?.[2]?.[1] === "FFF2CC" && rows[2]?.[4]?.[1] === "FFF2CC" && rows[2]?.[3]?.[1] === null, "changed values highlighted (including one that became empty), others not");
  check(rows[1]?.[1]?.[0] === "001", "codes keep their leading zeros");
  check(rows[4]?.[0]?.[1] === "E2EFDA" && rows[5]?.[0]?.[0] === "Removed" && rows[5]?.[0]?.[1] === "FCE4D6", "Added and Removed labels coloured; removed rows last");
  await page.getByLabel("Include unchanged rows (1)").uncheck();
  const c = await download(page, "Download CSV report", "r.csv");
  const lines = c.bytes.toString("utf8").replace(/^﻿/, "").split("\r\n").filter(Boolean);
  check(c.name === "april - differences.csv" && lines.length === 5 && !lines.some((l) => l.startsWith("Unchanged")), `CSV report without unchanged rows (${lines.length} lines)`);
  check(lines[1] === "Changed,002,25,Ben,,6,y,price: 20 → 25; city: Oslo → (empty)", `CSV report line (${lines[1]})`);
  check(await page.getByText(/april - differences\.csv .* was checked and downloaded/).isVisible(), "the page confirms the check");

  console.log("\nKeys and options");
  await page.getByRole("button", { name: /Add a key column/ }).click();
  await page.getByLabel("Key column 2").selectOption("price");
  check(await waitCounts(page, [1, 2, 2, 1]), "id and price together: 002 becomes removed and added");
  await page.getByLabel("Match rows by").selectOption({ label: "Whole rows (no key column)" });
  check(await waitCounts(page, [0, 3, 3, 1]), "whole rows: only identical rows are unchanged");
  check(await page.getByText(/Rows are compared as a whole\. A row with one changed value shows as one removed and one added row/).isVisible(), "whole rows are explained");
  await page.getByRole("button", { name: "Choose other files" }).click();
  check((await page.getByRole("region", { name: "Newer file" }).locator(".font-medium").textContent()) === "april.csv", "Choose other files keeps the files chosen");
  await page.getByRole("button", { name: "Change the older file, march.csv" }).click();
  await page.getByRole("button", { name: "Change the newer file, april.csv" }).click();
  await pick(page, file("a.csv", "code,name\nAB1,Asha\nCD2,Ben\n"), file("b.csv", "code,name\nab1,ASHA\nCD2,Ben \n"));
  await compare(page);
  check(await waitCounts(page, [1, 1, 1, 0]), "exact: capital letters and spaces count");
  await page.getByLabel("Ignore capital letters (Pune = PUNE)").check();
  check(await waitCounts(page, [1, 0, 0, 1]), "ignoring capital letters (keys and values)");
  await page.getByLabel("Ignore spaces at the start and end").check();
  check(await waitCounts(page, [0, 0, 0, 2]), "and spaces at the end: the same data");
  check(await page.getByText("The two files have the same data (with the options chosen).").isVisible(), "the page says the data is the same");

  console.log("\nRepeated keys, an Excel sheet, no columns in common");
  await page.getByRole("button", { name: "Choose other files" }).click();
  await page.getByRole("button", { name: "Change the older file, a.csv" }).click();
  await page.getByRole("button", { name: "Change the newer file, b.csv" }).click();
  await pick(page, file("r1.csv", "id,v\n7,a\n7,b\n8,c\n"), file("r2.csv", "id,v\n7,a\n7,x\n8,c\n"));
  await compare(page);
  await page.getByLabel("Match rows by").selectOption("id");
  check(await waitCounts(page, [1, 0, 0, 2]), "a repeated key is matched in order");
  check(await page.getByText(/Some keys appear more than once \(1 key in the older file, 1 key in the newer file\), for example “7”/).isVisible(), "repeated keys are reported with an example");
  await page.getByRole("button", { name: "Choose other files" }).click();
  await page.getByRole("button", { name: "Change the older file, r1.csv" }).click();
  await page.getByRole("button", { name: "Change the newer file, r2.csv" }).click();
  await pick(page, { name: "book.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: readFileSync(xlsxPath) }, file("new.csv", "id,amount\n001,12.5\n002,4\n"));
  await compare(page);
  await page.getByLabel("Sheet in the older file").selectOption("Prices");
  check(await waitCounts(page, [1, 0, 0, 1]), "a CSV file against the chosen Excel sheet");
  check(await page.getByText("Older: book.xlsx (sheet “Prices”), 2 rows").isVisible(), "the sheet compared is named");
  await page.getByRole("button", { name: "Choose other files" }).click();
  await page.getByRole("button", { name: "Change the newer file, new.csv" }).click();
  await page.getByLabel("Choose the newer file").setInputFiles(file("other.csv", "x,y\n1,2\n"));
  await page.getByText("other.csv", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Compare files" }).click();
  check(await page.getByRole("alert").filter({ hasText: "no columns in common" }).waitFor({ timeout: 15000 }).then(() => true, () => false), "files with no columns in common are explained");

  console.log("\nKeyboard");
  await page.getByRole("button", { name: "Change the newer file, other.csv" }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Choose the newer file").setInputFiles(file("new.csv", "id,amount\n001,12.5\n002,4\n"));
  await page.getByText("new.csv", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Compare files" }).focus();
  await page.keyboard.press("Enter");
  check(await page.getByRole("heading", { name: "Comparison" }).waitFor({ timeout: 30000 }).then(() => true, () => false), "Remove and Compare work with the keyboard");
  const box = page.getByLabel("Ignore capital letters (Pune = PUNE)");
  const was = await box.isChecked();
  await box.focus();
  await page.keyboard.press("Space");
  check((await box.isChecked()) !== was, "options work with the keyboard");
  check(errors.length === 0, `no page errors (${errors.slice(0, 2).join(" | ")})`);
  await page.close();
}

{
  console.log("\nColumn names: overriding the automatic detection");
  const page = await openPage({ width: 1280, height: 900 });
  await pick(page, file("y1.csv", "2024,2025\n10,20\n11,21\n"), file("y2.csv", "2024,2025\n10,20\n11,22\n"));
  await compare(page);
  const older = page.getByLabel(/^First row of the older file contains column names/);
  const newer = page.getByLabel(/^First row of the newer file contains column names/);
  check(!(await older.isChecked()) && !(await newer.isChecked()), "years as column names are detected as data (both boxes unticked)");
  check(await waitCounts(page, [1, 0, 0, 2]), "so the header row is compared as a row");
  await older.check();
  await page.getByText("(changed by you; detected: data)").first().waitFor({ timeout: 15000 });
  await newer.check();
  check(await waitCounts(page, [1, 0, 0, 1]), "ticked for both files: the years are column names");
  check((await page.getByLabel("Match rows by").inputValue()) === "2024", "and the key is suggested again from the new names");
  check((await page.getByText("(changed by you; detected: data)").count()) === 2, "the page says the choice differs from what was detected");
  await page.getByRole("button", { name: "Choose other files" }).click();
  await page.getByRole("button", { name: "Change the older file, y1.csv" }).click();
  await page.getByRole("button", { name: "Change the newer file, y2.csv" }).click();
  await pick(page, file("p1.csv", "Asha,Pune\nBen,Oslo\n"), file("p2.csv", "Asha,Pune\nBen,Rome\n"));
  await compare(page);
  check(await page.getByText(/Older: p1\.csv, 1 row · Newer: p2\.csv, 1 row/).isVisible(), "a first data row taken as column names leaves 1 row each");
  await page.getByLabel(/^First row of the older file contains column names/).uncheck();
  await page.getByText("(changed by you; detected: names)").first().waitFor({ timeout: 15000 });
  await page.getByLabel(/^First row of the newer file contains column names/).uncheck();
  check(await waitCounts(page, [1, 0, 0, 1]), "unticked for both files: Asha's row is compared too");
  check(await page.getByText(/Older: p1\.csv, 2 rows · Newer: p2\.csv, 2 rows/).isVisible(), "both rows of each file are counted");
  const a = await axe(page, false);
  check(a.length === 0, `axe-core with the column-names boxes: ${JSON.stringify(a)}`);
  await page.close();
}

{
  console.log("\nPhone layout (390 × 844)");
  const page = await openPage({ width: 390, height: 844 });
  await pick(page, MARCH, APRIL);
  let w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `file choice: no page-level horizontal scroll (${w}px)`);
  await compare(page);
  w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `result: no page-level horizontal scroll (${w}px)`);
  const box = await page.getByRole("button", { name: "Download Excel report (.xlsx)" }).boundingBox();
  check(!!box && box.height >= 44, `report button is a comfortable tap target (${box?.height ?? 0}px)`);
  await page.close();
}

await browser.close();
rmSync(DL, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
