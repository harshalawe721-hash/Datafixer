/**
 * Stage 11, Step 2: browser test of the “Remove Duplicates” page: preview on open,
 * matching options, chosen columns, keep first/last, remove, undo/redo, CSV download,
 * mark, Excel with a filter (removal blocked → clear or mark), old .xls (mark and
 * download as Excel), keyboard, axe-core (light and dark), phone layout.
 * Usage: start the app (npm run build && npm start), then `npm run test:duplicates`.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import * as XLSX from "xlsx";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js", { paths: [process.cwd()] }), "utf8");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DL = mkdtempSync(path.join(tmpdir(), "dups-"));

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const ROWS = [
  ["name", "email", "city"],
  ["Asha", "asha@example.com", "Pune"],
  ["Ben", "ben@example.com", "Rome"],
  ["Asha", "asha@example.com", "Pune"],
  ["Asha P", "asha@example.com", "Mumbai"],
  ["ben", "ben@example.com ", "Rome"],
];
const CSV = ROWS.map((r) => r.join(",")).join("\n");

const browser = await chromium.launch();
const errors: string[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function openPage(viewport: { width: number; height: number }, file: { name: string; mimeType: string; buffer: Buffer }) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/remove-duplicates`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(file);
  await page.getByRole("heading", { name: "Remove duplicates", exact: true }).waitFor({ timeout: 30000 });
  return page;
}
const csvFile = { name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) };
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const summary = (page: Page, text: RegExp) => visible(page.getByRole("status").filter({ hasText: text }));
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
const openpyxl = (file: string, expr: string) => {
  const r = spawnSync("python3", ["-I", "-c", `import openpyxl,sys,json; ws=openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps(${expr}))`, file], { encoding: "utf8" });
  return r.status === 0 ? JSON.parse(r.stdout) : r.stderr;
};

// ---------------------------------------------------------------- desktop, CSV
{
  console.log("\nDesktop CSV: preview, options, remove, undo, redo, download");
  const page = await openPage({ width: 1280, height: 900 }, csvFile);
  check(await visible(page.getByRole("heading", { level: 1, name: "Remove Duplicates" })), "page heading “Remove Duplicates”");
  check(await summary(page, /1 group of matching rows · 1 duplicate row will be removed/), "preview on open: 1 exact duplicate");
  const groups = page.getByRole("table", { name: /Groups of matching rows/ });
  check(/2\s+4\s+Asha\s+asha@example\.com\s+Pune/.test(await groups.innerText()), "group: row 2 kept, row 4 is the copy");

  const a1 = await axe(page, false);
  const a2 = await axe(page, true);
  check(a1.length === 0 && a2.length === 0, `axe-core on the page with a preview, light and dark: ${JSON.stringify([a1, a2])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  await page.getByRole("checkbox", { name: /Ignore capital letters/ }).check();
  await page.getByRole("checkbox", { name: "Ignore extra spaces" }).check();
  check(await summary(page, /2 groups of matching rows · 2 duplicate rows will be removed/), "ignoring capitals and spaces: Ben and “ben ” match too");

  await page.getByRole("radio", { name: "Only the columns I choose" }).check();
  check(await visible(page.getByText("Tick at least one column to compare.")), "chosen columns: asks for a column");
  await page.getByRole("group", { name: "Columns to compare" }).getByRole("checkbox", { name: /^email/ }).check();
  check(await summary(page, /2 groups of matching rows · 3 duplicate rows will be removed/), "email only: Asha P counts as a copy as well");
  await page.getByRole("radio", { name: "The last" }).check();
  check(/5\s+2, 4/.test(await groups.innerText()), "keep the last: row 5 kept, rows 2 and 4 are copies");

  await page.getByRole("button", { name: "Apply: remove 3 rows" }).click();
  check(await visible(page.getByText(/3 duplicate rows removed/)), "done message after Apply");
  check(await visible(page.getByText(/3 rows removed/)), "“Your changes” shows 3 rows removed");
  check(await summary(page, /No duplicate rows found in the chosen columns/), "the preview now finds none");
  await page.getByRole("button", { name: "Undo" }).click();
  check(await summary(page, /3 duplicate rows will be removed/), "Undo brings the rows back (preview finds them again)");
  await page.getByRole("button", { name: "Redo" }).click();
  await summary(page, /No duplicate rows found/);

  const dl = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Download corrected CSV" }).click();
  const file = path.join(DL, "dedup.csv");
  await (await dl).saveAs(file);
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  check(text === "name,email,city\nAsha P,asha@example.com,Mumbai\nben,ben@example.com ,Rome\n", `downloaded CSV keeps the last copies: ${JSON.stringify(text)}`);
  await page.keyboard.press("Escape");

  await page.getByRole("radio", { name: "All columns (whole rows are the same)" }).focus();
  await page.keyboard.press("ArrowDown");
  check(await page.getByRole("radio", { name: "Only the columns I choose" }).isChecked(), "compare choice works with the arrow keys");
  check(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
  await page.close();
}

// ---------------------------------------------------------------- mark
{
  console.log("\nMark instead of remove");
  const page = await openPage({ width: 1280, height: 900 }, csvFile);
  await page.getByRole("radio", { name: /Mark them in a new column/ }).check();
  check(await summary(page, /1 duplicate row will be marked/), "preview: 1 row will be marked");
  await page.getByRole("button", { name: "Apply: mark 1 row" }).click();
  check(await visible(page.getByText(/marked in a new “Duplicate” column/)), "done message after marking");
  await page.waitForTimeout(500);
  check((await headers(page)).some((h) => h.endsWith("Duplicate")), "table has the new “Duplicate” column");
  check(await visible(page.getByRole("gridcell", { name: "Duplicate of row 2", exact: true })), "row 4 says “Duplicate of row 2”");
  check((await page.getByText(/1 column added/).count()) > 0, "“Your changes” shows 1 column added (no rows removed)");
  await page.close();
}

// ---------------------------------------------------------------- Excel with a filter, and .xls
{
  console.log("\nExcel with a filter on the header: removal blocked, clear or mark instead");
  const xf = path.join(DL, "people.xlsx");
  const gen = spawnSync(
    "python3",
    ["-I", "-c", "import openpyxl,sys,json\nwb=openpyxl.Workbook(); ws=wb.active\nfor r in json.loads(sys.argv[2]): ws.append(r)\nws.auto_filter.ref='A1:C6'\nws['A1'].font=openpyxl.styles.Font(bold=True)\nwb.save(sys.argv[1])", xf, JSON.stringify(ROWS)],
    { encoding: "utf8" },
  );
  check(gen.status === 0, "test workbook with a filter created");
  const xlsxType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  let page = await openPage({ width: 1280, height: 900 }, { name: "people.xlsx", mimeType: xlsxType, buffer: readFileSync(xf) });
  check(await visible(page.getByText(/Rows can.t be removed from this file, because removing them would break: .*Filter/)), "removal blocked: the filter would break");
  check((await page.getByRole("button", { name: /^Apply/ }).count()) === 0, "no Apply button while blocked");
  await page.getByRole("checkbox", { name: /Clear these rows instead/ }).check();
  check(await summary(page, /1 duplicate row will be cleared \(the rows stay in place\)/), "clear instead: 1 row will be cleared");
  await page.getByRole("button", { name: "Apply: clear 1 row" }).click();
  check(await visible(page.getByText("The cells of 1 duplicate row were cleared; the rows themselves stay in place. You can undo this.")), "done message after clearing");
  await page.close();

  page = await openPage({ width: 1280, height: 900 }, { name: "people.xlsx", mimeType: xlsxType, buffer: readFileSync(xf) });
  await page.getByRole("button", { name: "Mark them in a new column instead" }).click();
  await page.getByRole("button", { name: "Apply: mark 1 row" }).click();
  await page.getByText(/marked in a new “Duplicate” column/).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Download corrected file" }).click();
  let dlp = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("dialog").getByRole("button", { name: "Download Excel file" }).click();
  const out = path.join(DL, "marked.xlsx");
  await (await dlp).saveAs(out);
  const vals = openpyxl(out, "[ws['D1'].value, ws['D4'].value, ws['A1'].font.bold, ws.auto_filter.ref, ws.max_row]");
  check(JSON.stringify(vals) === JSON.stringify(["Duplicate", "Duplicate of row 2", true, "A1:C6", 6]), `Excel download: the mark, bold header and filter kept, no rows removed: ${JSON.stringify(vals)}`);
  await page.close();

  console.log("\nOld .xls file: rows never removed; marking downloads as Excel");
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(ROWS), "People");
  const xlsPath = path.join(DL, "old.xls");
  writeFileSync(xlsPath, Buffer.from(XLSX.write(wb, { bookType: "biff8", type: "array" }) as ArrayBuffer));
  page = await openPage({ width: 1280, height: 900 }, { name: "old.xls", mimeType: "application/vnd.ms-excel", buffer: readFileSync(xlsPath) });
  check(await visible(page.getByText(/what refers to these rows can.t be checked/)), ".xls: removal blocked with the reason");
  await page.getByRole("button", { name: "Mark them in a new column instead" }).click();
  await page.getByRole("button", { name: "Apply: mark 1 row" }).click();
  await page.getByText(/marked in a new “Duplicate” column/).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Download corrected file" }).click();
  dlp = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("dialog").getByRole("button", { name: /^Download (Excel file|as Excel|\.xlsx)/ }).first().click();
  const out2 = path.join(DL, "old-marked.xlsx");
  await (await dlp).saveAs(out2);
  const v2 = openpyxl(out2, "[ws['D1'].value, ws['D4'].value, ws.max_row]");
  check(JSON.stringify(v2) === JSON.stringify(["Duplicate", "Duplicate of row 2", 6]), `.xls marked and downloaded as .xlsx: ${JSON.stringify(v2)}`);
  await page.close();
}

// ---------------------------------------------------------------- phone
{
  console.log("\nPhone layout (390 × 844)");
  const page = await openPage({ width: 390, height: 844 }, csvFile);
  await summary(page, /1 duplicate row will be removed/);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `no page-level horizontal scroll (${w}px)`);
  const apply = page.getByRole("button", { name: "Apply: remove 1 row" });
  const box = await apply.boundingBox();
  check(!!box && box.height >= 40, `Apply button is a comfortable tap target (${box?.height ?? 0}px)`);
  await apply.click();
  check(await visible(page.getByText(/1 duplicate row removed/)), "Apply works on a phone");
  await page.close();
}

await browser.close();
rmSync(DL, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
