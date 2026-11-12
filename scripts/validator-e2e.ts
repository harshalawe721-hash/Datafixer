/**
 * Browser test of the CSV Validator page (Stage 5, Step 3).
 * Usage: start the app (npm run build && npm start), then `npm run test:validator`.
 */
import { createRequire } from "node:module";
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PAGE = `${BASE}/csv-validator`;
const PACK = new URL("../tests/fixtures/validate/", import.meta.url);
let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
const errors: string[] = [];
const offsite: string[] = [];
page.on("pageerror", (e: Error) => errors.push(String(e)));
page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
page.on("request", (r: { url(): string; method(): string }) => {
  if (!r.url().startsWith(BASE) && !r.url().startsWith("data:") && !r.url().startsWith("blob:")) offsite.push(r.url());
  if (r.method() !== "GET") offsite.push(`${r.method()} ${r.url()}`);
});

const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const heading = () => page.locator("#validator-heading");
const openFile = async (f: { name: string; mimeType: string; buffer: Buffer } | string) => {
  await page.goto(PAGE, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(typeof f === "string" ? path.join(PACK.pathname, f) : f);
  await heading().waitFor({ state: "visible", timeout: 60000 });
};
const card = (title: string | RegExp) => page.locator("article", { has: page.getByRole("heading", { name: title, exact: typeof title === "string" }) });
const cardCount = async (title: string) => (await card(title).locator("p.text-right span").first().textContent())?.trim();
const checklist = async () =>
  Object.fromEntries(
    await page.locator("section[aria-labelledby=validator-heading] ul.divide-y li").evaluateAll((lis: Element[]) =>
      lis.map((li) => [li.querySelector("span span, span a")?.textContent?.trim() ?? li.textContent, li.lastElementChild?.textContent?.trim()]),
    ),
  ) as Record<string, string>;
const rowNumbers = () => page.locator("tbody th").allTextContents();
const namesBox = () => page.getByRole("checkbox", { name: "First row contains column names" }).first();
const waitChecked = () => page.waitForTimeout(300).then(() => heading().waitFor({ state: "visible", timeout: 30000 }));

console.log("\nClean file");
await openFile("0-clean.csv");
check((await heading().textContent()) === "Valid CSV file", "verdict: Valid CSV file");
check(await visible(page.getByText("Ready for Excel, Google Sheets and databases.")), "import readiness line");
const clean = await checklist();
check(Object.keys(clean).length === 9 && Object.values(clean).every((s) => s === "Passed"), `checklist: 9 checks, all Passed (${JSON.stringify(clean)})`);
check((await page.locator("article").count()) === 0, "no problem cards");
check(await visible(page.getByText(/Checked 31 rows on this device/)), "rows checked, on this device");
check(await visible(page.getByText(/UTF-8 · Separator: Comma \(,\) · Line endings: CRLF \(Windows\) · Ends with a line break/)), "file facts line");

console.log("\nUneven rows: card, file lines, view affected rows");
await openFile("1-uneven.csv");
check((await heading().textContent()) === "Not a valid CSV file: 1 error", "verdict: 1 error");
check(await visible(page.getByText("Will not import cleanly: rows with the wrong number of fields.")), "import readiness names the error");
check((await cardCount("Rows with the wrong number of fields")) === "5", "card count 5");
check((await checklist())["Same number of fields in every row"] === "Error", "checklist marks row lengths as Error");
check(await visible(card("Rows with the wrong number of fields").locator("pre", { hasText: "1031,Ben,Smith, J,x@example.com,Rome" })), "the line as written in the file is shown");
check(await visible(card("Rows with the wrong number of fields").getByText(/shifted into the wrong columns/)), "explains that short rows can mean shifted data");
await card("Rows with the wrong number of fields").getByRole("button", { name: "View affected data" }).click();
await page.waitForTimeout(500);
check(JSON.stringify(await rowNumbers()) === JSON.stringify(["6", "13", "20", "27", "33"]), `only the affected rows are shown (${(await rowNumbers()).join(",")})`);
await page.getByRole("status").getByRole("button", { name: "Show all rows" }).click();

console.log("\nColumn names (decision 5)");
await openFile("2-header.csv");
check(await namesBox().isChecked(), "“First row contains column names” starts ticked (names that aren't data)");
check((await heading().textContent()) === "Not a valid CSV file: 2 errors", "verdict: 2 errors");
check((await cardCount("Columns without a name")) === "1" && (await cardCount("Duplicate column names")) === "1", "empty and duplicate name cards");
check(await visible(card("Duplicate column names").getByText(/Email \(D\)|email \(E\)/)), "columns labelled with their names");
await namesBox().uncheck();
await waitChecked();
await page.waitForFunction(() => document.querySelector("#validator-heading")?.textContent === "Valid CSV file", null, { timeout: 30000 }).catch(() => {});
check((await heading().textContent()) === "Valid CSV file", "unticked: the first row is data, no header problems");
check((await checklist())["Column names"] === "Not checked", "checklist says column names are not checked");
check((await page.getByRole("checkbox", { name: "First row contains column names" }).nth(1).isChecked()) === false, "the table's setting follows");
await namesBox().check();
await page.waitForFunction(() => document.querySelector("#validator-heading")?.textContent?.includes("2 errors"), null, { timeout: 30000 }).catch(() => {});
check((await heading().textContent()) === "Not a valid CSV file: 2 errors", "ticked again: errors are back");

console.log("\nQuotes, hidden characters, line endings");
await openFile("3-quotes.csv");
check(await visible(card("Quote characters in unexpected places").getByText("Row 17 · line 19")), "line number counts line breaks inside values (row 17 · line 19)");
await openFile("6-control.csv");
check((await cardCount("Hidden control characters")) === "3", "a file with NUL bytes is accepted and the 3 cells reported");
check(await visible(card("Hidden control characters").locator("pre", { hasText: "1002,Ben␀,chen2@example.com,Lyon" })), "NUL shown as ␀ in the file line");
check((await cardCount("Values that start like formulas")) === "4", "formula-like values: 4");
await openFile("5-line-endings.csv");
check((await card("Mixed line endings").getByRole("button", { name: "View affected data" }).count()) === 0, "file-level problem: no View affected data button");
check(await visible(card("Blank lines").getByRole("button", { name: "View affected data" })), "row-level problem keeps the button");
check(await visible(card("Mixed line endings").getByText(/First line ending with CRLF/)), "mixed line endings name the first row of each type");
await openFile("3b-unclosed.csv");
check(await visible(card("A quote that never closes").getByText(/cut: the row is longer/)), "unclosed quote: the swallowed text is shown, marked as cut");
await openFile("4-encoding.csv");
check((await cardCount("Characters that couldn't be read")) === "2", "unreadable characters: 2");

console.log("\nText encoding (decision 4)");
await openFile({ name: "accents.csv", mimeType: "text/csv", buffer: Buffer.from("name,price\r\nRenée,5 €\r\n", "utf8") });
const enc = page.getByRole("combobox", { name: "Text encoding" });
check((await enc.inputValue()) === "utf-8", "detected UTF-8");
check(JSON.stringify(await enc.locator("option").allTextContents()) === JSON.stringify(["UTF-8", "Windows-1252 (Western, older Excel)", "ISO-8859-1 (Latin-1)"]), "UTF-8, Windows-1252 and ISO-8859-1 offered");
check(await visible(page.getByText(/decides how the bytes in your file are turned into letters/)), "explains what the encoding choice does");
await enc.selectOption("windows-1252");
await heading().waitFor({ state: "visible", timeout: 30000 });
check(await visible(card("The file looks like UTF-8 but is read as WINDOWS-1252")), "wrong choice: clear warning");
check(await visible(page.locator("tbody td", { hasText: "RenÃ©e" })), "the table shows the mis-decoded text (nothing hidden)");
check(await visible(page.getByText(/You chose Windows-1252/)), "says the encoding was chosen, and what was detected");
// The chosen encoding is kept when the separator changes.
await page.getByRole("combobox", { name: "Column separator" }).selectOption(";");
await heading().waitFor({ state: "visible", timeout: 30000 });
check((await page.getByRole("combobox", { name: "Text encoding" }).inputValue()) === "windows-1252", "encoding kept when the separator changes");
await page.getByRole("combobox", { name: "Text encoding" }).selectOption("utf-8");
await page.getByRole("combobox", { name: "Column separator" }).selectOption(",");
await page.waitForFunction(() => document.querySelector("#validator-heading")?.textContent === "Valid CSV file", null, { timeout: 30000 }).catch(() => {});
check((await heading().textContent()) === "Valid CSV file", "back to UTF-8 and comma: valid");

console.log("\nSeparator");
await openFile("10-semicolon.csv");
check((await page.getByRole("combobox", { name: "Column separator" }).inputValue()) === ";", "semicolon detected");
await page.getByRole("combobox", { name: "Column separator" }).selectOption(",");
await page.waitForTimeout(300);
check(await visible(card("The file reads as a single column")), "wrong separator: single-column warning suggesting the semicolon");
check(await visible(card("The file reads as a single column").getByText(/probably uses semicolon/)), "names the likely separator");

console.log("\nFiles refused before checking");
await page.goto(PAGE, { waitUntil: "networkidle" });
await page.locator("input[type=file]").setInputFiles({ name: "binary.csv", mimeType: "text/csv", buffer: Buffer.from([0x00, 0x01, 0x02, 0x41]) });
check(await visible(page.getByText(/contains binary data/)), "binary data is refused");
await page.locator("input[type=file]").setInputFiles({ name: "book.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("PK\x03\x04") });
check(await visible(page.getByText(/not a supported file type. Please choose a file in CSV, TSV or TXT format/)), "Excel files are refused (CSV, TSV and TXT only)");

console.log("\nCancel and check again (50 MB, examples spread through the file)");
const dir = mkdtempSync(path.join(tmpdir(), "validator-"));
const big = path.join(dir, "big.csv");
{
  const parts: string[] = ["id,name,email,amount\n"];
  for (let i = 0; i < 1_400_000; i++) parts.push(`${i},Person ${i},person${i}@example.com,${i % 1000}${i % 250_000 === 249_999 ? ",x" : ""}\n`);
  writeFileSync(big, parts.join(""));
}
await page.goto(PAGE, { waitUntil: "networkidle" });
await page.locator("input[type=file]").setInputFiles(big);
const cancelBtn = page.getByRole("button", { name: "Cancel" });
await page.getByText("Validating the CSV file").waitFor({ timeout: 120000 });
await cancelBtn.click().catch(() => {});
const cancelled = await visible(page.getByText("Check cancelled"), 20000);
if (cancelled) {
  check(true, "Cancel stops the check; the file stays open");
  await page.getByRole("button", { name: "Check again" }).click();
}
else console.log("  (the check finished before Cancel could be pressed; not counted)");
await heading().waitFor({ state: "visible", timeout: 120000 });
check((await cardCount("Rows with the wrong number of fields")) === "5", "50 MB: the 5 planted rows found");
check(await visible(card("Rows with the wrong number of fields").locator("pre", { hasText: "1249999,Person 1249999" })), "50 MB: file line found near the end of the file");
rmSync(dir, { recursive: true, force: true });

console.log("\nRepairs (Step 4)");
const dialog = () => page.getByRole("dialog");
const settle = async () => {
  await dialog().waitFor({ state: "detached", timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(300);
  await heading().waitFor({ state: "visible", timeout: 30000 });
};
await openFile("1-uneven.csv");
const uneven = card("Rows with the wrong number of fields");
check(await visible(uneven.getByRole("button", { name: "Add empty cells" })), "short rows: “Add empty cells” offered");
check((await uneven.getByRole("button", { name: "Remove empty extra fields" }).count()) === 0, "no “Remove empty extra fields” when the extra fields contain data");
check((await page.getByRole("button", { name: "Fix all safe problems" }).count()) === 0, "no Fix all when nothing safe can be fixed");
await uneven.getByRole("button", { name: "Add empty cells" }).click();
check(await visible(dialog().getByText(/shifted into the wrong columns/)), "preview warns that short rows can mean shifted data (decision 1)");
check(await visible(dialog().getByText("Row 6 · 3 fields → 4")), "before/after row shown");
check((await dialog().getByText("Before").count()) >= 3 && (await dialog().getByText("After").count()) >= 3, "before and after for each row");
await dialog().getByRole("button", { name: /^Apply fix \(3 changes\)/ }).click();
await settle();
check((await cardCount("Rows with the wrong number of fields")) === "2", "after the repair: the 2 rows with extra data remain (never automatic)");
check(await visible(page.getByText("3 cells changed (1 fix applied)")), "changes bar: 3 cells changed");
check(await visible(page.getByText(/The data was changed, so examples show cell values/)), "examples say the file lines no longer apply");
await page.getByRole("button", { name: "Undo" }).click();
await page.waitForFunction(() => document.querySelector("#validator-heading")?.textContent === "Not a valid CSV file: 1 error", null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(500);
check((await cardCount("Rows with the wrong number of fields")) === "5", "Undo brings back all 5 rows");

await openFile("2-header.csv");
await card("Columns without a name").getByRole("button", { name: "Fix column names" }).click();
check(await visible(dialog().getByText("Column C")) && (await visible(dialog().getByText("email (2)"))), "rename preview: Column C and email (2) (decision 2)");
check(await visible(dialog().getByText(/no new name repeats an existing one/)), "says no new duplicates are created");
await dialog().getByRole("button", { name: /^Apply fix \(2 changes\)/ }).click();
await settle();
check((await heading().textContent()) === "Valid CSV, with 1 warning", `names fixed: ${await heading().textContent()}`);
await page.getByRole("button", { name: "Fix all safe problems" }).click();
check(await visible(dialog().getByText("Remove spaces around names")), "Fix all lists the safe repair");
check(await visible(dialog().getByText(/Not included: adding empty cells to short rows/)), "Fix all says what is never included");
await dialog().getByRole("button", { name: /^Apply all fixes/ }).click();
await settle();
check((await heading().textContent()) === "Valid CSV file", "after Fix all: Valid CSV file");
await page.getByRole("button", { name: "History", exact: true }).click();
check(await visible(page.getByText("Fix column names")) && (await visible(page.getByText("Remove spaces around names"))), "both repairs are in the history");

await openFile({ name: "extra.csv", mimeType: "text/csv", buffer: Buffer.from("a,b\r\n1,2,,\r\n\r\n3,4\r\n5,6,\r\n") });
check(await visible(card("Rows with the wrong number of fields").getByRole("button", { name: "Remove empty extra fields" })), "empty extra fields: repair offered");
await page.getByRole("button", { name: "Fix all safe problems" }).click();
check(await visible(dialog().getByText("2 rows will be shortened")), "Fix all: 2 rows will be shortened");
await dialog().getByRole("button", { name: /^Apply all fixes \(3 changes\)/ }).click();
await settle();
check((await heading().textContent()) === "Valid CSV file", "empty extra fields and the blank line removed: valid");

await openFile("6-control.csv");
await card("Hidden control characters").getByRole("button", { name: "Remove hidden characters" }).click();
check(await visible(dialog().getByText("Ben␀")), "preview shows where the hidden characters are");
await dialog().getByRole("button", { name: /^Apply fix \(3 changes\)/ }).click();
await settle();
check((await heading().textContent()) === "Valid CSV, with 1 warning", "hidden characters removed (formula-like warning remains)");
const DL = mkdtempSync(path.join(tmpdir(), "validator-dl-"));
const dlPromise = page.waitForEvent("download", { timeout: 30000 });
await page.getByRole("button", { name: "Download corrected CSV" }).click();
const dl = await dlPromise;
const saved = path.join(DL, "repaired.csv");
await dl.saveAs(saved);
check(await visible(dialog().getByRole("heading", { name: "Export successful" })), "download verified and offered");
const bytes = readFileSync(saved);
check(!bytes.includes(0x00) && !bytes.includes(0x07), "downloaded file has no NUL or bell characters");
const py = spawnSync("python3", ["-I", "-c", "import csv,sys,json\nwith open(sys.argv[1],newline='',encoding='utf-8-sig') as f: print(json.dumps(list(csv.reader(f, strict=True))))", saved], { encoding: "utf8" });
const pyRows = py.status === 0 ? (JSON.parse(py.stdout) as string[][]) : [];
check(pyRows.length === 21 && pyRows[3]![1] === "Ben" && pyRows[8]![3] === "Leeds", `Python reads the repaired download (${pyRows.length} rows)`);
await dialog().getByRole("button", { name: "Close" }).first().click();
rmSync(DL, { recursive: true, force: true });

console.log("\nTSV and TXT files");
await openFile({ name: "data.tsv", mimeType: "text/tab-separated-values", buffer: Buffer.from("a\tb\r\n1\t2\r\n") });
check((await heading().textContent()) === "Valid CSV file" && (await page.getByRole("combobox", { name: "Column separator" }).inputValue()) === "\t", "a .tsv file opens with the tab separator");

console.log("\nPhone and tablet layouts");
for (const [name, device] of [["phone", devices["Pixel 7"]], ["tablet", devices["Galaxy Tab S4"]]] as const) {
  const ctx = await browser.newContext({ ...device, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on("pageerror", (e: Error) => errors.push(String(e)));
  for (const f of ["0-clean.csv", "1-uneven.csv", "2-header.csv", "3-quotes.csv", "3b-unclosed.csv", "5-line-endings.csv", "6-control.csv", "9-long-cells.csv"]) {
    await p.goto(PAGE, { waitUntil: "networkidle" });
    await p.locator("input[type=file]").setInputFiles(path.join(PACK.pathname, f));
    await p.locator("#validator-heading").waitFor({ timeout: 30000 });
    // Compare with the device's own width: a too-wide page makes mobile browsers widen the layout itself.
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    const vw = device.viewport.width;
    check(sw <= vw, `${name}: ${f} fits the screen width (${sw} ≤ ${vw})`);
  }
  await ctx.close();
}

console.log("\nPrivacy and errors");
check(offsite.length === 0, `no uploads or off-site requests (${offsite.slice(0, 3).join(", ")})`);
check(errors.length === 0, `no console or page errors (${errors.slice(0, 3).join(" | ")})`);
check(readFileSync(new URL("6-control.csv", PACK)).includes(0x00), "test files unchanged (NUL bytes still in 6-control.csv)");

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
