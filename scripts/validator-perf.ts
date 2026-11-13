/**
 * Stage 5 large-file test: the whole CSV Validator workflow in Chromium at 50,
 * 100 and 150 MB — open, validate (exact counts of planted problems), Fix all
 * safe problems, Add empty cells, Fix column names, Remove hidden characters,
 * re-check, and a download with options (semicolon, LF, no BOM). Measures time
 * per step and peak renderer memory, checks the downloaded file with Python's
 * csv module (every row), and that the original file is unchanged (SHA-256).
 * Usage: start the app, then `npm run test:validator-perf` (HEAP_MB=512
 * imitates a low-memory device; SIZES=50,100 limits the sizes).
 * Linux only (memory is read with `ps`). Needs ~1 GB of temp disk.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
import { closeSync, createReadStream, mkdirSync, openSync, rmSync, statSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HEAP_MB = process.env.HEAP_MB ? Number(process.env.HEAP_MB) : null;
const SIZES = (process.env.SIZES ?? "50,100,150").split(",").map(Number).filter(Boolean);
const DIR = path.join(tmpdir(), "datafixer-validator-perf");
const MB = 1024 * 1024;
const EXCEL_MAX_ROWS = 1_048_576;
mkdirSync(DIR, { recursive: true });

interface Planted {
  dataRows: number;
  short: number;
  longEmpty: number;
  blank: number;
  control: number;
  /** Rows in the file as the validator counts them (header + data rows + blank lines). */
  fileRows: number;
}

/**
 * 7 fields per row; header has a duplicate name (“email” twice). Planted at known rows:
 * short rows (5 fields) at i ≡ 1000 (mod 50,000); rows with 2 empty extra fields at
 * i ≡ 2000 (mod 40,000); a blank line after i ≡ 3000 (mod 100,000); a NUL inside the
 * name at i ≡ 4000 (mod 200,000). The residues never coincide.
 */
function writeCsv(file: string, bytes: number): Planted {
  const fd = openSync(file, "w");
  let written = writeSync(fd, "id,name,email,city,amount,date,email\n");
  const p: Planted = { dataRows: 0, short: 0, longEmpty: 0, blank: 0, control: 0, fileRows: 1 };
  // Whole rows only, and never more than `bytes` (the site's limit is inclusive).
  let buf: string[] = [];
  let bufBytes = 0;
  for (let i = 0; ; i++) {
    const name = i % 200_000 === 4000 ? `Name\u0000${i % 50_000}` : `Name ${i % 50_000}`;
    let fields = [String(i), name, `user${i}@example.com`, `City ${i % 13}`, String((i % 10_000) * 1.5), `2024-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`, `alt${i}@example.com`];
    const isShort = i % 50_000 === 1000;
    const isLong = i % 40_000 === 2000;
    if (isShort) fields = fields.slice(0, 5);
    else if (isLong) fields = [...fields, "", ""];
    const blank = i % 100_000 === 3000;
    const text = fields.join(",") + "\n" + (blank ? "\n" : "");
    if (written + bufBytes + text.length > bytes) break; // ASCII only: characters = bytes
    buf.push(text);
    bufBytes += text.length;
    p.dataRows++;
    if (isShort) p.short++;
    if (isLong) p.longEmpty++;
    if (i % 200_000 === 4000) p.control++;
    if (blank) p.blank++;
    if (buf.length >= 5000) {
      written += writeSync(fd, buf.join(""));
      buf = [];
      bufBytes = 0;
    }
  }
  if (buf.length) written += writeSync(fd, buf.join(""));
  closeSync(fd);
  p.fileRows = 1 + p.dataRows + p.blank;
  return p;
}

const sha256 = (file: string) =>
  new Promise<string>((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });

function rendererRssMB(): number {
  let kb = 0;
  for (const line of execSync("ps -eo rss,args").toString().split("\n")) if (line.includes("--type=renderer")) kb += Number(line.trim().split(/\s+/)[0]) || 0;
  return Math.round(kb / 1024);
}

interface Row {
  name: string;
  outcome: string;
  openS?: number;
  validateS?: number;
  counts?: string;
  repairS?: number;
  finalVerdict?: string;
  downloadS?: number;
  peakMB: number;
  file?: string;
  shaOk: boolean;
}

const browser = await chromium.launch({ args: HEAP_MB ? [`--js-flags=--max-old-space-size=${HEAP_MB}`] : [] });
const results: Row[] = [];
let failures = 0;

async function run(name: string, file: string, p: Planted) {
  const before = await sha256(file);
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  let crashed = false;
  page.on("crash", () => (crashed = true));
  await page.goto(`${BASE}/csv-validator`, { waitUntil: "networkidle" });
  const baseline = rendererRssMB();
  let peak = baseline;
  const poll = setInterval(() => (peak = Math.max(peak, rendererRssMB())), 250);
  const row: Row = { name, outcome: "", peakMB: 0, shaOk: false };
  const secs = (t: number) => Math.round(((Date.now() - t) / 1000) * 10) / 10;
  const heading = page.locator("#validator-heading");
  const dialog = page.getByRole("dialog");
  const card = (title: string) => page.locator("article", { has: page.getByRole("heading", { name: title, exact: true }) });
  const count = async (title: string) => {
    const c = card(title);
    return (await c.count()) ? Number(((await c.locator("p.text-right span").first().textContent()) ?? "").replace(/,/g, "")) : 0;
  };
  const checked = async () => {
    await page.waitForTimeout(300);
    const notChecked = page.getByRole("heading", { name: "This file couldn't be checked" });
    await heading.or(notChecked).first().waitFor({ timeout: 600_000 });
    if (await notChecked.isVisible()) throw new Error(`check refused safely: ${(await page.getByRole("alert").filter({ hasText: /\S/ }).first().textContent()) ?? ""}`);
  };
  const apply = async (button: () => Promise<void>, applyName: RegExp) => {
    await button();
    const b = dialog.getByRole("button", { name: applyName });
    await b.waitFor({ timeout: 600_000 });
    await b.click();
    await dialog.waitFor({ state: "detached", timeout: 600_000 });
    await checked();
  };
  try {
    let t = Date.now();
    await page.locator("input[type=file]").setInputFiles(file);
    await page.getByText(/Opened on your device in/).first().waitFor({ timeout: 600_000 });
    row.openS = secs(t);
    t = Date.now();
    await checked();
    row.validateS = secs(t);
    const tooMany = Math.max(0, p.fileRows - EXCEL_MAX_ROWS);
    const got = {
      uneven: await count("Rows with the wrong number of fields"),
      blank: await count("Blank lines"),
      control: await count("Hidden control characters"),
      duplicate: await count("Duplicate column names"),
      tooMany: await count("Too many rows for Excel"),
    };
    const want = { uneven: p.short + p.longEmpty, blank: p.blank, control: p.control, duplicate: 1, tooMany };
    const exact = JSON.stringify(got) === JSON.stringify(want);
    row.counts = `${exact ? "exact" : "MISMATCH"}: uneven ${got.uneven}/${want.uneven}, blank ${got.blank}/${want.blank}, NUL ${got.control}/${want.control}, duplicate ${got.duplicate}/1${tooMany ? `, over Excel ${got.tooMany}/${tooMany}` : ""}`;
    if (!exact) failures++;

    t = Date.now();
    await apply(() => page.getByRole("button", { name: "Fix all safe problems" }).click(), /^Apply all fixes/);
    await apply(() => card("Rows with the wrong number of fields").getByRole("button", { name: "Add empty cells" }).click(), /^Apply fix/);
    await apply(() => card("Duplicate column names").getByRole("button", { name: "Fix column names" }).click(), /^Apply fix/);
    await apply(() => card("Hidden control characters").getByRole("button", { name: "Remove hidden characters" }).click(), /^Apply fix/);
    row.repairS = secs(t);
    row.finalVerdict = (await heading.textContent()) ?? "";
    const wantVerdict = tooMany ? "Valid CSV, with 1 warning" : "Valid CSV file";
    if (row.finalVerdict !== wantVerdict) failures++;

    t = Date.now();
    const download = page.waitForEvent("download", { timeout: 600_000 });
    await page.getByRole("button", { name: "Download corrected CSV" }).click();
    await dialog.getByRole("radio", { name: /Semicolon/ }).check();
    await dialog.getByRole("radio", { name: /LF \(Unix, Mac\)/ }).check();
    await dialog.getByRole("radio", { name: /without BOM/ }).check();
    await dialog.getByRole("button", { name: "Create and download" }).click();
    const dl = await download;
    await page.getByRole("heading", { name: "Export successful" }).waitFor({ timeout: 600_000 });
    row.downloadS = secs(t);
    const out = path.join(DIR, `out-${name.replace(/\W+/g, "_")}.csv`);
    await dl.saveAs(out);
    // Python reads every row: no BOM, semicolons, every row 7 fields, no NUL, renamed column.
    const py = spawnSync(
      "python3",
      [
        "-I",
        "-c",
        [
          "import csv,sys,json",
          "f=open(sys.argv[1],'rb'); head=f.read(3); f.close()",
          "rows=0; bad=0; nul=0; first=None; cr=0",
          "with open(sys.argv[1],newline='',encoding='utf-8') as f:",
          "  for r in csv.reader(f, delimiter=';', strict=True):",
          "    rows+=1; first=first or r; bad+=len(r)!=7; nul+=any('\\x00' in v for v in r)",
          "with open(sys.argv[1],'rb') as f: cr=f.read().count(b'\\r')",
          "print(json.dumps({'bom': head==b'\\xef\\xbb\\xbf', 'rows': rows, 'bad': bad, 'nul': nul, 'cr': cr, 'header': first}))",
        ].join("\n"),
        out,
      ],
      { encoding: "utf8", maxBuffer: 1 << 20 },
    );
    const r = py.status === 0 ? (JSON.parse(py.stdout) as { bom: boolean; rows: number; bad: number; nul: number; cr: number; header: string[] }) : null;
    const fileOk = !!r && !r.bom && r.rows === p.dataRows + 1 && r.bad === 0 && r.nul === 0 && r.cr === 0 && r.header[6] === "email (2)";
    if (!fileOk) failures++;
    row.file = r
      ? `${fileOk ? "ok" : "WRONG"}: ${r.rows.toLocaleString("en-US")} rows (want ${(p.dataRows + 1).toLocaleString("en-US")}), all 7 fields: ${r.bad === 0}, NUL: ${r.nul}, BOM: ${r.bom}, CR: ${r.cr}, ${(statSync(out).size / MB).toFixed(0)} MB`
      : `Python failed: ${py.stderr.slice(0, 120)}`;
    rmSync(out, { force: true });
    row.outcome = crashed ? "CRASHED" : "ok";
  } catch (err) {
    const alert =
      (await page.getByRole("alert").filter({ hasText: /\S/ }).first().textContent({ timeout: 1000 }).catch(() => null)) ||
      (await page.getByText(/too large|couldn.t|can.t be|not enough memory/i).first().textContent({ timeout: 1000 }).catch(() => null));
    const msg = String(err);
    row.outcome = crashed ? "CRASHED (tab)" : msg.includes("refused safely") ? msg.replace(/^Error: /, "").slice(0, 160) : alert ? `stopped safely: ${alert.trim().slice(0, 140)}` : `failed: ${msg.slice(0, 160)}`;
    if (crashed || row.outcome.startsWith("failed")) failures++;
  }
  clearInterval(poll);
  row.peakMB = peak - baseline;
  row.shaOk = (await sha256(file)) === before;
  if (!row.shaOk) failures++;
  results.push(row);
  console.log(JSON.stringify(row));
  await context.close();
}

console.log(`Chromium headless${HEAP_MB ? `, JS heap capped at ${HEAP_MB} MB` : ""}`);
for (const size of SIZES) {
  const file = path.join(DIR, `validator-${size}mb.csv`);
  const p = writeCsv(file, size * MB);
  await run(`CSV ${size} MB (${p.fileRows.toLocaleString("en-US")} rows)`, file, p);
  rmSync(file, { force: true });
}
await browser.close();
console.log("\n| File | Outcome | Open | Validate | Planted problems found | All repairs (4, with re-checks) | Final verdict | Download (semicolon, LF, no BOM; create + verify) | Peak extra memory | Downloaded file (Python) | Original unchanged |\n|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  console.log(`| ${r.name} | ${r.outcome} | ${r.openS ?? "—"}s | ${r.validateS ?? "—"}s | ${r.counts ?? "—"} | ${r.repairS ?? "—"}s | ${r.finalVerdict ?? "—"} | ${r.downloadS ?? "—"}s | ${r.peakMB} MB | ${r.file ?? "—"} | ${r.shaOk ? "yes" : "NO"} |`);
}
console.log(`\n${failures ? `${failures} problem(s)` : "No problems"}: crashes, wrong counts, wrong verdicts, wrong files or changed originals count as problems; stopping safely on a low-memory device does not.`);
process.exit(failures ? 1 : 0);
