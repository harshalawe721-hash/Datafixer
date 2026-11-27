"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, Loader2, Split } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import type { SplitCombinePreview } from "@/engine/core";
import type { SplitMode } from "@/engine/fix/split-combine";
import { EngineError } from "@/engine/errors";
import { EditBar } from "@/components/tools/fix/EditBar";

const SEPARATORS = [
  { id: "space", label: "Space", value: " " },
  { id: "comma", label: "Comma ( , )", value: "," },
  { id: "semicolon", label: "Semicolon ( ; )", value: ";" },
  { id: "dash", label: "Dash ( - )", value: "-" },
  { id: "tab", label: "Tab", value: "\t" },
  { id: "custom", label: "Other text", value: "" },
] as const;
type SeparatorId = (typeof SEPARATORS)[number]["id"];

type Column = { index: number; name: string; example: string };
type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: SplitCombinePreview; columnName: string; key: string }
  | { status: "applying"; preview: SplitCombinePreview; columnName: string; key: string }
  | { status: "error"; message: string };

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/** An empty part is shown as a dash in the preview. */
const shown = (s: string) => (s === "" ? "—" : s);

/**
 * Split a column (Stage 10): choose a column and a separator; the preview
 * shows the new columns for the first rows. Apply adds them at the right edge
 * of the sheet; Undo takes them away. The original column is kept unless the
 * user ticks "Remove the original column".
 */
export function SplitPanel({ api }: { api: ToolApi }) {
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const [columns, setColumns] = useState<Column[]>([]);
  const [column, setColumn] = useState<number | null>(null);
  const [separator, setSeparator] = useState<SeparatorId>("space");
  const [custom, setCustom] = useState("");
  const [mode, setMode] = useState<SplitMode>("first");
  const [maxParts, setMaxParts] = useState<number | null>(null);
  const [trim, setTrim] = useState(true);
  const [quotes, setQuotes] = useState(false);
  const [removeOriginal, setRemoveOriginal] = useState(false);
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  const [done, setDone] = useState<string | null>(null);
  const seq = useRef(0);
  /** Choices of the preview last requested (see the preview effect). */
  const requested = useRef<string | null>(null);

  const unsupported = api.format === "xls";
  const sepValue = separator === "custom" ? custom : SEPARATORS.find((s) => s.id === separator)!.value;

  // Column list (names follow the "First row contains column names" setting and every change).
  useEffect(() => {
    if (!api.sheetReady || unsupported) return;
    let live = true;
    apiRef.current.columns().then(
      (cols) => {
        if (!live) return;
        setColumns(cols);
        setColumn((c) => (c !== null && c < cols.length ? c : null));
      },
      () => live && setColumns([]),
    );
    return () => {
      live = false;
    };
  }, [api.viewKey, api.headerRow, api.edits.version, api.sheetReady, unsupported]);

  // Preview whenever a choice changes (a short pause while typing a custom separator).
  const active = column !== null && !unsupported && sepValue !== "";
  /** The choices a preview was made for: a preview for other choices is never shown or applied. */
  const key = JSON.stringify([column, sepValue, mode, maxParts, trim, quotes, removeOriginal, api.edits.version, api.headerRow]);
  useEffect(() => {
    if (!active || column === null) return;
    const timer = setTimeout(() => {
      // One request per set of choices: a re-render with the same choices (for example the
      // column list loading) must not start a second preview, which would replace the first
      // one's token while its Apply button is already shown.
      if (requested.current === key) return;
      requested.current = key;
      const mySeq = ++seq.current;
      setState({ status: "loading" });
      const columnName = columns.find((c) => c.index === column)?.name ?? `Column ${column + 1}`;
      apiRef.current
        .previewSplit({ column, options: { separator: sepValue, mode, maxParts: mode === "every" ? maxParts : null, trim, respectQuotes: quotes }, removeOriginal })
        .then(
          (preview) => mySeq === seq.current && setState({ status: "ready", preview, columnName, key }),
          (err: unknown) => {
            if (mySeq !== seq.current) return;
            requested.current = null;
            if (err instanceof EngineError && err.code === "cancelled") return setState({ status: "idle" });
            setState({ status: "error", message: err instanceof Error ? err.message : "The preview could not be made." });
          },
        );
    }, separator === "custom" ? 300 : 0);
    return () => clearTimeout(timer);
  }, [active, key, column, sepValue, separator, mode, maxParts, trim, quotes, removeOriginal, columns]);

  async function apply(preview: SplitCombinePreview, columnName: string) {
    if (!preview.token) return;
    setState({ status: "applying", preview, columnName, key });
    try {
      await apiRef.current.applyFix(preview.token);
      const kept = preview.originalsKept.length ? " The original column was kept (see the note in the preview)." : "";
      setDone(`“${columnName}” was split into ${plural(preview.columnsAdded, "new column")}, added at the right of the sheet.${kept} You can undo this.`);
      setColumn(null);
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "The split could not be applied. Nothing was changed." });
    }
  }

  if (unsupported) {
    return (
      <Card>
        <p role="status" className="flex items-start gap-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Split a column works with CSV and .xlsx files. Columns can&apos;t be added safely to old .xls files. Save the file as .xlsx in Excel, or convert
            it to CSV with Excel to CSV, then open it here.
          </span>
        </p>
      </Card>
    );
  }
  if (!api.sheetReady) return null;

  // With no column (or no separator) chosen, the panel is idle whatever the last preview was.
  const stale = (state.status === "ready" || state.status === "applying") && state.key !== key;
  const view: PreviewState = !active ? { status: "idle" } : stale || state.status === "idle" ? { status: "loading" } : state;
  const preview = view.status === "ready" || view.status === "applying" ? view.preview : null;
  const columnName = view.status === "ready" || view.status === "applying" ? view.columnName : "";
  const chosen = columns.find((c) => c.index === column);

  return (
    <div className="space-y-4">
      <EditBar api={api} />
      <Card>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Split className="size-5 text-primary" aria-hidden="true" /> Split a column
        </h2>
        <p className="mt-1 text-sm text-muted">Choose the column and where to split it. The preview shows the result before anything changes.</p>

        {done && (
          <p role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{done}</span>
          </p>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <label htmlFor="split-column" className="text-sm font-semibold">
              Column to split
            </label>
            <select
              id="split-column"
              className="mt-1 block h-11 w-full rounded-xl border border-line bg-background px-3 text-sm"
              value={column ?? ""}
              onChange={(e) => {
                setDone(null);
                setColumn(e.target.value === "" ? null : Number(e.target.value));
              }}
            >
              <option value="">Choose a column</option>
              {columns.map((c) => (
                <option key={c.index} value={c.index}>
                  {c.name}
                  {c.example ? ` (e.g. ${c.example.slice(0, 30)})` : ""}
                </option>
              ))}
            </select>
            {chosen?.example && <p className="mt-1 truncate text-xs text-muted">First value: {chosen.example}</p>}
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">Split at</legend>
            <div className="mt-1 flex flex-wrap gap-x-5">
              {SEPARATORS.map((s) => (
                <label key={s.id} className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" className="size-5 accent-[var(--primary)]" name="split-separator" checked={separator === s.id} onChange={() => setSeparator(s.id)} />
                  {s.label}
                </label>
              ))}
            </div>
            {separator === "custom" && (
              <div className="mt-1">
                <label htmlFor="split-custom" className="sr-only">
                  Separator text
                </label>
                <input
                  id="split-custom"
                  type="text"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="For example | or  - "
                  className="h-11 w-full rounded-xl border border-line bg-background px-3 font-mono text-sm"
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-muted">Spaces count: “ - ” (with spaces) is different from “-”.</p>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">How many times</legend>
            <div className="mt-1 space-y-0.5">
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" className="size-5 accent-[var(--primary)]" name="split-mode" checked={mode === "first"} onChange={() => setMode("first")} />
                At the first separator only (2 parts)
              </label>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" className="size-5 accent-[var(--primary)]" name="split-mode" checked={mode === "every"} onChange={() => setMode("every")} />
                At every separator
              </label>
            </div>
            {mode === "every" && (
              <div className="mt-1 flex items-center gap-2 text-sm">
                <label htmlFor="split-max">Parts to keep</label>
                <select
                  id="split-max"
                  className="h-10 rounded-xl border border-line bg-background px-2 text-sm"
                  value={maxParts ?? ""}
                  onChange={(e) => setMaxParts(e.target.value === "" ? null : Number(e.target.value))}
                >
                  <option value="">All</option>
                  {[2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n} (the last part keeps the rest)
                    </option>
                  ))}
                </select>
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-sm font-semibold">Options</legend>
            <div className="mt-1 space-y-0.5">
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={trim} onChange={(e) => setTrim(e.target.checked)} />
                Remove spaces around each part
              </label>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={quotes} onChange={(e) => setQuotes(e.target.checked)} />
                Don&apos;t split inside &quot;double quotes&quot;
              </label>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={removeOriginal} onChange={(e) => setRemoveOriginal(e.target.checked)} />
                Remove the original column
              </label>
            </div>
          </fieldset>
        </div>

        <div className="mt-5 border-t border-line pt-4" aria-live="polite">
          {view.status === "idle" && (
            <p className="text-sm text-muted">{column === null ? "Choose a column to see a preview." : "Type the separator to see a preview."}</p>
          )}
          {view.status === "loading" && (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Working out the parts…
            </p>
          )}
          {view.status === "error" && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{view.message}</span>
            </p>
          )}
          {preview && <SplitPreview preview={preview} columnName={columnName} />}
          {preview?.token && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void apply(preview, columnName)} disabled={view.status === "applying"}>
                {view.status === "applying" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
                Apply: add {plural(preview.columnsAdded, "column")}
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function SplitPreview({ preview, columnName }: { preview: SplitCombinePreview; columnName: string }) {
  if (preview.refused) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-xl bg-surface-muted px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{preview.refused}</span>
      </p>
    );
  }
  const parts = Array.from({ length: preview.columnsAdded }, (_, k) => `${columnName} (${k + 1})`);
  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground" role="status">
        {plural(preview.columnsAdded, "new column")} will be added at the right of the sheet · {plural(preview.cellsWritten, "cell")} filled
      </p>
      {preview.originalsKept.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>The original column will be kept, because removing it would break: {preview.originalsKept.join("; ")}.</span>
        </p>
      )}
      {preview.examples.length > 0 && (
        // Scrolls inside the card on narrow screens; the page itself never scrolls sideways.
        <div className="overflow-x-auto rounded-xl border border-line" tabIndex={0} aria-label="Preview of the first rows">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">First rows before and after the split</caption>
            <thead className="bg-surface-muted text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Row
                </th>
                <th scope="col" className="px-3 py-2 font-medium">
                  {columnName}
                </th>
                {parts.map((p) => (
                  <th key={p} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                    {p}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.examples.map((e) => (
                <tr key={e.row}>
                  <td className="px-3 py-2 text-muted">{fmt(e.row)}</td>
                  <td className="px-3 py-2 break-all">{e.before[0]}</td>
                  {e.after.map((a, k) => (
                    <td key={k} className="px-3 py-2 font-semibold whitespace-pre break-all">
                      {shown(a)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview.skipped.map((s) => (
        <p key={s.reason} className="text-xs text-muted">
          Left unchanged: {s.reason} ({fmt(s.count)})
        </p>
      ))}
      <p className="text-xs text-muted">Values without the separator go into the first new column. Check the preview: a separator inside a value (such as “Lee, Jr”) also splits it.</p>
    </div>
  );
}
