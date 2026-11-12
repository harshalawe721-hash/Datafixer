/**
 * Browser test of the Error Detector dashboard (Stage 3, Step 7).
 * Usage: start the app (npm run build && npm start), then `npm run test:detector`.
 */
import { createRequire } from "node:module";
import { mkdirSync, openSync, writeSync, closeSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const URL = `${BASE}/spreadsheet-error-detector`;
let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors: string[] = [];
page.on("pageerror", (e: Error) => errors.push(String(e)));
page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const openFile = async (f: { name: string; mimeType: string; buffer: Buffer } | string) => {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(f);
};
const card = (title: string) => page.locator("article", { has: page.getByRole("heading", { name: title, exact: true }) });
const cardCount = async (title: string) => (await card(title).locator("p.text-right span").first().textContent())?.trim();

// Planted problems (Steps 2–6): sheet rows 1..9 after the header.
const PLANTED =
  "id,name,email,amount,notes,\n" +
  "1,Ann,a@x.com,10,,\n" +
  "2,Bob,b@x.com,20,,\n" +
  ",,,,,\n" +
  "1,Ann,a@x.com,10,,\n" +
  "3,Cat,cat.example.com,30,,\n" +
  "4,Dan,d@x.com\n" +
  ",,,,,\n" +
  "2,Bob,b@x.com,20,,\n" +
  "1,Ann,a@x.com,10,,\n";

console.log("\nPlanted file: dashboard");
await openFile({ name: "planted.csv", mimeType: "text/csv", buffer: Buffer.from(PLANTED) });
check(await visible(page.getByRole("heading", { name: "Spreadsheet analysis complete" })), "analysis complete heading");
check(await visible(page.getByText(/Checked 9 rows and 6 columns on this device/)), "rows/columns checked, on device");
for (const [title, n] of [["Duplicate rows", "3"], ["Empty rows", "2"], ["Empty columns", "2"], ["Missing cells", "1"], ["Invalid email addresses", "1"]] as const) {
  check((await cardCount(title)) === n, `card "${title}" shows ${n} (got ${await cardCount(title)})`);
}
check((await page.locator("article").count()) === 5, "exactly 5 issue cards");
check(await visible(card("Duplicate rows").getByText("Warning")), "severity shown in words");
// Stage 4: fixes are offered on fixable problems only (guidance-only problems have no fix button).
check(await visible(card("Duplicate rows").getByRole("button", { name: "Remove duplicate rows" })), "fix button on a fixable problem");
check((await card("Missing cells").getByRole("button", { name: /^(Remove |Convert |Fix capitalization|Make )/ }).count()) === 0, "no fix button on a guidance-only problem");
await card("Duplicate rows").getByText("How to fix").click();
check(await visible(card("Duplicate rows").getByText(/Remove Duplicates/)), "How to fix guidance expands");

console.log("\nView affected data");
await card("Duplicate rows").getByRole("button", { name: "View affected data" }).click();
check(await visible(page.getByRole("status").filter({ hasText: /Showing 5 rows affected by Duplicate rows/ })), "filter banner with count");
await page.waitForTimeout(400);
const rowNums = await page.locator("tbody th").allTextContents();
check(JSON.stringify(rowNums) === JSON.stringify(["2", "3", "5", "9", "10"]), `only affected rows shown (${rowNums.join(",")})`);
check((await page.locator("tbody td.bg-warning-soft").count()) > 0, "affected cells highlighted");
check(await visible(card("Duplicate rows").getByRole("button", { name: "Show all rows" })), "card button switches to Show all rows");
await card("Missing cells").getByRole("button", { name: "View affected data" }).click();
await page.waitForTimeout(400);
check(JSON.stringify(await page.locator("tbody th").allTextContents()) === JSON.stringify(["7"]), "switching issue: missing cell row only");
check((await page.locator("tbody td.bg-warning-soft").count()) === 1, "exactly the one missing cell highlighted");
await page.getByRole("status").getByRole("button", { name: "Show all rows" }).click();
await page.waitForTimeout(400);
check((await page.locator("tbody tr").count()) === 9, "Show all rows restores the table");

console.log("\nColumn-names setting re-runs the check");
await page.getByRole("checkbox", { name: "First row contains column names" }).uncheck();
check(await visible(page.getByText(/Checked 10 rows and 6 columns/)), "rescanned with the header row as data");
await page.getByRole("checkbox", { name: "First row contains column names" }).check();
check(await visible(page.getByText(/Checked 9 rows and 6 columns/)), "rescanned again");

console.log("\nClean file");
await openFile({ name: "clean.csv", mimeType: "text/csv", buffer: Buffer.from("name,qty\nAnn,1\nBob,2\nCat,3\n") });
check(await visible(page.getByRole("heading", { name: "No problems found" })), "No problems found");
check(await visible(page.getByText("Invalid phone numbers")), "lists what was checked");

console.log("\nExcel workbook");
await openFile(path.join(import.meta.dirname, "..", "tests", "fixtures", "excel", "lo-features.xlsx"));
check(await visible(page.getByRole("heading", { name: "Spreadsheet analysis complete" })), "Excel analysed");
check((await page.locator("article h3").first().textContent()) === "Formula errors", "errors listed first");
check(await visible(card("Formula errors").getByText("— Formula: =1/0")), "formula behind the error shown");
await page.getByRole("button", { name: /^Summary/ }).click();
check(await visible(page.getByText(/Checked 2 rows and 2 columns/)), "switching sheet re-runs the check");

console.log("\nCancel keeps the file open");
const TMP = path.join(tmpdir(), "df-detector-e2e");
mkdirSync(TMP, { recursive: true });
const big = path.join(TMP, "big.csv");
{
  const fd = openSync(big, "w");
  writeSync(fd, "id,name,email,city,amount\n");
  const block = Buffer.from(Array.from({ length: 10000 }, (_, i) => `${i},Name ${i},user${i}@example.com,City ${i % 300},${i * 1.5}\n`).join(""));
  let n = 0;
  while (n < 40 * 1024 * 1024) n += writeSync(fd, block);
  closeSync(fd);
}
await openFile(big);
check(await visible(page.getByText("Checking for problems"), 60000), "scan progress shown after opening");
await page.getByRole("button", { name: "Cancel" }).click();
check(await visible(page.getByRole("heading", { name: "Check cancelled" })), "check cancelled");
check(await visible(page.locator("tbody tr")), "file still open: preview visible");
await page.getByRole("button", { name: "Check again" }).click();
check(await visible(page.getByRole("heading", { name: /Spreadsheet analysis complete|No problems found/ }), 120000), "check again completes");
rmSync(TMP, { recursive: true, force: true });

console.log("\nMobile");
await page.setViewportSize({ width: 390, height: 844 });
await openFile({ name: "planted.csv", mimeType: "text/csv", buffer: Buffer.from(PLANTED) });
await visible(page.getByRole("heading", { name: "Spreadsheet analysis complete" }));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
check(overflow <= 0, `no page-level horizontal scroll (${overflow}px)`);
if (process.env.SHOTS) await page.screenshot({ path: process.env.SHOTS, fullPage: true });

check(errors.length === 0, `no console/page errors ${errors.join(" | ")}`);
await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
