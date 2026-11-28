/**
 * Stage 17 large-file test: Compare Spreadsheets in Chromium with two CSV files of about 75 MB.
 * The newer file has its columns in another order and its rows in another order (blocks reversed),
 * every 1,000th row changed, every 200th row removed, and new rows at the end. It measures the
 * comparison (by the suggested key, then by whole rows, the files kept), the CSV report with every
 * row and the Excel report without unchanged rows, peak renderer memory, exact counts, and that
 * both files are unchanged (SHA-256). The reports are read back after download (Python).
 * Usage: start the app, then `npm run test:compare-perf` (HEAP_MB=512 imitates a low-memory
 * device; MB=75 sets the size of each file). Linux only (memory is read with `ps`).
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
const SIZE_MB = Number(process.env.MB ?? 75);
const DIR = path.join(tmpdir(), "datafixer-compare-perf");
const MB = 1024 * 1024;
mkdirSync(DIR, { recursive: true });

const line = (i: number, changed = false) => ({ id: String(i).padStart(8, "0"), name: `Asha ${i % 5000}`, city: `City${i % 400}`, amount: changed ? "changed" : String((i % 10000) * 1.5) });
// About 37 bytes per row.
const N = Math.floor((SIZE_MB * MB) / 37);
const ADDED = 10_000;
const isRemoved = (i: number) => i % 200 === 7;
const isChanged = (i: number) => i % 1000 === 3;

function write(file: string, rows: Iterable<string>, header: string) {
  const fd = openSync(file, "w");
  writeSync(fd, header + "\n");
  let buf: string[] = [];
  for (const r of rows) {
    buf.push(r);
    if (buf.length === 20000) {
      writeSync(fd, buf.join("\n") + "\n");
      buf = [];
    }
  }
  if (buf.length) writeSync(fd, buf.join("\n") + "\n");
  closeSync(fd);
}
const older = path.join(DIR, "older.csv");
const newer = path.join(DIR, "newer.csv");
write(older, (function* () {
  for (let i = 0; i < N; i++) {
    const l = line(i);
    yield `${l.id},${l.name},${l.city},${l.amount}`;
  }
})(), "id,name,city,amount");
// Newer: columns name,id,amount,city; rows in blocks of 10,000 written in reverse block order.
write(newer, (function* () {
  const blocks = Math.ceil(N / 10_000);
  for (let b = blocks - 1; b >= 0; b--) {
    for (let i = b * 10_000; i < Math.min(N, (b + 1) * 10_000); i++) {
      if (isRemoved(i)) continue;
      const l = line(i, isChanged(i));
      yield `${l.name},${l.id},${l.amount},${l.city}`;
    }
  }
  for (let i = N; i < N + ADDED; i++) {
    const l = line(i);
    yield `${l.name},${l.id},${l.amount},${l.city}`;
  }
})(), "name,id,amount,city");
let removed = 0;
let changed = 0;
for (let i = 0; i < N; i++) {
  if (isRemoved(i)) removed++;
  else if (isChanged(i)) changed++;
}
const unchanged = N - removed - changed;
const expectKey = [changed, ADDED, removed, unchanged];
const expectWhole = [0, ADDED + changed, removed + changed, unchanged];

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
  for (const l of execSync("ps -eo rss,args").toString().split("\n")) if (l.includes("--type=renderer")) kb += Number(l.trim().split(/\s+/)[0]) || 0;
  return Math.round(kb / 1024);
}
const fmt = (n: number) => n.toLocaleString("en-US");

const before = await Promise.all([sha256(older), sha256(newer)]);
const browser = await chromium.launch({ args: HEAP_MB ? [`--js-flags=--max-old-space-size=${HEAP_MB}`] : [] });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();
let crashed = false;
page.on("crash", () => (crashed = true));
await page.goto(`${BASE}/compare-files`, { waitUntil: "networkidle" });
const baseline = rendererRssMB();
let peak = baseline;
const poll = setInterval(() => (peak = Math.max(peak, rendererRssMB())), 250);
const steps: string[] = [];
const checks: string[] = [];
let outcome = "ok";
const counts = async (): Promise<number[]> =>
  Promise.all(["Changed rows", "Added rows", "Removed rows", "Unchanged rows"].map(async (l) => Number((await page.locator(`dt:text-is("${l}") + dd`).textContent())?.replace(/,/g, ""))));
const timed = async (label: string, fn: () => Promise<void>) => {
  const t = Date.now();
  await fn();
  steps.push(`${label} ${Math.round((Date.now() - t) / 100) / 10}s`);
};
try {
  await page.getByLabel("Choose the older file").setInputFiles(older);
  await page.getByLabel("Choose the newer file").setInputFiles(newer);
  await page.getByText("newer.csv", { exact: true }).waitFor({ timeout: 60000 });
  await timed("compare by key", async () => {
    await page.getByRole("button", { name: "Compare files" }).click();
    const done = page.getByRole("heading", { name: "Comparison" });
    const failed = page.getByRole("alert").filter({ hasText: /\S/ });
    await done.or(failed).first().waitFor({ timeout: 900000 });
    if (await failed.first().isVisible().catch(() => false)) throw new Error(`refused safely: ${await failed.first().textContent()}`);
  });
  const key = await page.getByLabel("Match rows by").inputValue();
  const got = await counts();
  checks.push(`key “${key}”: ${JSON.stringify(got) === JSON.stringify(expectKey) ? "counts exact" : `WRONG ${JSON.stringify(got)} instead of ${JSON.stringify(expectKey)}`} (${fmt(got[0]!)} changed, ${fmt(got[1]!)} added, ${fmt(got[2]!)} removed, ${fmt(got[3]!)} unchanged)`);
  if (key !== "id" || JSON.stringify(got) !== JSON.stringify(expectKey)) outcome = "WRONG";

  await timed("CSV report, every row", async () => {
    const dl = page.waitForEvent("download", { timeout: 900000 });
    await page.getByRole("button", { name: "Download CSV report" }).click();
    const d = await dl;
    const out = path.join(DIR, "report.csv");
    await d.saveAs(out);
    const py = `
import sys, collections
c = collections.Counter(); n = 0
with open(sys.argv[1], encoding="utf-8-sig") as f:
    head = f.readline().rstrip("\\r\\n")
    for line in f:
        n += 1; c[line.split(",", 1)[0]] += 1
print(head); print(n, c["Changed"], c["Added"], c["Removed"], c["Unchanged"])
`;
    const r = spawnSync("python3", ["-I", "-c", py, out], { encoding: "utf8" });
    const [head, nums] = r.stdout.trim().split("\n");
    const [n, ch, ad, rm, un] = (nums ?? "").split(" ").map(Number);
    const ok = head === "Change,name,id,amount,city,What changed" && JSON.stringify([ch, ad, rm, un]) === JSON.stringify(expectKey) && n === ADDED + removed + changed + unchanged;
    checks.push(`CSV report ${(statSync(out).size / MB).toFixed(0)} MB: ${ok ? `exactly ${fmt(n!)} rows with the right Change labels` : `WRONG ${head} ${nums}`}`);
    if (!ok) outcome = "WRONG";
    rmSync(out, { force: true });
  });

  await page.getByLabel(/^Include unchanged rows/).uncheck();
  await timed("Excel report, differences only", async () => {
    const dl = page.waitForEvent("download", { timeout: 900000 });
    await page.getByRole("button", { name: "Download Excel report (.xlsx)" }).click();
    const d = await dl;
    const out = path.join(DIR, "report.xlsx");
    await d.saveAs(out);
    const py = `
import sys, openpyxl
ws = openpyxl.load_workbook(sys.argv[1], read_only=True).active
n = 0; ch = 0; coloured = 0
for r in ws.iter_rows(min_row=2):
    n += 1
    if r[0].value == "Changed":
        ch += 1
        if r[3].fill and r[3].fill.fgColor and r[3].fill.fgColor.rgb == "FFFFF2CC": coloured += 1
print(n, ch, coloured)
`;
    const r = spawnSync("python3", ["-I", "-c", py, out], { encoding: "utf8", timeout: 600000 });
    const [n, ch, col] = r.stdout.trim().split(" ").map(Number);
    const ok = n === ADDED + removed + changed && ch === changed && col === changed;
    checks.push(`Excel report ${(statSync(out).size / MB).toFixed(1)} MB: ${ok ? `${fmt(n!)} rows, every changed amount highlighted` : `WRONG ${r.stdout.trim()} ${r.stderr.slice(-200)}`}`);
    if (!ok) outcome = "WRONG";
    rmSync(out, { force: true });
  });

  await timed("whole rows (files kept)", async () => {
    await page.getByLabel("Match rows by").selectOption({ label: "Whole rows (no key column)" });
    await page.getByText("Comparing again…").waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
    await page.getByText("Comparing again…").waitFor({ state: "hidden", timeout: 900000 });
  });
  const whole = await counts();
  checks.push(`whole rows: ${JSON.stringify(whole) === JSON.stringify(expectWhole) ? "counts exact" : `WRONG ${JSON.stringify(whole)} instead of ${JSON.stringify(expectWhole)}`}`);
  if (JSON.stringify(whole) !== JSON.stringify(expectWhole)) outcome = "WRONG";
} catch (err) {
  const msg = String(err);
  outcome = crashed ? "CRASHED (tab)" : msg.includes("refused safely") ? `stopped safely: ${msg.replace(/^Error: refused safely: /, "").slice(0, 170)}` : `failed: ${msg.slice(0, 200)}`;
}
clearInterval(poll);
const after = await Promise.all([sha256(older), sha256(newer)]);
await browser.close();
const shaOk = after[0] === before[0] && after[1] === before[1];
const name = `older ${(statSync(older).size / MB).toFixed(0)} MB (${fmt(N)} rows) vs newer ${(statSync(newer).size / MB).toFixed(0)} MB (${fmt(N - removed + ADDED)} rows)`;
rmSync(older, { force: true });
rmSync(newer, { force: true });
console.log(`\nChromium headless${HEAP_MB ? `, JS heap capped at ${HEAP_MB} MB` : ""}`);
console.log("\n| Files | Outcome | Steps | Peak extra memory | Checked | Files unchanged |\n|---|---|---|---|---|---|");
console.log(`| ${name} | ${crashed ? "CRASHED" : outcome} | ${steps.join(", ") || "—"} | ${peak - baseline} MB | ${checks.join("; ") || "—"} | ${shaOk ? "yes" : "NO"} |`);
process.exit(outcome.startsWith("failed") || outcome.startsWith("CRASHED") || outcome === "WRONG" || crashed || !shaOk ? 1 : 0);
