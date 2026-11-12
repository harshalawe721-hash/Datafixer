"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileDown, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProcessingProgress } from "@/components/spreadsheet/ProcessingProgress";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import type { ExportResult } from "@/engine/core";
import type { ProgressEvent } from "@/engine/types";
import { EngineError } from "@/engine/errors";
import { formatBytes } from "@/lib/format";

type State =
  | { status: "confirm" }
  | { status: "working"; progress: ProgressEvent | null }
  | { status: "done"; result: ExportResult }
  | { status: "error"; message: string; cancelled: boolean };

const fmt = (n: number) => n.toLocaleString("en-US");

/** Hand the file to the browser's download (a fresh link each time, released afterwards). */
function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Download the corrected file as CSV (safeguards S3, S4): the file is created
 * and checked cell by cell in the worker; only then is it offered, with a
 * summary of everything that changed. A failed or cancelled export downloads
 * nothing and keeps all changes.
 */
export function DownloadDialog({ api, onClose }: { api: ToolApi; onClose: () => void }) {
  const excel = api.format !== "csv";
  // Excel files: say what a CSV can't keep before anything is created.
  const [state, setState] = useState<State>(excel ? { status: "confirm" } : { status: "working", progress: null });
  const seq = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });

  const run = (mySeq: number) => {
    apiRef.current
      .exportCsv((progress) => {
        if (mySeq === seq.current) setState((s) => (s.status === "working" ? { ...s, progress } : s));
      })
      .then(
        (result) => {
          if (mySeq !== seq.current) return;
          setState({ status: "done", result });
          saveBlob(result.blob, result.summary.downloadName);
        },
        (err: unknown) => {
          if (mySeq !== seq.current) return;
          const cancelled = err instanceof EngineError && err.code === "cancelled";
          setState({ status: "error", cancelled, message: cancelled ? "The download was cancelled. Nothing was downloaded, and your changes are kept." : err instanceof Error ? err.message : "The file could not be created. Your changes are kept." });
        },
      );
  };
  const start = () => {
    const mySeq = ++seq.current;
    setState({ status: "working", progress: null });
    run(mySeq);
  };

  // CSV files start straight away (the initial state is already "working").
  useEffect(() => {
    if (!excel) run(++seq.current);
    const before = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const close = () => {
    if (state.status === "working") apiRef.current.abortScans();
    seq.current++;
    onClose();
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="download-title" tabIndex={-1} className="flex max-h-[100dvh] w-full flex-col bg-surface shadow-xl outline-none sm:max-h-[88vh] sm:max-w-xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex items-start gap-2">
            <FileDown className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
            <h2 id="download-title" className="text-lg font-semibold">
              {state.status === "done" ? "Export successful" : "Download the corrected file"}
            </h2>
          </div>
          <button type="button" onClick={close} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl hover:bg-surface-muted" aria-label="Close">
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {state.status === "confirm" && (
            <>
              <p className="text-sm">
                Excel download (keeping formatting and formulas) is being built next. For now you can download this sheet as a <strong>CSV file</strong>, which
                holds the values only.
              </p>
              <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm">
                <p className="flex items-center gap-2 font-semibold text-warning">
                  <AlertTriangle className="size-4" aria-hidden="true" /> A CSV file doesn&apos;t keep
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                  <li>Formatting such as fonts, colours, borders and column widths</li>
                  <li>Formulas (the values they show are saved instead)</li>
                  <li>Other sheets, charts, images, comments and merged cells</li>
                </ul>
                <p className="mt-2 text-muted">Your original Excel file is not changed. After the download you&apos;ll see exactly what wasn&apos;t kept.</p>
              </div>
            </>
          )}

          {state.status === "working" && (
            <ProcessingProgress fileName="Creating and checking your file" progress={state.progress} onCancel={close} />
          )}

          {state.status === "error" && (
            <div role={state.cancelled ? "status" : "alert"} className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm ${state.cancelled ? "bg-surface-muted" : "bg-danger-soft text-danger"}`}>
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{state.message}</span>
            </div>
          )}

          {state.status === "done" && <Summary result={state.result} />}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={close}>
            {state.status === "done" ? "Close" : "Cancel"}
          </Button>
          {state.status === "confirm" && (
            <Button onClick={start}>
              <Download className="size-4" aria-hidden="true" /> Download as CSV
            </Button>
          )}
          {state.status === "error" && (
            <Button onClick={start}>
              {state.cancelled ? "Start again" : "Try again"}
            </Button>
          )}
          {state.status === "done" && (
            <Button onClick={() => saveBlob(state.result.blob, state.result.summary.downloadName)}>
              <Download className="size-4" aria-hidden="true" /> Download again
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Summary({ result }: { result: ExportResult }) {
  const s = result.summary;
  const rows: [string, string][] = [
    ["Original file", s.originalName],
    ["Downloaded file", `${s.downloadName} (${formatBytes(s.bytes)})`],
    ["Cells edited", fmt(s.cellsEdited)],
    ["Rows removed", fmt(s.rowsRemoved)],
    ["Columns removed", fmt(s.columnsRemoved)],
    ["Duplicates removed", fmt(s.duplicatesRemoved)],
    ["Automatic corrections applied", fmt(s.automaticCorrections)],
    ["Cells edited by hand", fmt(s.manualEdits)],
  ];
  return (
    <>
      <p className="flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm" role="status">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          Your download has started. Before it was offered, DataFixer read the new file back and checked all {fmt(s.verification.cells)} cells in{" "}
          {fmt(s.verification.rows)} rows: every one matches your corrected data.
        </span>
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className="font-medium break-all">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="rounded-xl border border-line px-4 py-3 text-sm">
        <p className="font-semibold">Features that could not be kept</p>
        {s.notPreserved.length ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            {s.notPreserved.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-muted">None. A CSV file holds values only, and all of them are included.</p>
        )}
      </div>
      {s.warnings.length > 0 && (
        <div className="rounded-xl border border-line px-4 py-3 text-sm">
          <p className="font-semibold">Good to know</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            {s.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted">
        The file is saved by your browser, usually in your Downloads folder. If nothing appeared, tap “Download again”. Your original file is unchanged, and your
        changes stay here until you close this page.
      </p>
    </>
  );
}
