"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, History, Loader2, Redo2, ShieldCheck, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import type { HistoryItem, HistorySummary } from "@/engine/edit/session";
import { cn } from "@/lib/cn";

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const DETAIL_PAGE = 50;

/**
 * Changes made on this device: totals, Undo, Redo and the change history.
 * Shown once something has been changed (or can be redone).
 */
export function EditBar({ api }: { api: ToolApi }) {
  const { edits } = api;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  if (edits.changesApplied === 0 && !edits.canRedo) return null;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work. Your changes are unchanged.");
    } finally {
      setBusy(false);
    }
  };

  const parts = [
    edits.cellsEdited ? `${plural(edits.cellsEdited, "cell")} changed` : null,
    edits.rowsRemoved ? `${plural(edits.rowsRemoved, "row")} removed` : null,
    edits.columnsRemoved ? `${plural(edits.columnsRemoved, "column")} removed` : null,
  ].filter(Boolean);

  return (
    <Card className="border-primary/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-semibold">Your changes</h2>
          <p className="text-sm text-muted" aria-live="polite">
            {parts.length ? parts.join(" · ") : "No changes applied"}
            {edits.changesApplied ? ` (${plural(edits.changesApplied, "fix", "fixes")} applied)` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="h-10" disabled={!edits.canUndo || busy} onClick={() => void run(api.undo)}>
            <Undo2 className="size-4" aria-hidden="true" /> Undo
          </Button>
          <Button variant="outline" size="sm" className="h-10" disabled={!edits.canRedo || busy} onClick={() => void run(api.redo)}>
            <Redo2 className="size-4" aria-hidden="true" /> Redo
          </Button>
          <Button variant="outline" size="sm" className="h-10" aria-expanded={showHistory} aria-controls="change-history" onClick={() => setShowHistory((s) => !s)}>
            <History className="size-4" aria-hidden="true" /> History
            <ChevronDown className={cn("size-4 transition-transform", showHistory && "rotate-180")} aria-hidden="true" />
          </Button>
        </div>
      </div>
      {busy && (
        <p className="mt-2 flex items-center gap-2 text-sm text-muted" role="status">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Working…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <p className="mt-3 flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>
          Changes are kept on this device, in this tab only. Your original file is never changed. Downloading the corrected file isn&apos;t available yet; it is
          the next part being built.
        </span>
      </p>
      {showHistory && <HistoryPanel api={api} />}
    </Card>
  );
}

function HistoryPanel({ api }: { api: ToolApi }) {
  const [entries, setEntries] = useState<HistorySummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = api.edits.version;
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  useEffect(() => {
    let active = true;
    apiRef.current.history().then(
      (h) => active && setEntries(h),
      (err: unknown) => active && setError(err instanceof Error ? err.message : "The history could not be loaded."),
    );
    return () => {
      active = false;
    };
  }, [version]);

  return (
    <section id="change-history" aria-label="Change history" className="mt-4 border-t border-line pt-4">
      <p className="text-xs text-muted">Newest first. Cell and row numbers refer to your original file.</p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      {!entries && !error && <p className="mt-2 text-sm text-muted">Loading…</p>}
      <ul className="mt-2 space-y-2">
        {entries?.map((e) => (
          <HistoryEntry key={e.id} api={api} entry={e} />
        ))}
      </ul>
    </section>
  );
}

function HistoryEntry({ api, entry }: { api: ToolApi; entry: HistorySummary }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = [entry.cells ? plural(entry.cells, "cell") : null, entry.rowsRemoved ? `${plural(entry.rowsRemoved, "row")} removed` : null, entry.columnsRemoved ? `${plural(entry.columnsRemoved, "column")} removed` : null]
    .filter(Boolean)
    .join(" · ");

  const more = async () => {
    setLoading(true);
    try {
      const page = await api.historyDetails(entry.id, items.length, DETAIL_PAGE);
      setItems((prev) => [...prev, ...page.items]);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The details could not be loaded.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <li className="rounded-xl border border-line px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {entry.label}{" "}
            <span className={cn("ml-1 rounded-full px-2 py-0.5 text-xs font-semibold", entry.status === "applied" ? "bg-success-soft text-success" : "bg-surface-muted text-muted")}>
              {entry.status === "applied" ? "Applied" : "Undone"}
            </span>
          </p>
          <p className="text-xs text-muted">
            {count} · {new Date(entry.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            {entry.status === "undone" && !entry.redoable ? " · can no longer be redone" : ""}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex h-10 items-center gap-1 rounded-lg px-2 text-sm font-medium text-primary hover:bg-surface-muted"
          aria-expanded={open}
          onClick={() => {
            setOpen((o) => !o);
            if (!open && items.length === 0) void more();
          }}
        >
          {open ? "Hide details" : "Details"}
        </button>
      </div>
      {open && (
        <div className="mt-2 overflow-x-auto">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {items.some((i) => i.kind === "cell") && (
            // One block per cell (fits phone screens): cell, original value, new value, operation, status.
            <ul className="divide-y divide-line text-xs">
              {items.map((i, k) =>
                i.kind === "cell" ? (
                  <li key={k} className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 py-1.5">
                    <span className="text-muted">Cell</span>
                    <span className="font-mono font-semibold">{i.cell}</span>
                    <span className="text-muted">Original value</span>
                    <span className="font-mono break-all whitespace-pre-wrap">“{i.original}”</span>
                    <span className="text-muted">New value</span>
                    <span className="font-mono break-all whitespace-pre-wrap">“{i.newValue}”</span>
                    <span className="text-muted">Operation</span>
                    <span>{entry.label}</span>
                    <span className="text-muted">Status</span>
                    <span>{entry.status === "applied" ? "Applied" : "Undone"}</span>
                  </li>
                ) : null,
              )}
            </ul>
          )}
          <ul className="space-y-0.5 text-xs">
            {items.map((i, k) =>
              i.kind === "row" ? (
                <li key={k}>
                  Row {fmt(i.row)} {entry.status === "applied" ? "removed" : "(removal undone)"} — {i.reason}
                </li>
              ) : i.kind === "column" ? (
                <li key={k}>
                  Column {i.column} {entry.status === "applied" ? "removed" : "(removal undone)"} — {i.reason}
                </li>
              ) : null,
            )}
          </ul>
          {items.length < total && (
            <button type="button" disabled={loading} onClick={() => void more()} className="mt-2 inline-flex h-10 items-center rounded-lg border border-line-strong px-3 text-sm disabled:opacity-50">
              {loading ? "Loading…" : `Show more (${fmt(total - items.length)} left)`}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
