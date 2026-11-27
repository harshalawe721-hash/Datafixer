/**
 * Stage 15, Step 2: browser test of the “Merge Files” page: choosing several files (a
 * comma CSV, a semicolon CSV and an Excel file), a refused file, reordering and removing,
 * the merged table and its notes, options (source column, duplicates), CSV and Excel
 * downloads, going back to the list, the hand-off to Remove Duplicates, keyboard,
 * axe-core (light and dark), phone layout.
 * Usage: start the app (npm run build && npm start), then `npm run test:merge`.
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
const DL = mkdtempSync(path.join(tmpdir(), "merge-"));

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const xlsxPath = path.join(DL, "mar.xlsx");
const gen = spawnSync(
  "python3",
  ["-I", "-c", "import openpyxl,sys\nwb=openpyxl.Workbook(); ws=wb.active\nws.append(['ID','Name','phone'])\nws.append(['00125','Cher','+33 1'])\nws.append(['00123','Asha',None])\nwb.save(sys.argv[1])", xlsxPath],
  { encoding: "utf8" },
);
const JAN = { name: "jan.csv", mimeType: "text/csv", buffer: Buffer.from("id,name,city\n00123,Asha,Pune\n") };
const FEB = { name: "feb.csv", mimeType: "text/csv", buffer: Buffer.from("name;id\nBen;00124\n") };
const MAR = { name: "mar.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: readFileSync(xlsxPath) };

const browser = await chromium.launch();
const errors: string[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function openPage(viewport: { width: number; height: number }) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/merge-files`, { waitUntil: "networkidle" });
  return page;
}
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const headers = async (page: Page): Promise<string[]> => (await page.getByRole("columnheader").allTextContents()).map((t: string) => t.trim());
/** Added files are checked (their first bytes read) before they appear: wait for the list to have n files. */
const waitList = (page: Page, n: number) =>
  page.waitForFunction((k: number) => document.querySelectorAll("[aria-label='Files to merge, in order'] li").length === k, n, { timeout: 15000 }).catch(() => {});
const listNames = async (page: Page): Promise<string[]> =>
  page.getByRole("list", { name: "Files to merge, in order" }).getByRole("listitem").evaluateAll((els: Element[]) => els.map((e) => e.querySelector(".truncate")?.textContent ?? ""));
async function download(page: Page, button: RegExp, save: string) {
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

{
  console.log("\nDesktop: choose, reorder, merge, options, downloads");
  check(gen.status === 0, "test workbook created");
  const page = await openPage({ width: 1280, height: 900 });
  check(await visible(page.getByRole("heading", { level: 1, name: "Merge CSV and Excel Files" })), "page heading “Merge CSV and Excel Files”");
  await page.locator("input[type=file]").setInputFiles([JAN, FEB, MAR, { name: "data.json", mimeType: "application/json", buffer: Buffer.from("{}") }]);
  check(await visible(page.getByText(/“data\.json” is not a supported file type/)), "a refused file is listed with the reason");
  await waitList(page, 3);
  check(JSON.stringify(await listNames(page)) === JSON.stringify(["jan.csv", "feb.csv", "mar.xlsx"]), "the three accepted files are listed in order");
  const a1 = await axe(page, false);
  check(a1.length === 0, `axe-core on the file list: ${JSON.stringify(a1)}`);

  await page.getByRole("button", { name: "Move mar.xlsx up" }).click();
  check(JSON.stringify(await listNames(page)) === JSON.stringify(["jan.csv", "mar.xlsx", "feb.csv"]), "Move up changes the order");
  await page.getByRole("button", { name: "Move mar.xlsx down" }).focus();
  await page.keyboard.press("Enter");
  check(JSON.stringify(await listNames(page)) === JSON.stringify(["jan.csv", "feb.csv", "mar.xlsx"]), "order buttons work with the keyboard");
  await page.getByRole("button", { name: "Remove feb.csv" }).click();
  check(JSON.stringify(await listNames(page)) === JSON.stringify(["jan.csv", "mar.xlsx"]), "a file can be removed");
  await page.locator("input[type=file]").setInputFiles([FEB]);
  await waitList(page, 3);
  check(JSON.stringify(await listNames(page)) === JSON.stringify(["jan.csv", "mar.xlsx", "feb.csv"]), "more files can be added");

  await page.getByRole("button", { name: "Merge 3 files" }).click();
  await page.getByRole("heading", { name: "Merged table" }).waitFor({ timeout: 30000 });
  check(await visible(page.getByText("4 rows from 3 files · 5 columns")), "summary: 4 rows from 3 files · 5 columns");
  check(await visible(page.getByText(/2 columns are only in some files.*city \(1 of 3\), phone \(1 of 3\)/)), "note: columns only in some files");
  const h = await headers(page);
  check(["Source file", "id", "name", "city", "phone"].every((n) => h.some((t) => t.endsWith(n))), `merged columns matched by name (${h.join(", ")})`);
  check(await visible(page.getByRole("gridcell", { name: "00124", exact: true })), "the semicolon file's code keeps its zeros");
  const a2 = await axe(page, false);
  const a3 = await axe(page, true);
  check(a2.length === 0 && a3.length === 0, `axe-core on the merged table, light and dark: ${JSON.stringify([a2, a3])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  let d = await download(page, /^Download CSV$/, "m.csv");
  const text = d.bytes.subarray(3).toString("utf8");
  check(
    d.name === "merged.csv" && text === "Source file,id,name,city,phone\r\njan.csv,00123,Asha,Pune,\r\nmar.xlsx,00125,Cher,,+33 1\r\nmar.xlsx,00123,Asha,,\r\nfeb.csv,00124,Ben,,\r\n",
    `merged CSV (${d.name}): ${JSON.stringify(text)}`,
  );
  d = await download(page, /^Download Excel/, "m.xlsx");
  const r = spawnSync("python3", ["-I", "-c", "import openpyxl,sys,json; ws=openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps([ws['A2'].value, ws['B2'].value, ws.max_row]))", d.path], { encoding: "utf8" });
  check(r.status === 0 && r.stdout.trim() === '["jan.csv", "00123", 5]', `Excel download: ${r.stdout.trim() || r.stderr.trim()}`);

  await page.getByRole("checkbox", { name: /Add a “Source file” column/ }).uncheck();
  await page.getByRole("heading", { name: "Merged table" }).waitFor({ timeout: 30000 });
  await page.getByText("4 rows from 3 files · 4 columns").waitFor({ timeout: 30000 }).catch(() => {});
  check(!(await headers(page)).some((t) => t.endsWith("Source file")), "without the source column");
  await page.getByRole("checkbox", { name: /Remove rows that appear more than once/ }).check();
  await page.getByRole("heading", { name: "Merged table" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(1000);
  // jan.csv's Asha row has city Pune; mar.xlsx's has none, so they are not exact copies.
  check(await visible(page.getByText("4 rows from 3 files · 4 columns")) && (await page.getByText(/appeared more than once/).count()) === 0, "only exact copies count: rows differing in one cell are both kept");

  await page.getByRole("button", { name: "Add or remove files" }).click();
  check(JSON.stringify(await listNames(page)) === JSON.stringify(["jan.csv", "mar.xlsx", "feb.csv"]), "back to the list, files kept");
  check(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
  await page.close();
}

{
  console.log("\nExact copies across files");
  const page = await openPage({ width: 1280, height: 900 });
  await page.locator("input[type=file]").setInputFiles([JAN, { ...JAN, name: "jan-copy.csv" }]);
  await page.getByRole("checkbox", { name: /Remove rows that appear more than once/ }).check();
  await page.getByRole("button", { name: "Merge 2 files" }).click();
  await page.getByRole("heading", { name: "Merged table" }).waitFor({ timeout: 30000 });
  check(await visible(page.getByText(/1 row that appeared more than once was left out/)), "the copy in the second file is left out (the source column is ignored)");
  check(await visible(page.getByText("1 row from 2 files · 4 columns")), "1 row remains");
  await page.close();
}

{
  console.log("\nHand-off to Remove Duplicates");
  const page = await openPage({ width: 1280, height: 900 });
  await page.locator("input[type=file]").setInputFiles([JAN, MAR]);
  await page.getByRole("button", { name: "Merge 2 files" }).click();
  await page.getByRole("heading", { name: "Merged table" }).waitFor({ timeout: 30000 });
  await page.getByRole("button", { name: "Open in Remove Duplicates" }).click();
  check(await visible(page.getByRole("heading", { level: 1, name: "Remove Duplicates" }), 30000), "Remove Duplicates opens");
  check(await visible(page.getByText("merged.csv"), 30000), "with the merged file already open");
  await page.close();
}

{
  console.log("\nPhone layout (390 × 844)");
  const page = await openPage({ width: 390, height: 844 });
  await page.locator("input[type=file]").setInputFiles([JAN, FEB]);
  let w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `file list: no page-level horizontal scroll (${w}px)`);
  await page.getByRole("button", { name: "Merge 2 files" }).click();
  await page.getByRole("heading", { name: "Merged table" }).waitFor({ timeout: 30000 });
  w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `merged table: no page-level horizontal scroll (${w}px)`);
  const box = await page.getByRole("button", { name: /^Download CSV$/ }).boundingBox();
  check(!!box && box.height >= 40, `download button is a comfortable tap target (${box?.height ?? 0}px)`);
  await page.close();
}

await browser.close();
rmSync(DL, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
