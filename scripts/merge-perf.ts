/**
 * Stage 15 large-file test: Merge Files in Chromium, (a) 50 CSV files of about 2.9 MB
 * (just under 150 MB together) and (b) 3 CSV files of about 48 MB, with columns in a
 * different order in every other file: choose, merge, download, measuring time and peak
 * renderer memory, checking the downloaded file (header, exact line count) and that the
 * originals are unchanged (SHA-256).
 * Usage: start the app, then `npm run test:merge-perf` (CASES=many,big picks cases;
 * HEAP_MB=512 imitates a low-memory device). Linux only (memory is read with `ps`).
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { closeSync, createReadStream, mkdirSync, openSync, readSync, rmSync, statSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HEAP_MB = process.env.HEAP_MB ? Number(process.env.HEAP_MB) : null;
const CASES = (process.env.CASES ?? "many,big").split(",");
const DIR = path.join(tmpdir(), "datafixer-merge-perf");
const MB = 1024 * 1024;
mkdirSync(DIR, { recursive: true });

/** One CSV file of about `bytes`; odd files have the columns in another order. Returns data rows. */
function writeCsv(file: string, bytes: number, n: number): number {
  const fd = openSync(file, "w");
  const swapped = n % 2 === 1;
  let written = writeSync(fd, swapped ? "name,id,city,amount\n" : "id,name,city,amount\n");
  let rows = 0;
  for (let i = 0; written < bytes; ) {
    const lines: string[] = [];
    for (let k = 0; k < 5000; k++, i++) {
      const id = `${n}-${String(i).padStart(7, "0")}`;
      const name = `Asha ${i % 5000}`;
      lines.push(swapped ? `${name},${id},City${i % 400},${(i % 10000) * 1.5}` : `${id},${name},City${i % 400},${(i % 10000) * 1.5}`);
    }
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
function head(file: string, n = 200): string {
  const fd = openSync(file, "r");
  const buf = Buffer.alloc(n);
  const got = readSync(fd, buf, 0, n, 0);
  closeSync(fd);
  return buf.subarray(0, got).toString("utf8").replace(/^﻿/, "");
}

interface Row {
  name: string;
  outcome: string;
  mergeS?: number;
  steps: string[];
  peakMB: number;
  verified: string[];
  shaOk: boolean;
}

const browser = await chromium.launch({ args: HEAP_MB ? [`--js-flags=--max-old-space-size=${HEAP_MB}`] : [] });
const results: Row[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function run(name: string, files: string[], rows: number) {
  const before = await Promise.all(files.map(sha256));
  const context = await browser.newContext({ acceptDownloads: true });
  const page: Page = await context.newPage();
  let crashed = false;
  page.on("crash", () => (crashed = true));
  await page.goto(`${BASE}/merge-files`, { waitUntil: "networkidle" });
  const baseline = rendererRssMB();
  let peak = baseline;
  const poll = setInterval(() => (peak = Math.max(peak, rendererRssMB())), 250);
  const row: Row = { name, outcome: "", steps: [], peakMB: 0, verified: [], shaOk: false };
  try {
    await page.locator("input[type=file]").setInputFiles(files);
    const merge = page.getByRole("button", { name: `Merge ${files.length} files` });
    await merge.waitFor({ timeout: 120000 });
    const t = Date.now();
    await merge.click();
    const done = page.getByRole("heading", { name: "Merged table" });
    const refused = page.getByRole("heading", { name: "This file couldn't be opened" });
    await done.or(refused).first().waitFor({ timeout: 600000 });
    if (await refused.isVisible()) throw new Error(`refused safely: ${(await page.getByRole("alert").filter({ hasText: /\S/ }).first().textContent().catch(() => "")) ?? ""}`);
    row.mergeS = Math.round((Date.now() - t) / 100) / 10;
    const t2 = Date.now();
    const dl = page.waitForEvent("download", { timeout: 600000 });
    await page.getByRole("button", { name: /^Download CSV$/ }).click();
    const d = await dl;
    const out = path.join(DIR, "out.csv");
    await d.saveAs(out);
    row.steps.push(`CSV ${Math.round((Date.now() - t2) / 100) / 10}s`);
    const lines = await countLines(out);
    const header = head(out).split("\r\n")[0];
    row.verified.push(`${header === "Source file,id,name,city,amount" ? "header ok" : `HEADER ${header}`}, ${lines === rows + 1 ? "exactly" : "WRONG:"} ${lines.toLocaleString("en-US")} lines, ${(statSync(out).size / MB).toFixed(0)} MB`);
    rmSync(out, { force: true });
    row.outcome = crashed ? "CRASHED" : "ok";
  } catch (err) {
    const msg = String(err);
    row.outcome = crashed ? "CRASHED (tab)" : msg.includes("refused safely") ? `stopped safely: ${msg.replace(/^Error: refused safely: /, "").slice(0, 160)}` : `failed: ${msg.slice(0, 160)}`;
  }
  clearInterval(poll);
  row.peakMB = peak - baseline;
  const after = await Promise.all(files.map(sha256));
  row.shaOk = after.every((h, i) => h === before[i]);
  results.push(row);
  console.log(JSON.stringify(row));
  await context.close();
}

if (CASES.includes("many")) {
  const files: string[] = [];
  let rows = 0;
  for (let n = 0; n < 50; n++) {
    const f = path.join(DIR, `part-${String(n).padStart(2, "0")}.csv`);
    rows += writeCsv(f, 2.9 * MB, n);
    files.push(f);
  }
  const total = files.reduce((s, f) => s + statSync(f).size, 0);
  await run(`50 files, ${(total / MB).toFixed(0)} MB together (${rows.toLocaleString("en-US")} rows)`, files, rows);
  for (const f of files) rmSync(f, { force: true });
}
if (CASES.includes("big")) {
  const files: string[] = [];
  let rows = 0;
  for (let n = 0; n < 3; n++) {
    const f = path.join(DIR, `big-${n}.csv`);
    rows += writeCsv(f, 48 * MB, n);
    files.push(f);
  }
  const total = files.reduce((s, f) => s + statSync(f).size, 0);
  await run(`3 files, ${(total / MB).toFixed(0)} MB together (${rows.toLocaleString("en-US")} rows)`, files, rows);
  for (const f of files) rmSync(f, { force: true });
}

await browser.close();
console.log(`\nChromium headless${HEAP_MB ? `, JS heap capped at ${HEAP_MB} MB` : ""}`);
console.log("\n| Files | Outcome | Merge | Download (create + check) | Peak extra memory | Downloaded file | Originals unchanged |\n|---|---|---|---|---|---|---|");
for (const r of results) console.log(`| ${r.name} | ${r.outcome} | ${r.mergeS ?? "—"}s | ${r.steps.join(", ") || "—"} | ${r.peakMB} MB | ${r.verified.join("; ") || "—"} | ${r.shaOk ? "yes" : "NO"} |`);
process.exit(results.some((r) => r.outcome.startsWith("failed") || r.outcome.startsWith("CRASHED") || !r.shaOk) ? 1 : 0);
