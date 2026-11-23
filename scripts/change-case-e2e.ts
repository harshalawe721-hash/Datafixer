/**
 * Stage 9, Step 2: browser test of “Change case” in the Spreadsheet Cleaner: tool offered,
 * choose style and columns, preview, apply, the table changes, undo, download, keyboard,
 * axe-core on the dialog (light and dark), phone layout.
 * Usage: start the app (npm run build && npm start), then `npm run test:case`.
 */
import { createRequire } from "node:module";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js", { paths: [process.cwd()] }), "utf8");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DL = mkdtempSync(path.join(tmpdir(), "case-"));

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const CSV = ["name,city,email", "ravi k,DELHI,ravi@example.com", "MEERA s,mumbai,meera@example.com", "o'brien,new delhi,ob@example.com", "Asha Rao,Pune,asha@example.com"].join("\n");

const browser = await chromium.launch();
const errors: string[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function openCleaner(viewport: { width: number; height: number }) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/spreadsheet-cleaner`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles({ name: "people.csv", mimeType: "text/csv", buffer: Buffer.from(CSV) });
  await page.getByRole("heading", { name: "Cleaning tools" }).waitFor({ timeout: 30000 });
  return page;
}
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc.first().waitFor({ state: "visible", timeout }).then(() => true, () => false);
const cellTexts = (page: Page) => page.getByRole("gridcell").allTextContents();

async function axe(page: Page, dark: boolean) {
  await page.evaluate((d: boolean) => document.documentElement.classList.toggle("dark", d), dark);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(150);
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    // @ts-expect-error axe is injected
    const r = await window.axe.run(document.querySelector("[role=dialog]"), { resultTypes: ["violations"] });
    return r.violations.map((v: { id: string }) => v.id);
  });
}

// ---------------------------------------------------------------- desktop
{
  console.log("\nDesktop: choose, preview, apply, undo, download");
  const page = await openCleaner({ width: 1280, height: 900 });
  const tool = page.getByRole("button", { name: "Choose columns · Preview (Change case)" });
  check(await visible(tool), "“Change case” is offered in the Cleaner");
  await tool.click();
  const dlg = page.getByRole("dialog");
  check(await visible(dlg.getByRole("heading", { name: "Change case" })), "dialog titled “Change case”");
  check(await visible(dlg.getByText(/Choose a style and at least one column/)), "asks for a style and columns first");
  check((await dlg.getByRole("button", { name: /^Apply fix/ }).count()) === 0, "no Apply button before choosing");
  check((await dlg.getByRole("checkbox").count()) === 3, "all three text columns listed");
  const a1 = await axe(page, false);
  const a2 = await axe(page, true);
  check(a1.length === 0 && a2.length === 0, `axe-core on the dialog, light and dark: ${JSON.stringify([a1, a2])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  await dlg.getByRole("radio", { name: /Proper Case/ }).check();
  check(await visible(dlg.getByText(/can.t know every special spelling/)), "Proper Case shows the special-spelling note");
  await dlg.getByRole("checkbox", { name: /^name/ }).check();
  await dlg.getByRole("checkbox", { name: /^city/ }).check();
  check(await visible(dlg.getByText("6 cells will change")), "preview: 6 cells will change");
  const examples = await dlg.innerText();
  check(/ravi k[\s\S]*Ravi K/.test(examples) && /DELHI[\s\S]*Delhi/.test(examples) && /o'brien[\s\S]*O'Brien/.test(examples), "examples show before and after (Ravi K, Delhi, O'Brien)");
  await dlg.getByRole("button", { name: /^Apply fix \(6 changes\)/ }).click();
  await page.getByRole("heading", { name: "Cleaning tools" }).waitFor({ timeout: 30000 });
  await page.waitForTimeout(500);
  let cells = await cellTexts(page);
  check(["Ravi K", "Delhi", "Meera S", "Mumbai", "O'Brien", "New Delhi", "Asha Rao", "ravi@example.com"].every((v) => cells.includes(v)), "table shows the new values; emails unchanged");

  await page.getByRole("button", { name: "Undo" }).click();
  await page.waitForTimeout(800);
  cells = await cellTexts(page);
  check(cells.includes("ravi k") && cells.includes("DELHI"), "Undo restores the original values");
  await page.getByRole("button", { name: "Redo" }).click();
  await page.waitForTimeout(800);
  cells = await cellTexts(page);
  check(cells.includes("Ravi K"), "Redo applies them again");

  const dl = page.waitForEvent("download", { timeout: 30000 });
  await page.getByRole("button", { name: "Download corrected CSV" }).click();
  const file = path.join(DL, "out.csv");
  await (await dl).saveAs(file);
  const text = readFileSync(file, "utf8").replace(/^﻿/, "");
  check(text.includes("Ravi K,Delhi,ravi@example.com") && text.includes("O'Brien,New Delhi,ob@example.com"), "downloaded CSV has the changed case");
  await page.close();
}

// ---------------------------------------------------------------- keyboard
{
  console.log("\nKeyboard");
  const page = await openCleaner({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "Choose columns · Preview (Change case)" }).focus();
  await page.keyboard.press("Enter");
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("radio", { name: /Proper Case/ }).waitFor();
  await dlg.getByRole("radio", { name: /Proper Case/ }).focus();
  await page.keyboard.press("ArrowRight");
  check(await dlg.getByRole("radio", { name: /UPPER CASE/ }).isChecked(), "arrow keys move between styles");
  await dlg.getByRole("checkbox", { name: /^city/ }).focus();
  await page.keyboard.press("Space");
  check(await visible(dlg.getByText("3 cells will change")), "Space ticks a column (UPPER CASE on city: 3 cells)");
  await page.keyboard.press("Escape");
  check((await page.getByRole("dialog").count()) === 0, "Escape closes the dialog without changes");
  check((await cellTexts(page)).includes("mumbai"), "nothing changed after closing");
  await page.close();
}

// ---------------------------------------------------------------- phone
{
  console.log("\nPhone (375 px)");
  const page = await openCleaner({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Choose columns · Preview (Change case)" }).click();
  const dlg = page.getByRole("dialog");
  await dlg.getByRole("radio", { name: /lower case/ }).check();
  await dlg.getByRole("checkbox", { name: /^city/ }).check();
  check(await visible(dlg.getByText(/cells? will change/)), "preview works on a phone");
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 375, `no sideways scrolling (${w}px)`);
  await page.close();
}

// ---------------------------------------------------------------- Error Detector note (Step 3)
{
  console.log("\nError Detector: note on names in capitals or small letters");
  const page: Page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/spreadsheet-error-detector`, { waitUntil: "networkidle" });
  const caps = ["customer name,city,status", "RAVI KUMAR,delhi,ACTIVE", "meera shah,PUNE,ACTIVE", "Asha Rao,mumbai,ACTIVE", "KIRAN DAS,Chennai,ACTIVE"].join("\n");
  await page.locator("input[type=file]").setInputFiles({ name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from(caps) });
  await page.getByRole("heading", { name: "Spreadsheet analysis complete" }).waitFor({ timeout: 30000 });
  const note = page.locator("article", { has: page.getByRole("heading", { name: "Names written in capitals or small letters", exact: true }) });
  check(await visible(note), "note “Names written in capitals or small letters” shown");
  check(/customer name/.test(await note.innerText()) && /in Proper Case: “Ravi Kumar”/.test(await note.innerText()), "note names the column and shows a Proper Case example");
  await note.getByRole("button", { name: "Change case" }).click();
  const dlg = page.getByRole("dialog");
  check(await visible(dlg.getByText("6 cells will change")), "opens Change case with a ready preview (6 cells)");
  check(await dlg.getByRole("radio", { name: /Proper Case/ }).isChecked(), "Proper Case already chosen");
  check((await dlg.getByRole("checkbox", { name: /^customer name/ }).isChecked()) && (await dlg.getByRole("checkbox", { name: /^city/ }).isChecked()), "the two flagged columns already ticked");
  check(!(await dlg.getByRole("checkbox", { name: /^status/ }).isChecked()), "other columns not ticked");
  await dlg.getByRole("button", { name: /^Apply fix/ }).click();
  await page.getByRole("heading", { name: "Spreadsheet analysis complete" }).waitFor({ timeout: 30000 });
  let goneNote = false;
  for (let i = 0; i < 40 && !goneNote; i++) {
    goneNote = (await note.count()) === 0;
    if (!goneNote) await page.waitForTimeout(250);
  }
  check(goneNote, "after applying, the note is gone (re-check)");
  await page.close();
}

await browser.close();
rmSync(DL, { recursive: true, force: true });
check(errors.length === 0, `no browser errors${errors.length ? `: ${errors.slice(0, 3).join(" | ")}` : ""}`);
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
