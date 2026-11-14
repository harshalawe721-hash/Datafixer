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
const CONVERT = new URL("../tests/fixtures/convert/", import.meta.url).pathname;
const EXCEL = new URL("../tests/fixtures/excel/", import.meta.url).pathname;
// axe-core comes with the existing lint tools (eslint-config-next → eslint-plugin-jsx-a11y); nothing extra is installed.
const AXE = createRequire(import.meta.url).resolve("axe-core/axe.min.js");
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
// (The “page not found” check loads /does-not-exist on purpose: its 404 is expected.)
page.on("console", (m: { type(): string; text(): string; location(): { url: string } }) => m.type() === "error" && !m.location().url.includes("/does-not-exist") && errors.push(m.text()));
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
check(a.text.startsWith("Sort by column C"), `↑ from the first row reaches the column's header (${a.text})`);
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

// ---------------------------------------------------------------- axe-core (decision 3)
interface AxeViolation { id: string; impact: string | null; help: string; nodes: { target: string[] }[] }
const minor: Record<string, number> = {};
async function axe(label: string, dark = false) {
  if (dark) await page.evaluate(() => document.documentElement.classList.add("dark"));
  else await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.waitForTimeout(150);
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ path: AXE });
  const violations = (await page.evaluate(async () => {
    const w = window as unknown as { axe: { run: (ctx: Document, o: object) => Promise<{ violations: unknown[] }> } };
    return (await w.axe.run(document, { resultTypes: ["violations"] })).violations;
  })) as AxeViolation[];
  const bad = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  for (const v of violations.filter((x) => !bad.includes(x))) minor[`${v.id} (${v.impact})`] = (minor[`${v.id} (${v.impact})`] ?? 0) + 1;
  check(bad.length === 0, `${label}${dark ? " [dark]" : ""}: no serious or critical problems${bad.length ? ` — ${bad.map((v) => `${v.id}: ${v.help} at ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(", ")}`).join(" | ")}` : ""}`);
}

console.log("\naxe-core: every page, light and dark mode");
for (const p of ["/", "/spreadsheet-error-detector", "/spreadsheet-cleaner", "/csv-validator", "/excel-to-csv", "/csv-to-excel", "/about", "/contact", "/privacy-policy", "/terms-of-service", "/does-not-exist"]) {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  await axe(p);
  await axe(p, true);
}

console.log("\naxe-core: each tool after a file is opened");
await page.goto(`${BASE}/spreadsheet-error-detector`, { waitUntil: "networkidle" });
await page.locator("input[type=file]").setInputFiles(path.join(SCAN, "1-problems.csv"));
await page.getByRole("heading", { name: "Spreadsheet analysis complete" }).waitFor({ timeout: 30000 });
await axe("Error Detector: results");
await axe("Error Detector: results", true);
await page.locator("article").first().getByRole("button", { name: "View affected data" }).click();
await page.waitForTimeout(500);
await axe("Error Detector: affected rows shown");
await page.getByRole("button", { name: "Fix all safe problems" }).click();
await page.getByRole("dialog").getByRole("button", { name: /^Apply all fixes/ }).waitFor({ timeout: 30000 });
await axe("Error Detector: Fix all preview");
await axe("Error Detector: Fix all preview", true);
await page.getByRole("dialog").getByRole("button", { name: /^Apply all fixes/ }).click();
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30000 });
await page.getByRole("button", { name: "History", exact: true }).click();
await axe("Error Detector: changes and history");
await page.locator('td[data-r="0"][data-c="1"]').click();
await page.getByRole("dialog").getByRole("textbox").waitFor({ timeout: 10000 });
await axe("cell editor");
await axe("cell editor", true);
await page.keyboard.press("Escape");

await page.goto(`${BASE}/spreadsheet-cleaner`, { waitUntil: "networkidle" });
await page.locator("input[type=file]").setInputFiles(path.join(SCAN, "1-problems.csv"));
await page.getByRole("heading", { name: "Cleaning tools" }).waitFor({ timeout: 30000 });
await axe("Cleaner: tools");
await page.getByRole("button", { name: /Make date formats consistent|Fix capitalization/ }).first().click();
await page.getByRole("dialog").waitFor({ timeout: 30000 });
await page.waitForTimeout(500);
await axe("Cleaner: preview with choices");
await page.keyboard.press("Escape");

await page.goto(`${BASE}/csv-validator`, { waitUntil: "networkidle" });
await page.locator("input[type=file]").setInputFiles(path.join(VALIDATE, "1-uneven.csv"));
await page.locator("#validator-heading").waitFor({ timeout: 30000 });
await axe("CSV Validator: results");
await axe("CSV Validator: results", true);
await page.getByRole("button", { name: "Add empty cells" }).click();
await page.getByRole("dialog").getByRole("button", { name: /^Apply fix/ }).waitFor({ timeout: 30000 });
await axe("CSV Validator: repair preview");
await page.getByRole("dialog").getByRole("button", { name: /^Apply fix/ }).click();
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 30000 });
await page.locator("#validator-heading").waitFor({ timeout: 30000 });
await page.getByRole("button", { name: "Download corrected CSV" }).click();
await page.getByRole("dialog").getByRole("radio").first().waitFor({ timeout: 10000 });
await axe("CSV Validator: download options");
await axe("CSV Validator: download options", true);
await page.keyboard.press("Escape");

await page.goto(`${BASE}/csv-to-excel`, { waitUntil: "networkidle" });
await page.locator("input[type=file]").setInputFiles(path.join(CONVERT, "2-customers.csv"));
await page.locator("#convert-heading").waitFor({ timeout: 30000 });
await page.waitForTimeout(500);
await axe("CSV to Excel: settings");
await axe("CSV to Excel: settings", true);
const d1 = page.waitForEvent("download", { timeout: 30000 });
await page.getByRole("button", { name: "Convert to Excel (.xlsx)" }).click();
await d1;
await page.locator("#converted-heading").waitFor({ timeout: 30000 });
await axe("CSV to Excel: summary");

await page.goto(`${BASE}/excel-to-csv`, { waitUntil: "networkidle" });
await page.locator("input[type=file]").setInputFiles(path.join(EXCEL, "lo-features.xlsx"));
await page.locator("#to-csv-heading").waitFor({ timeout: 30000 });
await axe("Excel to CSV: settings");
await axe("Excel to CSV: settings", true);
const d2 = page.waitForEvent("download", { timeout: 30000 });
await page.getByRole("button", { name: "Download this sheet as CSV" }).click();
await d2;
await page.locator("#to-csv-done").waitFor({ timeout: 30000 });
await axe("Excel to CSV: summary");
console.log(`  (moderate and minor findings, by rule: ${Object.keys(minor).length ? JSON.stringify(minor) : "none"})`);

console.log("\nErrors");
check(errors.length === 0, `no console or page errors (${errors.slice(0, 3).join(" | ")})`);

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
