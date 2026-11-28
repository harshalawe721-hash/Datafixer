"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowLeftRight, CheckCircle2, Download, FileSpreadsheet, GitCompare, Loader2, ShieldCheck, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { saveBlob } from "@/components/tools/fix/DownloadDialog";
import { EngineClient } from "@/engine/client";
import { EngineError } from "@/engine/errors";
import type { CompareItem, CompareKind, CompareSummary } from "@/engine/core";
import type { ProgressEvent } from "@/engine/types";
import type { SpreadsheetFormat } from "@/lib/file-validation";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";

const ACCEPT = [".csv", ".tsv", ".txt", ".xlsx", ".xls"] as const;
const MAX_BYTES = 150 * 1024 * 1024;
const PAGE = 50;
const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

type Picked = { file: File; format: SpreadsheetFormat; sheet?: string; header?: boolean } | null;
type Options = { keys: string[] | null | undefined; ignoreCase: boolean; ignoreSpaces: boolean };
type Run = { status: "idle" } | { status: "working"; progress: ProgressEvent | null } | { status: "done"; summary: CompareSummary; seq: number } | { status: "error"; message: string };

const KINDS: { id: CompareKind; label: string }[] = [
  { id: "changed", label: "Changed" },
  { id: "added", label: "Added" },
  { id: "removed", label: "Removed" },
  { id: "unchanged", label: "Unchanged" },
];

/**
 * Compare Spreadsheets (Stage 17): an older and a newer file, rows matched by a key
 * column (suggested) or whole rows, the summary and every difference, and a report to
 * download. Both files are read on the device and never changed.
 */
export function CompareWorkspace() {
  const clientRef = useRef<EngineClient | null>(null);
  const client = useCallback(() => (clientRef.current ??= new EngineClient()), []);
  useEffect(
    () => () => {
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );
  const [older, setOlder] = useState<Picked>(null);
  const [newer, setNewer] = useState<Picked>(null);
  const [options, setOptions] = useState<Options>({ keys: undefined, ignoreCase: false, ignoreSpaces: false });
  const [run, setRun] = useState<Run>({ status: "idle" });
  const [showResult, setShowResult] = useState(false);
  /** Comparing again after a change on the result page (the result stays shown meanwhile). */
  const [updating, setUpdating] = useState(false);
  const seq = useRef(0);

  const compare = (o: Picked, n: Picked, opts: Options) => {
    if (!o || !n) return;
    const mySeq = ++seq.current;
    if (showResult && run.status === "done") setUpdating(true);
    else setRun({ status: "working", progress: null });
    client()
      .compareFiles(o, n, opts, (progress) => {
        if (mySeq === seq.current) setRun((r) => (r.status === "working" ? { status: "working", progress } : r));
      })
      .then(
        (summary) => {
          if (mySeq !== seq.current) return;
          setUpdating(false);
          setRun({ status: "done", summary, seq: mySeq });
          setShowResult(true);
        },
        (err: unknown) => {
          if (mySeq !== seq.current) return;
          setUpdating(false);
          const cancelled = err instanceof EngineError && err.code === "cancelled";
          setRun(cancelled ? { status: "idle" } : { status: "error", message: err instanceof Error ? err.message : "These files couldn't be compared. Your files are unchanged." });
          setShowResult(false);
        },
      );
  };
  const update = (next: Partial<Options>, o = older, n = newer) => {
    const opts = { ...options, ...next };
    setOptions(opts);
    compare(o, n, opts);
  };

  if (showResult && run.status === "done") {
    return (
      <ComparePanel
        summary={run.summary}
        runSeq={run.seq}
        client={client()}
        options={options}
        busy={updating}
        headers={{ older: older?.header, newer: newer?.header }}
        onOptions={(next) => update(next)}
        onSheet={(side, sheet) => {
          // Another sheet: its column names are detected again.
          const o = side === "older" && older ? { ...older, sheet, header: undefined } : older;
          const n = side === "newer" && newer ? { ...newer, sheet, header: undefined } : newer;
          setOlder(o);
          setNewer(n);
          update({ keys: undefined }, o, n);
        }}
        onHeader={(side, header) => {
          // Other column names: the key is suggested again.
          const o = side === "older" && older ? { ...older, header } : older;
          const n = side === "newer" && newer ? { ...newer, header } : newer;
          setOlder(o);
          setNewer(n);
          update({ keys: undefined }, o, n);
        }}
        onBack={() => {
          setShowResult(false);
          setRun({ status: "idle" });
        }}
      />
    );
  }

  const working = run.status === "working";
  const total = (older?.file.size ?? 0) + (newer?.file.size ?? 0);
  const tooBig = total > MAX_BYTES;
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>Choose the older and the newer version of a file. Both are read on your device, never uploaded, and never changed.</span>
      </p>
      <div className="grid items-start gap-4 md:grid-cols-[1fr_auto_1fr]">
        <FileSlot label="Older file" hint="For example last month's export" picked={older} disabled={working} onPick={(p) => setOlder(p)} />
        <div className="flex justify-center md:pt-24">
          <Button variant="outline" onClick={() => [setOlder(newer), setNewer(older)]} disabled={working || (!older && !newer)} aria-label="Swap the older and newer files">
            <ArrowLeftRight className="size-4" aria-hidden="true" /> <span className="md:sr-only">Swap</span>
          </Button>
        </div>
        <FileSlot label="Newer file" hint="For example this month's export" picked={newer} disabled={working} onPick={(p) => setNewer(p)} />
      </div>
      {tooBig && (
        <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>These files are {formatBytes(total)} together; up to 150 MB can be compared at once.</span>
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button size="lg" onClick={() => compare(older, newer, { ...options, keys: undefined })} disabled={!older || !newer || working || tooBig}>
          {working ? <Loader2 className="size-5 animate-spin" aria-hidden="true" /> : <GitCompare className="size-5" aria-hidden="true" />}
          Compare files
        </Button>
        {working && (
          <Button variant="outline" onClick={() => client().cancel()}>
            Cancel
          </Button>
        )}
        {!older || !newer ? <span className="text-sm text-muted">Choose both files to compare them.</span> : null}
      </div>
      <div aria-live="polite">
        {working && (
          <p className="text-sm text-muted">
            {run.progress?.phase === "indexing"
              ? "Matching the rows…"
              : `Reading the files${run.progress?.loaded != null && run.progress.total ? ` (${Math.min(99, Math.round((run.progress.loaded / run.progress.total) * 100))}%)` : ""}…`}
          </p>
        )}
        {run.status === "error" && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{run.message}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function FileSlot({ label, hint, picked, disabled, onPick }: { label: string; hint: string; picked: Picked; disabled: boolean; onPick: (p: Picked) => void }) {
  return (
    <section aria-label={label}>
      <h2 className="mb-2 text-base font-semibold">
        {label} <span className="text-sm font-normal text-muted">({hint})</span>
      </h2>
      {picked ? (
        <div className="flex min-h-24 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3">
          <span className="flex min-w-0 items-center gap-2">
            <FileSpreadsheet className="size-6 shrink-0 text-primary" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block font-medium break-all">{picked.file.name}</span>
              <span className="text-sm text-muted">{formatBytes(picked.file.size)}</span>
            </span>
          </span>
          <Button variant="outline" onClick={() => onPick(null)} disabled={disabled} aria-label={`Change the ${label.toLowerCase()}, ${picked.file.name}`}>
            <X className="size-4" aria-hidden="true" /> Change
          </Button>
        </div>
      ) : (
        <FileDropzone accept={ACCEPT} title={`Choose the ${label.toLowerCase()}`} disabled={disabled} onFileAccepted={(file, format) => onPick({ file, format })} />
      )}
    </section>
  );
}

function ComparePanel({
  summary: s,
  runSeq,
  client,
  options,
  busy,
  headers,
  onOptions,
  onSheet,
  onHeader,
  onBack,
}: {
  summary: CompareSummary;
  runSeq: number;
  client: EngineClient;
  options: Options;
  busy: boolean;
  /** The column-names choice per file (undefined: as detected); shown at once while comparing again. */
  headers: { older?: boolean; newer?: boolean };
  onOptions: (next: Partial<Options>) => void;
  onSheet: (side: "older" | "newer", sheet: string) => void;
  onHeader: (side: "older" | "newer", header: boolean) => void;
  onBack: () => void;
}) {
  const c = s.counts;
  const common = s.columns.filter((x) => x.inOlder && x.inNewer).map((x) => x.name);
  const onlyNewer = s.columns.filter((x) => !x.inOlder).map((x) => x.name);
  const onlyOlder = s.columns.filter((x) => !x.inNewer).map((x) => x.name);
  const firstKind = (["changed", "added", "removed"] as CompareKind[]).find((k) => c[k] > 0) ?? "unchanged";
  const [kind, setKind] = useState<CompareKind>(firstKind);
  const [kindSeq, setKindSeq] = useState(runSeq);
  if (kindSeq !== runSeq) {
    setKindSeq(runSeq);
    setKind(firstKind);
  }
  const keys = s.keys ?? [];
  const same = c.added === 0 && c.removed === 0 && c.changed === 0;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <GitCompare className="size-5 text-primary" aria-hidden="true" /> Comparison
            </h2>
            <p className="mt-1 text-sm break-all text-muted">
              Older: <strong className="text-foreground">{s.older.name}</strong>
              {s.older.sheet ? ` (sheet “${s.older.sheet}”)` : ""}, {plural(s.older.rows, "row")} · Newer: <strong className="text-foreground">{s.newer.name}</strong>
              {s.newer.sheet ? ` (sheet “${s.newer.sheet}”)` : ""}, {plural(s.newer.rows, "row")}
            </p>
          </div>
          <Button variant="outline" onClick={onBack}>
            Choose other files
          </Button>
        </div>

        <fieldset disabled={busy} className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <KeyChooser keys={keys} common={common} suggested={s.suggestedKey} onChange={(k) => onOptions({ keys: k })} />
            {(["older", "newer"] as const).map((side) =>
              s[side].sheets.length > 1 ? (
                <div key={side} className="text-sm">
                  <label htmlFor={`compare-sheet-${side}`} className="font-semibold">
                    Sheet in the {side} file
                  </label>
                  <select
                    id={`compare-sheet-${side}`}
                    className="mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base sm:max-w-72"
                    value={s[side].sheet ?? ""}
                    onChange={(e) => onSheet(side, e.target.value)}
                  >
                    {s[side].sheets.map((n) => (
                      <option key={n}>{n}</option>
                    ))}
                  </select>
                </div>
              ) : null,
            )}
          </div>
          <fieldset className="space-y-1">
            <legend className="text-sm font-semibold">When comparing values</legend>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={options.ignoreCase} onChange={(e) => onOptions({ ignoreCase: e.target.checked, keys: s.keys })} />
              Ignore capital letters (Pune = PUNE)
            </label>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={options.ignoreSpaces} onChange={(e) => onOptions({ ignoreSpaces: e.target.checked, keys: s.keys })} />
              Ignore spaces at the start and end
            </label>
            <p className="text-xs text-muted">Values are compared as they are shown{s.older.sheet || s.newer.sheet ? " in Excel" : ""}.</p>
          </fieldset>
          <fieldset className="space-y-1 md:col-span-2">
            <legend className="text-sm font-semibold">Column names</legend>
            {(["older", "newer"] as const).map((side) => (
              <label key={side} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={headers[side] ?? s[side].header} onChange={(e) => onHeader(side, e.target.checked)} />
                <span>
                  First row of the {side} file contains column names
                  {s[side].header !== s[side].headerDetected && <span className="text-muted"> (changed by you; detected: {s[side].headerDetected ? "names" : "data"})</span>}
                </span>
              </label>
            ))}
            <p className="text-xs text-muted">
              Detected automatically. Untick a box if that file&apos;s first row is data, or tick it if its column names look like data (such as years). Without names in
              both files, columns are matched by position.
            </p>
          </fieldset>
        </fieldset>

        <p className="mt-3 min-h-5 text-sm text-muted" aria-live="polite">
          {busy && (
            <span className="flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Comparing again…
            </span>
          )}
        </p>
        <h3 className="sr-only">Summary</h3>
        <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Changed rows" value={c.changed} tone="warning" note={c.changedCells ? plural(c.changedCells, "value") : undefined} />
          <Tile label="Added rows" value={c.added} tone="success" />
          <Tile label="Removed rows" value={c.removed} tone="danger" />
          <Tile label="Unchanged rows" value={c.unchanged} tone="muted" />
        </dl>
        <div className="mt-4 space-y-2 text-sm" aria-live="polite">
          {same && !onlyNewer.length && !onlyOlder.length && (
            <p className="flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-success">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>The two files have the same data{options.ignoreCase || options.ignoreSpaces ? " (with the options chosen)" : ""}.</span>
            </p>
          )}
          {(onlyNewer.length > 0 || onlyOlder.length > 0) && (
            <p className="text-muted">
              {onlyNewer.length > 0 && (
                <>
                  Columns only in the newer file: <strong className="text-foreground">{onlyNewer.join(", ")}</strong>.{" "}
                </>
              )}
              {onlyOlder.length > 0 && (
                <>
                  Columns only in the older file: <strong className="text-foreground">{onlyOlder.join(", ")}</strong>.{" "}
                </>
              )}
              They aren&apos;t compared, and columns are matched by name, so a column that moved isn&apos;t a change.
            </p>
          )}
          {s.keys === null && (
            <p className="text-muted">
              Rows are compared as a whole{s.suggestedKey ? "" : ", because no column has a different value in every row"}. A row with one changed value shows as one
              removed and one added row; choose a key column to see what changed in it.
            </p>
          )}
          {(s.repeated.older > 0 || s.repeated.newer > 0) && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                Some keys appear more than once ({[s.repeated.older ? `${plural(s.repeated.older, "key")} in the older file` : "", s.repeated.newer ? `${plural(s.repeated.newer, "key")} in the newer file` : ""].filter(Boolean).join(", ")}
                ), for example {s.repeated.examples.map((e) => `“${e}”`).join(", ")}. Those rows are matched in order (the first with the first) and marked “repeated key” in the
                report. A column with a different value in every row gives a clearer comparison.
              </span>
            </p>
          )}
        </div>
      </Card>

      <Differences client={client} runSeq={runSeq} counts={c} kind={kind} onKind={setKind} />
      <Reports client={client} runSeq={runSeq} unchanged={c.unchanged} />
    </div>
  );
}

function KeyChooser({ keys, common, suggested, onChange }: { keys: string[]; common: string[]; suggested: string | null; onChange: (keys: string[] | null) => void }) {
  const select = "mt-1 block min-h-11 w-full rounded-lg border border-line bg-surface px-3 text-base sm:max-w-72";
  const first = keys[0] ?? "";
  const extra = keys.slice(1);
  return (
    <div className="text-sm">
      <label htmlFor="compare-key" className="font-semibold">
        Match rows by
      </label>
      <select id="compare-key" className={select} value={first} onChange={(e) => onChange(e.target.value ? [e.target.value, ...extra.filter((k) => k !== e.target.value)] : null)}>
        {common.map((n) => (
          <option key={n} value={n}>
            {n}
            {n === suggested ? " (suggested)" : ""}
          </option>
        ))}
        <option value="">Whole rows (no key column)</option>
      </select>
      {extra.map((k, i) => (
        <div key={k} className="mt-2 flex items-end gap-2">
          <label className="block grow">
            <span className="sr-only">Key column {i + 2}</span>
            <select className={select} value={k} onChange={(e) => onChange(keys.map((x, j) => (j === i + 1 ? e.target.value : x)).filter((x, j, a) => a.indexOf(x) === j))} aria-label={`Key column ${i + 2}`}>
              {common.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" onClick={() => onChange(keys.filter((_, j) => j !== i + 1))} aria-label={`Remove key column ${k}`}>
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      {first && keys.length < 3 && common.some((n) => !keys.includes(n)) && (
        <button type="button" className="mt-1 min-h-10 text-sm font-semibold text-primary underline-offset-2 hover:underline" onClick={() => onChange([...keys, common.find((n) => !keys.includes(n))!])}>
          + Add a key column (for example first and last name together)
        </button>
      )}
      <p className="text-xs text-muted">
        {first
          ? "Rows with the same value here are the same row in both files, so you see exactly which values changed."
          : "Rows identical in both files count as unchanged; any other row as added or removed."}
      </p>
    </div>
  );
}

const TONES = { warning: "border-transparent bg-warning-soft", success: "border-transparent bg-success-soft", danger: "border-transparent bg-danger-soft", muted: "border-line bg-surface" };

function Tile({ label, value, tone, note }: { label: string; value: number; tone: keyof typeof TONES; note?: string }) {
  return (
    <div className={cn("rounded-xl border px-4 py-3", value > 0 ? TONES[tone] : TONES.muted)}>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-2xl font-semibold">{fmt(value)}</dd>
      {note && <dd className="text-xs text-muted">{note}</dd>}
    </div>
  );
}

function Differences({ client, runSeq, counts, kind, onKind }: { client: EngineClient; runSeq: number; counts: CompareSummary["counts"]; kind: CompareKind; onKind: (k: CompareKind) => void }) {
  const [items, setItems] = useState<{ key: string; list: CompareItem[]; total: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const key = `${runSeq}:${kind}`;
  useEffect(() => {
    let live = true;
    client.compareDetails(kind, 0, PAGE).then(
      (r) => live && setItems({ key, list: r.items, total: r.total }),
      () => live && setItems({ key, list: [], total: 0 }),
    );
    return () => {
      live = false;
    };
  }, [client, key, kind]);
  const current = items?.key === key ? items : null;
  const more = () => {
    if (!current) return;
    setLoading(true);
    client
      .compareDetails(kind, current.list.length, PAGE)
      .then((r) => setItems({ key, list: [...current.list, ...r.items], total: r.total }))
      .finally(() => setLoading(false));
  };
  return (
    <Card>
      <h2 className="text-lg font-semibold">Differences</h2>
      <div role="group" aria-label="Show" className="mt-3 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <Button key={k.id} variant={kind === k.id ? "primary" : "outline"} aria-pressed={kind === k.id} onClick={() => onKind(k.id)}>
            {k.label} ({fmt(counts[k.id])})
          </Button>
        ))}
      </div>
      {!current ? (
        <p className="mt-4 flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
        </p>
      ) : current.total === 0 ? (
        <p className="mt-4 text-sm text-muted">No {kind} rows.</p>
      ) : (
        <>
          <ul className="mt-4 divide-y divide-line rounded-xl border border-line" aria-label={`${KINDS.find((k) => k.id === kind)!.label} rows`}>
            {current.list.map((it) => (
              <li key={`${it.newerRow}-${it.olderRow}`} className="px-4 py-3 text-sm">
                <p className="font-medium">
                  {it.key ? <span className="break-all">{it.key}</span> : <span className="text-muted">(no key)</span>}{" "}
                  <span className="ml-1 font-normal text-muted">
                    {it.newerRow !== null && it.olderRow !== null
                      ? it.newerRow === it.olderRow
                        ? `row ${fmt(it.newerRow)}`
                        : `row ${fmt(it.olderRow)} → ${fmt(it.newerRow)}`
                      : it.newerRow !== null
                        ? `row ${fmt(it.newerRow)} of the newer file`
                        : `row ${fmt(it.olderRow!)} of the older file`}
                    {it.repeated ? " · repeated key" : ""}
                  </span>
                </p>
                {it.changes.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {it.changes.map((ch) => (
                      <li key={ch.column} className="break-words">
                        <span className="text-muted">{ch.column}:</span> <span className="rounded bg-danger-soft px-1 text-danger line-through decoration-1">{ch.old || "(empty)"}</span> →{" "}
                        <span className="rounded bg-success-soft px-1 text-success">{ch.new || "(empty)"}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {it.values.length > 0 && (
                  <p className="mt-1 break-words text-muted">
                    {it.values
                      .filter((v) => v.value !== "")
                      .slice(0, 8)
                      .map((v) => `${v.column}: ${v.value.length > 60 ? `${v.value.slice(0, 60)}…` : v.value}`)
                      .join(" · ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
            <span>
              Showing {fmt(current.list.length)} of {fmt(current.total)}.
            </span>
            {current.list.length < current.total && (
              <Button variant="outline" onClick={more} disabled={loading}>
                {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />} Show {fmt(Math.min(PAGE, current.total - current.list.length))} more
              </Button>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

type Work = { status: "idle" } | { status: "working"; what: string; pct: number | null } | { status: "done"; text: string } | { status: "error"; message: string };

function Reports({ client, runSeq, unchanged }: { client: EngineClient; runSeq: number; unchanged: number }) {
  const [includeUnchanged, setIncludeUnchanged] = useState(true);
  const [work, setWork] = useState<Work>({ status: "idle" });
  const [workSeq, setWorkSeq] = useState(runSeq);
  if (workSeq !== runSeq) {
    setWorkSeq(runSeq);
    setWork({ status: "idle" });
  }
  const busy = work.status === "working";
  const download = (format: "csv" | "xlsx") => {
    setWork({ status: "working", what: format === "xlsx" ? "Creating and checking the Excel report" : "Creating and checking the CSV report", pct: null });
    client
      .exportCompareReport(format, { includeUnchanged }, (p) => {
        if (p.loaded != null && p.total) setWork((w) => (w.status === "working" ? { ...w, pct: Math.min(99, Math.round((p.loaded! / p.total!) * 50 + (p.phase === "verifying" ? 50 : 0))) } : w));
      })
      .then(
        (r) => {
          saveBlob(r.blob, r.summary.downloadName);
          setWork({
            status: "done",
            text: `${r.summary.downloadName} (${formatBytes(r.summary.bytes)}, ${plural(r.summary.rows, "row")}${r.summary.sheets > 1 ? ` on ${r.summary.sheets} sheets` : ""}) was checked and downloaded. Your files are unchanged.`,
          });
        },
        (err: unknown) =>
          setWork({ status: "error", message: err instanceof EngineError && err.code === "cancelled" ? "Cancelled. Nothing was downloaded." : err instanceof Error ? err.message : "The report could not be created." }),
      );
  };
  return (
    <Card>
      <h2 className="text-lg font-semibold">Download the report</h2>
      <p className="mt-1 text-sm text-muted">
        Every row of the newer file and the removed rows, with a “Change” column (Added, Removed, Changed, Unchanged) and a “What changed” column. In the Excel report,
        changed values are highlighted.
      </p>
      <label className="mt-3 flex min-h-10 cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={includeUnchanged} onChange={(e) => setIncludeUnchanged(e.target.checked)} disabled={busy} />
        Include unchanged rows ({fmt(unchanged)})
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button onClick={() => download("xlsx")} disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />} Download Excel report (.xlsx)
        </Button>
        <Button variant="outline" onClick={() => download("csv")} disabled={busy}>
          <Download className="size-4" aria-hidden="true" /> Download CSV report
        </Button>
        {busy && (
          <Button variant="outline" onClick={() => void client.abortScans()}>
            Cancel
          </Button>
        )}
      </div>
      <div aria-live="polite">
        {work.status === "working" && (
          <p className="mt-3 text-sm text-muted">
            {work.what}
            {work.pct !== null ? ` (${work.pct}%)` : ""}…
          </p>
        )}
        {work.status === "done" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{work.text}</span>
          </p>
        )}
        {work.status === "error" && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{work.message}</span>
          </p>
        )}
      </div>
      <p className="mt-4 text-xs text-muted">
        To combine the two files instead, use{" "}
        <Link href="/merge-files" className="underline">
          Merge Files
        </Link>
        .
      </p>
    </Card>
  );
}
