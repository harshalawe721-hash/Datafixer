"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, CopyX, Info, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import type { DuplicatesPreview } from "@/engine/core";
import type { DuplicateAction, KeepWhich } from "@/engine/fix/duplicates";
import { EngineError } from "@/engine/errors";
import { EditBar } from "@/components/tools/fix/EditBar";

type Column = { index: number; name: string; example: string };
type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: DuplicatesPreview; key: string }
  | { status: "applying"; preview: DuplicatesPreview; key: string }
  | { status: "error"; message: string };

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/**
 * Remove Duplicates (Stage 11): compare all or chosen columns, exact or ignoring
 * capital letters and extra spaces, keep the first or last copy, and remove the
 * other copies or mark them in a new column. The preview runs as soon as the
 * file is open and after every choice; nothing changes until Apply.
 */
export function DuplicatesPanel({ api }: { api: ToolApi }) {
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const [columns, setColumns] = useState<Column[]>([]);
  const [allColumns, setAllColumns] = useState(true);
  const [chosen, setChosen] = useState<number[]>([]);
  const [ignoreCase, setIgnoreCase] = useState(false);
  const [ignoreSpaces, setIgnoreSpaces] = useState(false);
  const [keep, setKeep] = useState<KeepWhich>("first");
  const [action, setAction] = useState<DuplicateAction>("remove");
  const [clearInstead, setClearInstead] = useState(false);
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  const [done, setDone] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!api.sheetReady) return;
    let live = true;
    apiRef.current.columns().then(
      (cols) => {
        if (!live) return;
        setColumns(cols);
        setChosen((list) => list.filter((c) => c < cols.length));
      },
      () => live && setColumns([]),
    );
    return () => {
      live = false;
    };
  }, [api.viewKey, api.headerRow, api.edits.version, api.sheetReady]);

  const active = api.sheetReady && (allColumns || chosen.length > 0);
  /** The choices a preview was made for: a preview for other choices is never shown or applied. */
  const key = JSON.stringify([allColumns, chosen, ignoreCase, ignoreSpaces, keep, action, clearInstead, api.edits.version, api.headerRow, api.viewKey]);
  useEffect(() => {
    if (!active) return;
    const mySeq = ++seq.current;
    const timer = setTimeout(() => {
      setState({ status: "loading" });
      apiRef.current
        .previewDuplicates({ options: { columns: allColumns ? null : chosen, ignoreCase, ignoreSpaces, keep, action }, clearInstead: action === "remove" && clearInstead })
        .then(
          (preview) => mySeq === seq.current && setState({ status: "ready", preview, key }),
          (err: unknown) => {
            if (mySeq !== seq.current) return;
            if (err instanceof EngineError && err.code === "cancelled") return setState({ status: "idle" });
            setState({ status: "error", message: err instanceof Error ? err.message : "The preview could not be made." });
          },
        );
    }, 0);
    return () => clearTimeout(timer);
  }, [active, key, allColumns, chosen, ignoreCase, ignoreSpaces, keep, action, clearInstead]);

  const toggle = (i: number, on: boolean) => {
    setDone(null);
    setChosen((list) => (on ? [...new Set([...list, i])].sort((a, b) => a - b) : list.filter((c) => c !== i)));
  };
  const nameOf = (i: number) => columns.find((c) => c.index === i)?.name ?? `Column ${i + 1}`;

  async function apply(preview: DuplicatesPreview) {
    if (!preview.token) return;
    setState({ status: "applying", preview, key });
    try {
      await apiRef.current.applyFix(preview.token);
      setDone(
        preview.clearing
          ? `The cells of ${plural(preview.duplicates, "duplicate row")} were cleared; the rows themselves stay in place. You can undo this.`
          : action === "mark"
            ? `${plural(preview.duplicates, "duplicate row")} marked in a new “Duplicate” column at the right of the sheet. Nothing was removed. You can undo this.`
            : `${plural(preview.duplicates, "duplicate row")} removed. You can undo this.`,
      );
      setClearInstead(false);
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "The change could not be applied. Nothing was changed." });
    }
  }

  if (!api.sheetReady) return null;

  const stale = (state.status === "ready" || state.status === "applying") && state.key !== key;
  const view: PreviewState = !active ? { status: "idle" } : stale || state.status === "idle" ? { status: "loading" } : state;
  const preview = view.status === "ready" || view.status === "applying" ? view.preview : null;
  const compared = allColumns ? columns.map((c) => c.index) : chosen;

  return (
    <div className="space-y-4">
      <EditBar api={api} />
      <Card>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <CopyX className="size-5 text-primary" aria-hidden="true" /> Remove duplicates
        </h2>
        <p className="mt-1 text-sm text-muted">Choose how rows are compared. The preview shows which rows match before anything changes.</p>

        {done && (
          <p role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{done}</span>
          </p>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold">Compare</legend>
            <div className="mt-1 space-y-0.5">
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" className="size-5 accent-[var(--primary)]" name="dup-compare" checked={allColumns} onChange={() => (setAllColumns(true), setDone(null))} />
                All columns (whole rows are the same)
              </label>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" className="size-5 accent-[var(--primary)]" name="dup-compare" checked={!allColumns} onChange={() => (setAllColumns(false), setDone(null))} />
                Only the columns I choose
              </label>
            </div>
            {!allColumns && (
              <div className="mt-1 max-h-64 space-y-0.5 overflow-y-auto rounded-xl border border-line px-3 py-1" role="group" aria-label="Columns to compare">
                {columns.map((c) => (
                  <label key={c.index} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={chosen.includes(c.index)} onChange={(e) => toggle(c.index, e.target.checked)} />
                    <span className="font-medium">{c.name}</span>
                    {c.example && <span className="truncate text-muted">(e.g. {c.example})</span>}
                  </label>
                ))}
              </div>
            )}
          </fieldset>

          <div className="space-y-4">
            <fieldset>
              <legend className="text-sm font-semibold">Matching</legend>
              <div className="mt-1 space-y-0.5">
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={ignoreCase} onChange={(e) => (setIgnoreCase(e.target.checked), setDone(null))} />
                  Ignore capital letters (Paris = PARIS)
                </label>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={ignoreSpaces} onChange={(e) => (setIgnoreSpaces(e.target.checked), setDone(null))} />
                  Ignore extra spaces
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold">Which copy to keep</legend>
              <div className="mt-1 flex flex-wrap gap-x-5">
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" className="size-5 accent-[var(--primary)]" name="dup-keep" checked={keep === "first"} onChange={() => (setKeep("first"), setDone(null))} />
                  The first
                </label>
                <label className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" className="size-5 accent-[var(--primary)]" name="dup-keep" checked={keep === "last"} onChange={() => (setKeep("last"), setDone(null))} />
                  The last
                </label>
              </div>
            </fieldset>
            <fieldset>
              <legend className="text-sm font-semibold">What to do with the other copies</legend>
              <div className="mt-1 space-y-0.5">
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" className="size-5 accent-[var(--primary)]" name="dup-action" checked={action === "remove"} onChange={() => (setAction("remove"), setDone(null))} />
                  Remove them
                </label>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" className="size-5 accent-[var(--primary)]" name="dup-action" checked={action === "mark"} onChange={() => (setAction("mark"), setDone(null))} />
                  Mark them in a new column (remove nothing)
                </label>
              </div>
            </fieldset>
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-4" aria-live="polite">
          {view.status === "idle" && <p className="text-sm text-muted">Tick at least one column to compare.</p>}
          {view.status === "loading" && (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Looking for duplicate rows…
            </p>
          )}
          {view.status === "error" && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{view.message}</span>
            </p>
          )}
          {preview && (
            <DuplicatesPreviewView
              preview={preview}
              action={action}
              columnNames={compared.slice(0, 6).map(nameOf)}
              clearInstead={clearInstead}
              onClearInstead={setClearInstead}
              onMarkInstead={() => setAction("mark")}
            />
          )}
          {preview?.token && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void apply(preview)} disabled={view.status === "applying"}>
                {view.status === "applying" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
                {preview.clearing
                  ? `Apply: clear ${plural(preview.duplicates, "row")}`
                  : action === "mark"
                    ? `Apply: mark ${plural(preview.duplicates, "row")}`
                    : `Apply: remove ${plural(preview.duplicates, "row")}`}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function DuplicatesPreviewView({
  preview,
  action,
  columnNames,
  clearInstead,
  onClearInstead,
  onMarkInstead,
}: {
  preview: DuplicatesPreview;
  action: DuplicateAction;
  columnNames: string[];
  clearInstead: boolean;
  onClearInstead: (on: boolean) => void;
  onMarkInstead: () => void;
}) {
  if (preview.refused && preview.groups === 0) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-xl bg-surface-muted px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{preview.refused}</span>
      </p>
    );
  }
  const verb = preview.clearing ? "cleared (the rows stay in place)" : action === "mark" ? "marked" : "removed";
  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground" role="status">
        {plural(preview.groups, "group")} of matching rows · {plural(preview.duplicates, "duplicate row")} will be {verb}
      </p>
      {preview.blockedBy.length > 0 && (
        <div className="space-y-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>Rows can&apos;t be removed from this file, because removing them would break: {preview.blockedBy.join("; ")}.</span>
          </p>
          <label className="flex min-h-10 cursor-pointer items-center gap-2 text-foreground">
            <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={clearInstead} onChange={(e) => onClearInstead(e.target.checked)} />
            Clear these rows instead (their cells are emptied; the rows stay in place)
          </label>
          <Button size="sm" variant="outline" onClick={onMarkInstead}>
            Mark them in a new column instead
          </Button>
        </div>
      )}
      {preview.refused && preview.groups > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-xl bg-surface-muted px-4 py-3 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{preview.refused}</span>
        </p>
      )}
      {preview.examples.length > 0 && (
        // Scrolls inside the card on narrow screens; the page itself never scrolls sideways.
        <div className="overflow-x-auto rounded-xl border border-line" tabIndex={0} aria-label="Groups of matching rows">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Groups of matching rows: the row that is kept and its copies</caption>
            <thead className="bg-surface-muted text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                  Kept row
                </th>
                <th scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                  Copies
                </th>
                {columnNames.map((n, k) => (
                  <th key={k} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                    {n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.examples.map((e) => (
                <tr key={e.kept}>
                  <td className="px-3 py-2 font-semibold">{fmt(e.kept)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {e.copies.map(fmt).join(", ")}
                    {e.copyCount > e.copies.length ? ` and ${fmt(e.copyCount - e.copies.length)} more` : ""}
                  </td>
                  {e.values.map((v, k) => (
                    <td key={k} className="px-3 py-2 break-all">
                      {v === "" ? <span className="text-muted italic">empty</span> : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview.groups > preview.examples.length && (
        <p className="text-xs text-muted">The {fmt(preview.examples.length)} largest groups are shown. Every removed row is listed in the change history afterwards.</p>
      )}
      {preview.formulaSkipped > 0 && (
        <p className="text-xs text-muted">Left in place: {plural(preview.formulaSkipped, "duplicate row")} with formulas (rows with formulas are never removed automatically).</p>
      )}
      <p className="text-xs text-muted">Row numbers are the rows as they are now (row 1 is the first row of the sheet).</p>
    </div>
  );
}
