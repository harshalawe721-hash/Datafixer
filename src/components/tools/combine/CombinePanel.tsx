"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Combine, Info, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import type { SplitCombinePreview } from "@/engine/core";
import { EngineError } from "@/engine/errors";
import { EditBar } from "@/components/tools/fix/EditBar";

const SEPARATORS = [
  { id: "space", label: "Space", value: " ", example: "Asha Patil" },
  { id: "comma", label: "Comma and space", value: ", ", example: "Pune, Maharashtra" },
  { id: "dash", label: "Dash", value: "-", example: "AB-12" },
  { id: "none", label: "Nothing", value: "", example: "AB12" },
  { id: "custom", label: "Other text", value: "", example: "" },
] as const;
type SeparatorId = (typeof SEPARATORS)[number]["id"];

type Column = { index: number; name: string; example: string };
type PreviewState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; preview: SplitCombinePreview; key: string }
  | { status: "applying"; preview: SplitCombinePreview; key: string }
  | { status: "error"; message: string };

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;
const DEFAULT_NAME = "Combined";

/**
 * Combine columns (Stage 10): tick two or more columns (joined in the order
 * ticked, which can be changed), choose what goes between the values, and
 * name the new column. Apply adds it at the right edge of the sheet; the
 * original columns are kept unless the user ticks "Remove the original columns".
 */
export function CombinePanel({ api }: { api: ToolApi }) {
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const [columns, setColumns] = useState<Column[]>([]);
  /** Chosen columns, in the order they are joined. */
  const [chosen, setChosen] = useState<number[]>([]);
  const [separator, setSeparator] = useState<SeparatorId>("space");
  const [custom, setCustom] = useState("");
  const [name, setName] = useState("");
  const [skipEmpty, setSkipEmpty] = useState(true);
  const [removeOriginals, setRemoveOriginals] = useState(false);
  const [state, setState] = useState<PreviewState>({ status: "idle" });
  const [done, setDone] = useState<string | null>(null);
  const seq = useRef(0);

  const unsupported = api.format === "xls";
  const sepValue = separator === "custom" ? custom : SEPARATORS.find((s) => s.id === separator)!.value;
  const newName = name.trim() || DEFAULT_NAME;

  useEffect(() => {
    if (!api.sheetReady || unsupported) return;
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
  }, [api.viewKey, api.headerRow, api.edits.version, api.sheetReady, unsupported]);

  const active = chosen.length >= 2 && !unsupported && !(separator === "custom" && custom === "");
  /** The choices a preview was made for: a preview for other choices is never shown or applied. */
  const key = JSON.stringify([chosen, sepValue, skipEmpty, removeOriginals, newName, api.edits.version, api.headerRow]);
  useEffect(() => {
    if (!active) return;
    const mySeq = ++seq.current;
    const typing = separator === "custom" || name !== "";
    const timer = setTimeout(() => {
      setState({ status: "loading" });
      apiRef.current.previewCombine({ columns: chosen, name: newName, options: { separator: sepValue, skipEmpty }, removeOriginals }).then(
        (preview) => mySeq === seq.current && setState({ status: "ready", preview, key }),
        (err: unknown) => {
          if (mySeq !== seq.current) return;
          if (err instanceof EngineError && err.code === "cancelled") return setState({ status: "idle" });
          setState({ status: "error", message: err instanceof Error ? err.message : "The preview could not be made." });
        },
      );
    }, typing ? 300 : 0);
    return () => clearTimeout(timer);
  }, [active, key, chosen, sepValue, separator, name, newName, skipEmpty, removeOriginals]);

  const nameOf = (i: number) => columns.find((c) => c.index === i)?.name ?? `Column ${i + 1}`;
  const toggle = (i: number, on: boolean) => {
    setDone(null);
    setChosen((list) => (on ? (list.includes(i) ? list : [...list, i]) : list.filter((c) => c !== i)));
  };
  const move = (pos: number, by: -1 | 1) =>
    setChosen((list) => {
      const next = [...list];
      const to = pos + by;
      if (to < 0 || to >= next.length) return list;
      [next[pos], next[to]] = [next[to]!, next[pos]!];
      return next;
    });

  async function apply(preview: SplitCombinePreview) {
    if (!preview.token) return;
    setState({ status: "applying", preview, key });
    try {
      await apiRef.current.applyFix(preview.token);
      const kept = removeOriginals && preview.originalsKept.length ? " The original columns were kept (see the note in the preview)." : "";
      setDone(`${chosen.map((c) => `“${nameOf(c)}”`).join(" + ")} were combined into a new column${api.headerRow ? ` “${newName}”` : ""}, added at the right of the sheet.${kept} You can undo this.`);
      setChosen([]);
      setName("");
    } catch (err) {
      setState({ status: "error", message: err instanceof Error ? err.message : "The columns could not be combined. Nothing was changed." });
    }
  }

  if (unsupported) {
    return (
      <Card>
        <p role="status" className="flex items-start gap-2 text-sm">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            Combine columns works with CSV and .xlsx files. Columns can&apos;t be added safely to old .xls files. Save the file as .xlsx in Excel, or
            convert it to CSV with Excel to CSV, then open it here.
          </span>
        </p>
      </Card>
    );
  }
  if (!api.sheetReady) return null;

  const stale = (state.status === "ready" || state.status === "applying") && state.key !== key;
  const view: PreviewState = !active ? { status: "idle" } : stale || state.status === "idle" ? { status: "loading" } : state;
  const preview = view.status === "ready" || view.status === "applying" ? view.preview : null;

  return (
    <div className="space-y-4">
      <EditBar api={api} />
      <Card>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Combine className="size-5 text-primary" aria-hidden="true" /> Combine columns
        </h2>
        <p className="mt-1 text-sm text-muted">Tick the columns to join, in the order you want them. The preview shows the result before anything changes.</p>

        {done && (
          <p role="status" className="mt-4 flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{done}</span>
          </p>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <fieldset className="min-w-0">
            <legend className="text-sm font-semibold">Columns to combine</legend>
            <div className="mt-1 max-h-72 space-y-0.5 overflow-y-auto">
              {columns.map((c) => (
                <label key={c.index} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5 shrink-0 accent-[var(--primary)]" checked={chosen.includes(c.index)} onChange={(e) => toggle(c.index, e.target.checked)} />
                  <span className="font-medium">{c.name}</span>
                  {c.example && <span className="truncate text-muted">(e.g. {c.example})</span>}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="min-w-0">
            <h3 className="text-sm font-semibold" id="combine-order-heading">
              Order
            </h3>
            {chosen.length === 0 ? (
              <p className="mt-1 text-sm text-muted">Tick at least two columns.</p>
            ) : (
              <ol className="mt-1 space-y-1" aria-labelledby="combine-order-heading">
                {chosen.map((c, pos) => (
                  <li key={c} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1 text-sm">
                    <span className="w-5 text-muted">{pos + 1}.</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{nameOf(c)}</span>
                    <button
                      type="button"
                      className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface-muted disabled:opacity-40"
                      onClick={() => move(pos, -1)}
                      disabled={pos === 0}
                      aria-label={`Move ${nameOf(c)} up`}
                    >
                      <ArrowUp className="size-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface-muted disabled:opacity-40"
                      onClick={() => move(pos, 1)}
                      disabled={pos === chosen.length - 1}
                      aria-label={`Move ${nameOf(c)} down`}
                    >
                      <ArrowDown className="size-4" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <fieldset>
            <legend className="text-sm font-semibold">Between the values</legend>
            <div className="mt-1 flex flex-wrap gap-x-5">
              {SEPARATORS.map((s) => (
                <label key={s.id} className="inline-flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" className="size-5 accent-[var(--primary)]" name="combine-separator" checked={separator === s.id} onChange={() => setSeparator(s.id)} />
                  {s.label}
                  {s.example && <span className="text-muted">({s.example})</span>}
                </label>
              ))}
            </div>
            {separator === "custom" && (
              <div className="mt-1">
                <label htmlFor="combine-custom" className="sr-only">
                  Text between the values
                </label>
                <input
                  id="combine-custom"
                  type="text"
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="For example  /  or  | "
                  className="h-11 w-full rounded-xl border border-line bg-background px-3 font-mono text-sm"
                  autoComplete="off"
                />
                <p className="mt-1 text-xs text-muted">Spaces count: “ / ” (with spaces) is different from “/”.</p>
              </div>
            )}
          </fieldset>

          <div className="space-y-3">
            {api.headerRow && (
              <div>
                <label htmlFor="combine-name" className="text-sm font-semibold">
                  Name of the new column
                </label>
                <input
                  id="combine-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={DEFAULT_NAME}
                  className="mt-1 h-11 w-full rounded-xl border border-line bg-background px-3 text-sm"
                  autoComplete="off"
                />
              </div>
            )}
            <fieldset>
              <legend className="text-sm font-semibold">Options</legend>
              <div className="mt-1 space-y-0.5">
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={skipEmpty} onChange={(e) => setSkipEmpty(e.target.checked)} />
                  Skip empty values (no extra separators)
                </label>
                <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={removeOriginals} onChange={(e) => setRemoveOriginals(e.target.checked)} />
                  Remove the original columns
                </label>
              </div>
            </fieldset>
          </div>
        </div>

        <div className="mt-5 border-t border-line pt-4" aria-live="polite">
          {view.status === "idle" && (
            <p className="text-sm text-muted">{chosen.length < 2 ? "Tick at least two columns to see a preview." : "Type the text to put between the values to see a preview."}</p>
          )}
          {view.status === "loading" && (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Joining the values…
            </p>
          )}
          {view.status === "error" && (
            <p role="alert" className="flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{view.message}</span>
            </p>
          )}
          {preview && <CombinePreview preview={preview} sources={chosen.map(nameOf)} newName={api.headerRow ? newName : "New column"} />}
          {preview?.token && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void apply(preview)} disabled={view.status === "applying"}>
                {view.status === "applying" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
                Apply: add the combined column
              </Button>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function CombinePreview({ preview, sources, newName }: { preview: SplitCombinePreview; sources: string[]; newName: string }) {
  if (preview.refused) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-xl bg-surface-muted px-4 py-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>{preview.refused}</span>
      </p>
    );
  }
  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-secondary px-4 py-3 text-sm font-semibold text-secondary-foreground" role="status">
        1 new column will be added at the right of the sheet · {plural(preview.cellsWritten, "cell")} filled
      </p>
      {preview.originalsKept.length > 0 && (
        <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>The original columns will be kept, because removing them would break: {preview.originalsKept.join("; ")}.</span>
        </p>
      )}
      {preview.examples.length > 0 && (
        // Scrolls inside the card on narrow screens; the page itself never scrolls sideways.
        <div className="overflow-x-auto rounded-xl border border-line" tabIndex={0} aria-label="Preview of the first rows">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">First rows before and after combining</caption>
            <thead className="bg-surface-muted text-xs text-muted">
              <tr>
                <th scope="col" className="px-3 py-2 font-medium">
                  Row
                </th>
                {sources.map((s, k) => (
                  <th key={k} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                    {s}
                  </th>
                ))}
                <th scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                  {newName}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {preview.examples.map((e) => (
                <tr key={e.row}>
                  <td className="px-3 py-2 text-muted">{fmt(e.row)}</td>
                  {e.before.map((b, k) => (
                    <td key={k} className="px-3 py-2 break-all">
                      {b === "" ? <span className="text-muted italic">empty</span> : b}
                    </td>
                  ))}
                  <td className="px-3 py-2 font-semibold whitespace-pre break-all">{e.after[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {preview.skipped.map((s) => (
        <p key={s.reason} className="text-xs text-muted">
          Left empty: {s.reason} ({fmt(s.count)})
        </p>
      ))}
    </div>
  );
}
