/**
 * Stage 16 large-file test: Split File in Chromium. It opens a file, chooses how to split, and
 * downloads all parts as one .zip, measuring time and peak renderer memory. It unzips the
 * download and checks every part (column names first, exact line counts, every row once),
 * and checks that the original is unchanged (SHA-256).
 * Cases: "rows" (150 MB CSV, 1,000,000 rows per part), "many" (the same file into 1,000
 * parts), "column" (the same file, one part per value of a column with 60 values) and
 * "excel" (2,100,000 rows into 2 Excel parts, each over one sheet's 1,048,576 rows).
 * Usage: start the app, then `npm run test:split-file-perf` (CASES=rows,many,column,excel
 * picks cases; HEAP_MB=512 imitates a low-memory device). Linux only (memory is read with `ps`).
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
const CASES = (process.env.CASES ?? "rows,many,column,excel").split(",");
const DIR = path.join(tmpdir(), "datafixer-split-perf");
const MB = 1024 * 1024;
mkdirSync(DIR, { recursive: true });

/** A CSV file of about `bytes` (or exactly `rows` data rows), with a city column of 60 values. Returns data rows. */
function writeCsv(file: string, o: { bytes?: number; rows?: number }): number {
  const fd = openSync(file, "w");
  let written = writeSync(fd, "id,name,city,amount\n");
  let rows = 0;
  for (let i = 0; ; ) {
    const lines: string[] = [];
    for (let k = 0; k < 5000; k++, i++) {
      if (o.rows !== undefined && i >= o.rows) break;
      lines.push(`${String(i).padStart(8, "0")},Asha ${i % 5000},City${i % 60},${(i % 10000) * 1.5}`);
    }
    if (!lines.length) break;
    const buf = Buffer.from(lines.join("\n") + "\n");
    if (o.bytes !== undefined) {
      const room = o.bytes - written;
      const cut = buf.length <= room ? buf.length : buf.lastIndexOf(10, room) + 1;
      if (cut <= 0) break;
      written += writeSync(fd, buf, 0, cut);
      rows += buf.subarray(0, cut).toString().split("\n").length - 1;
      if (cut < buf.length) break;
    } else {
      written += writeSync(fd, buf);
      rows += lines.length;
    }
  }
  closeSync(fd);
  return rows;
}

const sha256 = (file: string) =>
  new Promise<string>((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file)
      .on("data", (d) => h.update(d))
      .on("end", () => resolve(h.digest("hex")))
      .on("error", reject);
  });
function rendererRssMB(): number {
  let kb = 0;
  for (const line of execSync("ps -eo rss,args").toString().split("\n")) if (line.includes("--type=renderer")) kb += Number(line.trim().split(/\s+/)[0]) || 0;
  return Math.round(kb / 1024);
}

/**
 * Unzip the download (Python's zipfile, streaming) and check every part: CSV parts start with the
 * column names and their data rows add up, with every id exactly once; Excel parts are read with
 * openpyxl (read-only) and their sheets' rows counted.
 */
function checkZip(zip: string, kind: "csv" | "xlsx", rows: number): { ok: boolean; text: string } {
  const py = `
import sys, zipfile, json
z = zipfile.ZipFile(sys.argv[1]); kind = sys.argv[2]
names = z.namelist(); data = 0; bad = []; ids = bytearray(${rows}); dup = 0
for n in names:
    if kind == "csv":
        with z.open(n) as f:
            first = f.readline().decode("utf-8-sig").rstrip("\\r\\n")
            if first != "id,name,city,amount": bad.append(n)
            for line in f:
                data += 1
                i = int(line[:8])
                if ids[i]: dup += 1
                ids[i] = 1
    else:
        import openpyxl, io
        wb = openpyxl.load_workbook(io.BytesIO(z.read(n)), read_only=True)
        for ws in wb.worksheets:
            it = ws.iter_rows(values_only=True)
            head = next(it)
            if list(head) != ["id", "name", "city", "amount"]: bad.append(n + ":" + ws.title)
            for r in it:
                data += 1
                i = int(r[0])
                if ids[i]: dup += 1
                ids[i] = 1
missing = len(ids) - sum(ids)
print(json.dumps({"parts": len(names), "data": data, "bad": bad[:3], "dup": dup, "missing": missing, "first": names[0], "last": names[-1]}))
`;
  const r = spawnSync("python3", ["-I", "-c", py, zip, kind], { encoding: "utf8", maxBuffer: 16 * MB });
  if (r.status !== 0) return { ok: false, text: `unzip check failed: ${r.stderr.slice(-300)}` };
  const j = JSON.parse(r.stdout) as { parts: number; data: number; bad: string[]; dup: number; missing: number; first: string; last: string };
  const ok = j.data === rows && j.bad.length === 0 && j.dup === 0 && j.missing === 0;
  return {
    ok,
    text: `${j.parts.toLocaleString("en-US")} parts (${j.first} … ${j.last}), ${ok ? "every row exactly once" : `WRONG: ${j.data} rows, ${j.dup} repeated, ${j.missing} missing, bad header ${j.bad.join(" ")}`}, column names in every ${kind === "xlsx" ? "sheet" : "part"}`,
  };
}

interface Row {
  name: string;
  outcome: string;
  openS?: number;
  zipS?: number;
  zipMB?: number;
  peakMB: number;
  verified: string;
  shaOk: boolean;
}

const browser = await chromium.launch({ args: HEAP_MB ? [`--js-flags=--max-old-space-size=${HEAP_MB}`] : [] });
const results: Row[] = [];
type Page = Awaited<ReturnType<typeof browser.newPage>>;

async function run(name: string, file: string, rows: number, choose: (page: Page) => Promise<void>, parts: number, kind: "csv" | "xlsx") {
  const before = await sha256(file);
  const context = await browser.newContext({ acceptDownloads: true });
  const page: Page = await context.newPage();
  let crashed = false;
  page.on("crash", () => (crashed = true));
  await page.goto(`${BASE}/split-file`, { waitUntil: "networkidle" });
  const baseline = rendererRssMB();
  let peak = baseline;
  const poll = setInterval(() => (peak = Math.max(peak, rendererRssMB())), 250);
  const row: Row = { name, outcome: "", peakMB: 0, verified: "—", shaOk: false };
  try {
    const t = Date.now();
    await page.locator("input[type=file]").setInputFiles(file);
    const ready = page.getByRole("heading", { name: "Split into parts" });
    const refused = page.getByRole("heading", { name: "This file couldn't be opened" });
    await ready.or(refused).first().waitFor({ timeout: 600000 });
    if (await refused.isVisible()) throw new Error(`refused safely: ${(await page.getByRole("alert").filter({ hasText: /\S/ }).first().textContent().catch(() => "")) ?? ""}`);
    row.openS = Math.round((Date.now() - t) / 100) / 10;
    await choose(page);
    await page.waitForFunction((k: number) => document.querySelectorAll("[aria-label='Parts'] li").length === k, parts, { timeout: 120000 });
    const t2 = Date.now();
    const dl = page.waitForEvent("download", { timeout: 1200000 });
    await page.getByRole("button", { name: "Download all parts (.zip)" }).click();
    const failed = page.getByRole("alert").filter({ hasText: /\S/ });
    const d = await Promise.race([dl, failed.first().waitFor({ timeout: 1200000 }).then(async () => { throw new Error(`refused safely: ${await failed.first().textContent()}`); })]);
    const out = path.join(DIR, "out.zip");
    await d.saveAs(out);
    row.zipS = Math.round((Date.now() - t2) / 100) / 10;
    row.zipMB = Math.round(statSync(out).size / MB);
    const v = checkZip(out, kind, rows);
    row.verified = v.text;
    rmSync(out, { force: true });
    row.outcome = crashed ? "CRASHED" : v.ok ? "ok" : "WRONG";
  } catch (err) {
    const msg = String(err);
    row.outcome = crashed ? "CRASHED (tab)" : msg.includes("refused safely") ? `stopped safely: ${msg.replace(/^Error: refused safely: /, "").slice(0, 170)}` : `failed: ${msg.slice(0, 170)}`;
  }
  clearInterval(poll);
  row.peakMB = peak - baseline;
  row.shaOk = (await sha256(file)) === before;
  results.push(row);
  console.log(JSON.stringify(row));
  await context.close();
}

const rowsPerPart = (n: number) => async (page: Page) => {
  await page.getByLabel("Rows per part").fill(String(n));
};
const big = path.join(DIR, "big.csv");
let bigRows = 0;
if (CASES.some((c) => c === "rows" || c === "many" || c === "column")) bigRows = writeCsv(big, { bytes: 150 * MB - 4096 });
const bigName = bigRows ? `CSV ${Math.round(statSync(big).size / MB)} MB (${bigRows.toLocaleString("en-US")} rows)` : "";

if (CASES.includes("rows")) {
  const n = Math.ceil(bigRows / 1_000_000);
  await run(`${bigName}, 1,000,000 rows per part`, big, bigRows, rowsPerPart(1_000_000), n, "csv");
}
if (CASES.includes("many")) {
  const per = Math.ceil(bigRows / 1000);
  await run(`${bigName}, ${per.toLocaleString("en-US")} rows per part (1,000 parts)`, big, bigRows, rowsPerPart(per), Math.ceil(bigRows / per), "csv");
}
if (CASES.includes("column")) {
  await run(`${bigName}, one part per city (60 values)`, big, bigRows, async (page) => {
    await page.getByLabel("One part for each value in a column").check();
    await page.getByLabel("Column", { exact: true }).selectOption({ index: 2 });
  }, 60, "csv");
}
rmSync(big, { force: true });
if (CASES.includes("excel")) {
  const f = path.join(DIR, "excel.csv");
  const rows = writeCsv(f, { rows: 2_100_000 });
  await run(`CSV ${Math.round(statSync(f).size / MB)} MB (2,100,000 rows) into 2 Excel parts of 1,050,000 rows`, f, rows, async (page) => {
    await page.getByLabel("A number of equal parts").check();
    await page.getByLabel("Number of parts (2–1,000)").fill("2");
    await page.getByLabel("Excel workbooks (.xlsx)").check();
  }, 2, "xlsx");
  rmSync(f, { force: true });
}

await browser.close();
console.log(`\nChromium headless${HEAP_MB ? `, JS heap capped at ${HEAP_MB} MB` : ""}`);
console.log("\n| File and choice | Outcome | Open | All parts (create + check + .zip) | .zip | Peak extra memory | Parts checked after download | Original unchanged |\n|---|---|---|---|---|---|---|---|");
for (const r of results)
  console.log(`| ${r.name} | ${r.outcome} | ${r.openS ?? "—"}s | ${r.zipS ?? "—"}s | ${r.zipMB ?? "—"} MB | ${r.peakMB} MB | ${r.verified} | ${r.shaOk ? "yes" : "NO"} |`);
process.exit(results.some((r) => r.outcome.startsWith("failed") || r.outcome.startsWith("CRASHED") || r.outcome === "WRONG" || !r.shaOk) ? 1 : 0);
