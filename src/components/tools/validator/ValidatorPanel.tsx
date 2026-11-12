"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, RotateCcw, XCircle } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProcessingProgress } from "@/components/spreadsheet/ProcessingProgress";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import type { ProgressEvent } from "@/engine/types";
import type { CheckId, ValidationResult } from "@/engine/validate/validate";
import { ISSUE_CHECK } from "@/engine/validate/validate";
import { EngineError } from "@/engine/errors";
import { columnLetter } from "@/engine/query/query";
import { IssueCard } from "@/components/tools/detector/IssueCard";
import { cn } from "@/lib/cn";

type State =
  | { status: "checking"; progress: ProgressEvent | null }
  | { status: "done"; result: ValidationResult }
  | { status: "cancelled" }
  | { status: "error"; message: string };

const SEPARATORS: Record<string, string> = { ",": "Comma (,)", ";": "Semicolon (;)", "\t": "Tab", "|": "Pipe (|)" };
const ENDINGS: Record<string, string> = { "\r\n": "CRLF (Windows)", "\n": "LF (Unix, Mac)", "\r": "CR (old Mac)", mixed: "Mixed", none: "None (one line)" };

const STATUS = {
  pass: { label: "Passed", icon: CheckCircle2, cls: "text-success" },
  error: { label: "Error", icon: XCircle, cls: "text-danger" },
  warning: { label: "Warning", icon: AlertTriangle, cls: "text-warning" },
  note: { label: "Note", icon: Info, cls: "text-primary" },
} as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * CSV Validator results (Stage 5). Checks automatically when a file is shown,
 * and again when the separator, the encoding or the column-names setting
 * changes. Read-only: nothing in the file is changed.
 */
export function ValidatorPanel({ api }: { api: ToolApi }) {
  const [recheck, setRecheck] = useState(0);
  const key = `${api.viewKey}:${api.headerRow}:${recheck}:${api.edits.version}`;
  const [state, setState] = useState<State>({ status: "checking", progress: null });
  const [startedKey, setStartedKey] = useState("");
  const seq = useRef(0);
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });

  if (api.sheetReady && startedKey !== key) {
    setStartedKey(key);
    setState({ status: "checking", progress: null });
  }

  useEffect(() => {
    if (!api.sheetReady) return;
    const mySeq = ++seq.current;
    const a = apiRef.current;
    a.viewIssue(null);
    a.validate({ headerRow: a.headerRow }, (progress) => {
      if (mySeq === seq.current) setState((s) => (s.status === "checking" ? { ...s, progress } : s));
    })
      .then((result) => {
        if (mySeq === seq.current) setState({ status: "done", result });
      })
      .catch((err: unknown) => {
        if (mySeq !== seq.current) return;
        if (err instanceof EngineError && err.code === "cancelled") setState({ status: "cancelled" });
        else setState({ status: "error", message: err instanceof Error ? err.message : "The file could not be checked." });
      });
  }, [key, api.sheetReady]);

  if (!api.sheetReady) return null;

  if (state.status === "checking") {
    return <ProcessingProgress fileName="Validating the CSV file" progress={state.progress} key={startedKey} onCancel={() => apiRef.current.abortScans()} />;
  }

  if (state.status === "cancelled" || state.status === "error") {
    return (
      <Card className={state.status === "error" ? "border-danger/40" : ""}>
        <h2 className="font-semibold">{state.status === "cancelled" ? "Check cancelled" : "This file couldn't be checked"}</h2>
        <p role={state.status === "error" ? "alert" : "status"} className="mt-1 text-sm text-muted">
          {state.status === "cancelled" ? "Your file is still open below. Nothing was changed." : state.message}
        </p>
        <Button size="sm" className="mt-4" onClick={() => setRecheck((n) => n + 1)}>
          <RotateCcw className="size-4" aria-hidden="true" /> Check again
        </Button>
      </Card>
    );
  }

  const { result } = state;
  const { verdict, file } = result;
  const firstIssueOf = (id: CheckId) => result.issues.find((i) => ISSUE_CHECK[i.id] === id);
  const columnLabel = (i: number) => {
    const name = result.columnNames[i]?.trim();
    const short = name && name.length > 40 ? `${name.slice(0, 39)}…` : name;
    return short ? `${short} (${columnLetter(i)})` : `Column ${columnLetter(i)}`;
  };
  const tone = !verdict.valid ? "invalid" : verdict.warnings ? "warnings" : "valid";
  const VerdictIcon = tone === "invalid" ? XCircle : tone === "warnings" ? AlertTriangle : CheckCircle2;
  const headline =
    tone === "invalid"
      ? `Not a valid CSV file: ${plural(verdict.errors, "error")}`
      : tone === "warnings"
        ? `Valid CSV, with ${plural(verdict.warnings, "warning")}`
        : "Valid CSV file";

  return (
    <section aria-labelledby="validator-heading" className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <VerdictIcon
            className={cn("mt-0.5 size-7 shrink-0", tone === "invalid" ? "text-danger" : tone === "warnings" ? "text-warning" : "text-success")}
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <h2 id="validator-heading" className="text-lg font-semibold">
              {headline}
            </h2>
            <p className="text-sm font-medium" aria-live="polite">
              {verdict.importReady}
            </p>
            <p className="mt-1 text-sm text-muted">
              Checked {plural(result.rows, "row")} on this device in {(result.timings.totalMs / 1000).toFixed(1)}s. Nothing was changed or uploaded.
            </p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
          <Fact label="Rows" value={result.rows.toLocaleString("en-US")} />
          <Fact label="Fields per row" value={result.expectedFields.toLocaleString("en-US")} />
          <Fact label="Errors" value={verdict.errors} cls={verdict.errors ? "text-danger" : "text-success"} />
          <Fact label="Warnings" value={verdict.warnings} cls={verdict.warnings ? "text-warning" : undefined} />
          <Fact label="Notes" value={verdict.notes} />
        </dl>
        <p className="mt-3 text-xs text-muted">
          {file.encoding.toUpperCase()}
          {file.hadBom ? " with BOM" : ""} · Separator: {SEPARATORS[file.delimiter] ?? `“${file.delimiter}”`} · Line endings: {ENDINGS[file.lineEnding]} ·{" "}
          {file.finalLineBreak ? "Ends with a line break" : "No line break at the end"}
        </p>

        <label className="mt-4 flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2.5 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 shrink-0" checked={api.headerRow} onChange={(e) => api.setHeaderRow(e.target.checked)} />
          <span>
            <span className="font-medium">First row contains column names</span>
            <span className="block text-muted">
              {api.headerRow
                ? "Column names are checked: missing or duplicate names are errors."
                : "The first row is treated as data, so column names are not checked."}
            </span>
          </span>
        </label>

        <h3 className="mt-5 text-sm font-semibold">Checklist</h3>
        <ul className="mt-2 divide-y divide-line text-sm">
          {result.checks.map((c) => {
            const st = STATUS[c.status];
            const Icon = st.icon;
            const first = firstIssueOf(c.id);
            const skipped = c.id === "header" && !result.headerRow;
            return (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className={cn("size-4 shrink-0", skipped ? "text-muted" : st.cls)} aria-hidden="true" />
                  {first ? (
                    <a href={`#issue-${first.id}`} className="hover:underline">
                      {c.label}
                    </a>
                  ) : (
                    <span>{c.label}</span>
                  )}
                </span>
                <span className={cn("shrink-0 text-xs font-semibold", skipped ? "text-muted" : st.cls)}>{skipped ? "Not checked" : st.label}</span>
              </li>
            );
          })}
        </ul>
        {result.rawLines === "changed" && (
          <p className="mt-3 flex items-start gap-2 text-xs text-muted">
            <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            The data was changed, so examples show cell values rather than the lines of the original file.
          </p>
        )}
      </Card>

      {result.issues.length > 0 && <h2 className="pt-2 text-lg font-semibold">Problems found, with how to fix each one</h2>}
      {result.issues.map((issue) => (
        <IssueCard key={issue.id} issue={issue} profiles={[]} columnLabel={columnLabel} active={api.activeIssueId === issue.id} onView={api.viewIssue} />
      ))}
    </section>
  );
}

function Fact({ label, value, cls }: { label: string; value: React.ReactNode; cls?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className={cn("font-semibold tabular-nums", cls)}>{value}</dd>
    </div>
  );
}
