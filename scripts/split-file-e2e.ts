/**
 * Stage 16, Step 2: browser test of the “Split File” page: rows per part, equal parts and
 * one part per column value; the list of parts; the .zip (unzipped and every part read)
 * and single-part downloads; CSV and Excel parts; an Excel file; choices that can't be
 * split; column names off; keyboard; axe-core (light and dark); phone layout.
 * Usage: start the app (npm run build && npm start), then `npm run test:split-file`.
 */
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { unzipSync } from "fflate";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const AXE = readFileSync(require.resolve("axe-core/axe.min.js", { paths: [process.cwd()] }), "utf8");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DL = mkdtempSync(path.join(tmpdir(), "split-file-"));

let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

// 13 data rows, semicolons, Windows line endings, codes with leading zeros, one row without a city.
const CITIES = ["Pune", "Oslo", "Lima"];
const BODY = Array.from({ length: 13 }, (_, i) => `00${i + 1};P${i + 1};${i === 12 ? "" : CITIES[i % 3]}`);
const CSV = {
  name: "people.csv",
  mimeType: "text/csv",
  buffer: Buffer.from(["id;name;city", ...BODY].join("\r\n") + "\r\n"),
};
const xlsxPath = path.join(DL, "book.xlsx");
const gen = spawnSync(
  "python3",
  [
    "-I",
    "-c",
    "import openpyxl,sys\nwb=openpyxl.Workbook(); ws=wb.active; ws.title='Data'\nws.append(['code','n'])\nfor i in range(1,6): ws.append(['00%d' % i, i])\nwb.save(sys.argv[1])",
    xlsxPath,
  ],
  { encoding: "utf8" },
);
const readXlsx = (file: string) =>
  spawnSync(
    "python3",
    [
      "-I",
      "-c",
      "import openpyxl,sys,json\nws=openpyxl.load_workbook(sys.argv[1]).active\nprint(json.dumps([[c for c in r] for r in ws.iter_rows(values_only=True)], separators=(',',':')))",
      file,
    ],
    { encoding: "utf8" },
  );

const browser = await chromium.launch();
const errors: string[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function openPage(viewport: { width: number; height: number }, file: { name: string; mimeType: string; buffer: Buffer }) {
  const page: Page = await browser.newPage({ viewport });
  page.on("pageerror", (e: Error) => errors.push(String(e)));
  page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && errors.push(m.text()));
  await page.goto(`${BASE}/split-file`, { waitUntil: "networkidle" });
  await page.locator("input[type=file]").setInputFiles(file);
  await page.getByRole("heading", { name: "Split into parts" }).waitFor({ timeout: 30000 });
  return page;
}
const visible = (loc: { first(): { waitFor(o: object): Promise<void> } }, timeout = 15000) =>
  loc
    .first()
    .waitFor({ state: "visible", timeout })
    .then(
      () => true,
      () => false,
    );
/** The file names in the list of parts, once it shows `n` parts. */
async function parts(page: Page, n: number): Promise<string[]> {
  await page.waitForFunction((k: number) => document.querySelectorAll("[aria-label='Parts'] li").length === k, n, { timeout: 15000 }).catch(() => {});
  return page
    .getByRole("list", { name: "Parts" })
    .getByRole("listitem")
    .evaluateAll((els: Element[]) => els.map((e) => e.querySelector(".font-medium")?.textContent ?? ""));
}
async function download(page: Page, button: RegExp | string, save: string) {
  const dl = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("button", { name: button, exact: typeof button === "string" }).click();
  const d = await dl;
  const p = path.join(DL, save);
  await d.saveAs(p);
  return { name: d.suggestedFilename(), bytes: readFileSync(p), path: p };
}
const csvLines = (b: Uint8Array) =>
  Buffer.from(b)
    .toString("utf8")
    .replace(/^﻿/, "")
    .split("\r\n")
    .filter((l) => l !== "");
async function axe(page: Page, dark: boolean) {
  await page.evaluate((d: boolean) => document.documentElement.classList.toggle("dark", d), dark);
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
  await page.waitForTimeout(150);
  if (!(await page.evaluate(() => "axe" in window))) await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => {
    // @ts-expect-error axe is injected
    const r = await window.axe.run(document.querySelector("main"), {
      resultTypes: ["violations"],
    });
    return r.violations.map((v: { id: string }) => v.id);
  });
}

{
  console.log("\nCSV file: rows per part, the .zip and one part");
  check(gen.status === 0, "test workbook created");
  const page = await openPage({ width: 1280, height: 900 }, CSV);
  check(await visible(page.getByText("This table has 13 rows of data.")), "the page says how many rows of data there are");
  check(
    JSON.stringify(await parts(page, 2)) === JSON.stringify(["people-part-01.csv", "people-part-02.csv"]),
    "a sensible number of rows per part is suggested (2 parts)",
  );
  const a1 = await axe(page, false);
  const a2 = await axe(page, true);
  check(a1.length === 0 && a2.length === 0, `axe-core, light and dark: ${JSON.stringify([a1, a2])}`);
  await page.evaluate(() => document.documentElement.classList.remove("dark"));

  await page.getByLabel("Rows per part").fill("5");
  check(
    JSON.stringify(await parts(page, 3)) === JSON.stringify(["people-part-01.csv", "people-part-02.csv", "people-part-03.csv"]),
    "5 rows per part: 3 parts",
  );
  check(await visible(page.getByText("3 rows (rows 12–14 of your file)")), "each part says which rows of the file it holds");

  const zip = await download(page, "Download all parts (.zip)", "all.zip");
  check(zip.name === "people - split.zip", `the .zip is named after the file (${zip.name})`);
  const files = unzipSync(new Uint8Array(zip.bytes));
  const names = Object.keys(files);
  check(
    JSON.stringify(names) === JSON.stringify(["people-part-01.csv", "people-part-02.csv", "people-part-03.csv"]),
    `the .zip holds the 3 parts (${names.join(", ")})`,
  );
  const ls = names.map((n) => csvLines(files[n]!));
  check(
    ls.every((l) => l[0] === "id;name;city"),
    "every part starts with the column names, with the file's semicolons",
  );
  check(JSON.stringify(ls.flatMap((l) => l.slice(1))) === JSON.stringify(BODY), "together the parts hold every row once, in order, codes with their zeros");
  check(Buffer.from(files[names[0]!]!).toString("utf8").startsWith("﻿id;name;city\r\n"), "UTF-8 with BOM and Windows line endings, like the file");
  check(await visible(page.getByText(/was checked and downloaded\. Every part was read back/)), "the page confirms the check");

  const one = await download(page, "Download people-part-03.csv", "p3.csv");
  check(
    one.name === "people-part-03.csv" && JSON.stringify(csvLines(one.bytes)) === JSON.stringify(["id;name;city", ...BODY.slice(10)]),
    "one part on its own",
  );

  console.log("\nEqual parts, choices that can't be split, column names off");
  await page.getByLabel("A number of equal parts").check();
  await page.getByLabel("Number of parts (2–1,000)").fill("4");
  const four = await parts(page, 4);
  check(four.length === 4, "4 equal parts");
  check(
    (await visible(page.getByText("4 rows (rows 2–5 of your file)"))) && (await visible(page.getByText("3 rows (rows 12–14 of your file)"))),
    "sizes differ by at most one row (4, 3, 3, 3)",
  );
  await page.getByLabel("Number of parts (2–1,000)").fill("50");
  check(await visible(page.getByText("The table has 13 rows of data, so it can be split into at most 13 parts.")), "too many parts: explained");
  check((await page.getByRole("button", { name: "Download all parts (.zip)" }).count()) === 0, "and nothing can be downloaded");
  await page.getByLabel("Number of parts (2–1,000)").fill("2");
  await page
    .getByRole("checkbox", {
      name: "First row contains column names",
      exact: true,
    })
    .uncheck();
  check(await visible(page.getByText("This table has 14 rows of data.")), "column names off: the first row counts as data");
  const noHeader = await download(page, "Download people-part-01.csv", "nh.csv");
  check(JSON.stringify(csvLines(noHeader.bytes)) === JSON.stringify(["id;name;city", ...BODY.slice(0, 6)]), "and no names are added to the parts");
  await page
    .getByRole("checkbox", {
      name: "First row contains column names",
      exact: true,
    })
    .check();

  console.log("\nOne part per column value, Excel parts");
  await page.getByLabel("One part for each value in a column").check();
  await page.getByLabel("Column", { exact: true }).selectOption({ label: "city (e.g. Pune)" });
  const byCity = await parts(page, 4);
  check(
    JSON.stringify(byCity) === JSON.stringify(["people-Pune.csv", "people-Oslo.csv", "people-Lima.csv", "people-empty.csv"]),
    `one part per city, empty last (${byCity.join(", ")})`,
  );
  check(
    await visible(
      page.getByRole("heading", {
        name: "4 parts, one for each value in “city”",
      }),
    ),
    "the heading names the column",
  );
  const pune = await download(page, "Download people-Pune.csv", "pune.csv");
  check(
    JSON.stringify(csvLines(pune.bytes)) === JSON.stringify(["id;name;city", ...BODY.filter((l) => l.endsWith(";Pune"))]),
    "the Pune part holds exactly the Pune rows",
  );

  await page.getByLabel("Excel workbooks (.xlsx)").check();
  check(
    JSON.stringify(await parts(page, 4)) === JSON.stringify(["people-Pune.xlsx", "people-Oslo.xlsx", "people-Lima.xlsx", "people-empty.xlsx"]),
    "Excel parts are named .xlsx",
  );
  const x = await download(page, "Download people-Oslo.xlsx", "oslo.xlsx");
  const xr = readXlsx(x.path);
  check(
    xr.status === 0 &&
      xr.stdout.trim() ===
        JSON.stringify([
          ["id", "name", "city"],
          ["002", "P2", "Oslo"],
          ["005", "P5", "Oslo"],
          ["008", "P8", "Oslo"],
          ["0011", "P11", "Oslo"],
        ]),
    `the Excel part opens with codes as text (${xr.stdout.trim() || xr.stderr.slice(-200)})`,
  );
  const xz = await download(page, "Download all parts (.zip)", "x.zip");
  check(
    JSON.stringify(Object.keys(unzipSync(new Uint8Array(xz.bytes)))) === JSON.stringify(byCity.map((n) => n.replace(".csv", ".xlsx"))),
    "the .zip holds the 4 workbooks",
  );

  console.log("\nKeyboard");
  await page.getByLabel("CSV files (.csv)").focus();
  await page.keyboard.press("ArrowDown");
  check(await page.getByLabel("Excel workbooks (.xlsx)").isChecked(), "the format can be chosen with the arrow keys");
  await page.keyboard.press("ArrowUp");
  await page.getByRole("button", { name: "Download all parts (.zip)" }).focus();
  const kd = page.waitForEvent("download", { timeout: 30000 });
  await page.keyboard.press("Enter");
  check((await kd).suggestedFilename() === "people - split.zip", "Download all works with the keyboard");
  check(errors.length === 0, `no page errors (${errors.slice(0, 2).join(" | ")})`);
  await page.close();
}

{
  console.log("\nExcel file");
  const page = await openPage(
    { width: 1280, height: 900 },
    {
      name: "book.xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: readFileSync(xlsxPath),
    },
  );
  check(await page.getByLabel("Excel workbooks (.xlsx)").isChecked(), "Excel parts are chosen for an Excel file");
  const names = await parts(page, 2);
  check(
    JSON.stringify(names) === JSON.stringify(["book - Data-part-01.xlsx", "book - Data-part-02.xlsx"]),
    `parts are named after the file and sheet (${names.join(", ")})`,
  );
  const x = await download(page, "Download book - Data-part-02.xlsx", "b2.xlsx");
  const xr = readXlsx(x.path);
  check(
    xr.status === 0 &&
      xr.stdout.trim() ===
        JSON.stringify([
          ["code", "n"],
          ["004", 4],
          ["005", 5],
        ]),
    `the part keeps codes as text and numbers as numbers (${xr.stdout.trim()})`,
  );
  await page.getByLabel("CSV files (.csv)").check();
  const c = await download(page, "Download book - Data-part-01.csv", "b1.csv");
  check(JSON.stringify(csvLines(c.bytes)) === JSON.stringify(["code,n", "001,1", "002,2", "003,3"]), "CSV parts from Excel use commas and the values as shown");
  await page.close();
}

{
  console.log("\nPhone layout (390 × 844)");
  const page = await openPage({ width: 390, height: 844 }, CSV);
  await parts(page, 2);
  const w = await page.evaluate(() => document.documentElement.scrollWidth);
  check(w <= 390, `no page-level horizontal scroll (${w}px)`);
  const box = await page.getByRole("button", { name: "Download people-part-01.csv" }).boundingBox();
  check(!!box && box.height >= 44, `part buttons are comfortable tap targets (${box?.height ?? 0}px)`);
  await page.close();
}

await browser.close();
rmSync(DL, { recursive: true, force: true });
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
