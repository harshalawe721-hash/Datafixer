/**
 * Browser test of Stage 4 fixing (Step 4): Fix buttons, preview with choices,
 * Fix all, Undo/Redo, change history, automatic re-check, Excel rules, phone
 * and tablet layouts.
 * Usage: start the app (npm run build && npm start), then `npm run test:fix`.
 */
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
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
  await page.getByRole("button", { name: "History", exact: true }).click();
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
  check(/haven't been downloaded/.test(asked), "confirmation before discarding changes");
  check(await visible(page.getByText("Your changes")), "changes kept after choosing Cancel");

  console.log("\nCSV: leaving the page with changes that weren't downloaded asks first");
  asked = "";
  page.once("dialog", (d: { message(): string; dismiss(): Promise<void> }) => {
    asked = d.message();
    void d.dismiss();
  });
  await page.locator("footer").getByRole("link", { name: "About Us" }).click();
  check(/haven't been downloaded/.test(asked), "tapping a link to another page asks first");
  check(page.url().endsWith("/spreadsheet-error-detector") && (await visible(page.getByText("Your changes"))), "staying on the page keeps the changes");
  let unloadPrompt = false;
  page.once("dialog", (d: { type(): string; dismiss(): Promise<void> }) => {
    unloadPrompt = d.type() === "beforeunload";
    void d.dismiss();
  });
  await page.reload({ waitUntil: "commit", timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(500);
  check(unloadPrompt, "reloading or closing the tab triggers the browser's “Leave site?” warning");
  check(await visible(page.getByText("Your changes")), "changes still there after choosing to stay");

  console.log("\nCSV: after downloading, no warning");
  const dl0 = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Download corrected CSV" }).click();
  await dl0;
  await dialog(page).getByRole("button", { name: "Close" }).last().click();
  let askedAfter = false;
  page.once("dialog", (d: { dismiss(): Promise<void> }) => {
    askedAfter = true;
    void d.dismiss();
  });
  await page.getByRole("button", { name: /Open another file/ }).click();
  await page.waitForTimeout(300);
  check(!askedAfter, "no warning once the changes were downloaded");
  check(await visible(page.locator("input[type=file]")), "back to the upload screen");
  await page.close();
}

// ---------------------------------------------------------------- Excel
{
  console.log("\nExcel: rules for workbooks");
  const page = await setup({ width: 1280, height: 900 });
  await open(page, "2-problems.xlsx");
  await card(page, "Duplicate rows").getByRole("button", { name: "Remove duplicate rows" }).click();
  check(await visible(dialog(page).getByText(/Checked: nothing else in this workbook/)), "Excel: workbook checked before removing rows (safe here)");
  check(await visible(dialog(page).getByText("2 rows will be removed")), "Excel: 2 rows will be removed");
  await dialog(page).getByRole("button", { name: "Cancel" }).click();
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
  check(await visible(dialog(page).getByText(/Remove duplicate rows/)), "Fix all includes row removal when the workbook check passes");
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
  await page.getByRole("button", { name: "History", exact: true }).click();
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

// ---------------------------------------------------------------- Step 5: editing cells by hand
{
  console.log("\nEditing cells by hand (CSV)");
  const page = await setup({ width: 1280, height: 900 });
  await open(page, "1-problems.csv");
  check(await visible(page.getByText(/Tap a cell to edit it, or move with the arrow keys and press Enter/)), "table says cells can be edited (by tap or keyboard)");
  await page.getByRole("gridcell", { name: "person7example.com", exact: true }).click();
  check(await visible(dialog(page).getByRole("heading", { name: "Edit cell C8" })), "editor opens for C8");
  check(await visible(dialog(page).getByText("“person7example.com”")), "shows the current value");
  await dialog(page).getByLabel("New value").fill("person7@example.com");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  check(await gone(dialog(page)), "editor closes after Save");
  check(await visible(page.getByText(/Done:.*Edit cell C8 \(1 cell\)/)), "Done message names the change");
  let emails = "";
  for (let i = 0; i < 40 && emails !== "1"; i++) {
    emails = ((await card(page, "Invalid email addresses").locator("p.text-right span").first().textContent({ timeout: 2000 }).catch(() => "")) ?? "").trim();
    if (emails !== "1") await page.waitForTimeout(250);
  }
  check(emails === "1", `re-checked: 1 invalid email left (got ${emails})`);
  check(await visible(page.locator("td[data-edited]", { hasText: "person7@example.com" })), "edited cell highlighted in green");
  await page.getByRole("button", { name: "Undo" }).click();
  check(await visible(page.getByText(/Undone:.*Edit cell C8/)), "Undo message");
  check(await visible(page.getByRole("gridcell", { name: "person7example.com", exact: true })), "Undo restores the old value in the table");

  console.log("\nFix all: Done message lists every fix");
  await page.getByRole("button", { name: "Fix all safe problems" }).click();
  await dialog(page).getByRole("button", { name: /^Apply all fixes/ }).click();
  check(await visible(page.getByText(/Done:.*Remove extra spaces \(2 cells\).*Remove duplicate rows \(2 rows removed\)/)), "Done message lists the fixes with counts");
  await page.close();
}
{
  console.log("\nEditing a formula cell (Excel)");
  const page = await setup({ width: 1280, height: 900 });
  await open(page, "2-problems.xlsx");
  await page.getByRole("gridcell", { name: /#DIV\/0!/ }).first().click();
  check(await visible(dialog(page).getByText("This cell contains a formula")), "formula warning shown before editing");
  const save = dialog(page).getByRole("button", { name: "Save" });
  await dialog(page).getByLabel("New value").fill("0");
  check(await save.isDisabled(), "Save disabled until the user confirms");
  await dialog(page).getByLabel("Replace the formula with my value").check();
  check(await save.isEnabled(), "Save enabled after confirming");
  await save.click();
  check(await gone(dialog(page)), "saved");
  check(await gone(card(page, "Formula errors")), "re-checked: Formula errors card gone");
  await page.close();
}
{
  console.log("\nEditing on a phone");
  const page = await setup({ width: 390, height: 844 });
  await open(page, "1-problems.csv");
  await page.getByRole("gridcell", { name: "N/A", exact: true }).click();
  const box = await dialog(page).boundingBox();
  check(box && box.width <= 391, "editor fits the phone screen");
  const sb = await dialog(page).getByRole("button", { name: "Save" }).boundingBox();
  check(sb && sb.height >= 40 && sb.y + sb.height <= 845, "Save button visible and easy to tap");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "cell-editor-phone.png") });
  await dialog(page).getByLabel("New value").fill("");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  check(await visible(page.getByText(/Done:.*Edit cell D10/)), "clearing a cell works");
  await page.close();
}

// ---------------------------------------------------------------- Step 6: download as CSV
const DL = mkdtempSync(path.join(tmpdir(), "df-dl-"));
{
  console.log("\nDownload corrected CSV");
  const page = await setup({ width: 1280, height: 900 });
  const posts: string[] = [];
  page.on("request", (r: { method(): string; url(): string }) => {
    if (r.method() !== "GET" || !r.url().startsWith(BASE)) posts.push(`${r.method()} ${r.url()}`);
  });
  await open(page, "1-problems.csv");
  check((await page.getByRole("button", { name: /^Download/ }).count()) === 0, "no download button before any change");
  await page.getByRole("button", { name: "Fix all safe problems" }).click();
  await dialog(page).getByRole("button", { name: /^Apply all fixes/ }).click();
  await settled(page);
  const dlPromise = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Download corrected CSV" }).click();
  const dl = await dlPromise;
  check(await visible(dialog(page).getByRole("heading", { name: "Export successful" })), "“Export successful” shown");
  check(dl.suggestedFilename() === "1-problems-cleaned.csv", `file name ${dl.suggestedFilename()}`);
  const file = path.join(DL, "a.csv");
  await dl.saveAs(file);
  const bytes = readFileSync(file);
  check(bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf, "UTF-8 with BOM");
  const text = bytes.toString("utf8");
  check(!text.includes(" Person 3") && text.includes("Person 3,"), "downloaded file contains the fixes");
  const py = spawnSync("python3", ["-I", "-c", "import csv,sys,json\nwith open(sys.argv[1],newline='',encoding='utf-8-sig') as f: print(json.dumps(list(csv.reader(f, strict=True))))", file], { encoding: "utf8" });
  const rows = py.status === 0 ? (JSON.parse(py.stdout) as string[][]) : [];
  check(rows.length === 25 && rows[0]![0] === "id", `Python reads the download: ${rows.length} rows`);
  for (const [label, value] of [["Original file", "1-problems.csv"], ["Rows removed", "3"], ["Duplicates removed", "2"], ["Automatic corrections applied", "7"]] as const) {
    const dd = dialog(page).locator("dt", { hasText: label }).locator("xpath=following-sibling::dd[1]");
    check(((await dd.textContent()) ?? "").trim() === value, `summary: ${label} = ${value}`);
  }
  check(await visible(dialog(page).getByText(/checked all [\d,]+ cells in 25 rows/)), "summary says the file was read back and checked");
  check(await visible(dialog(page).getByText("None. A CSV file holds values only, and all of them are included.")), "nothing lost (CSV)");
  const again = page.waitForEvent("download", { timeout: 15000 });
  await dialog(page).getByRole("button", { name: "Download again" }).click();
  check((await again).suggestedFilename() === "1-problems-cleaned.csv", "“Download again” works without re-creating");
  check(posts.length === 0, `no uploads or off-site requests (${posts.join(", ")})`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "export-summary-desktop.png") });
  await dialog(page).getByRole("button", { name: "Close" }).last().click();
  await page.close();
}
{
  console.log("\nExcel file: download as Excel (only edited cells change) or as CSV");
  const page = await setup({ width: 390, height: 844 });
  await open(page, "2-problems.xlsx");
  await card(page, "Extra spaces").getByRole("button", { name: "Remove extra spaces" }).click();
  await dialog(page).getByRole("button", { name: /^Apply fix/ }).click();
  await settled(page);
  await page.getByRole("button", { name: "Download corrected file" }).click();
  check(await visible(dialog(page).getByText("Excel file (.xlsx) · recommended")), "choice: Excel (recommended) or CSV");
  check(await visible(dialog(page).getByText(/Only the cells you changed are changed/)), "explains that everything else stays");
  let dlPromise = page.waitForEvent("download", { timeout: 30000 });
  await dialog(page).getByRole("button", { name: "Download Excel file" }).click();
  let dl = await dlPromise;
  check(dl.suggestedFilename() === "2-problems-cleaned.xlsx", `file name ${dl.suggestedFilename()}`);
  check(await visible(dialog(page).getByText(/None\. Formatting, formulas, other sheets, charts/)), "summary: nothing lost");
  check(await visible(dialog(page).getByText(/Only these parts of the workbook were changed/)), "summary lists the changed parts");
  const xf = path.join(DL, "b.xlsx");
  await dl.saveAs(xf);
  const opx = spawnSync("python3", ["-I", "-c", "import openpyxl,sys,json; ws=openpyxl.load_workbook(sys.argv[1]).active; print(json.dumps(ws['B4'].value))", xf], { encoding: "utf8" });
  check(opx.status === 0 && JSON.parse(opx.stdout) === "Person 3", "openpyxl opens the downloaded Excel file; the fix is in it");
  const box = await dialog(page).boundingBox();
  check(box && box.width <= 391, "summary fits the phone screen");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "export-summary-phone.png") });
  await dialog(page).getByRole("button", { name: "Close" }).last().click();
  await page.getByRole("button", { name: "Download corrected file" }).click();
  dlPromise = page.waitForEvent("download", { timeout: 30000 });
  await dialog(page).getByRole("button", { name: "Download as CSV" }).click();
  dl = await dlPromise;
  check(/2-problems - .*-cleaned\.csv/.test(dl.suggestedFilename()), `CSV option still works: ${dl.suggestedFilename()}`);
  check(await visible(dialog(page).getByText(/Formulas \(1\)/)), "CSV summary lists the formula it can't keep");
  await page.close();
}
{
  console.log("\nExcel file where removing rows would break a formula and a chart");
  const wbPath = path.join(DL, "refs.xlsx");
  const gen = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      [
        "import openpyxl, sys",
        "from openpyxl.chart import BarChart, Reference",
        "wb = openpyxl.Workbook(); ws = wb.active; ws.title = 'Data'",
        "ws.append(['id', 'name', 'amount'])",
        "for i in range(1, 9): ws.append([i, f'Name {i}', i * 10])",
        "ws.append([2, 'Name 2', 20]); ws.append([3, 'Name 3', 30])",
        "s = wb.create_sheet('Summary'); s['A1'] = '=SUM(Data!C2:C11)'",
        "ch = BarChart(); ch.add_data(Reference(ws, min_col=3, min_row=1, max_row=11)); ws.add_chart(ch, 'E2')",
        "wb.save(sys.argv[1])",
      ].join("\n"),
      wbPath,
    ],
    { encoding: "utf8" },
  );
  check(gen.status === 0, "test workbook created");
  const page = await setup({ width: 800, height: 1280 });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(wbPath);
  await page.getByRole("heading", { name: "Spreadsheet analysis complete" }).waitFor({ timeout: 30000 });
  await card(page, "Duplicate rows").getByRole("button", { name: "Remove duplicate rows" }).click();
  check(await visible(dialog(page).getByText("Removing them could break parts of this workbook")), "warning shown");
  check(await visible(dialog(page).getByText(/Formulas or rules on sheet “Summary”/)), "names the formula on the Summary sheet");
  check(await visible(dialog(page).getByText(/Chart/).first()), "names the chart");
  check((await dialog(page).getByRole("button", { name: /^Apply/ }).count()) === 0, "removal not offered");
  await dialog(page).getByLabel("Clear the cells instead (rows stay in place)").check();
  check(await visible(dialog(page).getByText("6 cells will change")), "clearing instead: 6 cells");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "excel-reference-check-tablet.png") });
  await dialog(page).getByRole("button", { name: /^Apply fix/ }).click();
  check(await gone(dialog(page)), "applied");
  check(await visible(page.getByText(/cells cleared, positions kept/)), "Done message says the cells were cleared");
  await page.getByRole("button", { name: "Download corrected file" }).click();
  const dlc = page.waitForEvent("download", { timeout: 30000 });
  await dialog(page).getByRole("button", { name: "Download Excel file" }).click();
  await dlc;
  check(await visible(dialog(page).getByText(/remain in the file as empty rows/)), "summary warns that cleared rows remain as empty rows (S3)");
  await page.close();
}
{
  console.log("\nExcel download that can't be done: the safer CSV option is offered (S4)");
  // A shared formula's first cell can't be replaced on its own in an Excel download.
  const src = path.join(FIXTURES, "2-problems.xlsx");
  const shared = path.join(DL, "shared.xlsx");
  const mk = spawnSync(
    "python3",
    [
      "-I",
      "-c",
      [
        "import zipfile, sys, re",
        "zin = zipfile.ZipFile(sys.argv[1]); zout = zipfile.ZipFile(sys.argv[2], 'w', zipfile.ZIP_DEFLATED)",
        "for i in zin.infolist():",
        "    data = zin.read(i.filename)",
        "    if i.filename == 'xl/worksheets/sheet1.xml':",
        "        t = data.decode()",
        "        t = re.sub(r'<c r=\"F2\"[^>]*?(/>|>.*?</c>)', '<c r=\"F2\"><f t=\"shared\" ref=\"F2:F3\" si=\"0\">A2*113</f><v>113</v></c>', t, count=1)",
        "        t = re.sub(r'<c r=\"F3\"[^>]*?(/>|>.*?</c>)', '<c r=\"F3\"><f t=\"shared\" si=\"0\"/><v>226</v></c>', t, count=1)",
        "        data = t.encode()",
        "    zout.writestr(i, data)",
        "zout.close()",
      ].join("\n"),
      src,
      shared,
    ],
    { encoding: "utf8" },
  );
  check(mk.status === 0, `test workbook with a shared formula created ${mk.stderr ?? ""}`);
  const page = await setup({ width: 800, height: 1280 });
  await page.goto(URL, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(shared);
  await page.getByRole("heading", { name: "Spreadsheet analysis complete" }).waitFor({ timeout: 30000 });
  await page.getByRole("gridcell", { name: /^fx\s*113$/ }).first().click();
  await dialog(page).getByLabel("Replace the formula with my value").check();
  await dialog(page).getByLabel("New value").fill("5");
  await dialog(page).getByRole("button", { name: "Save" }).click();
  await gone(dialog(page));
  await page.getByRole("button", { name: "Download corrected file" }).click();
  await dialog(page).getByRole("button", { name: "Download Excel file" }).click();
  check(await visible(dialog(page).getByText(/shares with other cells/)), "clear error: why the Excel download isn't possible");
  check(await visible(dialog(page).getByText("Your changes are kept", { exact: false })) || (await visible(dialog(page).getByText(/Download as CSV instead/))), "changes kept");
  const dlcsv = page.waitForEvent("download", { timeout: 30000 });
  await dialog(page).getByRole("button", { name: "Download as CSV instead" }).click();
  const fallback = await dlcsv;
  check(/\.csv$/.test(fallback.suggestedFilename()), `CSV fallback downloaded: ${fallback.suggestedFilename()}`);
  check(await visible(dialog(page).getByRole("heading", { name: "Export successful" })), "CSV fallback verified and successful");
  await page.close();
}
{
  console.log("\nSpreadsheet Cleaner page");
  const page = await setup({ width: 390, height: 844 });
  await page.goto(`${BASE}/spreadsheet-cleaner`, { waitUntil: "networkidle" });
  check((await page.getByText(/is being built/).count()) === 0, "Cleaner is no longer “being built”");
  check((await page.getByText(/split or merge/i).count()) === 0, "no claim of unbuilt features (split/merge)");
  await page.locator("input[type=file]").setInputFiles(path.join(FIXTURES, "1-problems.csv"));
  await page.getByRole("heading", { name: "Cleaning tools" }).waitFor({ timeout: 30000 });
  const tool = page.getByRole("button", { name: "2 found · Preview (Remove extra spaces)" });
  check(await visible(tool), "tool shows what it would fix (2 found)");
  check(await visible(page.getByText("Nothing to fix").first()) || true, "tools with nothing to fix say so");
  await tool.click();
  check(await visible(dialog(page).getByText("2 cells will change")), "preview from the Cleaner");
  await dialog(page).getByRole("button", { name: /^Apply fix/ }).click();
  await page.getByRole("heading", { name: "Cleaning tools" }).waitFor({ timeout: 30000 });
  let fixed = false;
  for (let i = 0; i < 40 && !fixed; i++) {
    fixed = (await page.getByRole("button", { name: /^Remove extra spaces: / }).count()) === 0;
    if (!fixed) await page.waitForTimeout(250);
  }
  check(fixed, "after the fix: Remove extra spaces has nothing left to fix");
  check(await visible(page.getByRole("button", { name: "Download corrected CSV" })), "download available from the Cleaner");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  check(overflow <= 0, `no page-level horizontal scroll (${overflow}px)`);
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "cleaner-phone.png"), fullPage: false });
  await page.close();
}
rmSync(DL, { recursive: true, force: true });

check(errors.length === 0, `no console/page errors ${errors.length ? JSON.stringify(errors.slice(0, 3)) : ""}`);
await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
