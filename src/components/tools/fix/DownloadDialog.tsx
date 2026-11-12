"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Download, FileDown, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { ProcessingProgress } from "@/components/spreadsheet/ProcessingProgress";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import type { CsvDownloadOptions, ExportResult } from "@/engine/core";
import type { ProgressEvent } from "@/engine/types";
import { EngineError } from "@/engine/errors";
import { formatBytes } from "@/lib/format";
import { XLS_REBUILD_LOSSES } from "@/engine/export/xls-losses";

type Kind = "xlsx" | "csv";

type State =
  | { status: "confirm" }
  | { status: "options" }
  | { status: "working"; progress: ProgressEvent | null; kind: Kind }
  | { status: "done"; result: ExportResult }
  | { status: "error"; message: string; cancelled: boolean; kind: Kind };

const fmt = (n: number) => n.toLocaleString("en-US");

const SEPARATORS = [
  { value: ",", label: "Comma (,)", hint: "The usual choice" },
  { value: ";", label: "Semicolon (;)", hint: "Excel in many European countries" },
  { value: "\t", label: "Tab", hint: "Saved as .tsv" },
] as const;
const LINE_ENDINGS = [
  { value: "\r\n", label: "CRLF (Windows)", hint: "Works everywhere" },
  { value: "\n", label: "LF (Unix, Mac)", hint: "Linux tools, many databases" },
] as const;
/** How a summary describes the written file. */
export function describeCsv(c: NonNullable<ExportResult["summary"]["csv"]>): string {
  const sep = SEPARATORS.find((x) => x.value === c.delimiter)?.label ?? `“${c.delimiter}”`;
  const eol = LINE_ENDINGS.find((x) => x.value === c.lineEnding)?.label ?? c.lineEnding;
  return `${sep} · ${eol} · UTF-8 ${c.bom ? "with BOM" : "without BOM"}`;
}

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
 * Download the corrected file (safeguards S3, S4): CSV files as CSV; Excel
 * files as Excel (recommended: only the edited cells change inside the original
 * workbook) or as CSV. The file is created and checked cell by cell in the
 * worker; only then is it offered, with a summary of everything that changed.
 * A failed or cancelled export downloads nothing and keeps all changes.
 */
export function DownloadDialog({ api, onClose }: { api: ToolApi; onClose: () => void }) {
  const excel = api.format !== "csv";
  const withOptions = !excel && api.csvDownloadOptions;
  // Excel files: choose Excel or CSV first, with what each keeps. CSV Validator: choose the format first.
  const [state, setState] = useState<State>(excel ? { status: "confirm" } : withOptions ? { status: "options" } : { status: "working", progress: null, kind: "csv" });
  const original = api.summary.csv;
  const [csvOptions, setCsvOptions] = useState<Required<CsvDownloadOptions>>(() => ({
    delimiter: original && (original.delimiter === ";" || original.delimiter === "\t") ? original.delimiter : ",",
    lineEnding: original?.lineEnding === "\n" ? "\n" : "\r\n",
    bom: true,
  }));
  const seq = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });

  const run = (mySeq: number, kind: Kind) => {
    const onProgress = (progress: ProgressEvent) => {
      if (mySeq === seq.current) setState((s) => (s.status === "working" ? { ...s, progress } : s));
    };
    (kind === "xlsx" ? apiRef.current.exportXlsx(onProgress) : apiRef.current.exportCsv(onProgress, withOptions ? csvOptions : undefined))
      .then(
        (result) => {
          if (mySeq !== seq.current) return;
          setState({ status: "done", result });
          saveBlob(result.blob, result.summary.downloadName);
          apiRef.current.markDownloaded(result.summary.version);
        },
        (err: unknown) => {
          if (mySeq !== seq.current) return;
          const cancelled = err instanceof EngineError && err.code === "cancelled";
          setState({ status: "error", kind, cancelled, message: cancelled ? "The download was cancelled. Nothing was downloaded, and your changes are kept." : err instanceof Error ? err.message : "The file could not be created. Your changes are kept." });
        },
      );
  };
  const start = (kind: Kind) => {
    const mySeq = ++seq.current;
    setState({ status: "working", progress: null, kind });
    run(mySeq, kind);
  };

  // CSV files start straight away (the initial state is already "working").
  useEffect(() => {
    if (!excel && !withOptions) run(++seq.current, "csv");
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
              <p className="text-sm">Choose the kind of file. Your original file is never changed; the download is a new file.</p>
              <section className="rounded-xl border-2 border-primary/50 px-4 py-3 text-sm">
                <h3 className="font-semibold">Excel file (.xlsx) · recommended</h3>
                {api.format === "xlsx" ? (
                  <p className="mt-1 text-muted">
                    Only the cells you changed are changed inside your original workbook. Formatting, formulas, other sheets, charts and everything else stay exactly
                    as they are.
                  </p>
                ) : (
                  <>
                    <p className="mt-1 text-muted">Old .xls files are saved in the newer .xlsx format. Values, formulas, number formats, merged cells, comments and other sheets are kept, but not:</p>
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                      {XLS_REBUILD_LOSSES.map((l) => (
                        <li key={l}>{l}</li>
                      ))}
                    </ul>
                  </>
                )}
                <Button className="mt-3 w-full sm:w-auto" onClick={() => start("xlsx")}>
                  <Download className="size-4" aria-hidden="true" /> Download Excel file
                </Button>
              </section>
              <section className="rounded-xl border border-line px-4 py-3 text-sm">
                <h3 className="font-semibold">CSV file · values only</h3>
                <p className="mt-1 flex items-start gap-2 text-muted">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden="true" />
                  <span>A CSV holds this sheet&apos;s values only: no formatting, formulas, other sheets, charts or images.</span>
                </p>
                <Button variant="outline" className="mt-3 w-full sm:w-auto" onClick={() => start("csv")}>
                  <Download className="size-4" aria-hidden="true" /> Download as CSV
                </Button>
              </section>
            </>
          )}

          {state.status === "options" && <CsvOptions value={csvOptions} onChange={setCsvOptions} />}

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
          {state.status === "options" && (
            <Button onClick={() => start("csv")}>
              <Download className="size-4" aria-hidden="true" /> Create and download
            </Button>
          )}
          {state.status === "error" && !state.cancelled && state.kind === "xlsx" && (
            // S4: the safer option when an Excel download fails (e.g. not enough memory to check it).
            <Button variant="outline" onClick={() => start("csv")}>
              <Download className="size-4" aria-hidden="true" /> Download as CSV instead
            </Button>
          )}
          {state.status === "error" && (
            <Button onClick={() => start(state.kind)}>
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
    ...(s.csv ? [["File format", describeCsv(s.csv)] as [string, string]] : []),
    ["Cells edited", fmt(s.cellsEdited)],
    ["Rows removed", fmt(s.rowsRemoved)],
    ["Columns removed", fmt(s.columnsRemoved)],
    ...(s.rowsShortened ? [["Rows shortened (empty extra fields removed)", fmt(s.rowsShortened)] as [string, string]] : []),
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
          <p className="mt-1 text-muted">
            {s.format === "xlsx" ? "None. Formatting, formulas, other sheets, charts and every other part of your workbook are kept." : "None. A CSV file holds values only, and all of them are included."}
          </p>
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

function OptionGroup<T extends string | boolean>({
  legend,
  name,
  options,
  current,
  set,
}: {
  legend: string;
  name: string;
  options: readonly { value: T; label: string; hint: string }[];
  current: T;
  set: (v: T) => void;
}) {
  return (
    <fieldset className="rounded-xl border border-line px-4 py-3">
      <legend className="px-1 text-sm font-semibold">{legend}</legend>
      {options.map((o) => (
        <label key={String(o.value)} className="flex min-h-10 cursor-pointer flex-wrap items-center gap-x-2 text-sm">
          <input type="radio" className="size-5 shrink-0 accent-[var(--primary)]" name={name} checked={current === o.value} onChange={() => set(o.value)} />
          <span className="font-medium">{o.label}</span>
          <span className="text-muted">· {o.hint}</span>
        </label>
      ))}
    </fieldset>
  );
}

const BOM_OPTIONS = [
  { value: true, label: "UTF-8 with BOM", hint: "Recommended: Excel shows accents correctly" },
  { value: false, label: "UTF-8 without BOM (for databases)", hint: "MySQL, PostgreSQL, scripts and most programs" },
] as const;

/** CSV Validator (decision 3): separator, line endings and BOM for the download. */
function CsvOptions({ value, onChange }: { value: Required<CsvDownloadOptions>; onChange: (v: Required<CsvDownloadOptions>) => void }) {
  return (
    <>
      <p className="text-sm">Choose how the new file is written. Every value is saved exactly, including quotes, separators and line breaks inside values. Your original file is never changed.</p>
      <OptionGroup<CsvDownloadOptions["delimiter"] & string> legend="Separator" name="dl-sep" options={SEPARATORS} current={value.delimiter} set={(delimiter) => onChange({ ...value, delimiter })} />
      <OptionGroup<CsvDownloadOptions["lineEnding"] & string> legend="Line endings" name="dl-eol" options={LINE_ENDINGS} current={value.lineEnding} set={(lineEnding) => onChange({ ...value, lineEnding })} />
      <OptionGroup<boolean> legend="Text encoding" name="dl-bom" options={BOM_OPTIONS} current={value.bom} set={(bom) => onChange({ ...value, bom })} />
    </>
  );
}
