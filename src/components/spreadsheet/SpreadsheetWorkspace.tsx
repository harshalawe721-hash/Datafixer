"use client";

import { useEffect, useState } from "react";
import { AlertCircle, AlertTriangle } from "lucide-react";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { useFileHandoff } from "@/components/upload/FileHandoffProvider";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useSpreadsheetEngine } from "./useSpreadsheetEngine";
import { ProcessingProgress } from "./ProcessingProgress";
import { FileSummary } from "./FileSummary";
import { SpreadsheetPreview } from "./SpreadsheetPreview";
import type { ToolApi } from "./tool-api";
import type { ScanIssue } from "@/engine/scan/scan";

/**
 * Upload → progress (with Cancel) → file summary + preview. Shared by the tools;
 * tool-specific panels (scan results, cleaning controls) plug in via renderTool,
 * shown between the file summary and the preview.
 */
export function SpreadsheetWorkspace({
  accept,
  renderTool,
}: {
  accept?: readonly string[];
  renderTool?: (api: ToolApi) => React.ReactNode;
}) {
  const { state, open, selectSheet, cancel, reset, getRows, scan, abortScans } = useSpreadsheetEngine();
  /** Column-names setting and the issue being viewed, reset for each file/sheet/separator. */
  const [view, setView] = useState<{ key: string; headerRow: boolean; issue: ScanIssue | null }>({ key: "", headerRow: false, issue: null });
  const { peekPending, clearPending } = useFileHandoff();
  /** Large-file advisory from validation, shown while the file is open. */
  const [advisory, setAdvisory] = useState<string | null>(() => peekPending()?.warning ?? null);
  // Pick up a file passed from another page (e.g. the homepage dropzone).
  // Cleared only after opening finishes, so React's development double-mount
  // (which disposes the first worker) simply reopens it.
  useEffect(() => {
    const pending = peekPending();
    if (pending) void open(pending.file, pending.format).finally(clearPending);
  }, [peekPending, clearPending, open]);

  if (state.status === "idle") {
    return (
      <FileDropzone
        accept={accept}
        onFileAccepted={(file, format, warning) => {
          setAdvisory(warning ?? null);
          void open(file, format);
        }}
      />
    );
  }

  const advisoryNote = advisory && (
    <p role="status" className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{advisory}</span>
    </p>
  );
  const resetAll = () => {
    setAdvisory(null);
    reset();
  };

  if (state.status === "working") {
    return (
      <div className="space-y-6">
        {advisoryNote}
        {state.summary && (
          <FileSummary summary={state.summary} onSelectSheet={() => {}} onReset={resetAll} />
        )}
        <ProcessingProgress fileName={state.file.name} progress={state.progress} startedAt={state.startedAt} onCancel={cancel} />
      </div>
    );
  }

  if (state.status === "error") {
    const cancelled = state.error.code === "cancelled";
    return (
      <div className="space-y-6">
        {advisoryNote}
        <Card className={cancelled ? "" : "border-danger/40"}>
          <div className="flex items-start gap-3">
            <AlertCircle className={`mt-0.5 size-5 shrink-0 ${cancelled ? "text-muted" : "text-danger"}`} aria-hidden="true" />
            <div className="flex-1">
              <h2 className="font-semibold">{cancelled ? "Processing cancelled" : "This file couldn't be opened"}</h2>
              <p role={cancelled ? "status" : "alert"} className="mt-1 text-sm text-muted">
                {state.error.message}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {state.file && state.format && (
                  <Button size="sm" onClick={() => void open(state.file!, state.format!)}>
                    Try again
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={resetAll}>
                  Choose a different file
                </Button>
              </div>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  const { summary, file, format } = state;
  const stats = summary.sheetStats[summary.activeSheet];
  const viewKey = `${file.name}:${file.size}:${file.lastModified}:${summary.activeSheet}:${summary.csv?.delimiter ?? ""}`;
  // A different file, sheet or separator: start from the guessed header setting, no filter.
  const current = view.key === viewKey ? view : { key: viewKey, headerRow: summary.headerGuess, issue: null };
  if (current !== view) setView(current);

  const api: ToolApi = {
    summary,
    viewKey,
    sheetReady: Boolean(stats) && !summary.sheetError,
    headerRow: current.headerRow,
    scan: (options, onProgress) => scan(summary.activeSheet, options, onProgress),
    abortScans,
    viewIssue: (issue) => {
      setView((v) => ({ ...v, issue }));
      if (issue) requestAnimationFrame(() => document.getElementById("data-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
    activeIssueId: current.issue?.id ?? null,
  };

  return (
    <div className="space-y-6">
      {advisoryNote}
      <FileSummary
        summary={summary}
        onSelectSheet={(name) => void selectSheet(name)}
        onChangeDelimiter={format === "csv" ? (d) => void open(file, format, { delimiter: d }) : undefined}
        onReset={resetAll}
      />
      {summary.sheetError ? (
        <Card className="border-dashed">
          <p role="status" className="text-sm text-muted">
            {summary.sheetError.message}
          </p>
        </Card>
      ) : null}
      {renderTool?.(api)}
      {!summary.sheetError && stats ? (
        <div id="data-preview" className="scroll-mt-20">
          <SpreadsheetPreview
            key={viewKey}
            sheet={summary.activeSheet}
            getRows={getRows}
            headerRow={current.headerRow}
            onHeaderRowChange={(headerRow) => setView((v) => ({ ...v, headerRow, issue: null }))}
            issue={current.issue}
            onClearIssue={() => setView((v) => ({ ...v, issue: null }))}
          />
        </div>
      ) : null}
    </div>
  );
}
