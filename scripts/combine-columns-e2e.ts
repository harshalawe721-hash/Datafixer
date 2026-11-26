/**
 * Stage 10, Step 3: browser test of the “Combine Columns” page: tick columns, change
 * the order, choose the separator, name the column, preview, apply, the table changes,
 * undo/redo, CSV and Excel downloads, skipping empty values, removing the originals,
 * .xls refused, keyboard, axe-core (light and dark), phone layout.
 * Usage: start the app (npm run build && npm start), then `npm run test:combine`.
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
const DL = mkdtempSync(path.join(tmpdir(), "combine-"));

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const CSV = ["first,last,city", "Asha,Patil,Pune", "Ben,Rome,Rome", "Cher,,Paris"].join("\n");

const browser = await chromium.launch();
const errors: string[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function openPage(viewport: { width: number; height: number }, file: { name: string; mimeType: string; buffer: Buffer }, ready = true) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/combine-columns`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(file);
  if (ready) await page.getByRole("heading", { name: "Combine columns", exact: true }).waitFor({ timeout: 30000 });
  return page;
}
const csvFile = { name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) };
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const headers = (page: Page): Promise<string[]> => page.getByRole("columnheader").allTextContents();
const tick = (page: Page, name: string) => page.getByRole("checkbox", { name: new RegExp(`^${name} \\(e\\.g\\.`) }).check();

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
  console.log("\nDesktop CSV: tick, order, preview, apply, undo, redo, download");
  const page = await openPage({ width: 1280, height: 900 }, csvFile);
  check(await visible(page.getByRole("heading", { level: 1, name: "Combine Columns" })), "page heading “Combine Columns”");
  check(await visible(page.getByText("Tick at least two columns to see a preview.")), "asks for two columns first");
  await tick(page, "first");
  check((await page.getByRole("button", { name: /^Apply/ }).count()) === 0, "no Apply button with one column");
  await tick(page, "last");
  await page.getByLabel("Name of the new column").fill("full name");
  check(await visible(page.getByText(/1 new column will be added at the right of the sheet · 3 cells filled/)), "preview: 1 new column, 3 cells filled");
  const table = page.getByRole("table", { name: /First rows before and after combining/ });
  await table.getByText("full name").waitFor({ timeout: 15000 });
  const tableText = await table.innerText();
  check(/Asha\s+Patil\s+Asha Patil/.test(tableText), "preview table: Asha + Patil → Asha Patil");
  check(/Cher\s+empty\s+Cher(\s|$)/.test(tableText), "an empty value is skipped: Cher → Cher");

  await page.getByRole("button", { name: "Move last up" }).click();
  await table.getByText("Patil Asha").waitFor({ timeout: 15000 }).catch(() => {});
  check(/Patil\s+Asha\s+Patil Asha/.test(await table.innerText()), "Move up changes the order: Patil Asha");
  await page.getByRole("button", { name: "Move last down" }).click();
  await table.getByText("Asha Patil").last().waitFor({ timeout: 15000 }).catch(() => {});

  const a1 = await axe(page, false);
  const a2 = await axe(page, true);
  check(a1.length === 0 && a2.length === 0, `axe-core on the page with a preview, light and dark: ${JSON.stringify([a1, a2])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  await page.getByRole("button", { name: "Apply: add the combined column" }).click();
  check(await visible(page.getByText(/“first” \+ “last” were combined into a new column “full name”/)), "done message after Apply");
  check(await visible(page.getByText(/1 column added/)), "“Your changes” shows 1 column added");
  await page.getByRole("columnheader", { name: "full name" }).first().waitFor({ timeout: 15000 }).catch(() => {});
  let h = await headers(page);
  check(h.some((t) => t.includes("full name")), "table shows the new column");
  check(await visible(page.getByRole("gridcell", { name: "Asha Patil", exact: true })), "table shows “Asha Patil”");

  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(500);
  h = await headers(page);
  check(!h.some((t) => t.includes("full name")), "Undo removes the new column");
  await page.getByRole("button", { name: "Redo" }).click();
  await page.getByRole("columnheader", { name: "full name" }).first().waitFor({ timeout: 15000 }).catch(() => {});
  check((await headers(page)).some((t) => t.includes("full name")), "Redo brings it back");

  const dl = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Download corrected CSV" }).click();
  const file = path.join(DL, "combined.csv");
  await (await dl).saveAs(file);
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  check(text === "first,last,city,full name\nAsha,Patil,Pune,Asha Patil\nBen,Rome,Rome,Ben Rome\nCher,,Paris,Cher\n", `downloaded CSV has the new column: ${JSON.stringify(text)}`);
  await page.keyboard.press("Escape");

  console.log("\nSeparators, empty values and removing the originals");
  await tick(page, "city");
  await tick(page, "first");
  await page.getByRole("radio", { name: /Comma and space/ }).check();
  check(await visible(page.getByRole("table").getByText("Pune, Asha")), "comma and space: Pune, Asha");
  await page.getByRole("checkbox", { name: /Skip empty values/ }).uncheck();
  await page.getByRole("radio", { name: /^Other text/ }).check();
  check(await visible(page.getByText("Type the text to put between the values to see a preview.")), "other text asks for the text");
  await page.getByLabel("Text between the values").fill(" / ");
  check(await visible(page.getByRole("table").getByText("Paris / Cher")), "custom text between values: Paris / Cher");

  await page.getByRole("radio", { name: /^Space/ }).check();
  await page.getByRole("checkbox", { name: /Remove the original columns/ }).check();
  await page.getByRole("button", { name: "Apply: add the combined column" }).click();
  await page.getByText(/were combined into a new column/).waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
  // Header cells start with a hidden “Sort by column X” label, so compare the endings.
  h = (await headers(page)).map((t) => t.trim());
  const has = (name: string) => h.some((t) => t.endsWith(name));
  check(!has("city") && !has("first") && has("last") && has("Combined"), `originals removed, new column named “Combined” by default (${h.join(", ")})`);

  await page.getByRole("checkbox", { name: /^last \(e\.g\./ }).focus();
  await page.keyboard.press("Space");
  check(await page.getByRole("checkbox", { name: /^last \(e\.g\./ }).isChecked(), "a column can be ticked with the keyboard");
  check(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
  await page.close();
}

// ---------------------------------------------------------------- Excel
{
  console.log("\nExcel: combine and download as Excel");
  const xf = path.join(DL, "people.xlsx");
  const gen = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      "import openpyxl,sys,datetime\nwb=openpyxl.Workbook(); ws=wb.active\nfor r in [['first','last','joined'],['Asha','Patil',datetime.date(2024,3,15)],['Ben','Rome',datetime.date(2024,4,1)]]: ws.append(r)\nfor c in ws['C'][1:]: c.number_format='yyyy-mm-dd'\nws['A1'].font=openpyxl.styles.Font(bold=True)\nwb.save(sys.argv[1])",
      xf,
    ],
    { encoding: "utf8" },
  );
  check(gen.status === 0, "test workbook created");
  const page = await openPage({ width: 1280, height: 900 }, { name: "people.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: readFileSync(xf) });
  await tick(page, "first");
  await tick(page, "last");
  await tick(page, "joined");
  check(await visible(page.getByRole("table").getByText("Asha Patil 2024-03-15")), "a date is joined as shown in the sheet (2024-03-15)");
  await page.getByRole("button", { name: "Apply: add the combined column" }).click();
  await page.getByText(/were combined/).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Download corrected file" }).click();
  const dlPromise = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("dialog").getByRole("button", { name: "Download Excel file" }).click();
  const out = path.join(DL, "out.xlsx");
  await (await dlPromise).saveAs(out);
  const opx = spawnSync(
    "python3",
    ["-I", "-c", "import openpyxl,sys,json; ws=openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps([ws['D1'].value, ws['D2'].value, ws['D3'].value, ws['A1'].font.bold, ws['C2'].number_format]))", out],
    { encoding: "utf8" },
  );
  const vals = opx.status === 0 ? JSON.parse(opx.stdout) : null;
  check(
    JSON.stringify(vals) === JSON.stringify(["Combined", "Asha Patil 2024-03-15", "Ben Rome 2024-04-01", true, "yyyy-mm-dd"]),
    `openpyxl reads the new column; bold header and date format kept: ${opx.stdout.trim() || opx.stderr.trim()}`,
  );
  await page.close();

  console.log("\nOld .xls files are refused by this page");
  const xls = await openPage({ width: 1280, height: 900 }, { name: "old.xls", mimeType: "application/vnd.ms-excel", buffer: readFileSync("tests/fixtures/excel/lo-features.xls") }, false);
  check(await visible(xls.getByText(/XLSX, CSV, TSV, TXT/)), "the page lists the accepted types and refuses .xls");
  check((await xls.getByRole("heading", { name: "Combine columns", exact: true }).count()) === 0, "no combine controls for an .xls file");
  await xls.close();
}

// ---------------------------------------------------------------- phone
{
  console.log("\nPhone layout (390 × 844)");
  const page = await openPage({ width: 390, height: 844 }, csvFile);
  await tick(page, "first");
  await tick(page, "last");
  await page.getByText(/1 new column will be added/).waitFor({ timeout: 15000 });
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `no page-level horizontal scroll (${w}px)`);
  const up = await page.getByRole("button", { name: "Move last up" }).boundingBox();
  check(!!up && up.height >= 40 && up.width >= 40, `order buttons are comfortable tap targets (${up?.width ?? 0}×${up?.height ?? 0}px)`);
  await page.getByRole("button", { name: "Apply: add the combined column" }).click();
  check(await visible(page.getByText(/were combined into a new column/)), "Apply works on a phone");
  await page.close();
}

await browser.close();
rmSync(DL, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
