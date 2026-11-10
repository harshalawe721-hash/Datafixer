/**
 * Memory budget for parsing, computed on the main thread and sent to the worker.
 *
 * Why: when a worker exhausts its JavaScript heap, Chromium crashes the whole
 * tab (verified with a 256 MB heap cap: "page crashed", no error event). The
 * page cannot recover from that, so the engine must stop *before* the limit.
 *
 * Sources, best first:
 * 1. Chromium's performance.memory.jsHeapSizeLimit (real per-isolate limit);
 * 2. navigator.deviceMemory (Chromium, coarse, capped at 8 GB);
 * 3. conservative defaults for mobile and desktop (Safari/Firefox expose neither).
 */
export interface MemoryBudget {
  bytes: number;
  source: "heap-limit" | "device-memory" | "default-mobile" | "default-desktop";
}

const MB = 1024 * 1024;
/** Share of the heap the parsed data may use; the rest covers parsing buffers, sorting and the UI. */
const HEAP_SHARE = 0.45;

export function isProbablyMobile(nav: Navigator): boolean {
  const ua = nav.userAgent || "";
  // iPadOS reports as "Macintosh" but has touch points.
  return /Mobi|Android|iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
}

export function computeMemoryBudget(): MemoryBudget {
  const perf = performance as Performance & { memory?: { jsHeapSizeLimit?: number } };
  const limit = perf.memory?.jsHeapSizeLimit;
  if (typeof limit === "number" && limit > 0) {
    return { bytes: Math.floor(limit * HEAP_SHARE), source: "heap-limit" };
  }
  const nav = navigator as Navigator & { deviceMemory?: number };
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory > 0) {
    return { bytes: Math.min(nav.deviceMemory * 1024 * MB * 0.15, 1536 * MB), source: "device-memory" };
  }
  return isProbablyMobile(nav) ? { bytes: 300 * MB, source: "default-mobile" } : { bytes: 1024 * MB, source: "default-desktop" };
}
