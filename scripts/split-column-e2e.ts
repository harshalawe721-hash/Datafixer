/**
 * Stage 10, Step 2: browser test of the “Split a Column” page: choose a column and a
 * separator, preview, apply, the table changes, undo/redo, CSV and Excel downloads,
 * “nothing to split”, removing the original, .xls refused, keyboard, axe-core (light
 * and dark), phone layout.
 * Usage: start the app (npm run build && npm start), then `npm run test:split`.
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
const DL = mkdtempSync(path.join(tmpdir(), "split-"));

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const CSV = ["name,city", "Asha Patil,Pune", "Ben Rome,Rome", "Cher,Paris"].join("\n");

const browser = await chromium.launch();
const errors: string[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function openPage(viewport: { width: number; height: number }, file: { name: string; mimeType: string; buffer: Buffer }, ready = true) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/split-column`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(file);
  if (ready) await page.getByRole("heading", { name: "Split a column", exact: true }).waitFor({ timeout: 30000 });
  return page;
}
const csvFile = { name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) };
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const headers = (page: Page): Promise<string[]> => page.getByRole("columnheader").allTextContents();

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

// ---------------------------------------------------------------- desktop, CSV
{
  console.log("\nDesktop CSV: choose, preview, apply, undo, redo, download");
  const page = await openPage({ width: 1280, height: 900 }, csvFile);
  check(await visible(page.getByRole("heading", { level: 1, name: "Split a Column" })), "page heading “Split a Column”");
  check(await visible(page.getByText("Choose a column to see a preview.")), "asks for a column first");
  check((await page.getByRole("button", { name: /^Apply/ }).count()) === 0, "no Apply button before choosing");

  await page.getByLabel("Column to split").selectOption({ label: "name (e.g. Asha Patil)" });
  check(await visible(page.getByText(/2 new columns will be added at the right of the sheet/)), "preview: 2 new columns will be added");
  const table = page.getByRole("table", { name: /First rows before and after the split/ });
  const tableText = await table.innerText();
  check(/name \(1\)[\s\S]*name \(2\)/.test(tableText) && /Asha Patil\s+Asha\s+Patil/.test(tableText), "preview table: Asha Patil → Asha | Patil");
  check(await visible(page.getByText(/Values without the separator go into the first new column/)), "explains values without the separator");

  const a1 = await axe(page, false);
  const a2 = await axe(page, true);
  check(a1.length === 0 && a2.length === 0, `axe-core on the page with a preview, light and dark: ${JSON.stringify([a1, a2])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  await page.getByRole("button", { name: "Apply: add 2 columns" }).click();
  check(await visible(page.getByText(/“name” was split into 2 new columns/)), "done message after Apply");
  check(await visible(page.getByText(/2 columns added/)), "“Your changes” shows 2 columns added");
  await page.getByRole("columnheader", { name: "name (2)" }).waitFor({ timeout: 15000 }).catch(() => {});
  let h = await headers(page);
  check(h.some((t) => t.includes("name (1)")) && h.some((t) => t.includes("name (2)")), "table shows the new columns");
  check(await visible(page.getByRole("gridcell", { name: "Patil", exact: true })), "table shows “Patil” in its own cell");

  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(500);
  h = await headers(page);
  check(!h.some((t) => t.includes("name (1)")), "Undo removes the new columns");
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("columnheader", { name: "name (1)" }).first().waitFor({ timeout: 15000 }).catch(() => {});
  h = await headers(page);
  check(h.some((t) => t.includes("name (1)")), "Redo brings them back");

  const dl = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Download corrected CSV" }).click();
  const file = path.join(DL, "split.csv");
  await (await dl).saveAs(file);
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  check(text === "name,city,name (1),name (2)\nAsha Patil,Pune,Asha,Patil\nBen Rome,Rome,Ben,Rome\nCher,Paris,Cher,\n", `downloaded CSV has the new columns: ${JSON.stringify(text)}`);
  await page.keyboard.press("Escape");

  console.log("\nNothing to split, and removing the original");
  await page.getByLabel("Column to split").selectOption({ label: "city (e.g. Pune)" });
  check(await visible(page.getByText(/No value contains “ ”, so there is nothing to split/)), "a column without spaces: nothing to split");
  check((await page.getByRole("button", { name: /^Apply/ }).count()) === 0, "no Apply button when nothing would change");

  await page.getByLabel("Column to split").selectOption({ label: "name (e.g. Asha Patil)" });
  await page.getByRole("checkbox", { name: "Remove the original column" }).check();
  await page.getByRole("button", { name: "Apply: add 2 columns" }).click();
  await page.getByText(/“name” was split into 2 new columns/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  h = await headers(page);
  check(!h.some((t) => t.trim() === "name") && h.some((t) => t.includes("city")), "original “name” column removed, “city” kept");

  console.log("\nCustom separator and keyboard");
  // After Apply the column choice resets, so choose it again first.
  await page.getByLabel("Column to split").selectOption({ label: "city (e.g. Pune)" });
  await page.getByRole("radio", { name: "Other text" }).check();
  check(await visible(page.getByText("Type the separator to see a preview.")), "custom separator asks for the text");
  await page.getByLabel("Separator text").fill("a");
  check(await visible(page.getByText(/new columns will be added/)), "custom separator previews");

  await page.getByLabel("Column to split").focus();
  await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.name ?? "");
  check(focused === "split-separator", `Tab moves from the column to the separator choices (${focused})`);
  check(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
  await page.close();
}

// ---------------------------------------------------------------- Excel
{
  console.log("\nExcel: split and download as Excel");
  const xf = path.join(DL, "people.xlsx");
  const gen = spawnSync(
    "python3",
    ["-I", "-c", "import openpyxl,sys\nwb=openpyxl.Workbook(); ws=wb.active\nfor r in [['name','city'],['Asha Patil','Pune'],['Ben Rome','Rome']]: ws.append(r)\nws['A1'].font=openpyxl.styles.Font(bold=True)\nwb.save(sys.argv[1])", xf],
    { encoding: "utf8" },
  );
  check(gen.status === 0, "test workbook created");
  const page = await openPage({ width: 1280, height: 900 }, { name: "people.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: readFileSync(xf) });
  await page.getByLabel("Column to split").selectOption({ label: "name (e.g. Asha Patil)" });
  await page.getByRole("button", { name: "Apply: add 2 columns" }).click();
  await page.getByText(/“name” was split/).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Download corrected file" }).click();
  const dlPromise = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("dialog").getByRole("button", { name: "Download Excel file" }).click();
  const out = path.join(DL, "out.xlsx");
  await (await dlPromise).saveAs(out);
  const opx = spawnSync(
    "python3",
    ["-I", "-c", "import openpyxl,sys,json; ws=openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps([[c.value for c in r] for r in ws.iter_rows()] + [ws['A1'].font.bold]))", out],
    { encoding: "utf8" },
  );
  const rows = opx.status === 0 ? JSON.parse(opx.stdout) : null;
  check(
    JSON.stringify(rows) === JSON.stringify([["name", "city", "name (1)", "name (2)"], ["Asha Patil", "Pune", "Asha", "Patil"], ["Ben Rome", "Rome", "Ben", "Rome"], true]),
    `openpyxl reads the new columns; the bold header is kept: ${opx.stdout.trim() || opx.stderr.trim()}`,
  );
  await page.close();

  console.log("\nOld .xls files are refused by this page");
  const xls = await openPage({ width: 1280, height: 900 }, { name: "old.xls", mimeType: "application/vnd.ms-excel", buffer: readFileSync("tests/fixtures/excel/lo-features.xls") }, false);
  check(await visible(xls.getByText(/XLSX, CSV, TSV, TXT/)), "the page lists the accepted types and refuses .xls");
  check((await xls.getByRole("heading", { name: "Split a column", exact: true }).count()) === 0, "no split controls for an .xls file");
  await xls.close();
}

// ---------------------------------------------------------------- phone
{
  console.log("\nPhone layout (390 × 844)");
  const page = await openPage({ width: 390, height: 844 }, csvFile);
  await page.getByLabel("Column to split").selectOption({ label: "name (e.g. Asha Patil)" });
  await page.getByText(/2 new columns will be added/).waitFor({ timeout: 15000 });
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `no page-level horizontal scroll (${w}px)`);
  const apply = page.getByRole("button", { name: "Apply: add 2 columns" });
  const box = await apply.boundingBox();
  check(!!box && box.height >= 40, `Apply button is a comfortable tap target (${box?.height ?? 0}px)`);
  await apply.click();
  check(await visible(page.getByText(/“name” was split into 2 new columns/)), "Apply works on a phone");
  await page.close();
}

await browser.close();
rmSync(DL, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
