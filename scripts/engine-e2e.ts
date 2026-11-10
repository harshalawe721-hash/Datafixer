/**
 * Browser end-to-end test of the spreadsheet engine through the real UI.
 * Usage: start the app (npm run build && npm start), then `npm run test:engine`.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdirSync, openSync, writeSync, closeSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { buildXlsx, sheetXml } from "../tests/engine/fixtures.ts";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const URL_DETECTOR = `${BASE}/spreadsheet-error-detector`;
const TMP = path.join(tmpdir(), "datafixer-engine-e2e");
mkdirSync(TMP, { recursive: true });

let passes = 0;
let failures = 0;
function check(cond: unknown, label: string) {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
}
const sha = (f: string) => createHash("sha256").update(readFileSync(f)).digest("hex");

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors: string[] = [];
const offOrigin: string[] = [];
const nonGet: string[] = [];
page.on("pageerror", (e: Error) => errors.push(String(e)));
page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
page.on("request", (r: { url(): string; method(): string }) => {
  if (!r.url().startsWith(BASE) && !r.url().startsWith("blob:") && !r.url().startsWith("data:")) offOrigin.push(r.url());
  if (r.method() !== "GET") nonGet.push(`${r.method()} ${r.url()}`);
});

const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 10000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const input = () => page.locator("input[type=file]");
async function openFile(file: { name: string; mimeType: string; buffer: Buffer } | string) {
  await page.goto(URL_DETECTOR, { waitUntil: "networkidle" });
  await input().setInputFiles(file);
}
const opened = () => visible(page.getByText("Opened on your device"));
const stat = async (label: string) => (await page.locator("dt", { hasText: new RegExp(`^${label}$`) }).locator("xpath=following-sibling::dd").textContent())?.trim();
const firstCell = (col = 0) => page.locator("tbody tr").first().locator("td").nth(col).textContent();

// ---------------------------------------------------------------------------
console.log("\nCSV: open, summary and preview");
let csv = "name,email,amount\n";
for (let i = 0; i < 1234; i++) csv += `Person ${i},p${i}@example.com,${i * 3}\n`;
await openFile({ name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
check(await opened(), "CSV opened");
check((await stat("Total rows")) === "1,235", "total rows = 1,235");
check((await stat("Columns")) === "3", "columns = 3");
check((await stat("Format")) === "CSV", "format = CSV");
check(await page.getByRole("checkbox", { name: "First row contains column names" }).isChecked(), "header row detected");
check((await firstCell(0)) === "Person 0", "first data row shown");
check((await page.locator("tbody th").first().textContent()) === "2", "row numbers are sheet row numbers");
check(await visible(page.getByText("1,234 data rows")), "footer shows data row count");

console.log("\nSearch, sort, paging, header toggle");
await page.getByLabel("Search in data").fill("p1233@");
check(await visible(page.getByText("1 matching row (of 1,234)")), "search narrows to 1 row");
check((await firstCell(0)) === "Person 1233", "search result correct");
await page.getByLabel("Search in data").fill("");
await visible(page.getByText("1,234 data rows"));
await page.getByRole("button", { name: /Sort by amount/ }).click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: /Sort by amount/ }).click();
await page.waitForTimeout(600);
check((await firstCell(2)) === "3699", "numeric descending sort (3699 first)");
check((await page.locator("th[aria-sort=descending]").count()) === 1, "aria-sort reflects sort");
await page.getByRole("button", { name: /Sort by amount/ }).click(); // back to unsorted
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Next" }).click();
await page.waitForTimeout(400);
check((await page.locator("tbody th").first().textContent()) === "102", "next page starts at row 102");
await page.getByRole("checkbox", { name: "First row contains column names" }).uncheck();
await page.waitForTimeout(400);
check((await firstCell(0)) === "name", "header toggle off shows first row as data");
check(await visible(page.getByText("1,235 rows")), "1,235 rows without header");

console.log("\nSeparator override and multi-byte text");
await openFile({ name: "semi.csv", mimeType: "text/csv", buffer: Buffer.from("city;note\nZürich;Café 😀\n東京;naïve\n") });
check(await opened(), "semicolon CSV opened");
check((await stat("Columns")) === "2", "semicolon detected (2 columns)");
check((await firstCell(0)) === "Zürich" && (await firstCell(1)) === "Café 😀", "multi-byte text intact");
await page.getByLabel("Column separator").selectOption(",");
await visible(page.getByText("Opened on your device"));
await page.waitForTimeout(500);
check((await stat("Columns")) === "1", "choosing comma re-reads as 1 column");

console.log("\nXLSX: inspection, sheets, features");
const xlsx = buildXlsx(
  [
    { name: "Sales", xml: sheetXml([["a", "b"], ["1", "2"], ["3", "4"]]) },
    { name: "Archive", state: "hidden" },
    { name: "Notes" },
  ],
  { "xl/charts/chart1.xml": "<c/>", "xl/vbaProject.bin": new Uint8Array([0]) },
);
await openFile({ name: "book.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from(xlsx) });
check(await opened(), "XLSX opened (structure)");
check((await stat("Sheets")) === "3", "3 sheets listed");
check((await stat("Total rows"))?.includes("3 (declared)"), "declared size shown before parsing");
check(await visible(page.getByRole("button", { name: /Archive.*hidden/ })), "hidden sheet badge");
check(await visible(page.getByText(/contains 1 chart/)), "chart feature warning");
check(await visible(page.getByText("This workbook contains macros. DataFixer never runs macros.")), "macro notice");
check(await visible(page.getByRole("status").filter({ hasText: "not available yet" })), "honest 'not available yet' for cell data");
await page.getByRole("button", { name: /^Notes/ }).click();
check(await visible(page.locator("button[aria-pressed=true]", { hasText: "Notes" })), "sheet switch works");

console.log("\nXLS, unsafe and damaged files");
const ole = Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(512)]);
await openFile({ name: "old.xls", mimeType: "application/vnd.ms-excel", buffer: ole });
check(await visible(page.getByText(/97–2003 \(\.xls\) files is not available yet/)), "XLS: clear not-available message");
const evil = buildXlsx([{ name: "S", xml: '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><worksheet/>' }]);
await openFile({ name: "evil.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from(evil) });
check(await visible(page.getByRole("alert").filter({ hasText: "not opened for safety" })), "DOCTYPE workbook rejected");
const good = buildXlsx([{ name: "S", xml: sheetXml(Array.from({ length: 400 }, (_, i) => [`row ${i}`, "x".repeat(i % 50)])) }]);
await openFile({ name: "cut.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from(good.slice(0, Math.floor(good.length * 0.5))) });
check(await visible(page.getByRole("alert").filter({ hasText: /incomplete or damaged|damaged/ })), "truncated workbook: damaged message");
await page.getByRole("button", { name: "Choose a different file" }).click();
check(await visible(page.locator("input[type=file]").locator("xpath=..")), "can choose another file after an error");

console.log("\nCancel and retry (60 MB CSV)");
const big = path.join(TMP, "big.csv");
{
  const fd = openSync(big, "w");
  writeSync(fd, "id,name,email,amount\n");
  const block = Buffer.from(Array.from({ length: 10000 }, (_, i) => `${i},Name ${i},user${i}@example.com,${i * 1.5}\n`).join(""));
  let n = 0;
  while (n < 60 * 1024 * 1024) n += writeSync(fd, block);
  closeSync(fd);
}
const before = sha(big);
await openFile(big);
check(await visible(page.getByRole("progressbar")), "progress bar shown");
await page.waitForTimeout(300);
const t0 = Date.now();
await page.getByRole("button", { name: "Cancel" }).click();
check(await visible(page.getByText("Processing cancelled"), 3000), `cancel takes effect (${Date.now() - t0} ms)`);
await page.getByRole("button", { name: "Try again" }).click();
check(await visible(page.getByText("Opened on your device"), 60000), "retry after cancel completes");
check(sha(big) === before, "original file SHA-256 unchanged");
rmSync(big);

console.log("\nHomepage handoff");
await page.goto(BASE + "/", { waitUntil: "networkidle" });
await page.locator("#hero-file-input").setInputFiles({ name: "handoff.csv", mimeType: "text/csv", buffer: Buffer.from("a,b\n1,2\n") });
await page.waitForURL("**/spreadsheet-error-detector");
check(await opened(), "homepage file opens in the engine");
check((await firstCell(0)) === "1", "handoff data shown");

console.log("\nMobile layout");
await page.setViewportSize({ width: 390, height: 844 });
await openFile({ name: "wide.csv", mimeType: "text/csv", buffer: Buffer.from(Array.from({ length: 30 }, (_, i) => `col${i}`).join(",") + "\n" + Array.from({ length: 30 }, (_, i) => `value-${i}`).join(",") + "\n") });
check(await opened(), "opened on mobile");
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check(overflow <= 0, `no page-level horizontal scroll (table scrolls inside) — overflow ${overflow}px`);

console.log("\nPrivacy");
check(offOrigin.length === 0, `no requests to other hosts ${offOrigin.join(" ")}`);
check(nonGet.length === 0, `no POST/PUT requests (nothing uploaded) ${nonGet.join(" ")}`);
check(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);

await browser.close();
rmSync(TMP, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
