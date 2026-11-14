"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, PencilLine, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { CellInfo, EditResult } from "@/engine/core";
import { EngineError } from "@/engine/errors";

/**
 * Edit one cell by hand. A formula cell shows a warning first and can only be
 * saved after the user confirms that the formula will be replaced (safeguard S1).
 * The change is applied to the working copy on this device; Undo takes it back.
 */
export function CellEditor({
  row,
  columnLabel,
  header = false,
  loadInfo,
  save,
  onClose,
}: {
  /** View row (for the "Row N" label). */
  row: number;
  /** Column name from the table header, if any. */
  columnLabel: string;
  /** Stage 7: this cell is the column's name (the header row), not data. */
  header?: boolean;
  loadInfo: () => Promise<CellInfo>;
  save: (text: string, replaceFormula: boolean) => Promise<EditResult>;
  onClose: () => void;
}) {
  const [info, setInfo] = useState<CellInfo | null>(null);
  const [text, setText] = useState("");
  const [confirmFormula, setConfirmFormula] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef(loadInfo);

  useEffect(() => {
    let active = true;
    loadRef.current().then(
      (i) => {
        if (!active) return;
        setInfo(i);
        setText(i.editText);
        requestAnimationFrame(() => {
          inputRef.current?.focus();
          inputRef.current?.select();
        });
      },
      (err: unknown) => active && setError(err instanceof Error ? err.message : "This cell could not be opened."),
    );
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [onClose]);

  const blocked = !!info?.formula && !confirmFormula;
  const unchanged = info !== null && text === info.editText && !info.formula;

  async function submit() {
    if (!info || blocked || saving) return;
    if (unchanged) return onClose();
    setSaving(true);
    setError(null);
    try {
      await save(text, !!info.formula && confirmFormula);
      onClose();
    } catch (err) {
      setError(err instanceof EngineError || err instanceof Error ? err.message : "The cell could not be saved.");
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="cell-editor-title" tabIndex={-1} className="flex max-h-[100dvh] w-full flex-col bg-surface shadow-xl outline-none sm:max-w-lg sm:rounded-2xl">
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <div className="flex min-w-0 items-start gap-2">
            <PencilLine className="mt-1 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id="cell-editor-title" className="text-lg font-semibold">
                {header ? "Rename column" : "Edit cell"} {info?.ref ?? ""}
              </h2>
              <p className="truncate text-xs text-muted">
                {header ? `Column name · ${columnLabel}` : `Row ${(row + 1).toLocaleString("en-US")} · ${columnLabel}`}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl hover:bg-surface-muted" aria-label="Close">
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>
        <form
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {!info && !error && (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading…
            </p>
          )}
          {info && (
            <>
              <p className="text-sm">
                <span className="text-muted">Current value: </span>
                <span className="font-mono break-all">{info.display === "" ? <em className="text-muted">(empty)</em> : `“${info.display}”`}</span>
              </p>
              {info.formula && (
                <div className="rounded-xl bg-warning-soft px-4 py-3 text-sm" role="alert">
                  <p className="flex items-start gap-2 font-semibold text-warning">
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> This cell contains a formula
                  </p>
                  <p className="mt-1 font-mono text-xs break-all">={info.formula}</p>
                  <p className="mt-1 text-muted">
                    Saving replaces the formula with the value you type, so this cell will no longer update. Other cells that use it are recalculated when the
                    file is opened in Excel.
                  </p>
                  <label className="mt-2 inline-flex min-h-10 cursor-pointer items-center gap-2">
                    <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={confirmFormula} onChange={(e) => setConfirmFormula(e.target.checked)} />
                    Replace the formula with my value
                  </label>
                </div>
              )}
              {header && (
                <p className="rounded-xl bg-surface-muted px-4 py-3 text-sm text-muted">
                  This is the column&apos;s name in the first row. Only the name changes; the data in the column stays as it is. Undo works as for any change.
                </p>
              )}
              <label className="block text-sm font-medium" htmlFor="cell-editor-input">
                {header ? "New name" : "New value"}
              </label>
              <textarea
                id="cell-editor-input"
                ref={inputRef}
                value={text}
                rows={3}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submit();
                  }
                }}
                className="w-full rounded-xl border border-line-strong bg-background px-3 py-2 font-mono text-sm focus:border-primary focus:outline-2 focus:outline-ring/40"
              />
              <p className="text-xs text-muted">
                Leave it empty to clear the cell.{info.isDate ? " Type a clear date such as 2024-01-31 to keep it a real date." : ""} Shift+Enter adds a new line.
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={!info || blocked || saving}>
              {saving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              Save
            </Button>
          </div>
          <p className="text-xs text-muted">Your original file is never changed. You can undo this.</p>
        </form>
      </div>
    </div>
  );
}
