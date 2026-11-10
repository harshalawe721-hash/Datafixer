"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ClipboardCopy, Loader2, Play, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EngineClient } from "@/engine/client";
import { EngineError } from "@/engine/errors";
import { computeMemoryBudget, isProbablyMobile } from "@/engine/memory-budget";
import { formatBytes } from "@/lib/format";

const MB = 1024 * 1024;
const SIZES = [10, 25, 50, 100, 150] as const;

interface RunResult {
  sizeMB: number;
  outcome: string;
  generateMs: number;
  openMs: number | null;
  rows: number | null;
  sortMs: number | null;
  searchMs: number | null;
  maxFrameGapMs: number;
  mainHeapMB: number | null;
}

function deviceInfo() {
  const nav = navigator as Navigator & { deviceMemory?: number; userAgentData?: { platform?: string; mobile?: boolean } };
  const perf = performance as Performance & { memory?: { jsHeapSizeLimit?: number } };
  const budget = computeMemoryBudget();
  return {
    userAgent: nav.userAgent,
    platform: nav.userAgentData?.platform ?? nav.platform ?? "unknown",
    mobile: isProbablyMobile(nav),
    cpuThreads: nav.hardwareConcurrency ?? null,
    deviceMemoryGB: nav.deviceMemory ?? null,
    jsHeapLimitMB: perf.memory?.jsHeapSizeLimit ? Math.round(perf.memory.jsHeapSizeLimit / MB) : null,
    memoryBudgetMB: Math.round(budget.bytes / MB),
    memoryBudgetSource: budget.source,
    screen: `${screen.width}×${screen.height} @${window.devicePixelRatio}x`,
    moduleWorkers: typeof Worker !== "undefined",
    crossOriginIsolated: self.crossOriginIsolated ?? false,
  };
}

function mainHeapMB(): number | null {
  const perf = performance as Performance & { memory?: { usedJSHeapSize?: number } };
  return perf.memory?.usedJSHeapSize ? Math.round(perf.memory.usedJSHeapSize / MB) : null;
}

/** Track the longest gap between animation frames (works in every browser). */
function startFrameMonitor() {
  let max = 0;
  let last = performance.now();
  let running = true;
  const loop = (t: number) => {
    max = Math.max(max, t - last);
    last = t;
    if (running) requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  return () => {
    running = false;
    return Math.round(max);
  };
}

export function Diagnostics() {
  const [info, setInfo] = useState<ReturnType<typeof deviceInfo> | null>(null);
  const [size, setSize] = useState<number>(25);
  const [status, setStatus] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<RunResult[]>([]);
  const [copied, setCopied] = useState(false);
  const clientRef = useRef<EngineClient | null>(null);
  const genRef = useRef<Worker | null>(null);

  useEffect(() => {
    // Browser-only APIs: read after mount.
    const t = setTimeout(() => setInfo(deviceInfo()), 0);
    return () => {
      clearTimeout(t);
      clientRef.current?.dispose();
      genRef.current?.terminate();
    };
  }, []);

  async function run() {
    setRunning(true);
    const stopFrames = startFrameMonitor();
    const result: RunResult = { sizeMB: size, outcome: "", generateMs: 0, openMs: null, rows: null, sortMs: null, searchMs: null, maxFrameGapMs: 0, mainHeapMB: null };
    try {
      setStatus("Generating synthetic data…");
      const t0 = performance.now();
      const gen = new Worker(new URL("./synthetic.worker.ts", import.meta.url), { type: "module" });
      genRef.current = gen;
      const blob = await new Promise<Blob>((resolve, reject) => {
        gen.onmessage = (e: MessageEvent<{ type: string; loaded?: number; total?: number; blob?: Blob }>) => {
          if (e.data.type === "progress") setStatus(`Generating synthetic data… ${Math.round(((e.data.loaded ?? 0) / (e.data.total ?? 1)) * 100)}%`);
          else resolve(e.data.blob!);
        };
        gen.onerror = (e) => {
          e.preventDefault();
          reject(new Error("The browser ran out of memory while generating test data."));
        };
      });
      gen.terminate();
      genRef.current = null;
      result.generateMs = Math.round(performance.now() - t0);

      const client = (clientRef.current ??= new EngineClient());
      const file = new File([blob], `synthetic-${size}mb.csv`, { type: "text/csv" });
      const t1 = performance.now();
      const summary = await client.open(file, "csv", undefined, (p) =>
        setStatus(`Opening… ${p.loaded !== null && p.total ? Math.round((p.loaded / p.total) * 100) : 0}%`),
      );
      result.openMs = Math.round(performance.now() - t1);
      result.rows = summary.sheetStats[summary.activeSheet]?.rows ?? null;

      setStatus("Sorting…");
      const t2 = performance.now();
      await client.getRows(summary.activeSheet, { offset: 0, limit: 100, headerRow: true, sort: { column: 1, direction: "asc" } });
      result.sortMs = Math.round(performance.now() - t2);

      setStatus("Searching…");
      const t3 = performance.now();
      await client.getRows(summary.activeSheet, { offset: 0, limit: 100, headerRow: true, search: "zzz-no-match" });
      result.searchMs = Math.round(performance.now() - t3);
      result.outcome = "ok";
    } catch (err) {
      result.outcome = err instanceof EngineError ? `${err.code}: ${err.message}` : err instanceof Error ? err.message : String(err);
    } finally {
      result.maxFrameGapMs = stopFrames();
      result.mainHeapMB = mainHeapMB();
      // Release everything held for the test.
      clientRef.current?.dispose();
      clientRef.current = null;
      setResults((r) => [...r, result]);
      setStatus(null);
      setRunning(false);
    }
  }

  function cancel() {
    genRef.current?.terminate();
    genRef.current = null;
    clientRef.current?.cancel();
  }

  async function copy() {
    const text = JSON.stringify({ device: info, results, date: new Date().toISOString() }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setStatus("Copying was blocked by the browser. Select the results text below and copy it manually.");
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold">This device</h2>
        {info ? (
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            {[
              ["Browser", info.userAgent],
              ["Platform", `${info.platform}${info.mobile ? " (mobile/tablet)" : ""}`],
              ["CPU threads", info.cpuThreads ?? "not reported"],
              ["Device memory", info.deviceMemoryGB ? `${info.deviceMemoryGB} GB (approximate)` : "not reported by this browser"],
              ["JavaScript heap limit", info.jsHeapLimitMB ? `${info.jsHeapLimitMB} MB` : "not reported by this browser"],
              ["DataFixer memory budget", `${info.memoryBudgetMB} MB (${info.memoryBudgetSource})`],
              ["Screen", info.screen],
            ].map(([k, v]) => (
              <div key={String(k)} className="min-w-0">
                <dt className="text-muted">{k}</dt>
                <dd className="font-medium break-words">{String(v)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-sm text-muted">Reading device information…</p>
        )}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Run a test</h2>
        <p className="mt-1 text-sm text-muted">
          Creates a synthetic CSV file of the chosen size on this device and opens it with the same engine the tools use.
          No files from your device are used and nothing is uploaded.
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="text-sm">
            <span className="block text-muted">Test size</span>
            <select value={size} onChange={(e) => setSize(Number(e.target.value))} disabled={running} className="mt-1 h-10 rounded-lg border border-line-strong bg-background px-3">
              {SIZES.map((s) => (
                <option key={s} value={s}>
                  {s} MB
                </option>
              ))}
            </select>
          </label>
          {running ? (
            <Button variant="outline" onClick={cancel}>
              <X className="size-4" aria-hidden="true" /> Cancel
            </Button>
          ) : (
            <Button onClick={() => void run()}>
              <Play className="size-4" aria-hidden="true" /> Run test
            </Button>
          )}
        </div>
        {status && (
          <p className="mt-4 flex items-center gap-2 text-sm" role="status">
            {running && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
            {status}
          </p>
        )}
      </Card>

      {results.length > 0 && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Results</h2>
            <Button variant="outline" size="sm" onClick={() => void copy()}>
              {copied ? <Check className="size-4" aria-hidden="true" /> : <ClipboardCopy className="size-4" aria-hidden="true" />}
              {copied ? "Copied" : "Copy results"}
            </Button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[40rem] text-left text-sm">
              <thead className="text-muted">
                <tr>
                  {["Size", "Result", "Generate", "Open", "Rows", "Sort", "Search", "Longest freeze", "Page heap"].map((h) => (
                    <th key={h} scope="col" className="border-b border-line py-2 pr-4 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="align-top">
                    <td className="border-b border-line py-2 pr-4">{r.sizeMB} MB</td>
                    <td className="max-w-xs border-b border-line py-2 pr-4">{r.outcome === "ok" ? "Opened" : r.outcome}</td>
                    <td className="border-b border-line py-2 pr-4">{(r.generateMs / 1000).toFixed(1)}s</td>
                    <td className="border-b border-line py-2 pr-4">{r.openMs !== null ? `${(r.openMs / 1000).toFixed(1)}s` : "—"}</td>
                    <td className="border-b border-line py-2 pr-4">{r.rows?.toLocaleString("en-US") ?? "—"}</td>
                    <td className="border-b border-line py-2 pr-4">{r.sortMs !== null ? `${r.sortMs} ms` : "—"}</td>
                    <td className="border-b border-line py-2 pr-4">{r.searchMs !== null ? `${r.searchMs} ms` : "—"}</td>
                    <td className="border-b border-line py-2 pr-4">{r.maxFrameGapMs} ms</td>
                    <td className="border-b border-line py-2 pr-4">{r.mainHeapMB !== null ? formatBytes(r.mainHeapMB * MB) : "n/a"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">
            “Longest freeze” is the longest pause between screen updates during the test (under ~100 ms feels smooth).
            “Page heap” covers the page only; the background worker&apos;s memory isn&apos;t visible to web pages in most browsers.
          </p>
        </Card>
      )}
    </div>
  );
}
