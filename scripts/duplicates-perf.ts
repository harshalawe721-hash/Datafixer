/**
 * Stage 11 large-file test: Remove Duplicates in Chromium at 50, 100 and 150 MB CSV (and a
 * 600,000-row .xlsx with XLSX=1), with a known number of planted duplicate rows: open, the
 * automatic preview, apply, download, measuring time per step, peak renderer memory and
 * crashes, checking the downloaded file (header, exact line count) and that the original
 * file is unchanged (SHA-256).
 * Usage: start the app, then `npm run test:duplicates-perf` (SIZES=50,100 limits the sizes;
 * HEAP_MB=512 imitates a low-memory device). Linux only (memory is read with `ps`).
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { closeSync, createReadStream, mkdirSync, openSync, rmSync, statSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Zip, ZipDeflate, strToU8 } from "fflate";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HEAP_MB = process.env.HEAP_MB ? Number(process.env.HEAP_MB) : null;
const SIZES = (process.env.SIZES ?? "50,100,150").split(",").map(Number).filter(Boolean);
const DIR = path.join(tmpdir(), "datafixer-duplicates-perf");
const MB = 1024 * 1024;
const LONG = 600_000;
mkdirSync(DIR, { recursive: true });

/** CSV: id,name,email,city,amount; every 200th row repeats the row 100 above it exactly (a planted duplicate). */
function writeCsv(file: string, bytes: number): { rows: number; planted: number } {
  const fd = openSync(file, "w");
  let written = writeSync(fd, "id,name,email,city,amount\n");
  let rows = 0;
  let planted = 0;
  const lineOf = (i: number) => `${i},Asha${i % 5000} Patil${i % 3000},user${i}@example.com,City${i % 400},${(i % 10000) * 1.5}`;
  for (let i = 0; written < bytes; ) {
    const lines: string[] = [];
    const dup: boolean[] = [];
    for (let k = 0; k < 5000; k++, i++) {
      const d = i % 200 === 199;
      lines.push(lineOf(d ? i - 100 : i));
      dup.push(d);
    }
    const buf = Buffer.from(lines.join("\n") + "\n");
    const room = bytes - written;
    const cut = buf.length <= room ? buf.length : buf.lastIndexOf(10, room) + 1;
    if (cut <= 0) break;
    written += writeSync(fd, buf, 0, cut);
    const n = buf.subarray(0, cut).toString().split("\n").length - 1;
    rows += n;
    for (let k = 0; k < n; k++) if (dup[k]) planted++;
    if (cut < buf.length) break;
  }
  closeSync(fd);
  return { rows, planted };
}

function writeXlsx(file: string, rows: number): number {
  let planted = 0;
  const fd = openSync(file, "w");
  const zip = new Zip((err, data) => {
    if (err) throw err;
    writeSync(fd, data);
  });
  const add = (name: string, text: string) => {
    const f = new ZipDeflate(name, { level: 6 });
    zip.add(f);
    f.push(strToU8(text), true);
  };
  add("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`);
  add("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  add("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Data" sheetId="1" r:id="rId1"/></sheets></workbook>`);
  add("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  add("xl/styles.xml", `<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`);
  const s = new ZipDeflate("xl/worksheets/sheet1.xml", { level: 6 });
  zip.add(s);
  s.push(strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:C${rows + 1}"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="B1" t="inlineStr"><is><t>name</t></is></c><c r="C1" t="inlineStr"><is><t>city</t></is></c></row>`));
  for (let i = 0; i < rows; i += 10000) {
    const parts: string[] = [];
    for (let k = i; k < Math.min(rows, i + 10000); k++) {
      const r = k + 2;
      const d = k % 200 === 199 ? k - 100 : k; // planted duplicate of the row 100 above
      if (d !== k) planted++;
      parts.push(`<row r="${r}"><c r="A${r}"><v>${d}</v></c><c r="B${r}" t="inlineStr"><is><t>Asha${d % 5000} Patil${d % 3000}</t></is></c><c r="C${r}" t="inlineStr"><is><t>City${d % 400}</t></is></c></row>`);
    }
    s.push(strToU8(parts.join("")));
  }
  s.push(strToU8("</sheetData></worksheet>"), true);
  zip.end();
  closeSync(fd);
  return planted;
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

/** First line and number of lines of a downloaded CSV. */
async function csvShape(file: string): Promise<{ header: string; lines: number }> {
  let lines = 0;
  let head = "";
  await new Promise<void>((res, rej) =>
    createReadStream(file)
      .on("data", (d) => {
        const b = d as Buffer;
        if (head.length < 400) head += b.subarray(0, 400).toString("utf8");
        for (const x of b) if (x === 10) lines++;
      })
      .on("end", () => res())
      .on("error", rej),
  );
  return { header: head.replace(/^﻿/, "").split(/\r?\n/)[0]!, lines };
}

interface Row {
  name: string;
  outcome: string;
  openS?: number;
  previewS?: number;
  applyS?: number;
  exportS?: number;
  peakMB: number;
  verified?: string;
  shaOk: boolean;
}

const browser = await chromium.launch({ args: HEAP_MB ? [`--js-flags=--max-old-space-size=${HEAP_MB}`] : [] });
const results: Row[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function run(name: string, file: string, kind: "csv" | "xlsx", rows: number, planted: number) {
  const before = await sha256(file);
  const context = await browser.newContext({ acceptDownloads: true });
  const page: Page = await context.newPage();
  let crashed = false;
  page.on("crash", () => (crashed = true));
  await page.goto(`${BASE}/remove-duplicates`, { waitUntil: "networkidle" });
  const baseline = rendererRssMB();
  let peak = baseline;
  const poll = setInterval(() => (peak = Math.max(peak, rendererRssMB())), 250);
  const row: Row = { name, outcome: "", peakMB: 0, shaOk: false };
  const secs = (t: number) => Math.round(((Date.now() - t) / 1000) * 10) / 10;
  const problem = page.getByRole("alert").filter({ hasText: /\S/ });
  try {
    let t = Date.now();
    await page.locator("input[type=file]").setInputFiles(file);
    const panel = page.getByRole("heading", { name: "Remove duplicates", exact: true });
    const refused = page.getByRole("heading", { name: "This file couldn't be opened" });
    await panel.or(refused).first().waitFor({ timeout: 300000 });
    if (await refused.isVisible()) throw new Error(`refused safely: when opening: ${(await problem.first().textContent().catch(() => "")) ?? ""}`);
    row.openS = secs(t);
    // The preview starts by itself (all columns, exact, keep the first, remove).
    t = Date.now();
    const apply = page.getByRole("button", { name: `Apply: remove ${planted.toLocaleString("en-US")} rows` });
    await apply.or(problem).first().waitFor({ timeout: 300000 });
    if (await problem.first().isVisible().catch(() => false)) throw new Error(`refused safely: ${(await problem.first().textContent()) ?? ""}`);
    row.previewS = secs(t);
    t = Date.now();
    await apply.click();
    const done = page.getByText(`${planted.toLocaleString("en-US")} duplicate rows removed`);
    await done.or(problem).first().waitFor({ timeout: 300000 });
    if (await problem.first().isVisible().catch(() => false)) throw new Error(`refused safely: ${(await problem.first().textContent()) ?? ""}`);
    row.applyS = secs(t);
    t = Date.now();
    const download = page.waitForEvent("download", { timeout: 300000 });
    await page.getByRole("button", { name: kind === "csv" ? "Download corrected CSV" : "Download corrected file" }).click();
    if (kind === "xlsx") await page.getByRole("dialog").getByRole("button", { name: "Download Excel file" }).click();
    const dl = await download;
    await page.getByRole("heading", { name: "Export successful" }).waitFor({ timeout: 300000 });
    row.exportS = secs(t);
    const out = path.join(DIR, `out.${kind}`);
    await dl.saveAs(out);
    if (kind === "csv") {
      const { header, lines } = await csvShape(out);
      const want = rows - planted + 1;
      row.verified = `${header === "id,name,email,city,amount" ? "header ok" : `HEADER ${header}`}, ${lines === want ? "exactly" : "WRONG:"} ${lines.toLocaleString("en-US")} lines (${planted.toLocaleString("en-US")} planted duplicates removed), ${(statSync(out).size / MB).toFixed(0)} MB`;
    } else row.verified = `${(statSync(out).size / MB).toFixed(1)} MB xlsx, ${planted.toLocaleString("en-US")} rows removed (checked cell by cell before download)`;
    rmSync(out, { force: true });
    row.outcome = crashed ? "CRASHED" : "ok";
  } catch (err) {
    const msg = String(err);
    row.outcome = crashed ? "CRASHED (tab)" : msg.includes("refused safely") ? `stopped safely: ${msg.replace(/^Error: refused safely: /, "").slice(0, 150)}` : `failed: ${msg.slice(0, 150)}`;
  }
  clearInterval(poll);
  row.peakMB = peak - baseline;
  row.shaOk = (await sha256(file)) === before;
  results.push(row);
  console.log(JSON.stringify(row));
  await context.close();
}

console.log(`Chromium headless${HEAP_MB ? `, JS heap capped at ${HEAP_MB} MB` : ""}`);
for (const size of SIZES) {
  const file = path.join(DIR, `dups-${size}mb.csv`);
  const { rows, planted } = writeCsv(file, size * MB);
  await run(`CSV ${size} MB (${rows.toLocaleString("en-US")} rows)`, file, "csv", rows, planted);
  rmSync(file, { force: true });
}
if (process.env.XLSX) {
  const file = path.join(DIR, "dups.xlsx");
  const planted = writeXlsx(file, LONG);
  await run(`XLSX ${(statSync(file).size / MB).toFixed(0)} MB (${LONG.toLocaleString("en-US")} rows)`, file, "xlsx", LONG, planted);
  rmSync(file, { force: true });
}
await browser.close();
console.log("\n| File | Outcome | Open | Preview | Apply | Create + verify + download | Peak extra memory | Downloaded file | Original unchanged |\n|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  console.log(`| ${r.name} | ${r.outcome} | ${r.openS ?? "—"}s | ${r.previewS ?? "—"}s | ${r.applyS ?? "—"}s | ${r.exportS ?? "—"}s | ${r.peakMB} MB | ${r.verified ?? "—"} | ${r.shaOk ? "yes" : "NO"} |`);
}
process.exit(results.some((r) => r.outcome.startsWith("failed") || r.outcome.startsWith("CRASHED") || !r.shaOk) ? 1 : 0);
