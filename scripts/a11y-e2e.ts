/**
 * Stage 7: keyboard accessibility (decision 2) and, from Step 4, automated
 * accessibility checks with axe-core (decision 3).
 * Usage: start the app (npm run build && npm start), then `npm run test:a11y`.
 */
import { createRequire } from "node:module";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const VALIDATE = new URL("../tests/fixtures/validate/", import.meta.url).pathname;
const SCAN = new URL("../tests/fixtures/scan/", import.meta.url).pathname;
let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (e: Error) => errors.push(String(e)));
page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
/** The focused element: grid position, role, label and text. */
const active = () =>
  page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    return { r: el?.dataset.r ?? null, c: el?.dataset.c ?? null, role: el?.getAttribute("role") ?? el?.tagName.toLowerCase() ?? null, label: el?.getAttribute("aria-label") ?? null, text: (el?.textContent ?? "").trim(), inDialog: !!el?.closest('[role="dialog"]') };
  });
const key = async (k: string, times = 1) => {
  for (let i = 0; i < times; i++) await page.keyboard.press(k);
};

console.log("\nKeyboard: reaching and moving around the table (CSV Validator, 2-header.csv)");
await page.goto(`${BASE}/csv-validator`, { waitUntil: "networkidle" });
await page.locator("input[type=file]").setInputFiles(path.join(VALIDATE, "2-header.csv"));
await page.locator("#validator-heading").waitFor({ timeout: 30000 });
const grid = page.getByRole("grid");
check((await grid.count()) === 1, "the table is exposed as a grid");
check((await grid.getAttribute("aria-rowcount")) === "21" && (await grid.getAttribute("aria-colcount")) === "8", "grid announces its size (21 rows, 8 columns incl. row numbers)");
check((await page.locator('td[role="gridcell"][tabindex="0"]').count()) === 1, "exactly one cell is in the Tab order");
await page.getByRole("combobox", { name: "Rows per page" }).focus();
await key("Tab");
let a = await active();
check(a.role === "gridcell" && a.r === "0" && a.c === "0", `Tab from the control above the table lands on the first cell (${JSON.stringify(a)})`);
await key("ArrowRight", 2);
await key("ArrowDown");
a = await active();
check(a.r === "1" && a.c === "2" && a.text === "n/a", `arrow keys move to row 2, column C (${a.r},${a.c} “${a.text}”)`);
await key("End");
a = await active();
check(a.c === "6", "End goes to the last cell of the row");
await key("Home");
a = await active();
check(a.c === "0", "Home goes to the first cell of the row");
await page.keyboard.press("Control+End");
a = await active();
check(a.r === "19" && a.c === "6", `Ctrl+End goes to the last cell (${a.r},${a.c})`);
await page.keyboard.press("Control+Home");
a = await active();
check(a.r === "0" && a.c === "0", "Ctrl+Home goes back to the first cell");
check((await page.locator('td[role="gridcell"][tabindex="0"]').count()) === 1, "still exactly one cell in the Tab order after moving");

console.log("\nKeyboard: editing a cell");
await key("ArrowDown", 2);
await key("ArrowRight", 1);
await key("Enter");
check(await visible(page.getByRole("dialog").getByRole("heading", { name: /Edit cell B4/ })), "Enter opens the cell editor for that cell (B4)");
a = await active();
check(a.inDialog, "focus moves into the editor");
await key("Escape");
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
a = await active();
check(a.r === "2" && a.c === "1", `Escape closes it and focus returns to the same cell (${a.r},${a.c})`);
await key("F2");
await page.getByRole("dialog").getByRole("textbox").fill("Keyboard edit");
await page.getByRole("dialog").getByRole("button", { name: /^Save/ }).focus();
await key("Enter");
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10000 });
check(await visible(page.locator("td[data-edited]", { hasText: "Keyboard edit" })), "F2, typing and Save by keyboard change the cell (shown as changed)");

console.log("\nKeyboard: the header and renaming a column (decision 2)");
await page.locator('td[data-r="0"][data-c="2"]').focus();
await key("ArrowUp");
a = await active();
check(a.label?.startsWith("Sort by") && a.label.includes("column C"), `↑ from the first row reaches the column's header (${a.label})`);
await key("ArrowRight");
a = await active();
check(a.label === "Rename column C", `→ reaches the column's Rename button (${a.label})`);
await key("Enter");
check(await visible(page.getByRole("dialog").getByRole("heading", { name: /Rename column C1/ })), "Enter opens “Rename column”");
check(await visible(page.getByRole("dialog").getByText(/Only the name changes; the data in the column stays as it is/)), "the editor says only the name changes");
await page.getByRole("dialog").getByRole("textbox").fill("status");
await page.getByRole("dialog").getByRole("button", { name: /^Save/ }).click();
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 10000 });
await page.waitForTimeout(800);
check(await visible(page.locator("thead", { hasText: "status" })), "the new column name is shown in the table");
check((await page.locator("article", { has: page.getByRole("heading", { name: "Columns without a name", exact: true }) }).count()) === 0, "the Validator no longer reports a column without a name");
await page.getByRole("button", { name: "Rename column C (status)" }).focus();
await key("ArrowDown");
a = await active();
check(a.r === "0" && a.c === "2", "↓ from the header goes back to the first cell of that column");
check((await page.locator("thead button[data-hb]:not([tabindex='-1'])").count()) === 0, "header buttons are reached with the arrow keys, not one Tab stop each");

console.log("\nKeyboard-only walkthrough: Spreadsheet Cleaner (fix all, apply, download)");
await page.goto(`${BASE}/spreadsheet-cleaner`, { waitUntil: "networkidle" });
await page.locator("input[type=file]").setInputFiles(path.join(SCAN, "1-problems.csv"));
await page.getByRole("heading", { name: "Spreadsheet analysis complete" }).waitFor({ timeout: 30000 });
const fixAll = page.getByRole("button", { name: "Fix all safe problems" });
await fixAll.focus();
await key("Enter");
const apply = page.getByRole("dialog").getByRole("button", { name: /^Apply all fixes/ });
await apply.waitFor({ timeout: 30000 });
a = await active();
check(a.inDialog, "the fix preview opens with focus inside it");
await key("Escape");
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 });
check((await page.evaluate(() => document.activeElement?.textContent?.trim())) === "Fix all safe problems", "Escape closes the preview and focus returns to the button");
await key("Enter");
await apply.waitFor({ timeout: 30000 });
await apply.focus();
await key("Enter");
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30000 });
check(await visible(page.getByText(/Done:/)), "Apply by keyboard applies the fixes");
const dl = page.waitForEvent("download", { timeout: 30000 });
await page.getByRole("button", { name: "Download corrected CSV" }).focus();
await key("Enter");
check((await dl).suggestedFilename() === "1-problems-cleaned.csv", "Download by keyboard works");
await page.getByRole("dialog").getByRole("button", { name: "Close" }).first().focus();
await key("Enter");
await page.getByRole("button", { name: "Undo" }).focus();
await key("Enter");
check(await visible(page.getByText(/undone/i)), "Undo by keyboard works");

console.log("\nErrors");
check(errors.length === 0, `no console or page errors (${errors.slice(0, 3).join(" | ")})`);

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
