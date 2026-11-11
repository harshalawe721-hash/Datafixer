"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ListChecks, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProcessingProgress } from "@/components/spreadsheet/ProcessingProgress";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import type { ProgressEvent } from "@/engine/types";
import type { ScanResult } from "@/engine/scan/scan";
import { EngineError } from "@/engine/errors";
import { IssueCard } from "./IssueCard";

type ScanState =
  | { status: "scanning"; progress: ProgressEvent | null }
  | { status: "done"; result: ScanResult }
  | { status: "cancelled" }
  | { status: "error"; message: string };

/** The 12 checks, listed when nothing is found so the user knows what was checked. */
const CHECKS = [
  "Duplicate rows",
  "Empty rows and columns",
  "Missing cells",
  "Extra spaces",
  "Inconsistent capitalization",
  "Numbers stored as text",
  "Inconsistent, impossible and ambiguous dates",
  "Invalid email addresses",
  "Invalid phone numbers",
  "Unusual values",
  "Formula errors",
];

/**
 * Error Detector results. Scans automatically when a sheet is shown, and again
 * when the sheet or the column-names setting changes. Read-only: nothing in the
 * file is changed, and there are no fix buttons (guidance only).
 */
export function ScanPanel({ api }: { api: ToolApi }) {
  const [rescan, setRescan] = useState(0);
  const scanKey = `${api.viewKey}:${api.headerRow}:${rescan}`;
  const [state, setState] = useState<ScanState>({ status: "scanning", progress: null });
  const [startedKey, setStartedKey] = useState("");
  const seq = useRef(0);
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });

  // A new scan is needed: show progress immediately (state updated during render, not in the effect).
  if (api.sheetReady && startedKey !== scanKey) {
    setStartedKey(scanKey);
    setState({ status: "scanning", progress: null });
  }

  useEffect(() => {
    if (!api.sheetReady) return;
    const mySeq = ++seq.current;
    const a = apiRef.current;
    a.viewIssue(null);
    a.scan({ headerRow: a.headerRow }, (progress) => {
      if (mySeq === seq.current) setState((s) => (s.status === "scanning" ? { ...s, progress } : s));
    })
      .then((result) => {
        if (mySeq === seq.current) setState({ status: "done", result });
      })
      .catch((err: unknown) => {
        if (mySeq !== seq.current) return;
        if (err instanceof EngineError && err.code === "cancelled") setState({ status: "cancelled" });
        else setState({ status: "error", message: err instanceof Error ? err.message : "The file could not be checked." });
      });
  }, [scanKey, api.sheetReady]);

  if (!api.sheetReady) return null;

  if (state.status === "scanning") {
    return (
      <ProcessingProgress
        fileName="Checking for problems"
        progress={state.progress}
        key={startedKey}
        onCancel={() => apiRef.current.abortScans()}
      />
    );
  }

  if (state.status === "cancelled" || state.status === "error") {
    return (
      <Card className={state.status === "error" ? "border-danger/40" : ""}>
        <h2 className="font-semibold">{state.status === "cancelled" ? "Check cancelled" : "This sheet couldn't be checked"}</h2>
        <p role={state.status === "error" ? "alert" : "status"} className="mt-1 text-sm text-muted">
          {state.status === "cancelled" ? "Your file is still open below. Nothing was changed." : state.message}
        </p>
        <Button size="sm" className="mt-4" onClick={() => setRescan((n) => n + 1)}>
          <RotateCcw className="size-4" aria-hidden="true" /> Check again
        </Button>
      </Card>
    );
  }

  const { result } = state;
  const problems = result.issues.filter((i) => i.severity !== "note");
  const notes = result.issues.length - problems.length;
  return (
    <section aria-labelledby="scan-results-heading" className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          {result.issues.length === 0 ? (
            <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <ListChecks className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
          )}
          <div className="min-w-0 flex-1">
            <h2 id="scan-results-heading" className="text-lg font-semibold">
              {result.issues.length === 0 ? "No problems found" : "Spreadsheet analysis complete"}
            </h2>
            <p className="text-sm text-muted" aria-live="polite">
              Checked {result.rows.toLocaleString("en-US")} {result.rows === 1 ? "row" : "rows"} and {result.columns.toLocaleString("en-US")}{" "}
              {result.columns === 1 ? "column" : "columns"} on this device in {(result.timings.totalMs / 1000).toFixed(1)}s. Nothing was changed.
            </p>
          </div>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-muted">Rows checked</dt>
            <dd className="font-semibold tabular-nums">{result.rows.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Columns</dt>
            <dd className="font-semibold tabular-nums">{result.columns.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Problems found</dt>
            <dd className={`font-semibold tabular-nums ${problems.length ? "text-danger" : "text-success"}`}>{problems.length}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Notes to review</dt>
            <dd className="font-semibold tabular-nums">{notes}</dd>
          </div>
        </dl>
        {result.issues.length === 0 ? (
          <div className="mt-4 text-sm text-muted">
            <p>DataFixer checked for:</p>
            <ul className="mt-1 grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
              {CHECKS.map((c) => (
                <li key={c} className="flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5 shrink-0 text-success" aria-hidden="true" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ul className="mt-4 space-y-1 text-sm">
            {result.issues.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-3 border-t border-line pt-1">
                <a href={`#issue-${i.id}`} className="hover:underline">
                  {i.title}
                </a>
                <span className="tabular-nums text-muted">{i.count.toLocaleString("en-US")}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {result.issues.map((issue) => (
        <IssueCard key={issue.id} issue={issue} profiles={result.profiles} active={api.activeIssueId === issue.id} onView={api.viewIssue} />
      ))}
    </section>
  );
}
