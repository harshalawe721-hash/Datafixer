/**
 * Stage 12 large-file test, in Chromium:
 * - JSON to CSV: a .json file just under the 50 MB limit (CSV and Excel downloads) and a
 *   150 MB .jsonl file (CSV download);
 * - CSV to JSON: 50 MB CSV as pretty JSON, 150 MB CSV as JSON Lines.
 * Measures time per step and peak renderer memory, checks the downloaded files (exact record
 * counts) and that the original file is unchanged (SHA-256).
 * Usage: start the app, then `npm run test:json-perf` (CASES=json,jsonl,csv50,csv150 picks
 * cases; HEAP_MB=512 imitates a low-memory device). Linux only (memory is read with `ps`).
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { closeSync, createReadStream, mkdirSync, openSync, readFileSync, rmSync, statSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HEAP_MB = process.env.HEAP_MB ? Number(process.env.HEAP_MB) : null;
const CASES = (process.env.CASES ?? "json,jsonl,csv50,csv150").split(",");
const DIR = path.join(tmpdir(), "datafixer-json-perf");
const MB = 1024 * 1024;
mkdirSync(DIR, { recursive: true });

const record = (i: number) =>
  JSON.stringify({ id: String(100000 + i).padStart(8, "0"), name: `Asha ${i % 5000}`, email: `user${i}@example.com`, address: { city: `City${i % 400}`, zip: String(10000 + (i % 90000)) }, amount: (i % 10000) * 1.5, active: i % 2 === 0, tags: ["a", "b"] });

/** Writes records until the file reaches `bytes`; returns the number of records. */
function writeJson(file: string, bytes: number, lines: boolean): number {
  const fd = openSync(file, "w");
  let written = writeSync(fd, lines ? "" : "[");
  let n = 0;
  // Stop before the target size: the upload box refuses files over its limit (50 MB .json, 150 MB .jsonl).
  for (;;) {
    const batch: string[] = [];
    for (let k = 0; k < 2000; k++) batch.push(record(n + k));
    const text = (lines ? "" : n > 0 ? "," : "") + batch.join(lines ? "\n" : ",") + (lines ? "\n" : "");
    if (written + Buffer.byteLength(text) + 1 > bytes) break;
    written += writeSync(fd, text);
    n += batch.length;
  }
  if (!lines) writeSync(fd, "]");
  closeSync(fd);
  return n;
}

function writeCsv(file: string, bytes: number): number {
  const fd = openSync(file, "w");
  let written = writeSync(fd, "id,name,email,city,amount,active\n");
  let rows = 0;
  for (let i = 0; written < bytes; ) {
    const lines: string[] = [];
    for (let k = 0; k < 5000; k++, i++) lines.push(`${String(100000 + i).padStart(8, "0")},Asha ${i % 5000},user${i}@example.com,City${i % 400},${(i % 10000) * 1.5},${i % 2 === 0}`);
    const buf = Buffer.from(lines.join("\n") + "\n");
    const room = bytes - written;
    const cut = buf.length <= room ? buf.length : buf.lastIndexOf(10, room) + 1;
    if (cut <= 0) break;
    written += writeSync(fd, buf, 0, cut);
    rows += buf.subarray(0, cut).toString().split("\n").length - 1;
    if (cut < buf.length) break;
  }
  closeSync(fd);
  return rows;
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
const countLines = (file: string) =>
  new Promise<number>((res, rej) => {
    let n = 0;
    createReadStream(file).on("data", (d) => { for (const b of d as Buffer) if (b === 10) n++; }).on("end", () => res(n)).on("error", rej);
  });

interface Row {
  name: string;
  outcome: string;
  openS?: number;
  steps: string[];
  peakMB: number;
  verified: string[];
  shaOk: boolean;
}

const browser = await chromium.launch({ args: HEAP_MB ? [`--js-flags=--max-old-space-size=${HEAP_MB}`] : [] });
const results: Row[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function run(name: string, pagePath: string, file: string, heading: string, steps: (page: Page, row: Row) => Promise<void>) {
  const before = await sha256(file);
  const context = await browser.newContext({ acceptDownloads: true });
  const page: Page = await context.newPage();
  let crashed = false;
  page.on("crash", () => (crashed = true));
  await page.goto(`${BASE}${pagePath}`, { waitUntil: "networkidle" });
  const baseline = rendererRssMB();
  let peak = baseline;
  const poll = setInterval(() => (peak = Math.max(peak, rendererRssMB())), 250);
  const row: Row = { name, outcome: "", steps: [], peakMB: 0, verified: [], shaOk: false };
  try {
    const t = Date.now();
    await page.locator("input[type=file]").setInputFiles(file);
    const panel = page.getByRole("heading", { name: heading });
    const refused = page.getByRole("heading", { name: "This file couldn't be opened" });
    await panel.or(refused).first().waitFor({ timeout: 300000 });
    if (await refused.isVisible()) throw new Error(`refused safely: when opening: ${(await page.getByRole("alert").filter({ hasText: /\S/ }).first().textContent().catch(() => "")) ?? ""}`);
    row.openS = Math.round((Date.now() - t) / 100) / 10;
    await steps(page, row);
    row.outcome = crashed ? "CRASHED" : "ok";
  } catch (err) {
    const msg = String(err);
    row.outcome = crashed ? "CRASHED (tab)" : msg.includes("refused safely") ? `stopped safely: ${msg.replace(/^Error: refused safely: /, "").slice(0, 160)}` : `failed: ${msg.slice(0, 160)}`;
  }
  clearInterval(poll);
  row.peakMB = peak - baseline;
  row.shaOk = (await sha256(file)) === before;
  results.push(row);
  console.log(JSON.stringify(row));
  await context.close();
}

/** Clicks a download button, waits for the file and the done message (or an error), saves it. */
async function download(page: Page, button: RegExp, row: Row, label: string): Promise<string> {
  const t = Date.now();
  const dl = page.waitForEvent("download", { timeout: 600000 });
  await page.getByRole("button", { name: button }).click();
  const problem = page.getByRole("alert").filter({ hasText: /\S/ });
  const d = await Promise.race([dl, problem.first().waitFor({ timeout: 600000 }).then(async () => { throw new Error(`refused safely: ${label}: ${(await problem.first().textContent()) ?? ""}`); })]);
  const out = path.join(DIR, `out-${label}`);
  await (d as { saveAs(p: string): Promise<void> }).saveAs(out);
  row.steps.push(`${label} ${Math.round((Date.now() - t) / 100) / 10}s`);
  return out;
}

if (CASES.includes("json")) {
  const file = path.join(DIR, "big.json");
  const n = writeJson(file, 49 * MB, false);
  await run(`JSON to CSV · .json ${(statSync(file).size / MB).toFixed(0)} MB (${n.toLocaleString("en-US")} records)`, "/json-to-csv", file, "Your JSON as a table", async (page, row) => {
    const csv = await download(page, /^Download CSV$/, row, "CSV");
    const lines = await countLines(csv);
    row.verified.push(`CSV ${lines === n + 1 ? "exactly" : "WRONG:"} ${lines.toLocaleString("en-US")} lines`);
    rmSync(csv, { force: true });
    const xlsx = await download(page, /^Download Excel/, row, "Excel");
    row.verified.push(`Excel ${(statSync(xlsx).size / MB).toFixed(1)} MB (checked cell by cell)`);
    rmSync(xlsx, { force: true });
  });
  rmSync(file, { force: true });
}
if (CASES.includes("jsonl")) {
  const file = path.join(DIR, "big.jsonl");
  const n = writeJson(file, 150 * MB, true);
  await run(`JSON to CSV · .jsonl ${(statSync(file).size / MB).toFixed(0)} MB (${n.toLocaleString("en-US")} lines)`, "/json-to-csv", file, "Your JSON as a table", async (page, row) => {
    const csv = await download(page, /^Download CSV$/, row, "CSV");
    const lines = await countLines(csv);
    row.verified.push(`CSV ${lines === n + 1 ? "exactly" : "WRONG:"} ${lines.toLocaleString("en-US")} lines`);
    rmSync(csv, { force: true });
  });
  rmSync(file, { force: true });
}
for (const size of [50, 150]) {
  if (!CASES.includes(`csv${size}`)) continue;
  const file = path.join(DIR, `big-${size}.csv`);
  const rows = writeCsv(file, size * MB);
  const lines = size === 150;
  await run(`CSV to JSON · CSV ${size} MB (${rows.toLocaleString("en-US")} rows) → ${lines ? "JSON Lines" : "pretty JSON"}`, "/csv-to-json", file, "Convert to JSON", async (page, row) => {
    await page.getByRole("radio", { name: /Detect numbers/ }).check();
    if (lines) await page.getByRole("radio", { name: /^JSON Lines/ }).check();
    await page.getByLabel("Preview of the JSON").waitFor({ timeout: 300000 });
    const out = await download(page, lines ? /^Download \.jsonl$/ : /^Download \.json$/, row, lines ? "JSONL" : "JSON");
    if (lines) {
      const n = await countLines(out);
      row.verified.push(`${n === rows ? "exactly" : "WRONG:"} ${n.toLocaleString("en-US")} records, ${(statSync(out).size / MB).toFixed(0)} MB`);
    } else {
      const parsed = JSON.parse(readFileSync(out, "utf8")) as { id: string; amount: number }[];
      const ok = parsed.length === rows && parsed[0]!.id === "00100000" && typeof parsed[1]!.amount === "number";
      row.verified.push(`${ok ? "exactly" : "WRONG:"} ${parsed.length.toLocaleString("en-US")} records (codes text, amounts numbers), ${(statSync(out).size / MB).toFixed(0)} MB`);
    }
    rmSync(out, { force: true });
  });
  rmSync(file, { force: true });
}

await browser.close();
console.log(`\nChromium headless${HEAP_MB ? `, JS heap capped at ${HEAP_MB} MB` : ""}`);
console.log("\n| Case | Outcome | Open | Downloads (create + check) | Peak extra memory | Downloaded files | Original unchanged |\n|---|---|---|---|---|---|---|");
for (const r of results) console.log(`| ${r.name} | ${r.outcome} | ${r.openS ?? "—"}s | ${r.steps.join(", ") || "—"} | ${r.peakMB} MB | ${r.verified.join("; ") || "—"} | ${r.shaOk ? "yes" : "NO"} |`);
process.exit(results.some((r) => r.outcome.startsWith("failed") || r.outcome.startsWith("CRASHED") || !r.shaOk) ? 1 : 0);
