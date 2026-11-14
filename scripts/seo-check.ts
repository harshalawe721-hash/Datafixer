/**
 * Stage 7 Step 5: SEO and performance check of every page.
 * Usage: start the app (npm run build && npm start), then `npm run test:seo`.
 */
import { createRequire } from "node:module";

const { chromium, devices } = createRequire(import.meta.url)("playwright");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let passes = 0;
let failures = 0;
const check = (cond: unknown, label: string) => {
  if (cond) passes++;
  else failures++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}`);
};

const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
const paths = urls.map((u) => new URL(u).pathname);
console.log("\nSitemap and robots");
check(paths.length === 10, `sitemap lists 10 pages (${paths.join(", ")})`);
check(!paths.includes("/diagnostics"), "the diagnostics page is not in the sitemap");
const robots = await (await fetch(`${BASE}/robots.txt`)).text();
check(/Allow: \//.test(robots) && /Sitemap: .*\/sitemap\.xml/.test(robots), "robots.txt allows crawling and points to the sitemap");

const browser = await chromium.launch();
const page = await browser.newPage();
const titles = new Map<string, string>();
const links = new Set<string>();
console.log("\nEvery page: status, headings, title, description, canonical, link previews, structured data");
for (const p of paths) {
  const res = await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  const info = await page.evaluate(() => {
    const meta = (sel: string) => document.querySelector(sel)?.getAttribute("content") ?? null;
    return {
      h1: document.querySelectorAll("h1").length,
      title: document.title,
      description: meta('meta[name="description"]'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null,
      og: {
        title: meta('meta[property="og:title"]'),
        description: meta('meta[property="og:description"]'),
        url: meta('meta[property="og:url"]'),
        type: meta('meta[property="og:type"]'),
        image: meta('meta[property="og:image"]'),
        width: meta('meta[property="og:image:width"]'),
        height: meta('meta[property="og:image:height"]'),
        alt: meta('meta[property="og:image:alt"]'),
        site: meta('meta[property="og:site_name"]'),
      },
      twitter: { card: meta('meta[name="twitter:card"]'), image: meta('meta[name="twitter:image"]') },
      robots: meta('meta[name="robots"]'),
      lang: document.documentElement.lang,
      jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => {
        try {
          return (JSON.parse(s.textContent ?? "") as { "@type"?: string })["@type"] ?? "?";
        } catch {
          return "INVALID";
        }
      }),
      links: [...document.querySelectorAll("a[href]")].map((a) => (a as HTMLAnchorElement).href).filter((h) => h.startsWith(location.origin)),
      imagesWithoutAlt: [...document.querySelectorAll("img")].filter((i) => !i.hasAttribute("alt")).length,
    };
  });
  info.links.forEach((l: string) => links.add(l.split("#")[0]!));
  titles.set(info.title, (titles.get(info.title) ? `${titles.get(info.title)}, ` : "") + p);
  const abs = `${BASE}${p === "/" ? "" : p}`;
  const ok =
    res?.status() === 200 &&
    info.h1 === 1 &&
    info.lang === "en" &&
    info.title.length >= 20 &&
    info.title.length <= 75 &&
    (info.description?.length ?? 0) >= 70 &&
    (info.description?.length ?? 0) <= 160 &&
    info.canonical === abs &&
    info.og.title && info.og.description && info.og.url === abs && info.og.type === "website" && info.og.site === "DataFixer" &&
    info.og.image === `${BASE}/opengraph-image` && info.og.width === "1200" && info.og.height === "630" && info.og.alt &&
    info.twitter.card === "summary_large_image" && info.twitter.image === `${BASE}/opengraph-image` &&
    !info.robots?.includes("noindex") &&
    info.jsonld.length > 0 && !info.jsonld.includes("INVALID") &&
    info.imagesWithoutAlt === 0;
  check(ok, `${p}: ${ok ? `title ${info.title.length} chars, description ${info.description?.length} chars, JSON-LD ${info.jsonld.join("+")}` : JSON.stringify(info).slice(0, 600)}`);
}
check([...titles.values()].every((v) => !v.includes(",")), "every page title is unique");

console.log("\nLink preview image");
const og = await fetch(`${BASE}/opengraph-image`);
const ogBytes = new Uint8Array(await og.arrayBuffer());
const png = ogBytes[0] === 0x89 && ogBytes[1] === 0x50;
const w = (ogBytes[16]! << 24) | (ogBytes[17]! << 16) | (ogBytes[18]! << 8) | ogBytes[19]!;
const h = (ogBytes[20]! << 24) | (ogBytes[21]! << 16) | (ogBytes[22]! << 8) | ogBytes[23]!;
check(og.status === 200 && og.headers.get("content-type") === "image/png" && png && w === 1200 && h === 630, `served as a 1200×630 PNG (${og.status}, ${og.headers.get("content-type")}, ${w}×${h})`);
check(ogBytes.length < 300 * 1024, `small enough for WhatsApp (${Math.round(ogBytes.length / 1024)} KB < 300 KB)`);

console.log("\nInternal links and the hidden diagnostics page");
let broken: string[] = [];
for (const l of links) {
  const r = await fetch(l, { redirect: "manual" });
  if (r.status !== 200) broken.push(`${l} → ${r.status}`);
}
check(broken.length === 0, `all ${links.size} internal links work${broken.length ? `: ${broken.join(", ")}` : ""}`);
check(![...links].some((l) => new URL(l).pathname.startsWith("/diagnostics")), "no page links to /diagnostics");
const diag = await page.goto(`${BASE}/diagnostics`, { waitUntil: "networkidle" });
const diagRobots = await page.evaluate(() => document.querySelector('meta[name="robots"]')?.getAttribute("content") ?? "");
check(diag?.status() === 200 && /noindex/.test(diagRobots) && /nofollow/.test(diagRobots), `/diagnostics still works for internal use and is hidden from search engines (${diagRobots})`);
await page.goto(`${BASE}/contact`, { waitUntil: "networkidle" });
const mailto = await page.locator('a[href^="mailto:"]').first().getAttribute("href");
check(mailto === "mailto:wavelightning639@gmail.com", `the contact page shows the owner's address (${mailto})`);
const notFound = await page.goto(`${BASE}/does-not-exist`, { waitUntil: "networkidle" });
check(notFound?.status() === 404, "unknown pages answer 404");
broken = [];

console.log("\nLoading on a phone-sized screen (Chromium, CPU slowed 4×)");
const ctx = await browser.newContext({ ...devices["Pixel 7"] });
const phone = await ctx.newPage();
const cdp = await ctx.newCDPSession(phone);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
const perf: { path: string; fcp: number; lcp: number; cls: number; js: number }[] = [];
for (const p of ["/", "/spreadsheet-error-detector", "/csv-validator", "/csv-to-excel", "/about"]) {
  let js = 0;
  const onResponse = async (r: { url(): string; request(): { resourceType(): string }; body(): Promise<Buffer> }) => {
    if (r.request().resourceType() === "script") js += (await r.body().catch(() => Buffer.alloc(0))).length;
  };
  phone.on("response", onResponse);
  await phone.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  await phone.waitForTimeout(1500);
  const m = await phone.evaluate(
    () =>
      new Promise<{ fcp: number; lcp: number; cls: number }>((resolve) => {
        let lcp = 0;
        let cls = 0;
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (lcp = e.startTime))).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((l) => l.getEntries().forEach((e) => (cls += (e as unknown as { value: number; hadRecentInput: boolean }).hadRecentInput ? 0 : (e as unknown as { value: number }).value))).observe({ type: "layout-shift", buffered: true });
        const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
        setTimeout(() => resolve({ fcp, lcp, cls }), 300);
      }),
  );
  phone.off("response", onResponse);
  perf.push({ path: p, ...m, js });
  check(m.lcp < 2500 && m.cls < 0.1, `${p}: first paint ${Math.round(m.fcp)} ms, largest paint ${Math.round(m.lcp)} ms (< 2,500), layout shift ${m.cls.toFixed(3)} (< 0.1), scripts ${Math.round(js / 1024)} KB`);
}

await browser.close();
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
