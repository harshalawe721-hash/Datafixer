"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, FileArchive, FileText, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProcessingProgress } from "@/components/spreadsheet/ProcessingProgress";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import { CsvOptions, describeCsv, saveBlob } from "@/components/tools/fix/DownloadDialog";
import type { CsvFormat, ExportResult, WorkbookZipResult } from "@/engine/core";
import type { ProgressEvent } from "@/engine/types";
import { EngineError } from "@/engine/errors";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";

type Values = "shown" | "plain";
type State =
  | { status: "ready" }
  | { status: "working"; progress: ProgressEvent | null; zip: boolean }
  | { status: "done"; result: { kind: "sheet"; r: ExportResult } | { kind: "zip"; r: WorkbookZipResult } }
  | { status: "error"; message: string; cancelled: boolean };

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

const VALUE_OPTIONS: { value: Values; label: string; hint: string }[] = [
  { value: "shown", label: "As shown in Excel", hint: "Recommended: dates and numbers look as they do on screen, e.g. 13/11/2026 or 1,250.00" },
  { value: "plain", label: "Plain values (for databases)", hint: "Dates as 2026-11-13, numbers in full precision without formatting, TRUE/FALSE as words" },
];

/**
 * Excel to CSV (Stage 6): the chosen sheet, or every sheet as a ZIP
 * (decision 3), with values as shown or plain (decision 4) and the Stage 5
 * format options. Every file is checked cell by cell before it is offered.
 */
export function ExcelToCsvPanel({ api }: { api: ToolApi }) {
  const [state, setState] = useState<State>({ status: "ready" });
  const [values, setValues] = useState<Values>("shown");
  const [format, setFormat] = useState<CsvFormat>({ delimiter: ",", lineEnding: "\r\n", bom: true });
  const [stateKey, setStateKey] = useState(api.viewKey);
  const seq = useRef(0);
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  if (stateKey !== api.viewKey) {
    setStateKey(api.viewKey);
    setState({ status: "ready" });
  }

  const worksheets = api.summary.sheets.filter((s) => s.kind === "worksheet");
  const active = api.summary.sheets.find((s) => s.name === api.summary.activeSheet);

  const run = (zip: boolean) => {
    const mySeq = ++seq.current;
    setState({ status: "working", progress: null, zip });
    const onProgress = (progress: ProgressEvent) => {
      if (mySeq === seq.current) setState((s) => (s.status === "working" ? { ...s, progress } : s));
    };
    const options = { ...format, values };
    const job = zip
      ? apiRef.current.exportWorkbookZip(options, onProgress).then((r) => ({ kind: "zip" as const, r }))
      : apiRef.current.exportCsv(onProgress, options).then((r) => ({ kind: "sheet" as const, r }));
    job.then(
      (result) => {
        if (mySeq !== seq.current) return;
        setState({ status: "done", result });
        saveBlob(result.r.blob, result.r.summary.downloadName);
      },
      (err: unknown) => {
        if (mySeq !== seq.current) return;
        const cancelled = err instanceof EngineError && err.code === "cancelled";
        setState({ status: "error", cancelled, message: cancelled ? "The download was cancelled. Nothing was downloaded." : err instanceof Error ? err.message : "The file could not be created." });
      },
    );
  };

  if (state.status === "working") {
    return (
      <ProcessingProgress
        fileName={state.zip ? "Creating a CSV file for every sheet" : `Creating ${active?.name ?? "the sheet"} as CSV`}
        progress={state.progress}
        phaseLabels={state.zip ? { exporting: "Reading and writing the sheets", verifying: "Checking the ZIP file" } : { exporting: "Writing the CSV file", verifying: "Checking the new file cell by cell" }}
        onCancel={() => apiRef.current.abortScans()}
      />
    );
  }
  if (state.status === "done") return <Done result={state.result} values={values} onAgain={() => setState({ status: "ready" })} />;

  return (
    <section aria-labelledby="to-csv-heading" className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="to-csv-heading" className="text-lg font-semibold">
              Convert to CSV
            </h2>
            <p className="text-sm text-muted">
              {api.sheetReady ? (
                <>
                  Sheet: <span className="font-medium text-foreground">{active?.name}</span>
                  {active && active.state !== "visible" ? " (hidden in Excel)" : ""}
                  {worksheets.length > 1 ? ". Choose another sheet in the list above, or download every sheet at once." : "."}
                </>
              ) : (
                "This sheet has no cells to convert. Choose a worksheet in the list above, or download every sheet at once."
              )}{" "}
              The CSV is created on this device; your workbook is never changed.
            </p>
          </div>
        </div>

        <fieldset className="mt-4 rounded-xl border border-line px-4 py-3">
          <legend className="px-1 text-sm font-semibold">Values in the new file</legend>
          {VALUE_OPTIONS.map((o) => (
            <label key={o.value} className="flex min-h-10 cursor-pointer flex-wrap items-center gap-x-2 text-sm">
              <input type="radio" className="size-5 shrink-0 accent-[var(--primary)]" name="to-csv-values" checked={values === o.value} onChange={() => setValues(o.value)} />
              <span className="font-medium">{o.label}</span>
              <span className="text-muted">· {o.hint}</span>
            </label>
          ))}
        </fieldset>

        <div className="mt-3 space-y-3">
          <CsvOptions value={format} onChange={setFormat} fromExcel />
        </div>

        {state.status === "error" && (
          <p role={state.cancelled ? "status" : "alert"} className={cn("mt-4 rounded-xl px-4 py-3 text-sm", state.cancelled ? "bg-surface-muted" : "bg-danger-soft text-danger")}>
            {state.message}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          {api.sheetReady && (
            <Button className="h-12" onClick={() => run(false)}>
              <Download className="size-4" aria-hidden="true" /> Download this sheet as CSV
            </Button>
          )}
          {worksheets.length > 1 && (
            <Button variant={api.sheetReady ? "outline" : "primary"} className="h-12" onClick={() => run(true)}>
              <FileArchive className="size-4" aria-hidden="true" /> All {worksheets.length} sheets (ZIP)
            </Button>
          )}
        </div>
      </Card>
    </section>
  );
}

function Done({ result, values, onAgain }: { result: { kind: "sheet"; r: ExportResult } | { kind: "zip"; r: WorkbookZipResult }; values: Values; onAgain: () => void }) {
  const s = result.r.summary;
  const formatLine = s.csv ? `${describeCsv(s.csv)} · ${values === "plain" ? "plain values" : "values as shown in Excel"}` : "";
  const rows: [string, string][] =
    result.kind === "sheet"
      ? [
          ["Original file", result.r.summary.originalName],
          ["Downloaded file", `${result.r.summary.downloadName} (${formatBytes(result.r.summary.bytes)})`],
          ["File format", formatLine],
          ["Rows", fmt(result.r.summary.rows)],
        ]
      : [
          ["Original file", result.r.summary.originalName],
          ["Downloaded file", `${result.r.summary.downloadName} (${formatBytes(result.r.summary.bytes)})`],
          ["File format", formatLine],
          ...result.r.summary.files.map((f, i): [string, string] => [i === 0 ? "Files in the ZIP" : "", `${f.name}${f.hidden ? " (hidden sheet)" : ""}: ${plural(f.rows, "row")}`]),
        ];
  const checked =
    result.kind === "sheet"
      ? `checked all ${fmt(result.r.summary.verification.cells)} cells in ${plural(result.r.summary.verification.rows, "row")}`
      : `checked every cell of all ${plural(result.r.summary.files.length, "file")} (${fmt(result.r.summary.files.reduce((n, f) => n + f.cells, 0))} cells) and read the ZIP back`;
  return (
    <section aria-labelledby="to-csv-done" className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="to-csv-done" className="text-lg font-semibold">
              {result.kind === "zip" ? "ZIP file created" : "CSV file created"}
            </h2>
            <p className="text-sm" role="status">
              Your download has started. Before it was offered, DataFixer {checked}.
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map(([k, v], i) => (
            <div key={i} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 break-words font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 rounded-xl border border-line px-4 py-3 text-sm">
          <p className="font-semibold">What a CSV file can&apos;t keep</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
            {s.notPreserved.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
        {s.warnings.length > 0 && (
          <ul className="mt-3 space-y-1 text-sm">
            {s.warnings.map((w) => (
              <li key={w} className="flex items-start gap-2 text-muted">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => saveBlob(result.r.blob, s.downloadName)}>
            <Download className="size-4" aria-hidden="true" /> Download again
          </Button>
          <Button variant="outline" onClick={onAgain}>
            <RotateCcw className="size-4" aria-hidden="true" /> Change settings or sheet
          </Button>
        </div>
      </Card>
    </section>
  );
}
