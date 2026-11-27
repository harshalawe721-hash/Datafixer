/**
 * Stage 13, Step 1: browser test of the “TSV to CSV” page: separator found, structure
 * check (and the hand-off to the CSV Validator), CSV downloads with each option, CSV → TSV,
 * Excel download, .txt and .tab files, keyboard, axe-core (light and dark), phone layout.
 * Usage: start the app (npm run build && npm start), then `npm run test:tsv`.
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
const DL = mkdtempSync(path.join(tmpdir(), "tsv-"));

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const TSV = 'id\tname\tnote\n00123\tPatil, Asha\tsays "hi"\n00124\tBen\tCafé\n';

const browser = await chromium.launch();
const errors: string[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;
const file = (name: string, text: string, mimeType = "text/tab-separated-values") => ({ name, mimeType, buffer: Buffer.from(text) });

async function openPage(viewport: { width: number; height: number }, f: { name: string; mimeType: string; buffer: Buffer }) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/tsv-to-csv`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(f);
  await page.getByRole("heading", { name: "Convert to CSV" }).waitFor({ timeout: 30000 });
  return page;
}
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
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
  console.log("\nDesktop: TSV to CSV with each option");
  const page = await openPage({ width: 1280, height: 900 }, file("data.tsv", TSV));
  check(await visible(page.getByRole("heading", { level: 1, name: "TSV to CSV Converter" })), "page heading “TSV to CSV Converter”");
  check(await visible(page.getByText(/separated by\s+tabs/)), "the separator found: tabs");
  // The CSV Validator's rules warn about the quote in an unquoted value (says "hi").
  check(await visible(page.getByText(/The structure is fine, with 1 warning/)), "structure check: fine, with the quote warning");
  check(await visible(page.getByRole("gridcell", { name: "00123", exact: true })), "the table keeps the leading zeros");
  const a1 = await axe(page, false);
  const a2 = await axe(page, true);
  check(a1.length === 0 && a2.length === 0, `axe-core, light and dark: ${JSON.stringify([a1, a2])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  let d = await download(page, /^Download CSV$/, "a.csv");
  check(d.name === "data.csv", `named data.csv (${d.name})`);
  const bom = d.bytes[0] === 0xef && d.bytes[1] === 0xbb && d.bytes[2] === 0xbf;
  const text = d.bytes.subarray(bom ? 3 : 0).toString("utf8");
  check(bom && text === 'id,name,note\r\n00123,"Patil, Asha","says ""hi"""\r\n00124,Ben,Café\r\n', `default: comma, Windows line endings, BOM, quoting: ${JSON.stringify(text)}`);
  check(await visible(page.getByText(/data\.csv .* was checked and downloaded/)), "done message after the download");

  await page.getByRole("radio", { name: /^Semicolon/ }).check();
  await page.getByText("More options", { exact: true }).click();
  await page.getByRole("radio", { name: "Mac and Linux" }).check();
  await page.getByRole("checkbox", { name: /Add a UTF-8 marker/ }).uncheck();
  d = await download(page, /^Download CSV$/, "b.csv");
  check(d.bytes.toString("utf8") === 'id;name;note\n00123;Patil, Asha;"says ""hi"""\n00124;Ben;Café\n', `semicolon, Mac/Linux line endings, no BOM: ${JSON.stringify(d.bytes.toString("utf8"))}`);

  d = await download(page, /^Download Excel/, "c.xlsx");
  const r = spawnSync("python3", ["-I", "-c", "import openpyxl,sys,json; ws=openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps([ws['A2'].value, ws['B2'].value, ws['C3'].value]))", d.path], { encoding: "utf8" });
  check(r.status === 0 && r.stdout.trim() === '["00123", "Patil, Asha", "Caf\\u00e9"]', `Excel: the code stays text: ${r.stdout.trim() || r.stderr.trim()}`);

  await page.getByRole("radio", { name: /^Comma/ }).focus();
  await page.keyboard.press("ArrowRight");
  check(await page.getByRole("radio", { name: /^Semicolon/ }).isChecked(), "separator choice works with the arrow keys");
  check(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
  await page.close();
}

{
  console.log("\nCSV to TSV, .txt and .tab files, a broken file");
  let page = await openPage({ width: 1280, height: 900 }, file("data.csv", "a,b\n1,2\n", "text/csv"));
  await page.getByRole("radio", { name: /^Tab/ }).check();
  const d = await download(page, /^Download TSV$/, "d.tsv");
  check(d.bytes.subarray(3).toString("utf8") === "a\tb\r\n1\t2\r\n", `CSV to TSV (${d.name})`);
  await page.close();

  page = await openPage({ width: 1280, height: 900 }, file("export.txt", "x\ty\n1\t2\n", "text/plain"));
  const t = await download(page, /^Download CSV$/, "e.csv");
  check(t.name === "export.csv", `a .txt file becomes export.csv (${t.name})`);
  await page.close();

  page = await openPage({ width: 1280, height: 900 }, file("export.tab", "x\ty\n1\t2\n", "text/plain"));
  check(await visible(page.getByText(/separated by\s+tabs/)), "a .tab file is accepted");
  check(await visible(page.getByText(/The structure is fine: every row has the same number of values/)), "a clean file: structure fine, no warnings");
  await page.close();

  page = await openPage({ width: 1280, height: 900 }, file("broken.tsv", "a\tb\tc\n1\t2\t3\n4\t5\n"));
  check(await visible(page.getByText(/problem.* in the file's structure/)), "a row with fewer values is reported");
  await page.getByRole("link", { name: "Check and repair in the CSV Validator" }).click();
  check(await visible(page.getByRole("heading", { level: 1, name: "CSV Validator" }), 30000), "the link opens the CSV Validator");
  check(await visible(page.getByText("broken.tsv"), 30000), "with the same file already open");
  await page.close();
}

{
  console.log("\nPhone layout (390 × 844)");
  const page = await openPage({ width: 390, height: 844 }, file("data.tsv", TSV));
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `no page-level horizontal scroll (${w}px)`);
  const box = await page.getByRole("button", { name: /^Download CSV$/ }).boundingBox();
  check(!!box && box.height >= 40, `download button is a comfortable tap target (${box?.height ?? 0}px)`);
  await page.close();
}

await browser.close();
rmSync(DL, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
