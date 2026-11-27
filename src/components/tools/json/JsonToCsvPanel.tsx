"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardPaste, Download, FileJson, Info, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import { saveBlob } from "@/components/tools/fix/DownloadDialog";
import { EngineError } from "@/engine/errors";
import type { SpreadsheetFormat } from "@/lib/file-validation";
import { formatBytes } from "@/lib/format";

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const listLabel = (path: string) => (path === "" ? "The whole file" : path);

type DownloadState = { status: "idle" } | { status: "working"; kind: "csv" | "xlsx" } | { status: "done"; name: string; bytes: number } | { status: "error"; message: string };

/**
 * JSON to CSV (Stage 12): shows how the JSON became a table (which list, what
 * was kept as text) and creates CSV or Excel downloads, each checked before it
 * is offered. The table itself is the shared preview below.
 */
export function JsonToCsvPanel({ api }: { api: ToolApi }) {
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const [download, setDownload] = useState<DownloadState>({ status: "idle" });
  const seq = useRef(0);
  const json = api.summary.json;
  if (!api.sheetReady || !json) return null;
  const columns = api.summary.sheetStats[api.summary.activeSheet]?.columns ?? 0;

  const run = (kind: "csv" | "xlsx") => {
    const mySeq = ++seq.current;
    setDownload({ status: "working", kind });
    const p = kind === "csv" ? apiRef.current.exportCsv() : apiRef.current.convertToXlsx();
    p.then(
      (r) => {
        if (mySeq !== seq.current) return;
        saveBlob(r.blob, r.summary.downloadName);
        setDownload({ status: "done", name: r.summary.downloadName, bytes: r.blob.size });
      },
      (err: unknown) => {
        if (mySeq !== seq.current) return;
        const cancelled = err instanceof EngineError && err.code === "cancelled";
        setDownload({ status: "error", message: cancelled ? "Cancelled. Nothing was created." : err instanceof Error ? err.message : "The file could not be created." });
      },
    );
  };

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <FileJson className="size-5 text-primary" aria-hidden="true" /> Your JSON as a table
      </h2>
      <p className="mt-1 text-sm text-muted" role="status">
        {plural(json.records, json.lines ? "line" : "record")} · {plural(columns, "column")}
        {json.lines ? " · JSON Lines" : ""}
      </p>

      {json.lists.length > 1 && (
        <div className="mt-4">
          <label htmlFor="json-list" className="text-sm font-semibold">
            Which list to show
          </label>
          <select
            id="json-list"
            className="mt-1 block h-11 w-full max-w-md rounded-xl border border-line bg-background px-3 text-sm"
            value={json.path ?? ""}
            onChange={(e) => {
              setDownload({ status: "idle" });
              apiRef.current.reopen({ jsonPath: e.target.value });
            }}
          >
            {json.lists.map((l) => (
              <option key={l.path} value={l.path}>
                {listLabel(l.path)} ({plural(l.length, "item")})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">This file holds more than one list. The largest one is shown first.</p>
        </div>
      )}

      {(json.listsAsText > 0 || json.longNumbers > 0 || json.path === null) && (
        <ul className="mt-4 space-y-1 text-sm">
          {json.path === null && (
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              The file holds one object, so it is shown as one row.
            </li>
          )}
          {json.listsAsText > 0 && (
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {plural(json.listsAsText, "cell")} {json.listsAsText === 1 ? "holds" : "hold"} a list from the JSON (for example several phone numbers), kept as JSON text so nothing is lost.
            </li>
          )}
          {json.longNumbers > 0 && (
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {plural(json.longNumbers, "number")} longer than 15 digits {json.longNumbers === 1 ? "was" : "were"} kept exactly as written (Excel would round {json.longNumbers === 1 ? "it" : "them"}).
            </li>
          )}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => run("csv")} disabled={download.status === "working"}>
          {download.status === "working" && download.kind === "csv" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          Download CSV
        </Button>
        <Button variant="outline" onClick={() => run("xlsx")} disabled={download.status === "working"}>
          {download.status === "working" && download.kind === "xlsx" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          Download Excel (.xlsx)
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        In the Excel file, plain numbers become numbers and year-month-day dates become dates; codes with leading zeros and long numbers stay text.
      </p>
      <div aria-live="polite">
        {download.status === "working" && <p className="mt-3 text-sm text-muted">Creating the file and checking it cell by cell…</p>}
        {download.status === "done" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {download.name} ({formatBytes(download.bytes)}) was checked and downloaded. Your JSON file is unchanged.
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

/** Paste JSON instead of choosing a file (shown before a file is open). */
export function PasteJson({ open }: { open: (file: File, format: SpreadsheetFormat) => void }) {
  const [text, setText] = useState("");
  const [lines, setLines] = useState(false);
  return (
    <Card>
      <label htmlFor="json-paste" className="flex items-center gap-2 font-semibold">
        <ClipboardPaste className="size-4 text-primary" aria-hidden="true" /> Or paste JSON
      </label>
      <textarea
        id="json-paste"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        spellCheck={false}
        placeholder='[{"name": "Asha", "city": "Pune"}, {"name": "Ben", "city": "Rome"}]'
        className="mt-2 w-full rounded-xl border border-line bg-background px-3 py-2 font-mono text-sm"
      />
      <label className="mt-2 flex min-h-10 cursor-pointer items-center gap-2 text-sm">
        <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={lines} onChange={(e) => setLines(e.target.checked)} />
        One record per line (JSON Lines)
      </label>
      <Button className="mt-2" disabled={text.trim() === ""} onClick={() => open(new File([text], lines ? "pasted.jsonl" : "pasted.json", { type: "application/json" }), "json")}>
        Show as a table
      </Button>
      <p className="mt-2 text-xs text-muted">What you paste stays in this browser; it is not sent anywhere.</p>
    </Card>
  );
}
