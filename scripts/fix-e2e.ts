/**
 * Browser test of Stage 4 fixing (Step 4): Fix buttons, preview with choices,
 * Fix all, Undo/Redo, change history, automatic re-check, Excel rules, phone
 * and tablet layouts.
 * Usage: start the app (npm run build && npm start), then `npm run test:fix`.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const URL = `${BASE}/spreadsheet-error-detector`;
const FIXTURES = path.join(import.meta.dirname, "..", "tests", "fixtures", "scan");
const SHOTS = process.env.SCREENSHOT_DIR;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const browser = await chromium.launch();
const errors: string[] = [];

type Page = Awaited<ReturnType<typeof browser.newPage>>;
async function setup(viewport: { width: number; height: number }) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  return page;
}
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 20000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const gone = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 20000) =>
  loc.first().waitFor({ state: "detached", timeout }).then(() => true, () => false);

async function open(page: Page, file: string) {
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(path.join(FIXTURES, file));
  await page.getByRole("heading", { name: "Spreadsheet analysis complete" }).waitFor({ timeout: 30000 });
}
const card = (page: Page, title: string) => page.locator("article", { has: page.getByRole("heading", { name: title, exact: true }) });
const dialog = (page: Page) => page.getByRole("dialog");
/** Wait for the re-check after a change to finish. */
const settled = async (page: Page) => {
  await page.getByRole("heading", { name: "Spreadsheet analysis complete" }).waitFor({ timeout: 30000 });
};

// ---------------------------------------------------------------- CSV, desktop
{
  console.log("\nCSV: single fix with preview");
  const page = await setup({ width: 1280, height: 900 });
  await open(page, "1-problems.csv");
  check(await visible(page.getByRole("button", { name: "Fix all safe problems" })), "“Fix all safe problems” offered");
  check(await visible(card(page, "Extra spaces").getByRole("button", { name: "Remove extra spaces" })), "fix button on Extra spaces");
  check((await card(page, "Invalid email addresses").getByRole("button", { name: /^(Remove|Convert|Make|Fix)/ }).count()) === 0, "no fix button on Invalid emails (guidance only)");

  await card(page, "Extra spaces").getByRole("button", { name: "Remove extra spaces" }).click();
  check(await visible(dialog(page).getByText("2 cells will change")), "preview: 2 cells will change");
  check(await visible(dialog(page).getByText("·Person 3")), "preview shows the hidden space (·Person 3)");
  check(await visible(dialog(page).getByText("London·")), "preview shows trailing space (London·)");
  check((await page.locator("[data-edited]").count()) === 0, "nothing changed before Apply");
  await dialog(page).getByRole("button", { name: /^Apply fix/ }).click();
  check(await gone(dialog(page)), "dialog closes after Apply");
  check(await visible(page.getByText("2 cells changed")), "edit bar: 2 cells changed");
  await settled(page);
  check(await gone(card(page, "Extra spaces")), "re-checked: Extra spaces card is gone");
  check(await visible(page.getByText(/These results include your changes/)), "results say they include the changes");
  check((await page.locator("[data-edited]").count()) >= 1, "changed cell is highlighted in the table");

  console.log("\nCSV: undo, redo, history");
  await page.getByRole("button", { name: "Undo" }).click();
  check(await visible(card(page, "Extra spaces")), "Undo: Extra spaces card is back");
  await page.getByRole("button", { name: "Redo" }).click();
  await settled(page);
  check(await gone(card(page, "Extra spaces")), "Redo: fixed again");
  await page.getByRole("button", { name: "History" }).click();
  const hist = page.locator("#change-history");
  check(await visible(hist.getByText("Remove extra spaces")), "history lists the fix");
  check(await visible(hist.getByText("Applied")), "history status: Applied");
  await hist.getByRole("button", { name: "Details" }).first().click();
  check(await visible(hist.getByText("B4", { exact: true })), "history details: cell B4");
  check(await visible(hist.getByText("“ Person 3”")), "history details: original value");
  check(await visible(hist.getByText("“Person 3”", { exact: true })), "history details: new value");
  check(await visible(hist.getByText("Operation")), "history details: operation and status labelled");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "history-desktop.png"), fullPage: false });

  console.log("\nCSV: dates need a choice");
  await card(page, "Inconsistent dates").getByRole("button", { name: "Make date formats consistent" }).click();
  check(await visible(dialog(page).getByText("Date format for “joined”")), "date format choice shown");
  check(await visible(dialog(page).getByText("Nothing will change automatically.")), "nothing changes before choosing");
  await dialog(page).getByRole("combobox").selectOption("iso");
  check(await visible(dialog(page).getByText("1 cell will change")), "after choosing: 1 cell will change");
  check(await visible(dialog(page).getByText(/Impossible dates .* never changed automatically/)), "impossible date listed as left for you");
  await dialog(page).getByRole("button", { name: /^Apply fix/ }).click();
  await settled(page);
  check(await gone(card(page, "Inconsistent dates")), "Inconsistent dates card gone");
  check(await visible(card(page, "Impossible dates")), "Impossible dates still reported");

  console.log("\nCSV: phone layout never invents digits");
  await card(page, "Phone numbers in different formats").getByRole("button", { name: "Make phone number layouts consistent" }).click();
  await dialog(page).getByRole("radio").first().check();
  check(await visible(dialog(page).getByText(/different number of digits or no country code/)), "10-digit number left alone, with the reason");
  check((await dialog(page).getByRole("button", { name: /^Apply/ }).count()) === 0, "no Apply button when nothing would change");
  await dialog(page).getByRole("button", { name: "Close", exact: true }).first().click();
  check(await gone(dialog(page)), "dialog closed");

  console.log("\nCSV: Fix all safe problems");
  await page.getByRole("button", { name: "Fix all safe problems" }).click();
  check(await visible(dialog(page).getByRole("heading", { name: "Fix all safe problems" })), "Fix all preview opens");
  check(await visible(dialog(page).getByText(/Remove duplicate rows/)), "includes duplicate rows");
  check(await visible(dialog(page).getByText(/kept\. Use “Remove empty columns” to decide/)), "named empty column kept, with a note");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "fix-all-desktop.png") });
  await dialog(page).getByRole("button", { name: /^Apply all fixes/ }).click();
  await settled(page);
  for (const t of ["Duplicate rows", "Empty rows", "Inconsistent capitalization", "Numbers stored as text"]) check(await gone(card(page, t)), `${t} fixed`);
  check(await visible(card(page, "Empty columns")), "Empty columns left for the user");

  console.log("\nCSV: leaving with changes asks first");
  let asked = "";
  page.once("dialog", (d: { message(): string; dismiss(): Promise<void> }) => {
    asked = d.message();
    void d.dismiss();
  });
  await page.getByRole("button", { name: /Open another file/ }).click();
  check(/unsaved change/.test(asked), "confirmation before discarding changes");
  check(await visible(page.getByText("Your changes")), "changes kept after choosing Cancel");
  await page.close();
}

// ---------------------------------------------------------------- Excel
{
  console.log("\nExcel: rules for workbooks");
  const page = await setup({ width: 1280, height: 900 });
  await open(page, "2-problems.xlsx");
  check((await card(page, "Duplicate rows").getByRole("button", { name: "Remove duplicate rows" }).count()) === 0, "no row removal for Excel yet");
  check(await visible(card(page, "Duplicate rows").getByText(/check the workbook's formulas and charts/)), "explains why");
  await card(page, "Inconsistent dates").getByRole("button", { name: "Make date formats consistent" }).click();
  await dialog(page).getByRole("combobox").selectOption("excel-dmy");
  check(await visible(dialog(page).getByText("1 cell will change")), "text date → real Excel date: 1 cell");
  await dialog(page).getByRole("button", { name: /^Apply fix/ }).click();
  await settled(page);
  let remaining = "";
  for (let i = 0; i < 40 && remaining !== "1"; i++) {
    remaining = ((await card(page, "Inconsistent dates").locator("p.text-right span").first().textContent({ timeout: 2000 }).catch(() => "")) ?? "").trim();
    if (remaining !== "1") await page.waitForTimeout(250);
  }
  check(remaining === "1", `only the impossible text date remains inconsistent (got ${remaining})`);
  await page.getByRole("button", { name: "Fix all safe problems" }).click();
  check(await visible(dialog(page).getByText(/Excel file: duplicate and empty rows and columns are not removed yet/)), "Fix all explains Excel limits");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
  await page.close();
}

// ---------------------------------------------------------------- phone and tablet
for (const [label, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["tablet", { width: 800, height: 1280 }],
] as const) {
  console.log(`\nLayout: ${label}`);
  const page = await setup(viewport);
  await open(page, "1-problems.csv");
  await card(page, "Inconsistent capitalization").getByRole("button", { name: "Fix capitalization" }).click();
  check(await visible(dialog(page).getByText("1 cell will change")), "preview works");
  const box = await dialog(page).boundingBox();
  check(box && box.width <= viewport.width + 1, "dialog fits the screen width");
  const apply = dialog(page).getByRole("button", { name: /^Apply fix/ });
  const ab = await apply.boundingBox();
  check(ab && ab.y + ab.height <= viewport.height + 1 && ab.height >= 40, "Apply button visible and large enough to tap");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `fix-dialog-${label}.png`) });
  await apply.click();
  await settled(page);
  check(await visible(page.getByRole("button", { name: "Undo" })), "Undo available");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `no page-level horizontal scroll (${overflow}px)`);
  await page.getByRole("button", { name: "History" }).click();
  await page.locator("#change-history").getByRole("button", { name: "Details" }).first().click();
  await page.locator("#change-history").getByText("Original value").waitFor();
  const hb = await page.locator("#change-history").boundingBox();
  check(hb && hb.x >= 0 && hb.x + hb.width <= viewport.width + 1, "history details fit the screen");
  if (SHOTS) {
    await page.locator("#change-history").scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(SHOTS, `history-${label}.png`) });
  }
  await page.close();
}

check(errors.length === 0, `no console/page errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ""}`);
await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
