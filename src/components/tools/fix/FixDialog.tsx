"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, ArrowRight, CheckCircle2, Info, Loader2, Undo2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import type { FixAllPreview, FixPreviewResult } from "@/engine/core";
import type { DateTarget, FixChoice, FixOptions, FixPreview } from "@/engine/fix/fixes";
import type { FixId } from "@/engine/fix/fix-ids";
import type { ProgressEvent } from "@/engine/types";
import { EngineError } from "@/engine/errors";
import { columnLetter } from "@/engine/query/query";

export type FixRequest = { kind: "one"; fixId: FixId } | { kind: "all" };

type Choices = Omit<FixOptions, "headerRow">;

type DialogState =
  | { status: "loading"; progress: ProgressEvent | null }
  | { status: "ready"; preview: FixPreviewResult | FixAllPreview }
  | { status: "applying"; preview: FixPreviewResult | FixAllPreview }
  | { status: "error"; message: string; stale: boolean };

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/** Make spaces, tabs and non-breaking spaces at the edges visible (· ⇥ ⍽). */
function reveal(s: string): string {
  const show = (ch: string) => (ch === "\t" ? "⇥" : ch === " " ? "⍽" : "·");
  const lead = s.match(/^[\s﻿]+/)?.[0] ?? "";
  if (lead.length === s.length) return [...s].map(show).join("");
  const trail = s.match(/[\s﻿]+$/)?.[0] ?? "";
  return `${[...lead].map(show).join("")}${s.slice(lead.length, s.length - trail.length)}${[...trail].map(show).join("")}`;
}

/**
 * Preview of a fix (or of "Fix all safe problems"). Nothing changes until the
 * user taps Apply; choices (spellings, date formats, phone layouts) re-run the
 * preview. Full-screen on phones, a centred dialog on larger screens.
 */
export function FixDialog({
  api,
  request,
  columnName,
  onClose,
}: {
  api: ToolApi;
  request: FixRequest;
  /** Name of a column (view index) for the examples. */
  columnName: (index: number) => string;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<Choices>({});
  const [state, setState] = useState<DialogState>({ status: "loading", progress: null });
  const seq = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });

  /** Ask the worker for a preview (the caller shows the loading state). */
  const run = useCallback(
    (next: Choices) => {
      const mySeq = ++seq.current;
      const onProgress = (progress: ProgressEvent) => {
        if (mySeq === seq.current) setState((s) => (s.status === "loading" ? { ...s, progress } : s));
      };
      const a = apiRef.current;
      const p = request.kind === "all" ? a.previewFixAll(onProgress) : a.previewFix(request.fixId, next, onProgress);
      p.then(
        (preview) => mySeq === seq.current && setState({ status: "ready", preview }),
        (err: unknown) => {
          if (mySeq !== seq.current) return;
          if (err instanceof EngineError && err.code === "cancelled") return onClose();
          setState({ status: "error", message: err instanceof Error ? err.message : "The preview could not be made.", stale: false });
        },
      );
    },
    [request, onClose],
  );

  const load = (next: Choices) => {
    setState({ status: "loading", progress: null });
    run(next);
  };

  // First preview (the initial state is already "loading").
  useEffect(() => {
    run({});
  }, [run]);

  // Focus the dialog, close on Escape, and give focus back afterwards.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    if (state.status === "loading") apiRef.current.abortScans();
    seq.current++;
    onClose();
  }

  const choose = (patch: Choices) => {
    const next: Choices = {
      ...choices,
      ...patch,
      caseChoices: { ...choices.caseChoices, ...patch.caseChoices },
      dateChoices: { ...choices.dateChoices, ...patch.dateChoices },
      phoneChoices: { ...choices.phoneChoices, ...patch.phoneChoices },
    };
    if (patch.keepColumns) next.keepColumns = patch.keepColumns;
    setChoices(next);
    load(next);
  };

  async function apply(preview: FixPreviewResult | FixAllPreview) {
    setState({ status: "applying", preview });
    try {
      await apiRef.current.applyFix(preview.token);
      onClose();
    } catch (err) {
      const stale = err instanceof EngineError && err.code === "stale-preview";
      setState({ status: "error", message: err instanceof Error ? err.message : "The fix could not be applied.", stale });
    }
  }

  const title = request.kind === "all" ? "Fix all safe problems" : (state.status === "ready" || state.status === "applying" ? (state.preview as FixPreviewResult).label : "Preparing the fix");
  const preview = state.status === "ready" || state.status === "applying" ? state.preview : null;
  const total = preview ? preview.cellsChanged + preview.rowsRemoved + preview.columnsRemoved : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="fix-dialog-title"
        tabIndex={-1}
        className="flex max-h-[100dvh] w-full flex-col bg-surface shadow-xl outline-none sm:max-h-[88vh] sm:max-w-2xl sm:rounded-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-2">
            <Wand2 className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="fix-dialog-title" className="text-lg font-semibold">
                {title}
              </h2>
              <p className="text-xs text-muted">Preview. Nothing changes until you tap Apply, and you can undo it afterwards.</p>
            </div>
          </div>
          <button type="button" onClick={close} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl hover:bg-surface-muted" aria-label="Close">
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {state.status === "loading" && (
            <p className="flex items-center gap-2 py-8 text-sm text-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Working out what would change
              {state.progress?.loaded != null && state.progress.total ? ` (${Math.min(99, Math.round((state.progress.loaded / state.progress.total) * 100))}%)` : ""}…
            </p>
          )}
          {state.status === "error" && (
            <div role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{state.message}</span>
            </div>
          )}
          {preview && "steps" in preview && <AllPreview preview={preview} columnName={columnName} />}
          {preview && !("steps" in preview) && <OnePreview preview={preview} columnName={columnName} choices={choices} onChoose={choose} />}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-end">
          {state.status === "error" && state.stale ? (
            <Button variant="outline" onClick={() => load(choices)}>
              Preview again
            </Button>
          ) : null}
          <Button variant="outline" onClick={close}>
            {total === 0 && preview ? "Close" : "Cancel"}
          </Button>
          {preview && total > 0 && (
            <Button onClick={() => void apply(preview)} disabled={state.status === "applying"}>
              {state.status === "applying" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
              Apply {request.kind === "all" ? "all fixes" : "fix"} ({plural(total, "change")})
            </Button>
          )}
        </footer>
      </div>
    </div>
  );
}

function Totals({ p }: { p: { cellsChanged: number; rowsRemoved: number; columnsRemoved: number } }) {
  const parts = [
    p.cellsChanged ? `${plural(p.cellsChanged, "cell")} will change` : null,
    p.rowsRemoved ? `${plural(p.rowsRemoved, "row")} will be removed` : null,
    p.columnsRemoved ? `${plural(p.columnsRemoved, "column")} will be removed` : null,
  ].filter(Boolean);
  if (parts.length === 0) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-surface-muted px-4 py-3 text-sm" role="status">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        Nothing will change automatically.
      </p>
    );
  }
  return (
    <p className="rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground" role="status">
      {parts.join(" · ")}
    </p>
  );
}

function Examples({ preview, columnName, limit = 20 }: { preview: FixPreview; columnName: (i: number) => string; limit?: number }) {
  const showSpaces = preview.fixId === "extra-spaces";
  return (
    <>
      {preview.examples.length > 0 && (
        <div>
          {/* Stacked (not a wide table) so it fits phone screens. */}
          <ul className="divide-y divide-line text-sm">
            {preview.examples.slice(0, limit).map((e) => (
              <li key={`${e.row}:${e.col}`} className="py-1.5">
                <span className="block text-xs text-muted">
                  Row {fmt(e.row + 1)} · {columnName(e.col)}
                </span>
                <span className="flex flex-wrap items-center gap-x-2 font-mono text-xs break-all">
                  <span>{showSpaces ? reveal(e.before) : e.before}</span>
                  <ArrowRight className="size-3 shrink-0 text-muted" aria-hidden="true" />
                  <span className="sr-only">changes to</span>
                  <span className="font-semibold">{e.after}</span>
                </span>
              </li>
            ))}
          </ul>
          {preview.cellsChanged > Math.min(limit, preview.examples.length) && (
            <p className="mt-1 text-xs text-muted">…and {plural(preview.cellsChanged - Math.min(limit, preview.examples.length), "more cell")}. Every change is listed in the change history afterwards.</p>
          )}
          {showSpaces && <p className="mt-1 text-xs text-muted">· marks a space, ⍽ a non-breaking space and ⇥ a tab.</p>}
        </div>
      )}
      {preview.rows.length > 0 && (
        <ul className="space-y-0.5 text-sm">
          {preview.rows.slice(0, limit).map((r) => (
            <li key={r.row}>
              <span className="text-muted">Row {fmt(r.row + 1)}</span> — {r.reason}
            </li>
          ))}
          {preview.rowsRemoved > Math.min(limit, preview.rows.length) && <li className="text-xs text-muted">…and {plural(preview.rowsRemoved - Math.min(limit, preview.rows.length), "more row")}.</li>}
        </ul>
      )}
    </>
  );
}

function Skipped({ items, title = "Left for you to check" }: { items: { reason: string; count: number }[]; title?: string }) {
  if (items.length === 0) return null;
  return (
    <div className="rounded-xl border border-line px-4 py-3">
      <p className="text-sm font-semibold">{title}</p>
      <ul className="mt-1 space-y-1 text-sm text-muted">
        {items.map((s) => (
          <li key={s.reason}>
            <span className="font-medium text-foreground tabular-nums">{fmt(s.count)}</span> — {s.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OnePreview({ preview, columnName, choices, onChoose }: { preview: FixPreviewResult; columnName: (i: number) => string; choices: Choices; onChoose: (c: Choices) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{preview.description}</p>
      {preview.choices.length > 0 && <ChoiceList choices={preview.choices} onChoose={onChoose} />}
      {preview.fixId === "empty-columns" && (preview.columns.length > 0 || (choices.keepColumns?.length ?? 0) > 0) && (
        <KeepColumns preview={preview} keep={choices.keepColumns ?? []} onChange={(keepColumns) => onChoose({ keepColumns })} />
      )}
      <Totals p={preview} />
      <Examples preview={preview} columnName={columnName} />
      <Skipped items={preview.skipped} />
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <Undo2 className="size-3.5" aria-hidden="true" /> Formula cells are never changed automatically. Your original file is never changed.
      </p>
    </div>
  );
}

function AllPreview({ preview, columnName }: { preview: FixAllPreview; columnName: (i: number) => string }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">These fixes need no decisions from you. They are applied in this order, and each one can be undone separately.</p>
      <Totals p={preview} />
      {preview.steps.map((s) => (
        <section key={s.fixId} className="rounded-xl border border-line px-4 py-3">
          <h3 className="text-sm font-semibold">
            {s.label} <span className="font-normal text-muted">· {plural(s.cellsChanged + s.rowsRemoved + s.columnsRemoved, s.cellsChanged ? "cell" : s.rowsRemoved ? "row" : "column")}</span>
          </h3>
          <div className="mt-2">
            <Examples preview={s} columnName={columnName} limit={3} />
          </div>
        </section>
      ))}
      {preview.notes.length > 0 && (
        <div className="rounded-xl border border-line px-4 py-3">
          <p className="text-sm font-semibold">Not included</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">
            {preview.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Date formats, phone layouts and spellings that are equally common need your choice: use the Fix button on those problems.</p>
        </div>
      )}
    </div>
  );
}

function KeepColumns({ preview, keep, onChange }: { preview: FixPreviewResult; keep: number[]; onChange: (keep: number[]) => void }) {
  const all = [...preview.columns.map((c) => ({ ...c, kept: false })), ...keep.filter((k) => !preview.columns.some((c) => c.index === k)).map((index) => ({ index, letter: columnLetter(index), name: null as string | null, kept: true }))].sort(
    (a, b) => a.index - b.index,
  );
  return (
    <fieldset className="rounded-xl border border-line px-4 py-3">
      <legend className="px-1 text-sm font-semibold">Columns to remove</legend>
      <ul className="space-y-1">
        {all.map((c) => (
          <li key={c.index}>
            <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-5 accent-[var(--primary)]"
                checked={!c.kept}
                onChange={(e) => onChange(e.target.checked ? keep.filter((k) => k !== c.index) : [...keep, c.index])}
              />
              Column {c.letter}
              {c.name ? ` “${c.name}”` : ""}
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function ChoiceList({ choices, onChoose }: { choices: FixChoice[]; onChoose: (c: Choices) => void }) {
  return (
    <div className="space-y-3">
      {choices.map((ch) => {
        if (ch.kind === "spelling") {
          return (
            <fieldset key={ch.key} className="rounded-xl border border-warning/50 bg-warning-soft/40 px-4 py-3">
              <legend className="px-1 text-sm font-semibold">Which spelling should “{ch.columnName}” use?</legend>
              <p className="text-xs text-muted">These are equally common, so DataFixer won&apos;t guess.</p>
              <div className="mt-1 flex flex-wrap gap-x-5">
                {ch.options.map((o) => (
                  <label key={o.value} className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                    <input type="radio" className="size-5 accent-[var(--primary)]" name={`spell-${ch.key}`} checked={ch.chosen === o.value} onChange={() => onChoose({ caseChoices: { [ch.key]: o.value } })} />
                    <span className="font-medium">{o.value}</span>
                    <span className="text-muted">({fmt(o.count)})</span>
                  </label>
                ))}
              </div>
            </fieldset>
          );
        }
        if (ch.kind === "date-format") {
          const target = ch.chosen?.target ?? "";
          const order = ch.chosen?.order ?? "";
          const set = (t: DateTarget, o: "dmy" | "mdy" | "" = order) => onChoose({ dateChoices: { [ch.column]: { target: t, ...(o ? { order: o } : {}) } } });
          return (
            <fieldset key={ch.column} className="rounded-xl border border-line px-4 py-3">
              <legend className="px-1 text-sm font-semibold">Date format for “{ch.columnName}”</legend>
              <p className="text-xs text-muted">
                Found: {ch.formats.map((f) => `${f.label} (${fmt(f.count)})`).join(", ")}
                {ch.notDates ? `, not a date (${fmt(ch.notDates)})` : ""}.
              </p>
              <label className="mt-2 block text-sm">
                <span className="sr-only">Format</span>
                <select
                  className="h-11 w-full rounded-xl border border-line-strong bg-background px-3 text-sm"
                  value={target}
                  onChange={(e) => e.target.value && set(e.target.value as DateTarget)}
                >
                  <option value="">Choose a format…</option>
                  {ch.targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                      {t.id === ch.suggested ? " (suggested)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              {ch.needsOrder && (
                <div className="mt-2">
                  <p className="text-sm">Some dates (like 03/04/2024) could be day-first or month-first. Which does this column use?</p>
                  <div className="flex flex-wrap gap-x-5">
                    {(
                      [
                        ["dmy", "Day first (03/04 = 3 April)"],
                        ["mdy", "Month first (03/04 = March 4)"],
                      ] as const
                    ).map(([o, label]) => (
                      <label key={o} className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                        <input type="radio" className="size-5 accent-[var(--primary)]" name={`order-${ch.column}`} checked={order === o} disabled={!target} onChange={() => set(target as DateTarget, o)} />
                        {label}
                      </label>
                    ))}
                  </div>
                  {!target && <p className="text-xs text-muted">Choose a format first.</p>}
                </div>
              )}
            </fieldset>
          );
        }
        return (
          <fieldset key={ch.column} className="rounded-xl border border-line px-4 py-3">
            <legend className="px-1 text-sm font-semibold">Phone layout for “{ch.columnName}”</legend>
            <p className="text-xs text-muted">Only spacing and punctuation change. Numbers with different digits are left as they are.</p>
            <div className="mt-1 space-y-0.5">
              {ch.layouts.map((l) => (
                <label key={l.template} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" className="size-5 accent-[var(--primary)]" name={`phone-${ch.column}`} checked={ch.chosen === l.template} onChange={() => onChoose({ phoneChoices: { [ch.column]: l.template } })} />
                  <span className="font-mono">{l.example}</span>
                  <span className="text-muted">
                    ({fmt(l.count)}){l.template === ch.suggested ? " · most common" : ""}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
