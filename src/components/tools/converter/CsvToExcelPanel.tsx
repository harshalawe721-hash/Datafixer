"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ChevronDown, Download, FileSpreadsheet, RotateCcw, ShieldCheck, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProcessingProgress } from "@/components/spreadsheet/ProcessingProgress";
import { useFileHandoff } from "@/components/upload/FileHandoffProvider";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import { saveBlob } from "@/components/tools/fix/DownloadDialog";
import type { ConvertResult } from "@/engine/core";
import type { ProgressEvent } from "@/engine/types";
import type { ValidationResult } from "@/engine/validate/validate";
import { EngineError } from "@/engine/errors";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";

type State =
  | { status: "ready" }
  | { status: "working"; progress: ProgressEvent | null }
  | { status: "done"; result: ConvertResult }
  | { status: "error"; message: string; cancelled: boolean };

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/**
 * CSV to Excel (Stage 6): a short structure check, the settings, then a new
 * .xlsx workbook created and checked on the device (decisions 1, 2 and 6).
 * The CSV file is never changed.
 */
export function CsvToExcelPanel({ api }: { api: ToolApi }) {
  const key = `${api.viewKey}:${api.headerRow}`;
  const [state, setState] = useState<State>({ status: "ready" });
  const [stateKey, setStateKey] = useState(key);
  const [verdict, setVerdict] = useState<{ key: string; result: ValidationResult } | null>(null);
  const seq = useRef(0);
  const apiRef = useRef(api);
  const { setPending } = useFileHandoff();
  useEffect(() => {
    apiRef.current = api;
  });

  // A different file, separator, encoding or column-names setting: start again.
  if (stateKey !== key) {
    setStateKey(key);
    setState({ status: "ready" });
  }

  // The Validator's verdict, so problems can be repaired before converting.
  useEffect(() => {
    if (!api.sheetReady) return;
    let live = true;
    apiRef.current
      .validate({ headerRow: apiRef.current.headerRow })
      .then((result) => live && setVerdict({ key, result }))
      .catch(() => live && setVerdict(null));
    return () => {
      live = false;
    };
  }, [key, api.sheetReady]);

  if (!api.sheetReady) return null;

  const convert = () => {
    const mySeq = ++seq.current;
    setState({ status: "working", progress: null });
    apiRef.current
      .convertToXlsx((progress) => {
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
          setState({ status: "error", cancelled, message: cancelled ? "The conversion was cancelled. Nothing was created." : err instanceof Error ? err.message : "The Excel file could not be created." });
        },
      );
  };

  if (state.status === "working") {
    return (
      <ProcessingProgress
        fileName="Creating your Excel file"
        progress={state.progress}
        phaseLabels={{ exporting: "Writing the Excel file", verifying: "Checking the new file cell by cell" }}
        onCancel={() => {
          apiRef.current.abortScans();
        }}
      />
    );
  }

  if (state.status === "done") return <Done result={state.result} onAgain={() => setState({ status: "ready" })} />;

  const v = verdict?.key === key ? verdict.result : null;
  return (
    <section aria-labelledby="convert-heading" className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="convert-heading" className="text-lg font-semibold">
              Convert to Excel
            </h2>
            <p className="text-sm text-muted">A new .xlsx workbook is created on this device. Your CSV file is not uploaded and is never changed.</p>
          </div>
        </div>

        {v && <Verdict result={v} onRepair={() => setPending({ file: api.file, format: "csv" })} />}

        <label className="mt-4 flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={api.headerRow} onChange={(e) => api.setHeaderRow(e.target.checked)} />
          <span>
            <span className="font-medium">First row contains column names</span>
            <span className="block text-muted">
              {api.headerRow ? "The first row stays text, in bold, frozen at the top, with a filter." : "Every row is treated as data. No header formatting is added."}
            </span>
          </span>
        </label>

        <details className="group mt-3 rounded-xl border border-line px-4 py-3 text-sm [&_summary::-webkit-details-marker]:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
            Which values become numbers and dates
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
            <li>Plain numbers such as 42, -3.5 or 1.50 become numbers, and look the same in Excel (1.50 keeps two decimals).</li>
            <li>Dates written year-month-day (2024-03-15) become real Excel dates, shown the same way.</li>
            <li>
              Everything else stays text exactly as written, so nothing is lost: leading zeros (007, phone numbers, ZIP codes), more than 15 digits, 1,250, 12%, $5,
              03/04/2024 (it could be 3 April or March 4), and values that start like formulas (=1+1 is never run).
            </li>
            <li>More rows than an Excel sheet holds (1,048,576) continue on another sheet{api.headerRow ? ", with the column names repeated" : ""}.</li>
          </ul>
        </details>

        {state.status === "error" && (
          <p role={state.cancelled ? "status" : "alert"} className={cn("mt-4 rounded-xl px-4 py-3 text-sm", state.cancelled ? "bg-surface-muted" : "bg-danger-soft text-danger")}>
            {state.message}
          </p>
        )}

        <Button className="mt-4 h-12 w-full sm:w-auto" onClick={convert}>
          <Download className="size-4" aria-hidden="true" /> {state.status === "error" && !state.cancelled ? "Try again" : "Convert to Excel (.xlsx)"}
        </Button>
      </Card>
    </section>
  );
}

function Verdict({ result, onRepair }: { result: ValidationResult; onRepair: () => void }) {
  const ok = result.verdict.valid;
  const Icon = ok ? (result.verdict.warnings ? AlertTriangle : CheckCircle2) : XCircle;
  return (
    <div className={cn("mt-4 rounded-xl px-4 py-3 text-sm", ok ? "bg-surface-muted" : "bg-danger-soft")}>
      <p className="flex items-start gap-2">
        <Icon className={cn("mt-0.5 size-4 shrink-0", ok ? (result.verdict.warnings ? "text-warning" : "text-success") : "text-danger")} aria-hidden="true" />
        <span>
          <span className="font-semibold">
            {ok ? (result.verdict.warnings ? `Valid CSV, with ${plural(result.verdict.warnings, "warning")}.` : "Valid CSV file.") : `${plural(result.verdict.errors, "problem")} in the file's structure.`}
          </span>{" "}
          {ok ? "It can be converted as it is." : `${result.verdict.importReady} Converting keeps the data exactly as it is, problems included.`}
        </span>
      </p>
      {(!ok || result.verdict.warnings > 0) && (
        <Link href="/csv-validator" onClick={onRepair} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 font-semibold hover:bg-surface-muted">
          <ShieldCheck className="size-4" aria-hidden="true" /> Check and repair in the CSV Validator
        </Link>
      )}
    </div>
  );
}

function Done({ result, onAgain }: { result: ConvertResult; onAgain: () => void }) {
  const s = result.summary;
  const rows: [string, string][] = [
    ["Original file", s.originalName],
    ["Downloaded file", `${s.downloadName} (${formatBytes(s.bytes)})`],
    ...s.sheets.map((sh, i): [string, string] => [i === 0 ? (s.sheets.length > 1 ? "Sheets" : "Sheet") : "", `${sh.name}: ${plural(sh.rows, "row")}${s.headerRow ? " + column names" : ""}`]),
    ["Numbers", fmt(s.counts.numbers)],
    ["Dates", fmt(s.counts.dates)],
    ["Text", fmt(s.counts.text)],
    ["Empty cells", fmt(s.counts.empty)],
  ];
  return (
    <section aria-labelledby="converted-heading" className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <h2 id="converted-heading" className="text-lg font-semibold">
              Excel file created
            </h2>
            <p className="text-sm" role="status">
              Your download has started. Before it was offered, DataFixer read the new file back and checked all {fmt(s.verification.cells)} cells in{" "}
              {plural(s.verification.rows, "row")}.
            </p>
          </div>
        </div>
        {s.split && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              The file has more rows than one Excel sheet holds, so it continues on {plural(s.sheets.length - 1, "more sheet")}
              {s.headerRow ? ", each starting with the column names" : ""}. No row was left out.
            </span>
          </p>
        )}
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {rows.map(([k, val], i) => (
            <div key={i} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="min-w-0 break-words font-medium">{val}</dd>
            </div>
          ))}
        </dl>
        {s.keptAsText.length > 0 && (
          <div className="mt-4 rounded-xl border border-line px-4 py-3 text-sm">
            <p className="font-semibold">Kept as text on purpose</p>
            <ul className="mt-1 space-y-1 text-muted">
              {s.keptAsText.map((k) => (
                <li key={k.reason}>
                  <span className="font-medium text-foreground tabular-nums">{fmt(k.count)}</span> — {k.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => saveBlob(result.blob, s.downloadName)}>
            <Download className="size-4" aria-hidden="true" /> Download again
          </Button>
          <Button variant="outline" onClick={onAgain}>
            <RotateCcw className="size-4" aria-hidden="true" /> Change settings and convert again
          </Button>
        </div>
      </Card>
    </section>
  );
}
