/**
 * Browser test for the 150 MB file-size limit.
 * Generates real files at boundary sizes, selects them through the file picker
 * AND drag-and-drop, and checks acceptance/rejection, messages, main-thread
 * blocking and that source files are left unchanged.
 *
 * Usage: start the app, then `npm run test:large` (BASE_URL, LARGE_TEST_DIR optional).
 * Writes ~900 MB of temporary files, deleted at the end.
 */
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, openSync, writeSync, closeSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const { chromium } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const DIR = process.env.LARGE_TEST_DIR ?? path.join(tmpdir(), "datafixer-large-files");
const MB = 1024 * 1024;
const MAX = 157_286_400;

const cases = [
  { label: "50 MB", size: 50 * MB, ok: true, advisory: false },
  { label: "100 MB", size: 100 * MB, ok: true, advisory: true },
  { label: "149 MB", size: 149 * MB, ok: true, advisory: true },
  { label: "150 MB exactly", size: MAX, ok: true, advisory: true },
  { label: "150 MB + 1 byte", size: MAX + 1, ok: false },
  { label: "151 MB", size: 151 * MB, ok: false },
];

let passes = 0;
let failures = 0;
function check(cond, label) {
  cond ? passes++ : failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
}

/** Write a realistic CSV of exactly `size` bytes. */
function writeCsv(file, size) {
  const fd = openSync(file, "w");
  const header = "id,name,email,phone,signup_date,amount\n";
  const rows = [];
  for (let i = 0; i < 20000; i++) {
    rows.push(`${i},Customer ${i},user${i}@example.com,+1-555-${String(i % 10000).padStart(4, "0")},2024-0${(i % 9) + 1}-1${i % 10},${(i * 7.31).toFixed(2)}\n`);
  }
  const block = Buffer.from(rows.join(""));
  let written = writeSync(fd, header);
  while (written < size) {
    const n = Math.min(block.length, size - written);
    written += writeSync(fd, block, 0, n);
  }
  closeSync(fd);
}

function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = createHash("sha256");
    createReadStream(file).on("data", (d) => h.update(d)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

mkdirSync(DIR, { recursive: true });
const browser = await chromium.launch();

try {
  for (const c of cases) {
    console.log(`\n${c.label} (${c.size.toLocaleString("en-US")} bytes) — expect ${c.ok ? "accepted" : "rejected"}`);
    const file = path.join(DIR, `test-${c.size}.csv`);
    writeCsv(file, c.size);
    check(statSync(file).size === c.size, "generated file has the exact size");
    const before = await sha256(file);

    for (const method of ["browse", "drag-and-drop"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.goto(BASE + "/", { waitUntil: "networkidle" });

      // Record main-thread long tasks during validation.
      await page.evaluate(() => {
        window.__longest = 0;
        new PerformanceObserver((list) => {
          for (const e of list.getEntries()) window.__longest = Math.max(window.__longest, e.duration);
        }).observe({ type: "longtask", buffered: false });
      });

      const t0 = Date.now();
      if (method === "browse") {
        await page.locator("#hero-file-input").setInputFiles(file);
      } else {
        // Build a File of the same size inside the page and drop it on the zone.
        const dt = await page.evaluateHandle(
          async ({ size, name }) => {
            const head = new TextEncoder().encode("id,name,email\n1,Ann,ann@example.com\n");
            const chunk = new Uint8Array(4 * 1024 * 1024).fill(0x61);
            const parts = [head];
            let left = size - head.length;
            while (left > 0) {
              const n = Math.min(left, chunk.length);
              parts.push(n === chunk.length ? chunk : chunk.subarray(0, n));
              left -= n;
            }
            const f = new File(parts, name, { type: "text/csv" });
            const d = new DataTransfer();
            d.items.add(f);
            return d;
          },
          { size: c.size, name: path.basename(file) },
        );
        await page.evaluate(() => (window.__longest = 0));
        await page.dispatchEvent("label[for='hero-file-input']", "drop", { dataTransfer: dt });
      }

      if (c.ok) {
        const navigated = await page
          .waitForURL("**/spreadsheet-error-detector", { timeout: 15000 })
          .then(() => true, () => false);
        const ms = Date.now() - t0;
        check(navigated, `[${method}] accepted and opened in Error Detector (${ms} ms incl. transfer)`);
        const advisory = await page
          .getByRole("status")
          .filter({ hasText: "large file" })
          .first()
          .waitFor({ timeout: 2000 })
          .then(() => true, () => false);
        check(advisory === c.advisory, `[${method}] large-file advisory ${c.advisory ? "shown" : "not shown"}`);
      } else {
        const alert = page.getByRole("alert").filter({ hasText: "maximum file size" }).first();
        const shown = await alert.waitFor({ timeout: 15000 }).then(() => true, () => false);
        check(shown, `[${method}] rejected with a visible error`);
        if (shown) {
          const text = await alert.textContent();
          check(/150 MB/.test(text ?? ""), `[${method}] message states the 150 MB limit: "${text}"`);
        }
        check(page.url() === BASE + "/", `[${method}] stays on the page (not silently dropped)`);
      }
      const longest = await page.evaluate(() => window.__longest);
      check(longest < 200, `[${method}] longest main-thread block during validation: ${Math.round(longest)} ms`);
      check(errors.length === 0, `[${method}] no page errors ${errors.join(" ")}`);
      await context.close();
    }

    check((await sha256(file)) === before, "source file unchanged (SHA-256 identical)");
    rmSync(file);
  }
} finally {
  await browser.close();
  rmSync(DIR, { recursive: true, force: true });
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
