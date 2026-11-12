/**
 * Stage 4 large-file test (S4): the whole workflow in Chromium at 50, 100 and
 * 150 MB — open, check, "Fix all safe problems", download — measuring time per
 * step, peak renderer memory and crashes, checking the downloaded file (BOM,
 * row count) and that the original file is unchanged (SHA-256).
 * Usage: start the app, then `npm run test:export-perf` (HEAP_MB=512 imitates a
 * low-memory device; SIZES=50,100 limits the sizes; XLSX=1 adds an Excel case).
 * Linux only (memory is read with `ps`). Needs ~1.5 GB of temp disk.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { closeSync, createReadStream, mkdirSync, openSync, readFileSync, rmSync, statSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Zip, ZipDeflate, strToU8 } from "fflate";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const HEAP_MB = process.env.HEAP_MB ? Number(process.env.HEAP_MB) : null;
const SIZES = (process.env.SIZES ?? "50,100,150").split(",").map(Number).filter(Boolean);
const DIR = path.join(tmpdir(), "datafixer-export-perf");
const MB = 1024 * 1024;
mkdirSync(DIR, { recursive: true });

/** CSV with planted problems: 1 in 97 names has a leading space, 1 in 13 cities is lower-case, 1 in 200 rows repeats an earlier row. */
function writeCsv(file: string, bytes: number): number {
  const fd = openSync(file, "w");
  let written = writeSync(fd, "id,name,email,city,amount,date\n");
  let rows = 0;
  const recent: string[] = [];
  for (let i = 0; written < bytes; ) {
    const lines: string[] = [];
    for (let k = 0; k < 5000; k++, i++) {
      let line: string;
      if (i % 200 === 199 && recent.length) line = recent[i % recent.length]!;
      else {
        line = `${i},${i % 97 === 0 ? " " : ""}Name ${i % 50000},user${i}@example.com,${i % 13 === 0 ? "paris" : "Paris"},${(i % 10000) * 1.5},2024-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`;
        if (recent.length < 100) recent.push(line);
      }
      lines.push(line);
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

function writeXlsx(file: string, rows: number) {
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
  s.push(strToU8(`<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>id</t></is></c><c r="B1" t="inlineStr"><is><t>name</t></is></c><c r="C1" t="inlineStr"><is><t>city</t></is></c><c r="D1" t="inlineStr"><is><t>amount</t></is></c></row>`));
  for (let i = 0; i < rows; i += 10000) {
    const parts: string[] = [];
    for (let k = i; k < Math.min(rows, i + 10000); k++) {
      const r = k + 2;
      parts.push(`<row r="${r}"><c r="A${r}"><v>${k}</v></c><c r="B${r}" t="inlineStr"><is><t xml:space="preserve">${k % 97 === 0 ? " " : ""}Name ${k % 50000}</t></is></c><c r="C${r}" t="inlineStr"><is><t>${k % 13 === 0 ? "paris" : "Paris"}</t></is></c><c r="D${r}"><v>${(k % 10000) * 1.5}</v></c></row>`);
    }
    s.push(strToU8(parts.join("")));
  }
  s.push(strToU8("</sheetData></worksheet>"), true);
  zip.end();
  closeSync(fd);
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
  checkS?: number;
  fixS?: number;
  recheckS?: number;
  exportS?: number;
  peakMB: number;
  verified?: string;
  shaOk: boolean;
}

const browser = await chromium.launch({ args: HEAP_MB ? [`--js-flags=--max-old-space-size=${HEAP_MB}`] : [] });
const results: Row[] = [];

async function run(name: string, file: string, kind: "csv" | "xlsx", expectRows?: number) {
  const before = await sha256(file);
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  let crashed = false;
  page.on("crash", () => (crashed = true));
  await page.goto(`${BASE}/spreadsheet-error-detector`, { waitUntil: "networkidle" });
  const baseline = rendererRssMB();
  let peak = baseline;
  const poll = setInterval(() => (peak = Math.max(peak, rendererRssMB())), 250);
  const row: Row = { name, outcome: "", peakMB: 0, shaOk: false };
  const secs = (t: number) => Math.round(((Date.now() - t) / 1000) * 10) / 10;
  const analysed = page.getByRole("heading", { name: "Spreadsheet analysis complete" });
  try {
    let t = Date.now();
    await page.locator("input[type=file]").setInputFiles(file);
    await page.getByText(/Opened on your device in/).first().waitFor({ timeout: 300000 });
    row.openS = secs(t);
    t = Date.now();
    const notChecked = page.getByRole("heading", { name: "This sheet couldn't be checked" });
    await analysed.or(notChecked).first().waitFor({ timeout: Number(process.env.CHECK_TIMEOUT_MS ?? 300000) });
    if (await notChecked.isVisible()) throw new Error(`check refused safely: ${(await page.getByRole("alert").first().textContent()) ?? ""}`);
    row.checkS = secs(t);
    t = Date.now();
    await page.getByRole("button", { name: "Fix all safe problems" }).click();
    const apply = page.getByRole("dialog").getByRole("button", { name: /^Apply all fixes/ });
    await apply.waitFor({ timeout: 300000 });
    await apply.click();
    await page.getByRole("dialog").waitFor({ state: "detached", timeout: 300000 });
    row.fixS = secs(t);
    t = Date.now();
    await page.getByText(/These results include your changes/).waitFor({ timeout: 300000 });
    row.recheckS = secs(t);
    t = Date.now();
    const download = page.waitForEvent("download", { timeout: 300000 });
    await page.getByRole("button", { name: kind === "csv" ? "Download corrected CSV" : "Download corrected file" }).click();
    if (kind === "xlsx") await page.getByRole("dialog").getByRole("button", { name: "Download Excel file" }).click();
    const dl = await download;
    await page.getByRole("heading", { name: "Export successful" }).waitFor({ timeout: 300000 });
    row.exportS = secs(t);
    const out = path.join(DIR, `out-${name.replace(/\W+/g, "_")}.${kind}`);
    await dl.saveAs(out);
    if (kind === "csv") {
      const head = readFileSync(out).subarray(0, 3);
      let lines = 0;
      await new Promise<void>((res) => createReadStream(out).on("data", (d) => { for (const b of d as Buffer) if (b === 10) lines++; }).on("end", () => res()));
      const bom = head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf;
      row.verified = `${bom ? "BOM ok" : "NO BOM"}, ${lines.toLocaleString("en-US")} lines${expectRows ? ` (≤ ${(expectRows + 1).toLocaleString("en-US")} before fixes)` : ""}, ${(statSync(out).size / MB).toFixed(0)} MB`;
    } else row.verified = `${(statSync(out).size / MB).toFixed(1)} MB xlsx`;
    rmSync(out, { force: true });
    row.outcome = crashed ? "CRASHED" : "ok";
  } catch (err) {
    if (process.env.SHOT_DIR) await page.screenshot({ path: path.join(process.env.SHOT_DIR, `fail-${name.replace(/\W+/g, "_")}.png`), fullPage: true }).catch(() => {});
    // (Next.js has an empty role="alert" route announcer on every page, so look for the message text too.)
    const alert =
      (await page.getByRole("alert").filter({ hasText: /\S/ }).first().textContent({ timeout: 1000 }).catch(() => null)) ||
      (await page.getByText(/too large|couldn.t|can.t be/i).first().textContent({ timeout: 1000 }).catch(() => null));
    const msg = String(err);
    row.outcome = crashed ? "CRASHED (tab)" : msg.includes("refused safely") ? msg.replace(/^Error: /, "").slice(0, 160) : alert ? `stopped safely: ${alert.trim().slice(0, 140)}` : `failed: ${msg.slice(0, 140)}`;
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
  const file = path.join(DIR, `planted-${size}mb.csv`);
  const rows = writeCsv(file, size * MB);
  await run(`CSV ${size} MB (${rows.toLocaleString("en-US")} rows)`, file, "csv", rows);
  rmSync(file, { force: true });
}
if (process.env.XLSX) {
  const file = path.join(DIR, "planted.xlsx");
  writeXlsx(file, 600_000);
  await run(`XLSX ${(statSync(file).size / MB).toFixed(0)} MB (600,000 rows)`, file, "xlsx");
  rmSync(file, { force: true });
}
await browser.close();
console.log("\n| File | Outcome | Open | Check | Fix all | Re-check | Create + verify + download | Peak extra memory | Downloaded file | Original unchanged |\n|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  console.log(`| ${r.name} | ${r.outcome} | ${r.openS ?? "—"}s | ${r.checkS ?? "—"}s | ${r.fixS ?? "—"}s | ${r.recheckS ?? "—"}s | ${r.exportS ?? "—"}s | ${r.peakMB} MB | ${r.verified ?? "—"} | ${r.shaOk ? "yes" : "NO"} |`);
}
