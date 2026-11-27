/**
 * Stage 14, Step 2: browser test of the “XML to CSV” page: a product feed with g: fields,
 * the record choice, joined values, data left out, CSV and Excel downloads, an ISO-8859-1
 * file, mistakes with line and column, refused entity declarations, keyboard, axe-core
 * (light and dark), phone layout.
 * Usage: start the app (npm run build && npm start), then `npm run test:xml`.
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
const DL = mkdtempSync(path.join(tmpdir(), "xml-"));

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel><title>My shop</title>
<item><g:id>00123</g:id><title>Kurta</title><g:price>499.00 INR</g:price></item>
<item><g:id>00124</g:id><title>Saree &amp; blouse</title><g:price>1299.00 INR</g:price></item>
</channel></rss>`;
const CATALOG = `<catalog><products>
<product id="1"><sku>00123</sku><name>Kurta</name><tag>cotton</tag><tag>blue</tag></product>
<product id="2"><sku>00124</sku><name>Saree</name></product>
</products></catalog>`;

const browser = await chromium.launch();
const errors: string[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;
const xmlFile = (name: string, content: string | Buffer) => ({ name, mimeType: "application/xml", buffer: Buffer.isBuffer(content) ? content : Buffer.from(content) });

async function openPage(viewport: { width: number; height: number }, f: { name: string; mimeType: string; buffer: Buffer }, ready = true) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/xml-to-csv`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(f);
  if (ready) await page.getByRole("heading", { name: "Your XML as a table" }).waitFor({ timeout: 30000 });
  return page;
}
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const headers = async (page: Page): Promise<string[]> => (await page.getByRole("columnheader").allTextContents()).map((t: string) => t.trim());
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
  console.log("\nDesktop: a product feed");
  const page = await openPage({ width: 1280, height: 900 }, xmlFile("feed.xml", FEED));
  check(await visible(page.getByRole("heading", { level: 1, name: "XML to CSV Converter" })), "page heading “XML to CSV Converter”");
  check(await visible(page.getByText("2 records (each <item>) · 3 columns")), "summary: 2 records (each <item>) · 3 columns");
  check(await visible(page.getByText(/data outside the records .* is not in the table/)), "note: the feed's own title is left out");
  const h = await headers(page);
  check(h.some((t) => t.endsWith("g:id")) && h.some((t) => t.endsWith("g:price")), `g: prefixes kept (${h.join(", ")})`);
  check(await visible(page.getByRole("gridcell", { name: "00123", exact: true })), "the id keeps its leading zeros");
  check(await visible(page.getByRole("gridcell", { name: "Saree & blouse", exact: true })), "&amp; becomes &");
  const a1 = await axe(page, false);
  const a2 = await axe(page, true);
  check(a1.length === 0 && a2.length === 0, `axe-core, light and dark: ${JSON.stringify([a1, a2])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  let d = await download(page, /^Download CSV$/, "feed.csv");
  const bom = d.bytes[0] === 0xef && d.bytes[1] === 0xbb && d.bytes[2] === 0xbf;
  const text = d.bytes.subarray(bom ? 3 : 0).toString("utf8");
  check(d.name === "feed.csv" && bom && text === "g:id,title,g:price\r\n00123,Kurta,499.00 INR\r\n00124,Saree & blouse,1299.00 INR\r\n", `CSV download (${d.name}): ${JSON.stringify(text)}`);
  d = await download(page, /^Download Excel/, "feed.xlsx");
  const r = spawnSync("python3", ["-I", "-c", "import openpyxl,sys,json; ws=openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps([ws['A1'].value, ws['A2'].value, ws['C3'].value]))", d.path], { encoding: "utf8" });
  check(r.status === 0 && r.stdout.trim() === '["g:id", "00123", "1299.00 INR"]', `Excel: the id stays text: ${r.stdout.trim() || r.stderr.trim()}`);
  check(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
  await page.close();
}

{
  console.log("\nRecord choice, joined values, encodings, mistakes");
  let page = await openPage({ width: 1280, height: 900 }, xmlFile("catalog.xml", CATALOG));
  const select = page.getByLabel("Which element is one record (one row)");
  check(await visible(select), "a choice of record elements is offered");
  check((await select.inputValue()) === "catalog/products/product", "products are chosen first (not the repeated tags)");
  check(await visible(page.getByText(/1 cell holds values from repeated elements/)), "note: values joined from repeated tags");
  check(await visible(page.getByRole("gridcell", { name: "cotton; blue", exact: true })), "joined with “; ”");
  await select.focus();
  check(await page.evaluate(() => document.activeElement?.id === "xml-records"), "the record choice can be reached with the keyboard");
  await select.selectOption("catalog/products/product/tag");
  await page.getByText("2 records (each <tag>) · 1 column").waitFor({ timeout: 30000 }).catch(() => {});
  check(await visible(page.getByText("2 records (each <tag>) · 1 column")), "choosing <tag> shows one row per tag");
  await page.close();

  const latin = Buffer.concat([Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><list><item>Caf'), Buffer.from([0xe9]), Buffer.from("</item><item>x</item></list>")]);
  page = await openPage({ width: 1280, height: 900 }, xmlFile("latin.xml", latin));
  check(await visible(page.getByRole("gridcell", { name: "Café", exact: true })), "an ISO-8859-1 file is read correctly");
  check(await visible(page.getByText(/read as ISO-8859-1/)), "note: the encoding used");
  await page.close();

  page = await openPage({ width: 1280, height: 900 }, xmlFile("broken.xml", "<items>\n  <item>x</items>\n"), false);
  check(await visible(page.getByRole("heading", { name: "This file couldn't be opened" })), "invalid XML: the file isn't opened");
  check(await visible(page.getByText(/isn't valid XML: Expected <\/item> but found <\/items>.*\(line 2, column 10\)/)), "the mistake is explained with its line and column");
  await page.close();

  page = await openPage({ width: 1280, height: 900 }, xmlFile("bomb.xml", '<?xml version="1.0"?><!DOCTYPE l [<!ENTITY a "aaaaaaaa"><!ENTITY b "&a;&a;&a;">]><l>&b;</l>'), false);
  check(await visible(page.getByText(/defines its own entities .* refuses for safety/)), "entity declarations are refused for safety");
  await page.close();
}

{
  console.log("\nPhone layout (390 × 844)");
  const page = await openPage({ width: 390, height: 844 }, xmlFile("feed.xml", FEED));
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
