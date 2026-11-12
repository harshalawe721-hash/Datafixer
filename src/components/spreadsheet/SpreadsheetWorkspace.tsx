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
import type { LastChange, ToolApi } from "./tool-api";
import { CellEditor } from "@/components/tools/fix/CellEditor";
import type { ScanIssue } from "@/engine/scan/scan";
import type { EditResult } from "@/engine/core";
import type { EditStats } from "@/engine/edit/session";

const NO_EDITS: EditStats = { cellsEdited: 0, rowsRemoved: 0, columnsRemoved: 0, changesApplied: 0, canUndo: false, canRedo: false, version: 0 };

/** Ask before an action that would discard the user's changes (they live only in this tab). */
function confirmDiscard(edits: EditStats, action: string): boolean {
  if (edits.changesApplied === 0) return true;
  return window.confirm(
    `You have ${edits.changesApplied} ${edits.changesApplied === 1 ? "change" : "changes"} to this sheet that haven't been downloaded. ${action} will discard them. Your original file is not affected. Continue?`,
  );
}

/**
 * Upload → progress (with Cancel) → file summary + preview. Shared by the tools;
 * tool-specific panels (scan results, cleaning controls) plug in via renderTool,
 * shown between the file summary and the preview.
 */
export function SpreadsheetWorkspace({
  accept,
  renderTool,
  allowEditing = false,
  csvValidator = false,
}: {
  accept?: readonly string[];
  renderTool?: (api: ToolApi) => React.ReactNode;
  /** Stage 4: tap a cell in the table to edit it. */
  allowEditing?: boolean;
  /**
   * Stage 5 (CSV Validator): a "Text encoding" choice beside the separator, and
   * CSV files with a few NUL bytes are accepted so they can be reported.
   */
  csvValidator?: boolean;
}) {
  const engine = useSpreadsheetEngine();
  const { state, open, selectSheet, cancel, reset, getRows, scan, validate, abortScans } = engine;
  /** Changes to the current sheet (Stage 4), tied to the view they were made in. */
  const [editState, setEditState] = useState<{ key: string; stats: EditStats; last: LastChange | null }>({ key: "", stats: NO_EDITS, last: null });
  /** Edit version last downloaded, per view: changes after it are "unsaved". */
  const [downloaded, setDownloaded] = useState<{ key: string; version: number }>({ key: "", version: -1 });
  const unsaved =
    state.status === "ready" &&
    editState.stats.changesApplied > 0 &&
    !(downloaded.key === editState.key && downloaded.version === editState.stats.version);
  // Changes live only in this tab: ask before leaving the page with changes that weren't downloaded.
  useEffect(() => {
    if (!unsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ""; // the browser shows its own "Leave site?" message
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.hasAttribute("download") || (a.target && a.target !== "_self") || e.defaultPrevented) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin === window.location.origin && url.pathname === window.location.pathname) return; // same page (e.g. #issue links)
      if (!window.confirm("You have changes that haven't been downloaded. Leaving this page will discard them. Your original file is not affected. Leave anyway?")) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [unsaved]);
  /** Cell open in the cell editor (view position). */
  const [editing, setEditing] = useState<{ row: number; col: number; label: string } | null>(null);
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
        allowNulBytes={csvValidator}
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
  const currentEdits = state.status === "ready" ? editState : { key: "", stats: NO_EDITS, last: null };
  const resetAll = () => {
    if (state.status === "ready" && unsaved && !confirmDiscard(currentEdits.stats, "Opening another file")) return;
    setAdvisory(null);
    setEditState({ key: "", stats: NO_EDITS, last: null });
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
  const viewKey = `${file.name}:${file.size}:${file.lastModified}:${summary.activeSheet}:${summary.csv?.delimiter ?? ""}:${summary.csv?.encoding ?? ""}`;
  // A different file, sheet or separator: start from the guessed header setting, no filter.
  const current = view.key === viewKey ? view : { key: viewKey, headerRow: csvValidator ? (summary.namesGuess ?? summary.headerGuess) : summary.headerGuess, issue: null };
  if (current !== view) setView(current);
  // Changes belong to one file/sheet view; a new view starts with none.
  const edits = editState.key === viewKey ? editState.stats : NO_EDITS;
  const lastChange = editState.key === viewKey ? editState.last : null;
  const track = (action: LastChange["action"]) => (r: EditResult) => {
    setEditState((prev) => ({
      key: viewKey,
      stats: r.stats,
      last: r.entries.length ? { action, entries: r.entries, seq: (prev.last?.seq ?? 0) + 1 } : prev.key === viewKey ? prev.last : null,
    }));
    return r;
  };
  const sheetName = summary.activeSheet;

  const api: ToolApi = {
    summary,
    viewKey,
    sheetReady: Boolean(stats) && !summary.sheetError,
    headerRow: current.headerRow,
    setHeaderRow: (headerRow) => setView((v) => ({ ...v, headerRow, issue: null })),
    scan: (options, onProgress) => scan(summary.activeSheet, options, onProgress),
    validate: (options, onProgress) => validate(summary.activeSheet, options, onProgress),
    abortScans,
    viewIssue: (issue) => {
      setView((v) => ({ ...v, issue }));
      if (issue) requestAnimationFrame(() => document.getElementById("data-preview")?.scrollIntoView({ behavior: "smooth", block: "start" }));
    },
    activeIssueId: current.issue?.id ?? null,
    format,
    edits,
    previewFix: (fixId, options, onProgress) => engine.previewFix(sheetName, fixId, { ...options, headerRow: current.headerRow }, onProgress),
    previewFixAll: (onProgress) => engine.previewFixAll(sheetName, { headerRow: current.headerRow }, onProgress),
    lastChange,
    applyFix: (token) => engine.applyFix(sheetName, token).then(track("applied")),
    exportCsv: (onProgress) => engine.exportCsv(sheetName, onProgress),
    exportXlsx: (onProgress) => engine.exportXlsx(sheetName, onProgress),
    markDownloaded: (version) => setDownloaded({ key: viewKey, version }),
    undo: () => engine.undo(sheetName).then(track("undone")),
    redo: () => engine.redo(sheetName).then(track("redone")),
    history: () => engine.history(sheetName),
    historyDetails: (entry, offset, limit) => engine.historyDetails(sheetName, entry, offset, limit),
  };

  return (
    <div className="space-y-6">
      {advisoryNote}
      <FileSummary
        summary={summary}
        onSelectSheet={(name) => {
          // Only one Excel sheet is kept in memory: switching discards this sheet's changes.
          if (!unsaved || confirmDiscard(edits, "Switching to another sheet")) void selectSheet(name);
        }}
        onChangeDelimiter={
          format === "csv"
            ? (d) =>
                (!unsaved || confirmDiscard(edits, "Changing the separator")) &&
                // Validator: an encoding the user chose is kept when the separator changes.
                void open(file, format, { delimiter: d, encoding: csvValidator && summary.csv?.encodingChosen ? summary.csv.encoding : undefined })
            : undefined
        }
        onChangeEncoding={
          csvValidator && format === "csv"
            ? (encoding) => (!unsaved || confirmDiscard(edits, "Changing the text encoding")) && void open(file, format, { encoding })
            : undefined
        }
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
            dataVersion={edits.version}
            onCellClick={allowEditing ? (row, col, label) => setEditing({ row, col, label }) : undefined}
          />
        </div>
      ) : null}
      {editing && (
        <CellEditor
          key={`${editing.row}:${editing.col}:${edits.version}`}
          row={editing.row}
          columnLabel={editing.label}
          loadInfo={() => engine.cellInfo(sheetName, editing.row, editing.col)}
          save={(text, replaceFormula) => engine.editCell(sheetName, editing.row, editing.col, text, replaceFormula).then(track("applied"))}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
