/**
 * Stage 13 large-file test: TSV to CSV in Chromium at 50, 100 and 150 MB (values contain
 * commas and quotes, so CSV quoting is exercised), with an Excel download for 50 MB: open,
 * download, measuring time and peak renderer memory, checking the downloaded file (header,
 * exact line count, quoted values) and that the original is unchanged (SHA-256).
 * Usage: start the app, then `npm run test:tsv-perf` (SIZES=50,100 limits the sizes;
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
const SIZES = (process.env.SIZES ?? "50,100,150").split(",").map(Number).filter(Boolean);
const DIR = path.join(tmpdir(), "datafixer-tsv-perf");
const MB = 1024 * 1024;
mkdirSync(DIR, { recursive: true });

function writeTsv(file: string, bytes: number): number {
  const fd = openSync(file, "w");
  let written = writeSync(fd, "id\tname\tcity\tnote\tamount\n");
  let rows = 0;
  for (let i = 0; written < bytes; ) {
    const lines: string[] = [];
    for (let k = 0; k < 5000; k++, i++) lines.push(`${String(i).padStart(8, "0")}\tPatil, Asha ${i % 5000}\tCity${i % 400}\tsays "hi" ${i % 7}\t${(i % 10000) * 1.5}`);
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
function head(file: string, n = 300): string {
  const fd = openSync(file, "r");
  const buf = Buffer.alloc(n);
  const got = readSync(fd, buf, 0, n, 0);
  closeSync(fd);
  return buf.subarray(0, got).toString("utf8").replace(/^﻿/, "");
}

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

for (const size of SIZES) {
  const file = path.join(DIR, `big-${size}.tsv`);
  const rows = writeTsv(file, size * MB);
  const before = await sha256(file);
  const context = await browser.newContext({ acceptDownloads: true });
  const page: Page = await context.newPage();
  let crashed = false;
  page.on("crash", () => (crashed = true));
  await page.goto(`${BASE}/tsv-to-csv`, { waitUntil: "networkidle" });
  const baseline = rendererRssMB();
  let peak = baseline;
  const poll = setInterval(() => (peak = Math.max(peak, rendererRssMB())), 250);
  const row: Row = { name: `TSV ${size} MB (${rows.toLocaleString("en-US")} rows)`, outcome: "", steps: [], peakMB: 0, verified: [], shaOk: false };
  try {
    const t = Date.now();
    await page.locator("input[type=file]").setInputFiles(file);
    const panel = page.getByRole("heading", { name: "Convert to CSV" });
    const refused = page.getByRole("heading", { name: "This file couldn't be opened" });
    await panel.or(refused).first().waitFor({ timeout: 300000 });
    if (await refused.isVisible()) throw new Error(`refused safely: when opening: ${(await page.getByRole("alert").filter({ hasText: /\S/ }).first().textContent().catch(() => "")) ?? ""}`);
    row.openS = Math.round((Date.now() - t) / 100) / 10;
    const csv = await download(page, /^Download CSV$/, row, "CSV");
    const lines = await countLines(csv);
    const first = head(csv).split("\r\n");
    const quoted = first[0] === "id,name,city,note,amount" && first[1] === '00000000,"Patil, Asha 0",City0,"says ""hi"" 0",0';
    row.verified.push(`CSV ${lines === rows + 1 ? "exactly" : "WRONG:"} ${lines.toLocaleString("en-US")} lines, ${quoted ? "values quoted correctly" : `QUOTING WRONG: ${first[1]}`}, ${(statSync(csv).size / MB).toFixed(0)} MB`);
    rmSync(csv, { force: true });
    if (size === 50) {
      const xlsx = await download(page, /^Download Excel/, row, "Excel");
      row.verified.push(`Excel ${(statSync(xlsx).size / MB).toFixed(1)} MB (checked cell by cell)`);
      rmSync(xlsx, { force: true });
    }
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
  rmSync(file, { force: true });
}

await browser.close();
console.log(`\nChromium headless${HEAP_MB ? `, JS heap capped at ${HEAP_MB} MB` : ""}`);
console.log("\n| File | Outcome | Open | Downloads (create + check) | Peak extra memory | Downloaded files | Original unchanged |\n|---|---|---|---|---|---|---|");
for (const r of results) console.log(`| ${r.name} | ${r.outcome} | ${r.openS ?? "—"}s | ${r.steps.join(", ") || "—"} | ${r.peakMB} MB | ${r.verified.join("; ") || "—"} | ${r.shaOk ? "yes" : "NO"} |`);
process.exit(results.some((r) => r.outcome.startsWith("failed") || r.outcome.startsWith("CRASHED") || !r.shaOk) ? 1 : 0);
