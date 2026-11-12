"use client";

import { AlertCircle, AlertTriangle, ChevronDown, Info, Table2, Wand2, X } from "lucide-react";
import type { ColumnProfile, ScanIssue, Severity } from "@/engine/scan/scan";
import { cn } from "@/lib/cn";

const SEVERITY: Record<Severity, { label: string; icon: typeof AlertCircle; card: string; badge: string }> = {
  error: { label: "Error", icon: AlertCircle, card: "border-l-danger", badge: "bg-danger-soft text-danger" },
  warning: { label: "Warning", icon: AlertTriangle, card: "border-l-warning", badge: "bg-warning-soft text-warning" },
  note: { label: "Note", icon: Info, card: "border-l-primary", badge: "bg-secondary text-secondary-foreground" },
};

const UNIT: Record<ScanIssue["unit"], [string, string]> = {
  rows: ["row", "rows"],
  cells: ["cell", "cells"],
  groups: ["group", "groups"],
  columns: ["column", "columns"],
};

export function IssueCard({
  issue,
  profiles,
  active,
  onView,
  fix,
}: {
  issue: ScanIssue;
  profiles: ColumnProfile[];
  active: boolean;
  onView: (issue: ScanIssue | null) => void;
  /** Stage 4: a working fix for this problem, or the reason there isn't one yet. */
  fix?: { label: string; onFix: () => void } | { unavailable: string };
}) {
  const s = SEVERITY[issue.severity];
  const Icon = s.icon;
  const [one, many] = UNIT[issue.unit];
  const colLabel = (i: number) => profiles[i]?.name ?? `Column ${profiles[i]?.letter ?? ""}`;
  const headingId = `issue-${issue.id}`;
  return (
    <article aria-labelledby={headingId} className={cn("rounded-2xl border border-l-4 border-line bg-surface p-5 shadow-card", s.card, active && "ring-2 ring-primary/40")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", s.badge)}>
            <Icon className="size-3.5" aria-hidden="true" />
            {s.label}
          </span>
          <h3 id={headingId} className="mt-2 text-lg font-semibold">
            {issue.title}
          </h3>
        </div>
        <p className="text-right">
          <span className="block text-2xl font-bold tabular-nums">{issue.count.toLocaleString("en-US")}</span>
          <span className="text-xs text-muted">{issue.count === 1 ? one : many}</span>
        </p>
      </div>

      <p className="mt-2 text-sm leading-relaxed text-muted">{issue.explanation}</p>

      {issue.columns && issue.columns.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Affected columns">
          {issue.columns.slice(0, 8).map((c) => (
            <li key={c.index} className="rounded-lg bg-surface-muted px-2 py-1 text-xs">
              <span className="font-medium">{c.name}</span>
              {c.count > 0 && <span className="text-muted"> · {c.count.toLocaleString("en-US")}</span>}
            </li>
          ))}
          {issue.columns.length > 8 && <li className="px-2 py-1 text-xs text-muted">+{issue.columns.length - 8} more</li>}
        </ul>
      )}

      {issue.examples && issue.examples.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Examples</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {issue.examples.map((e, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="shrink-0 text-muted tabular-nums">Row {(e.row + 1).toLocaleString("en-US")}</span>
                {/* Whole-row problems (duplicates, empty rows): the column isn't meaningful. */}
                {issue.unit !== "rows" && <span className="shrink-0 text-muted">· {colLabel(e.col)}</span>}
                {issue.unit !== "rows" && e.value !== "" && <span className="min-w-0 truncate font-medium">{e.value}</span>}
                {e.note && <span className="text-muted">— {e.note}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="group mt-4 rounded-xl bg-surface-muted px-4 py-3 [&_summary::-webkit-details-marker]:hidden">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold">
          How to fix
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <p className="mt-2 text-sm leading-relaxed text-muted">{issue.howToFix}</p>
      </details>

      <div className="mt-4 flex flex-wrap gap-2">
        {fix && "onFix" in fix && (
          <button type="button" onClick={fix.onFix} className="inline-flex h-10 items-center gap-2 rounded-xl bg-success px-4 text-sm font-semibold text-white hover:opacity-90 dark:text-black">
            <Wand2 className="size-4" aria-hidden="true" /> {fix.label}
          </button>
        )}
        {active ? (
          <button type="button" onClick={() => onView(null)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-semibold hover:bg-surface-muted">
            <X className="size-4" aria-hidden="true" /> Show all rows
          </button>
        ) : (
          <button type="button" onClick={() => onView(issue)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary-hover">
            <Table2 className="size-4" aria-hidden="true" /> View affected data
          </button>
        )}
      </div>
      {fix && "unavailable" in fix && <p className="mt-2 text-xs text-muted">{fix.unavailable}</p>}
    </article>
  );
}
