/**
 * Performance harness: generates real CSV/XLSX files at 50/100/150 MB and
 * opens them through the UI in Chromium, measuring:
 *  - outcome (opened / clear error) and processing time
 *  - peak renderer memory (RSS of Chromium renderer processes; the worker
 *    runs inside the renderer process)
 *  - main-thread responsiveness (longest gap between animation frames and
 *    longest "long task")
 *  - cancellation latency and memory released after cancel
 *  - sort/search latency once a file is open
 *  - SHA-256 of every file before and after
 *
 * Usage: start the app, then `npm run test:perf`. Needs ~2 GB of temp disk.
 * HEAP_MB=512 caps the JS heap to imitate a low-memory device.
 * Linux only (memory is read with `ps`).
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { closeSync, createReadStream, mkdirSync, openSync, rmSync, statSync, writeSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Zip, ZipDeflate, strToU8 } from "fflate";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DIR = process.env.PERF_DIR ?? path.join(tmpdir(), "datafixer-perf");
const HEAP_MB = process.env.HEAP_MB ? Number(process.env.HEAP_MB) : null;
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const MB = 1024 * 1024;
mkdirSync(DIR, { recursive: true });

// ---------------------------------------------------------------- generators
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const words = ["alpha", "bravo", "delta", "echo", "kilo", "lima", "oscar", "papa", "romeo", "tango", "Zürich", "café", "naïve"];

function writeCsv(file: string, targetBytes: number, kind: "normal" | "wide" | "unicode") {
  const fd = openSync(file, "w");
  let written = 0;
  const header =
    kind === "wide" ? Array.from({ length: 40 }, (_, i) => `c${i}`).join(",") + "\n" : kind === "unicode" ? "id,名前,都市,note\n" : "id,name,email,city,amount,date\n";
  written += writeSync(fd, header);
  let i = 0;
  while (written < targetBytes) {
    const lines: string[] = [];
    for (let k = 0; k < 5000; k++, i++) {
      if (kind === "wide") lines.push(Array.from({ length: 40 }, () => Math.floor(rnd() * 1000)).join(","));
      else if (kind === "unicode") lines.push(`${i},名前 ${Math.floor(rnd() * 1e5)},東京都 ${i % 50},"${words[i % words.length]} ""quoted"" ${Math.floor(rnd() * 1e6)}"`);
      else lines.push(`${i},${words[i % words.length]} ${Math.floor(rnd() * 1e6)},user${Math.floor(rnd() * 1e7)}@example.com,City ${i % 500},${(rnd() * 1e5).toFixed(2)},2024-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`);
    }
    const buf = Buffer.from(lines.join("\n") + "\n");
    const n = Math.min(buf.length, targetBytes - written);
    // Cut at a line end so the file stays valid.
    const cut = n === buf.length ? n : buf.lastIndexOf(10, n) + 1 || n;
    written += writeSync(fd, buf, 0, cut);
    if (cut < buf.length) break;
  }
  closeSync(fd);
}

const col = (c: number) => {
  let s = "";
  for (c++; c > 0; c = Math.floor((c - 1) / 26)) s = String.fromCharCode(65 + ((c - 1) % 26)) + s;
  return s;
};

/** Stream an XLSX of roughly targetBytes compressed size. */
function writeXlsx(file: string, targetBytes: number, opts: { sheets: number; kind: "normal" | "compressed" | "formulas" }) {
  const fd = openSync(file, "w");
  let written = 0;
  const zip = new Zip((err, data) => {
    if (err) throw err;
    written += writeSync(fd, data);
  });
  const addText = (name: string, text: string) => {
    const f = new ZipDeflate(name, { level: 6 });
    zip.add(f);
    f.push(strToU8(text), true);
  };
  const names = Array.from({ length: opts.sheets }, (_, i) => `Sheet${i + 1}`);
  addText("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`);
  addText("_rels/.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`);
  addText("xl/workbook.xml", `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${n}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`);
  addText("xl/_rels/workbook.xml.rels", `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}</Relationships>`);
  let uncompressed = 0;
  for (let s = 0; s < opts.sheets; s++) {
    const f = new ZipDeflate(`xl/worksheets/sheet${s + 1}.xml`, { level: opts.kind === "compressed" ? 9 : 6 });
    zip.add(f);
    f.push(strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>`));
    // Stay safely under the target (the 150 MB limit is exact): stop ~3 MB early.
    const sheetTarget = (targetBytes * (s + 1)) / opts.sheets - 3 * MB;
    let r = 1;
    // Safety cap on uncompressed output for the compressed case (generation time).
    while (written < sheetTarget && uncompressed < 6 * 1024 * MB) {
      const parts: string[] = [];
      for (let k = 0; k < 2000; k++, r++) {
        if (opts.kind === "compressed") {
          parts.push(`<row r="${r}"><c r="A${r}"><v>1</v></c><c r="B${r}" t="inlineStr"><is><t>same text</t></is></c><c r="C${r}"><v>1</v></c><c r="D${r}"><v>1</v></c></row>`);
        } else {
          const cells: string[] = [];
          for (let c = 0; c < 8; c++) {
            if (opts.kind === "formulas" && c === 7) cells.push(`<c r="${col(c)}${r}"><f>SUM(B${r}:G${r})</f><v>${Math.floor(rnd() * 1e6)}</v></c>`);
            else if (c % 2 === 0) cells.push(`<c r="${col(c)}${r}" t="inlineStr"><is><t>${words[Math.floor(rnd() * words.length)]} ${Math.floor(rnd() * 1e6)}</t></is></c>`);
            else cells.push(`<c r="${col(c)}${r}"><v>${(rnd() * 1e5).toFixed(2)}</v></c>`);
          }
          parts.push(`<row r="${r}">${cells.join("")}</row>`);
        }
      }
      const chunk = parts.join("");
      uncompressed += chunk.length;
      f.push(strToU8(chunk));
    }
    f.push(strToU8(`</sheetData></worksheet>`), true);
  }
  zip.end();
  closeSync(fd);
  return uncompressed;
}

// ---------------------------------------------------------------- measuring
function rendererRssMB(): number {
  try {
    const out = execSync("ps -eo rss=,args=", { encoding: "utf8", maxBuffer: 16 * MB });
    let kb = 0;
    for (const line of out.split("\n")) if (line.includes("--type=renderer")) kb += Number(line.trim().split(/\s+/)[0]) || 0;
    return kb / 1024;
  } catch {
    return NaN;
  }
}

function sha256(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

interface Result {
  name: string;
  sizeMB: number;
  outcome: string;
  seconds: number;
  peakRendererMB: number;
  baselineMB: number;
  maxFrameGapMs: number;
  longestTaskMs: number;
  /** Error Detector scan (runs automatically after opening). */
  scanSeconds?: number;
  scanOutcome?: string;
  sortMs?: number;
  searchMs?: number;
  cancelMs?: number;
  memAfterCancelMB?: number;
  shaUnchanged: boolean;
}

const browser = await chromium.launch({ args: HEAP_MB ? [`--js-flags=--max-old-space-size=${HEAP_MB}`] : [] });
const results: Result[] = [];

async function run(name: string, file: string, opts: { cancelAt?: number } = {}): Promise<void> {
  const before = await sha256(file);
  const context = await browser.newContext();
  const page = await context.newPage();
  let crashed = false;
  page.on("crash", () => (crashed = true));
  await page.goto(`${BASE}/spreadsheet-error-detector`, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const w = window as unknown as { __gap: number; __long: number; __last: number };
    w.__gap = 0;
    w.__long = 0;
    w.__last = performance.now();
    const loop = (t: number) => {
      w.__gap = Math.max(w.__gap, t - w.__last);
      w.__last = t;
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => (w.__long = Math.max(w.__long, e.duration)))).observe({ type: "longtask" });
    } catch {
      /* not supported */
    }
  });
  const baseline = rendererRssMB();
  let peak = baseline;
  const poll = setInterval(() => (peak = Math.max(peak, rendererRssMB())), 250);
  // Reset frame stats right before the work starts (page load jank excluded).
  await page.evaluate(() => {
    const w = window as unknown as { __gap: number; __long: number; __last: number };
    w.__gap = 0;
    w.__long = 0;
    w.__last = performance.now();
  });
  const t0 = Date.now();
  await page.locator("input[type=file]").setInputFiles(file);

  let outcome = "";
  let cancelMs: number | undefined;
  let memAfterCancelMB: number | undefined;
  if (opts.cancelAt !== undefined) {
    await page.waitForFunction(
      (pct: number) => Number(document.querySelector("[role=progressbar]")?.getAttribute("aria-valuenow") ?? 0) >= pct,
      opts.cancelAt,
      { timeout: 120000 },
    ).catch(() => {});
    const tc = Date.now();
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByText("Processing cancelled").waitFor({ timeout: 10000 });
    cancelMs = Date.now() - tc;
    await page.waitForTimeout(2000);
    memAfterCancelMB = Math.round(rendererRssMB() - baseline);
    outcome = "cancelled";
  } else {
    outcome = await Promise.race([
      page.getByText("Opened on your device").waitFor({ timeout: 300000 }).then(async () => {
        // Sheet-level refusal messages only (not the general "large file" notice).
        const status = await page.getByRole("status").filter({ hasText: /too large to open safely|more data than a web browser|need much more memory|needs more memory than/ }).first().textContent({ timeout: 500 }).catch(() => null);
        return status ? `file info shown; sheet refused: ${status.slice(0, 80)}…` : "opened";
      }),
      page.getByText("This file couldn't be opened").waitFor({ timeout: 300000 }).then(async () => `error: ${(await page.getByRole("alert").first().textContent())?.slice(0, 90)}…`),
      page.getByRole("alert").filter({ hasText: "maximum file size" }).waitFor({ timeout: 300000 }).then(() => "rejected at upload: over 150 MB"),
    ]).catch(() => (crashed ? "TAB CRASHED" : "timeout"));
  }
  const seconds = (Date.now() - t0) / 1000;
  // The Error Detector scans automatically once the file is open: time it too.
  let scanSeconds: number | undefined;
  let scanOutcome: string | undefined;
  if (outcome === "opened") {
    const ts0 = Date.now();
    scanOutcome = await Promise.race([
      page.getByRole("heading", { name: /^(Spreadsheet analysis complete|No problems found)$/ }).waitFor({ timeout: 600000 }).then(async () => `${await page.locator("section[aria-labelledby=scan-results-heading] article").count()} issue types`),
      page.getByRole("heading", { name: "This sheet couldn't be checked" }).waitFor({ timeout: 600000 }).then(async () => `refused: ${(await page.getByRole("alert").first().textContent())?.slice(0, 70)}…`),
    ]).catch(() => (crashed ? "TAB CRASHED" : "timeout"));
    scanSeconds = Math.round(((Date.now() - ts0) / 1000) * 10) / 10;
  }
  clearInterval(poll);
  const frame = crashed ? { gap: NaN, long: NaN } : await page.evaluate(() => {
    const w = window as unknown as { __gap: number; __long: number };
    return { gap: w.__gap, long: w.__long };
  });

  let sortMs: number | undefined;
  let searchMs: number | undefined;
  if (outcome === "opened") {
    // Sort by the 2nd column: wait until the first visible row actually changes.
    const firstRow = () => page.locator("tbody tr").first().innerText();
    const beforeSort = await firstRow();
    const ts = Date.now();
    await page.locator("thead th button").nth(1).click();
    await page.waitForFunction(
      (prev: string) => (document.querySelector("tbody tr") as HTMLElement | null)?.innerText !== prev,
      beforeSort,
      { timeout: 120000, polling: 20 },
    );
    sortMs = Date.now() - ts;
    const tq = Date.now();
    await page.getByLabel("Search in data").fill("zzz-no-match");
    await page.getByText(/No rows contain/).waitFor({ timeout: 120000 });
    searchMs = Date.now() - tq - 300; // minus debounce
  }
  await context.close();
  const r: Result = {
    name,
    sizeMB: Math.round(statSync(file).size / MB),
    outcome,
    seconds: Math.round(seconds * 10) / 10,
    peakRendererMB: Math.round(peak),
    baselineMB: Math.round(baseline),
    maxFrameGapMs: Math.round(frame.gap),
    longestTaskMs: Math.round(frame.long),
    scanSeconds,
    scanOutcome,
    sortMs,
    searchMs,
    cancelMs,
    memAfterCancelMB,
    shaUnchanged: (await sha256(file)) === before,
  };
  results.push(r);
  console.log(JSON.stringify(r));
}

const cases: { name: string; make: (f: string) => unknown; ext: string; cancelAt?: number }[] = [
  { name: "csv-normal-50", ext: "csv", make: (f) => writeCsv(f, 50 * MB, "normal") },
  { name: "csv-normal-100", ext: "csv", make: (f) => writeCsv(f, 100 * MB, "normal") },
  { name: "csv-normal-150", ext: "csv", make: (f) => writeCsv(f, 150 * MB, "normal") },
  { name: "csv-wide-150", ext: "csv", make: (f) => writeCsv(f, 150 * MB, "wide") },
  { name: "csv-unicode-100", ext: "csv", make: (f) => writeCsv(f, 100 * MB, "unicode") },
  { name: "csv-150-cancel", ext: "csv", make: (f) => writeCsv(f, 150 * MB, "normal"), cancelAt: 40 },
  { name: "xlsx-normal-10", ext: "xlsx", make: (f) => writeXlsx(f, 13 * MB, { sheets: 1, kind: "normal" }) },
  { name: "xlsx-normal-50", ext: "xlsx", make: (f) => writeXlsx(f, 50 * MB, { sheets: 1, kind: "normal" }) },
  { name: "xlsx-normal-100", ext: "xlsx", make: (f) => writeXlsx(f, 100 * MB, { sheets: 1, kind: "normal" }) },
  { name: "xlsx-normal-150", ext: "xlsx", make: (f) => writeXlsx(f, 150 * MB, { sheets: 1, kind: "normal" }) },
  { name: "xlsx-multisheet-150", ext: "xlsx", make: (f) => writeXlsx(f, 150 * MB, { sheets: 6, kind: "normal" }) },
  { name: "xlsx-formulas-50", ext: "xlsx", make: (f) => writeXlsx(f, 50 * MB, { sheets: 1, kind: "formulas" }) },
  { name: "xlsx-compressed-50", ext: "xlsx", make: (f) => writeXlsx(f, 50 * MB, { sheets: 1, kind: "compressed" }) },
  { name: "xlsx-150-cancel", ext: "xlsx", make: (f) => writeXlsx(f, 150 * MB, { sheets: 6, kind: "normal" }), cancelAt: 30 },
  // Genuine .xls via LibreOffice (needs python3 + openpyxl + soffice).
  { name: "xls-5", ext: "xls", make: (f) => makeXls(f, 5) },
  { name: "xls-20", ext: "xls", make: (f) => makeXls(f, 20) },
  { name: "xls-50", ext: "xls", make: (f) => makeXls(f, 50) },
  { name: "xls-100", ext: "xls", make: (f) => makeXls(f, 100) },
];

function makeXls(file: string, mb: number) {
  const script = path.join(import.meta.dirname, "fixtures", "make_large_xls.py");
  execFileSync("python3", [script, file, String(mb)], { stdio: "ignore", timeout: 3600_000 });
}

console.log(`Chromium headless${HEAP_MB ? `, JS heap capped at ${HEAP_MB} MB` : ""}`);
try {
  for (const c of cases) {
    if (ONLY && !ONLY.test(c.name)) continue;
    const file = path.join(DIR, `${c.name}.${c.ext}`);
    const tg = Date.now();
    const info = c.make(file);
    console.log(`# generated ${c.name}: ${(statSync(file).size / MB).toFixed(1)} MB${typeof info === "number" ? `, ${(info / MB).toFixed(0)} MB uncompressed XML` : ""} in ${((Date.now() - tg) / 1000).toFixed(0)}s`);
    await run(c.name, file, { cancelAt: c.cancelAt });
    rmSync(file);
  }
} finally {
  await browser.close();
  rmSync(DIR, { recursive: true, force: true });
}

console.log("\n| Case | Size | Outcome | Open | Scan | Scan result | Peak renderer RSS (baseline) | Max frame gap | Longest task | Sort | Search | Cancel | SHA-256 same |");
console.log("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
for (const r of results) {
  console.log(
    `| ${r.name} | ${r.sizeMB} MB | ${r.outcome} | ${r.seconds}s | ${r.scanSeconds !== undefined ? `${r.scanSeconds}s` : "—"} | ${r.scanOutcome ?? "—"} | ${r.peakRendererMB} MB (${r.baselineMB}) | ${r.maxFrameGapMs} ms | ${r.longestTaskMs} ms | ${r.sortMs !== undefined ? `${r.sortMs} ms` : "—"} | ${r.searchMs !== undefined ? `${r.searchMs} ms` : "—"} | ${r.cancelMs !== undefined ? `${r.cancelMs} ms (then ${r.memAfterCancelMB} MB above baseline)` : "—"} | ${r.shaUnchanged ? "yes" : "NO"} |`,
  );
}
process.exit(results.every((r) => r.shaUnchanged && !/CRASH|timeout/.test(r.outcome)) ? 0 : 1);
