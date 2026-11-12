"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ListChecks, RotateCcw, Wand2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ProcessingProgress } from "@/components/spreadsheet/ProcessingProgress";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import type { ProgressEvent } from "@/engine/types";
import type { ScanResult } from "@/engine/scan/scan";
import { EngineError } from "@/engine/errors";
import { IssueCard } from "./IssueCard";
import { FixDialog, type FixRequest } from "@/components/tools/fix/FixDialog";
import { EditBar } from "@/components/tools/fix/EditBar";
import { FIX_IDS, FIX_LABELS, type FixId } from "@/engine/fix/fix-ids";

/** Fixes included in "Fix all safe problems" (no decisions needed). */
const FIX_ALL = new Set<string>(["extra-spaces", "inconsistent-case", "numbers-as-text", "duplicate-rows", "empty-rows", "empty-columns"]);
/** Fixes that remove rows or columns: not offered for Excel files until the workbook reference check exists (Stage 4, Step 7). */
const REMOVES_ROWS_OR_COLUMNS = new Set<string>(["duplicate-rows", "empty-rows", "empty-columns"]);
const EXCEL_REMOVAL_NOTE =
  "For Excel files, removing rows and columns will be added once DataFixer can first check the workbook's formulas and charts, so nothing that refers to these rows breaks.";

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
 * when the sheet, the column-names setting or the data (a fix, undo or redo)
 * changes. Fixes are previewed first and applied only on request; the original
 * file is never changed.
 */
export function ScanPanel({ api }: { api: ToolApi }) {
  const [rescan, setRescan] = useState(0);
  const [fixRequest, setFixRequest] = useState<FixRequest | null>(null);
  const scanKey = `${api.viewKey}:${api.headerRow}:${rescan}:${api.edits.version}`;
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
      <div className="space-y-4">
        <EditBar api={api} />
        <ProcessingProgress
          fileName={api.edits.changesApplied ? "Checking again after your changes" : "Checking for problems"}
          progress={state.progress}
          key={startedKey}
          onCancel={() => apiRef.current.abortScans()}
        />
      </div>
    );
  }

  if (state.status === "cancelled" || state.status === "error") {
    return (
      <div className="space-y-4">
      <EditBar api={api} />
      <Card className={state.status === "error" ? "border-danger/40" : ""}>
        <h2 className="font-semibold">{state.status === "cancelled" ? "Check cancelled" : "This sheet couldn't be checked"}</h2>
        <p role={state.status === "error" ? "alert" : "status"} className="mt-1 text-sm text-muted">
          {state.status === "cancelled" ? "Your file is still open below. Nothing was changed." : state.message}
        </p>
        <Button size="sm" className="mt-4" onClick={() => setRescan((n) => n + 1)}>
          <RotateCcw className="size-4" aria-hidden="true" /> Check again
        </Button>
      </Card>
      </div>
    );
  }

  const { result } = state;
  const problems = result.issues.filter((i) => i.severity !== "note");
  const notes = result.issues.length - problems.length;
  const excel = api.format !== "csv";
  const offered = (id: string) => (FIX_IDS as readonly string[]).includes(id) && !(excel && REMOVES_ROWS_OR_COLUMNS.has(id));
  const canFixAll = result.issues.some((i) => FIX_ALL.has(i.id) && offered(i.id));
  const columnName = (i: number) => result.profiles[i]?.name ?? `Column ${result.profiles[i]?.letter ?? i + 1}`;
  const changed = api.edits.changesApplied > 0;
  return (
    <section aria-labelledby="scan-results-heading" className="space-y-4">
      <EditBar api={api} />
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
              {result.columns === 1 ? "column" : "columns"} on this device in {(result.timings.totalMs / 1000).toFixed(1)}s.{" "}
              {changed ? "These results include your changes. Your original file is unchanged." : "Nothing was changed."}
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
        {canFixAll && (
          <div className="mt-4 flex flex-col gap-2 rounded-xl bg-success-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <strong>Fix the simple problems in one go.</strong> You&apos;ll see every change before anything is applied.
            </p>
            <Button className="h-11 shrink-0" onClick={() => setFixRequest({ kind: "all" })}>
              <Wand2 className="size-4" aria-hidden="true" /> Fix all safe problems
            </Button>
          </div>
        )}
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
        <IssueCard
          key={issue.id}
          issue={issue}
          profiles={result.profiles}
          active={api.activeIssueId === issue.id}
          onView={api.viewIssue}
          fix={
            offered(issue.id)
              ? { label: FIX_LABELS[issue.id as FixId], onFix: () => setFixRequest({ kind: "one", fixId: issue.id as FixId }) }
              : (FIX_IDS as readonly string[]).includes(issue.id)
                ? { unavailable: EXCEL_REMOVAL_NOTE }
                : undefined
          }
        />
      ))}
      {fixRequest && <FixDialog api={api} request={fixRequest} columnName={columnName} onClose={() => setFixRequest(null)} />}
    </section>
  );
}
