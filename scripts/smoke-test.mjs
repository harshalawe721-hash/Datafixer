/**
 * End-to-end smoke test for the DataFixer UI.
 * Usage: start the app (npm run build && npm start), then `npm run test:smoke`.
 * BASE_URL defaults to http://localhost:3000. Set SCREENSHOT_DIR to save screenshots.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const SHOTS = process.env.SCREENSHOT_DIR;
// CommonJS require honours NODE_PATH, so a globally installed Playwright also works.
const { chromium } = createRequire(import.meta.url)("playwright");
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const PAGES = [
  "/",
  "/spreadsheet-error-detector",
  "/spreadsheet-cleaner",
  "/csv-validator",
  "/excel-to-csv",
  "/csv-to-excel",
  "/about",
  "/contact",
  "/privacy-policy",
  "/terms-of-service",
];

let failures = 0;
let passes = 0;
function check(cond, label) {
  if (cond) {
    passes++;
    console.log(`  ✓ ${label}`);
  } else {
    failures++;
    console.log(`  ✗ ${label}`);
  }
}

const browser = await chromium.launch();

/** Wait up to 3 s for a locator to become visible. */
async function visible(locator) {
  return locator.first().waitFor({ state: "visible", timeout: 3000 }).then(() => true, () => false);
}

async function newPage(viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  return { context, page, errors };
}

// 1. Every page: status, one H1, unique title, canonical, meta description, no console errors.
console.log("\nPages and metadata");
{
  const { page, errors, context } = await newPage();
  const titles = new Set();
  for (const p of PAGES) {
    const res = await page.goto(BASE + p, { waitUntil: "networkidle" });
    check(res?.status() === 200, `${p} returns 200`);
    const h1 = await page.locator("h1").count();
    check(h1 === 1, `${p} has exactly one <h1> (found ${h1})`);
    const title = await page.title();
    check(title && !titles.has(title), `${p} has a unique title: "${title}"`);
    titles.add(title);
    const canonical = await page.locator('link[rel="canonical"]').getAttribute("href");
    check(canonical?.endsWith(p === "/" ? "/" : p) || (p === "/" && canonical), `${p} canonical = ${canonical}`);
    const desc = await page.locator('meta[name="description"]').getAttribute("content");
    check(desc && desc.length > 50, `${p} has a meta description`);
    const ld = await page.locator('script[type="application/ld+json"]').allTextContents();
    check(ld.every((t) => { try { JSON.parse(t); return true; } catch { return false; } }), `${p} JSON-LD is valid JSON (${ld.length} blocks)`);
  }
  check(errors.length === 0, `no console/page errors across pages ${errors.length ? JSON.stringify(errors) : ""}`);
  const nf = await page.goto(BASE + "/does-not-exist");
  check(nf?.status() === 404, "unknown route returns 404");
  await context.close();
}

// 2. Internal links all resolve.
console.log("\nInternal links");
{
  const { page, context } = await newPage();
  await page.goto(BASE + "/");
  const hrefs = new Set();
  for (const p of PAGES) {
    await page.goto(BASE + p);
    for (const h of await page.locator("a[href^='/']").evaluateAll((as) => as.map((a) => a.getAttribute("href")))) {
      hrefs.add(h.split("#")[0] || "/");
    }
  }
  for (const h of hrefs) {
    const r = await page.request.get(BASE + h);
    check(r.status() === 200, `link ${h} → ${r.status()}`);
  }
  await context.close();
}

// 3. Header: Tools dropdown and theme toggle.
console.log("\nHeader interactions (desktop)");
{
  const { page, context, errors } = await newPage();
  await page.goto(BASE + "/");
  const toolsBtn = page.getByRole("button", { name: "Tools" });
  check((await toolsBtn.getAttribute("aria-expanded")) === "false", "Tools menu starts closed");
  await toolsBtn.click();
  check((await toolsBtn.getAttribute("aria-expanded")) === "true", "Tools menu opens on click");
  const menuLinks = page.locator("[data-menu-item]");
  check((await menuLinks.count()) === 5, "Tools menu lists 5 tools");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "desktop-tools-menu.png") });
  await page.keyboard.press("Escape");
  check((await toolsBtn.getAttribute("aria-expanded")) === "false", "Escape closes Tools menu");
  await toolsBtn.focus();
  await page.keyboard.press("ArrowDown");
  await page.waitForTimeout(100);
  const focused = await page.evaluate(() => document.activeElement?.hasAttribute("data-menu-item"));
  check(focused, "ArrowDown opens menu and focuses first item");
  await page.keyboard.press("Escape");
  await toolsBtn.click();
  await page.locator("[data-menu-item]", { hasText: "CSV Validator" }).click();
  await page.waitForURL("**/csv-validator");
  check(page.url().endsWith("/csv-validator"), "Clicking a tool navigates to it");
  check((await toolsBtn.getAttribute("aria-expanded")) === "false", "Menu closes after navigation");

  await page.goto(BASE + "/");
  await page.click("body", { position: { x: 5, y: 500 } });
  await toolsBtn.click();
  await page.mouse.click(5, 600);
  check((await toolsBtn.getAttribute("aria-expanded")) === "false", "Outside click closes Tools menu");

  // How It Works anchor
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "How It Works" }).click();
  await page.waitForTimeout(600);
  const inView = await page.locator("#how-it-works").evaluate((el) => {
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  });
  check(inView, "How It Works link scrolls to the section");

  // Theme
  const isDark = () => page.evaluate(() => document.documentElement.classList.contains("dark"));
  const before = await isDark();
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  check((await isDark()) !== before, "Theme toggle switches theme");
  await page.reload();
  check((await isDark()) !== before, "Theme choice persists after reload");
  if (SHOTS) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(SHOTS, `desktop-home-${before ? "light" : "dark"}.png`), fullPage: true });
  }
  check(errors.length === 0, `no console errors ${errors.length ? JSON.stringify(errors) : ""}`);
  await context.close();
}

// 4. System dark preference is honoured when nothing is saved.
console.log("\nTheme default");
{
  const context = await browser.newContext({ colorScheme: "dark" });
  const page = await context.newPage();
  await page.goto(BASE + "/");
  check(await page.evaluate(() => document.documentElement.classList.contains("dark")), "OS dark preference applied on first visit");
  await context.close();
}

// 5. Upload area.
console.log("\nUpload area");
{
  const { page, context, errors } = await newPage();
  await page.goto(BASE + "/");
  const input = page.locator("#hero-file-input");

  await input.setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hello") });
  check(await visible(page.getByRole("alert").filter({ hasText: "not a supported file type" })), "Rejects .txt file");

  await input.setInputFiles({ name: "fake.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("just text, not a zip") });
  check(await visible(page.getByRole("alert").filter({ hasText: "not a valid XLSX" })), "Rejects text renamed to .xlsx");

  await input.setInputFiles({ name: "empty.csv", mimeType: "text/csv", buffer: Buffer.alloc(0) });
  check(await visible(page.getByRole("alert").filter({ hasText: "is empty" })), "Rejects empty file");

  await input.setInputFiles({ name: "binary.csv", mimeType: "text/csv", buffer: Buffer.from([0x00, 0x01, 0x02, 0x41]) });
  check(await visible(page.getByRole("alert").filter({ hasText: "binary data" })), "Rejects binary data named .csv");

  const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(40)]);
  await input.setInputFiles({ name: "book.csv", mimeType: "text/csv", buffer: zip });
  check(await visible(page.getByRole("alert").filter({ hasText: "actually an Excel workbook" })), "Detects workbook renamed to .csv");

  // "Scan My Spreadsheet" opens the native file chooser.
  const chooserPromise = page.waitForEvent("filechooser", { timeout: 3000 }).catch(() => null);
  await page.getByRole("button", { name: "Scan My Spreadsheet" }).click();
  check((await chooserPromise) !== null, "Scan My Spreadsheet opens the file picker");

  await page.getByRole("link", { name: "Explore Free Tools" }).click();
  await page.waitForTimeout(500);
  check(page.url().endsWith("/#tools"), "Explore Free Tools goes to tools section");

  // Valid CSV is handed to the Error Detector without a page reload.
  await page.evaluate(() => (window.__noReload = true));
  await input.setInputFiles({ name: "customers.csv", mimeType: "text/csv", buffer: Buffer.from("name,email\nAnn,ann@example.com\n") });
  await page.waitForURL("**/spreadsheet-error-detector");
  check(await visible(page.getByText("customers.csv")), "Valid CSV opens in Error Detector with filename shown");
  check(await page.getByText("Comma-Separated Values (CSV)").isVisible(), "Detected format shown");
  check(await page.evaluate(() => window.__noReload === true), "Handoff happened via client navigation (no reload/upload)");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "desktop-detector-handoff.png"), fullPage: true });
  await page.reload();
  check(!(await page.getByText("customers.csv").isVisible()), "File is not persisted after reload");

  // Drag and drop
  await page.goto(BASE + "/");
  const dt = await page.evaluateHandle(() => {
    const d = new DataTransfer();
    d.items.add(new File(["a,b\n1,2\n"], "dropped.csv", { type: "text/csv" }));
    return d;
  });
  await page.dispatchEvent("label[for='hero-file-input']", "drop", { dataTransfer: dt });
  await page.waitForURL("**/spreadsheet-error-detector", { timeout: 5000 }).catch(() => {});
  check(await visible(page.getByText("dropped.csv")), "Drag-and-drop accepts a file");
  check(errors.length === 0, `no console errors ${errors.length ? JSON.stringify(errors) : ""}`);
  await context.close();
}

// 6. Mobile: menu and no horizontal overflow.
console.log("\nMobile (390×844)");
{
  const { page, context, errors } = await newPage({ width: 390, height: 844 });
  for (const p of PAGES) {
    await page.goto(BASE + p);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `${p} has no horizontal scroll (overflow ${overflow}px)`);
  }
  await page.goto(BASE + "/");
  check(!(await page.getByRole("button", { name: "Tools" }).isVisible()), "Desktop Tools menu hidden on mobile");
  const menuBtn = page.getByRole("button", { name: "Open menu" });
  await menuBtn.click();
  const mobileNav = page.getByRole("navigation", { name: "Mobile" });
  check(await mobileNav.isVisible(), "Mobile menu opens");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "mobile-menu.png") });
  await mobileNav.getByRole("link", { name: "Spreadsheet Cleaner" }).click();
  await page.waitForURL("**/spreadsheet-cleaner");
  check(!(await mobileNav.isVisible()), "Mobile menu closes after navigation");
  await page.goto(BASE + "/");
  if (SHOTS) await page.screenshot({ path: path.join(SHOTS, "mobile-home.png"), fullPage: true });
  check(errors.length === 0, `no console errors ${errors.length ? JSON.stringify(errors) : ""}`);
  await context.close();
}

// 7. Sitemap and robots.
console.log("\nSitemap and robots");
{
  const { page, context } = await newPage();
  const sm = await (await page.request.get(BASE + "/sitemap.xml")).text();
  check(PAGES.every((p) => sm.includes(`${p === "/" ? "" : p}</loc>`)), "sitemap.xml lists every page");
  const rb = await (await page.request.get(BASE + "/robots.txt")).text();
  check(/Sitemap: .*\/sitemap\.xml/.test(rb), "robots.txt references sitemap");
  await context.close();
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
