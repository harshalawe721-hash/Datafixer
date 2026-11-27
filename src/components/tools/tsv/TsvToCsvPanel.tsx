"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, AlertTriangle, ArrowRightLeft, CheckCircle2, ChevronDown, Download, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import { useFileHandoff } from "@/components/upload/FileHandoffProvider";
import { saveBlob } from "@/components/tools/fix/DownloadDialog";
import type { ValidationResult } from "@/engine/validate/validate";
import { EngineError } from "@/engine/errors";
import { formatBytes } from "@/lib/format";
import { cn } from "@/lib/cn";

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

const SEPARATOR_NAMES: Record<string, string> = { "\t": "tabs", ",": "commas", ";": "semicolons", "|": "pipes (|)" };
const OUT_SEPARATORS = [
  { value: ",", label: "Comma", hint: "the usual CSV" },
  { value: ";", label: "Semicolon", hint: "for Excel in countries that write 3,5" },
  { value: "\t", label: "Tab", hint: "a TSV file again" },
] as const;

type DownloadState = { status: "idle" } | { status: "working"; kind: "csv" | "xlsx" } | { status: "done"; name: string; bytes: number } | { status: "error"; message: string };

/**
 * TSV to CSV (Stage 13): the separator found, a quick structure check (with a
 * link to the CSV Validator), and downloads: CSV with the chosen separator,
 * line endings and BOM (decision 2A), or Excel (decision 3A). Every download is
 * read back and checked before it is offered.
 */
export function TsvToCsvPanel({ api }: { api: ToolApi }) {
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const { setPending } = useFileHandoff();
  const [separator, setSeparator] = useState<"," | ";" | "\t">(",");
  const [lineEnding, setLineEnding] = useState<"\r\n" | "\n">("\r\n");
  const [bom, setBom] = useState(true);
  const [download, setDownload] = useState<DownloadState>({ status: "idle" });
  const [verdict, setVerdict] = useState<{ key: string; result: ValidationResult } | null>(null);
  const seq = useRef(0);
  const key = `${api.viewKey}:${api.headerRow}`;

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
  const found = api.summary.csv?.delimiter ?? "\t";
  const v = verdict?.key === key ? verdict.result : null;
  const outExt = separator === "\t" ? "TSV" : "CSV";

  const run = (kind: "csv" | "xlsx") => {
    const mySeq = ++seq.current;
    setDownload({ status: "working", kind });
    const p = kind === "csv" ? apiRef.current.exportCsv(undefined, { delimiter: separator, lineEnding, bom }) : apiRef.current.convertToXlsx();
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
  const change = (fn: () => void) => {
    setDownload({ status: "idle" });
    fn();
  };

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <ArrowRightLeft className="size-5 text-primary" aria-hidden="true" /> Convert to CSV
      </h2>
      <p className="mt-1 text-sm" role="status">
        The values in this file are separated by <strong>{SEPARATOR_NAMES[found] ?? `“${found}”`}</strong>.{" "}
        <span className="text-muted">If that looks wrong in the table, change “Column separator” above.</span>
      </p>

      {v && (
        <div className={cn("mt-4 rounded-xl px-4 py-3 text-sm", v.verdict.valid ? "bg-surface-muted" : "bg-danger-soft")}>
          <p className="flex items-start gap-2">
            {v.verdict.valid ? (
              v.verdict.warnings ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              )
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
            )}
            <span>
              <span className="font-semibold">
                {v.verdict.valid
                  ? v.verdict.warnings
                    ? `The structure is fine, with ${plural(v.verdict.warnings, "warning")}.`
                    : "The structure is fine: every row has the same number of values."
                  : `${plural(v.verdict.errors, "problem")} in the file's structure.`}
              </span>{" "}
              {v.verdict.valid ? "It can be converted as it is." : "Converting keeps the data exactly as it is, problems included."}
            </span>
          </p>
          {(!v.verdict.valid || v.verdict.warnings > 0) && (
            <Link
              href="/csv-validator"
              onClick={() => setPending({ file: api.file, format: "csv" })}
              className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-surface px-3 font-semibold hover:bg-surface-muted"
            >
              <ShieldCheck className="size-4" aria-hidden="true" /> Check and repair in the CSV Validator
            </Link>
          )}
        </div>
      )}

      <fieldset className="mt-4">
        <legend className="text-sm font-semibold">Separator in the new file</legend>
        <div className="mt-1 flex flex-wrap gap-x-5">
          {OUT_SEPARATORS.map((o) => (
            <label key={o.label} className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
              <input type="radio" className="size-5 accent-[var(--primary)]" name="tsv-separator" checked={separator === o.value} onChange={() => change(() => setSeparator(o.value))} />
              {o.label} <span className="text-muted">({o.hint})</span>
            </label>
          ))}
        </div>
      </fieldset>

      <details className="group mt-3 rounded-xl border border-line px-4 py-3 text-sm [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 font-semibold">
          More options
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <fieldset className="mt-2">
          <legend className="font-medium">Line endings</legend>
          <div className="mt-1 flex flex-wrap gap-x-5">
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2">
              <input type="radio" className="size-5 accent-[var(--primary)]" name="tsv-eol" checked={lineEnding === "\r\n"} onChange={() => change(() => setLineEnding("\r\n"))} />
              Windows (recommended)
            </label>
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2">
              <input type="radio" className="size-5 accent-[var(--primary)]" name="tsv-eol" checked={lineEnding === "\n"} onChange={() => change(() => setLineEnding("\n"))} />
              Mac and Linux
            </label>
          </div>
        </fieldset>
        <label className="mt-1 flex min-h-10 cursor-pointer items-center gap-2">
          <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={bom} onChange={(e) => change(() => setBom(e.target.checked))} />
          Add a UTF-8 marker (BOM), so Excel shows accented letters correctly
        </label>
      </details>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => run("csv")} disabled={download.status === "working"}>
          {download.status === "working" && download.kind === "csv" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          Download {outExt}
        </Button>
        <Button variant="outline" onClick={() => run("xlsx")} disabled={download.status === "working"}>
          {download.status === "working" && download.kind === "xlsx" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          Download Excel (.xlsx)
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        Values containing the new separator, quotes or line breaks are put in quotes, so they stay in one cell. In the Excel file, codes with leading zeros stay text and plain
        numbers become numbers.
      </p>
      <div aria-live="polite">
        {download.status === "working" && <p className="mt-3 text-sm text-muted">Creating the file and checking it cell by cell…</p>}
        {download.status === "done" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {download.name} ({formatBytes(download.bytes)}) was checked and downloaded. Your original file is unchanged.
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
