"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Braces, CheckCircle2, Download, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import { saveBlob } from "@/components/tools/fix/DownloadDialog";
import type { JsonPreview } from "@/engine/core";
import type { JsonLayout } from "@/engine/json/write";
import { EngineError } from "@/engine/errors";
import { formatBytes } from "@/lib/format";

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

const LAYOUTS: { id: JsonLayout; label: string; hint: string }[] = [
  { id: "pretty", label: "Pretty", hint: "indented, easy to read" },
  { id: "compact", label: "Compact", hint: "smallest file" },
  { id: "lines", label: "JSON Lines (.jsonl)", hint: "one record per line" },
];

type DownloadState = { status: "idle" } | { status: "working"; done: number; total: number } | { status: "done"; name: string; bytes: number; records: number } | { status: "error"; message: string };

/**
 * CSV to JSON (Stage 12): the header row gives the key names; values are text
 * exactly as shown, or detected numbers, true/false and empty values (decision 3A);
 * pretty, compact or JSON Lines (decision 4A). The preview shows the first
 * records exactly as they will be written; every record is checked before the
 * file is offered.
 */
export function CsvToJsonPanel({ api }: { api: ToolApi }) {
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const [detect, setDetect] = useState(false);
  const [layout, setLayout] = useState<JsonLayout>("pretty");
  const [preview, setPreview] = useState<{ key: string; value: JsonPreview } | null>(null);
  const [download, setDownload] = useState<DownloadState>({ status: "idle" });
  const seq = useRef(0);
  const key = JSON.stringify([detect, layout, api.headerRow, api.viewKey]);

  useEffect(() => {
    if (!api.sheetReady) return;
    let live = true;
    apiRef.current.previewJson({ detect, layout }).then(
      (value) => live && setPreview({ key, value }),
      () => live && setPreview(null),
    );
    return () => {
      live = false;
    };
  }, [key, detect, layout, api.sheetReady]);

  if (!api.sheetReady) return null;
  const p = preview?.key === key ? preview.value : null;

  const run = () => {
    const mySeq = ++seq.current;
    setDownload({ status: "working", done: 0, total: p?.records ?? 0 });
    apiRef.current
      .exportJson({ detect, layout }, (progress) => {
        if (mySeq === seq.current && progress.loaded !== null) setDownload({ status: "working", done: progress.loaded, total: progress.total ?? 0 });
      })
      .then(
        (r) => {
          if (mySeq !== seq.current) return;
          saveBlob(r.blob, r.summary.downloadName);
          setDownload({ status: "done", name: r.summary.downloadName, bytes: r.blob.size, records: r.summary.records });
        },
        (err: unknown) => {
          if (mySeq !== seq.current) return;
          const cancelled = err instanceof EngineError && err.code === "cancelled";
          setDownload({ status: "error", message: cancelled ? "Cancelled. Nothing was created." : err instanceof Error ? err.message : "The JSON file could not be created." });
        },
      );
  };
  const change = (fn: () => void) => {
    setDownload({ status: "idle" });
    fn();
  };

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Braces className="size-5 text-primary" aria-hidden="true" /> Convert to JSON
      </h2>
      <p className="mt-1 text-sm text-muted">Each row becomes a record, and each column name a key. Your file is not uploaded and is never changed.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-3">
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[var(--primary)]" checked={api.headerRow} onChange={(e) => change(() => api.setHeaderRow(e.target.checked))} />
          <span>
            <span className="font-semibold">First row contains column names</span>
            <span className="block text-muted">{api.headerRow ? "They become the keys." : "Keys are column_1, column_2 …"}</span>
          </span>
        </label>
        <fieldset>
          <legend className="text-sm font-semibold">Values</legend>
          <div className="mt-1 space-y-0.5">
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
              <input type="radio" className="size-5 accent-[var(--primary)]" name="json-values" checked={!detect} onChange={() => change(() => setDetect(false))} />
              As text, exactly as shown
            </label>
            <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
              <input type="radio" className="size-5 accent-[var(--primary)]" name="json-values" checked={detect} onChange={() => change(() => setDetect(true))} />
              Detect numbers, true/false and empty values
            </label>
          </div>
          {detect && <p className="text-xs text-muted">Codes with leading zeros (00123), numbers longer than 15 digits and dates stay text.</p>}
        </fieldset>
        <fieldset>
          <legend className="text-sm font-semibold">Layout</legend>
          <div className="mt-1 space-y-0.5">
            {LAYOUTS.map((l) => (
              <label key={l.id} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" className="size-5 accent-[var(--primary)]" name="json-layout" checked={layout === l.id} onChange={() => change(() => setLayout(l.id))} />
                {l.label} <span className="text-muted">({l.hint})</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="mt-5 border-t border-line pt-4">
        <h3 className="text-sm font-semibold">
          {p ? `Preview: the first ${plural(p.sampleRecords, "record")} of ${fmt(p.records)}` : "Preview"}
        </h3>
        {p ? (
          <pre className="mt-2 max-h-80 overflow-auto rounded-xl border border-line bg-surface-muted p-3 font-mono text-xs leading-relaxed whitespace-pre" tabIndex={0} aria-label="Preview of the JSON">
            {p.sample}
          </pre>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Preparing the preview…
          </p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button onClick={run} disabled={download.status === "working" || !p}>
          {download.status === "working" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          Download {layout === "lines" ? ".jsonl" : ".json"}
        </Button>
        {download.status === "working" && (
          <Button variant="outline" onClick={() => apiRef.current.abortScans()}>
            Cancel
          </Button>
        )}
      </div>
      <div aria-live="polite">
        {download.status === "working" && (
          <p className="mt-3 text-sm text-muted">
            Writing and checking every record{download.total ? ` (${Math.min(99, Math.round((download.done / download.total) * 100))}%)` : ""}…
          </p>
        )}
        {download.status === "done" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {download.name} ({formatBytes(download.bytes)}, {plural(download.records, "record")}) was checked and downloaded. Your file is unchanged.
            </span>
          </p>
        )}
        {download.status === "error" && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{download.message}</span>
          </p>
        )}
      </div>
    </Card>
  );
}
