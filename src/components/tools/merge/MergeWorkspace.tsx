"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, CopyX, Download, Files, Info, Loader2, ShieldCheck, X } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { useFileHandoff } from "@/components/upload/FileHandoffProvider";
import { saveBlob } from "@/components/tools/fix/DownloadDialog";
import { EngineError } from "@/engine/errors";
import type { SpreadsheetFormat } from "@/lib/file-validation";
import { formatBytes } from "@/lib/format";

const ACCEPT = [".csv", ".tsv", ".txt", ".xlsx", ".xls"] as const;
const MAX_FILES = 50;
const MAX_BYTES = 150 * 1024 * 1024;
const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

type Item = { id: number; file: File; format: SpreadsheetFormat };
type Options = { sourceColumn: boolean; removeDuplicates: boolean };

/**
 * Merge Files (Stage 15): choose several files (a list that can be reordered and
 * trimmed), merge them, then see and download the merged table. The file list and
 * options live here, so they stay while the merged table is shown and when the user
 * goes back to change them.
 */
export function MergeWorkspace() {
  const [items, setItems] = useState<Item[]>([]);
  const [options, setOptions] = useState<Options>({ sourceColumn: true, removeDuplicates: false });
  const nextId = useRef(1);
  const files = items.map(({ file, format }) => ({ file, format }));

  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>Choose two or more CSV or Excel files. They are read on your device, never uploaded, and your files are never changed.</span>
      </p>
      <SpreadsheetWorkspace
        merge
        renderIdle={(_open, openMerge) => (
          <MergePicker
            items={items}
            options={options}
            onAdd={(added) => setItems((list) => [...list, ...added.map((a) => ({ ...a, id: nextId.current++ }))])}
            onChange={setItems}
            onOptions={setOptions}
            onMerge={() => openMerge(files, options)}
          />
        )}
        renderTool={(api) => (
          <MergePanel
            api={api}
            options={options}
            onOptions={(next) => {
              setOptions(next);
              api.openMerge(files, next);
            }}
          />
        )}
      />
    </div>
  );
}

function MergePicker({
  items,
  options,
  onAdd,
  onChange,
  onOptions,
  onMerge,
}: {
  items: Item[];
  options: Options;
  onAdd: (files: { file: File; format: SpreadsheetFormat }[]) => void;
  onChange: (items: Item[]) => void;
  onOptions: (o: Options) => void;
  onMerge: () => void;
}) {
  const total = items.reduce((n, i) => n + i.file.size, 0);
  const tooMany = items.length > MAX_FILES;
  const tooBig = total > MAX_BYTES;
  const move = (pos: number, by: -1 | 1) => {
    const next = [...items];
    const to = pos + by;
    if (to < 0 || to >= next.length) return;
    [next[pos], next[to]] = [next[to]!, next[pos]!];
    onChange(next);
  };
  return (
    <div className="space-y-4">
      <FileDropzone
        accept={ACCEPT}
        multiple
        onFileAccepted={() => {}}
        onFilesAccepted={onAdd}
        title={items.length ? "Add more files" : "Drag and drop your files here"}
      />
      {items.length > 0 && (
        <Card>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Files className="size-5 text-primary" aria-hidden="true" /> Files to merge
          </h2>
          <p className="mt-1 text-sm text-muted" role="status">
            {plural(items.length, "file")} · {formatBytes(total)} together. Rows are added in this order.
          </p>
          <ol className="mt-3 space-y-1" aria-label="Files to merge, in order">
            {items.map((item, pos) => (
              <li key={item.id} className="flex items-center gap-2 rounded-xl border border-line px-3 py-1 text-sm">
                <span className="w-6 text-muted">{pos + 1}.</span>
                <span className="min-w-0 flex-1 truncate font-medium">{item.file.name}</span>
                <span className="hidden text-muted sm:inline">{formatBytes(item.file.size)}</span>
                <button type="button" className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface-muted disabled:opacity-40" onClick={() => move(pos, -1)} disabled={pos === 0} aria-label={`Move ${item.file.name} up`}>
                  <ArrowUp className="size-4" aria-hidden="true" />
                </button>
                <button type="button" className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface-muted disabled:opacity-40" onClick={() => move(pos, 1)} disabled={pos === items.length - 1} aria-label={`Move ${item.file.name} down`}>
                  <ArrowDown className="size-4" aria-hidden="true" />
                </button>
                <button type="button" className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-surface-muted" onClick={() => onChange(items.filter((i) => i.id !== item.id))} aria-label={`Remove ${item.file.name}`}>
                  <X className="size-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ol>
          <MergeOptions options={options} onOptions={onOptions} />
          {(tooMany || tooBig) && (
            <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{tooMany ? `Up to ${MAX_FILES} files can be merged at once. Remove some, or merge them in groups.` : `Up to 150 MB can be merged at once (these files are ${formatBytes(total)}). Remove some, or merge them in groups.`}</span>
            </p>
          )}
          <Button className="mt-4" onClick={onMerge} disabled={items.length < 2 || tooMany || tooBig}>
            <Files className="size-4" aria-hidden="true" /> {items.length < 2 ? "Add at least two files" : `Merge ${plural(items.length, "file")}`}
          </Button>
        </Card>
      )}
    </div>
  );
}

function MergeOptions({ options, onOptions }: { options: Options; onOptions: (o: Options) => void }) {
  return (
    <fieldset className="mt-4">
      <legend className="text-sm font-semibold">Options</legend>
      <div className="mt-1 space-y-0.5">
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={options.sourceColumn} onChange={(e) => onOptions({ ...options, sourceColumn: e.target.checked })} />
          Add a “Source file” column (which file each row came from)
        </label>
        <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" className="size-5 accent-[var(--primary)]" checked={options.removeDuplicates} onChange={(e) => onOptions({ ...options, removeDuplicates: e.target.checked })} />
          Remove rows that appear more than once
        </label>
      </div>
    </fieldset>
  );
}

type DownloadState = { status: "idle" } | { status: "working"; kind: "csv" | "xlsx" | "dups" } | { status: "done"; name: string; bytes: number } | { status: "error"; message: string };

function MergePanel({ api, options, onOptions }: { api: ToolApi; options: Options; onOptions: (o: Options) => void }) {
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const router = useRouter();
  const { setPending } = useFileHandoff();
  const [download, setDownload] = useState<DownloadState>({ status: "idle" });
  const seq = useRef(0);
  const m = api.summary.merge;
  if (!api.sheetReady || !m) return null;
  const partial = m.columns.filter((c) => c.files < m.files.length);

  const csvOptions = { delimiter: "," as const, lineEnding: "\r\n" as const, bom: true };
  const run = (kind: "csv" | "xlsx" | "dups") => {
    const mySeq = ++seq.current;
    setDownload({ status: "working", kind });
    const p = kind === "xlsx" ? apiRef.current.convertToXlsx() : apiRef.current.exportCsv(undefined, csvOptions);
    p.then(
      (r) => {
        if (mySeq !== seq.current) return;
        if (kind === "dups") {
          // Hand the merged table to Remove Duplicates (it stays on this device).
          setPending({ file: new File([r.blob], r.summary.downloadName, { type: "text/csv" }), format: "csv" });
          router.push("/remove-duplicates");
          return;
        }
        saveBlob(r.blob, r.summary.downloadName);
        setDownload({ status: "done", name: r.summary.downloadName, bytes: r.blob.size });
      },
      (err: unknown) => {
        if (mySeq !== seq.current) return;
        const cancelled = err instanceof EngineError && err.code === "cancelled";
        setDownload({ status: "error", message: cancelled ? "Cancelled. Nothing was created." : err instanceof Error ? err.message : "The file could not be created." });
      },
    );
  };

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Files className="size-5 text-primary" aria-hidden="true" /> Merged table
      </h2>
      <p className="mt-1 text-sm text-muted" role="status">
        {plural(m.records, "row")} from {plural(m.files.length, "file")} · {plural(m.columns.length + (m.sourceColumn ? 1 : 0), "column")}
      </p>

      <ul className="mt-3 space-y-0.5 text-sm" aria-label="Files in the merge">
        {m.files.map((f) => (
          <li key={f.name} className="flex flex-wrap gap-x-2">
            <span className="font-medium">{f.name}</span>
            <span className="text-muted">
              {plural(f.rows, "row")}
              {f.sheet ? ` · sheet “${f.sheet}”` : ""}
              {f.header ? "" : " · no column names (matched by position)"}
            </span>
          </li>
        ))}
      </ul>

      {(partial.length > 0 || m.duplicatesRemoved > 0) && (
        <ul className="mt-3 space-y-1 text-sm">
          {partial.length > 0 && (
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                {plural(partial.length, "column")} {partial.length === 1 ? "is" : "are"} only in some files, so {partial.length === 1 ? "it is" : "they are"} empty for the others:{" "}
                {partial
                  .slice(0, 8)
                  .map((c) => `${c.name} (${c.files} of ${m.files.length})`)
                  .join(", ")}
                {partial.length > 8 ? ", …" : ""}. Columns are matched by name; differently named columns (Email and E-mail) stay separate.
              </span>
            </li>
          )}
          {m.duplicatesRemoved > 0 && (
            <li className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
              {plural(m.duplicatesRemoved, "row")} that appeared more than once {m.duplicatesRemoved === 1 ? "was" : "were"} left out (the first copy is kept).
            </li>
          )}
        </ul>
      )}

      <MergeOptions options={options} onOptions={onOptions} />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => run("csv")} disabled={download.status === "working"}>
          {download.status === "working" && download.kind === "csv" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          Download CSV
        </Button>
        <Button variant="outline" onClick={() => run("xlsx")} disabled={download.status === "working"}>
          {download.status === "working" && download.kind === "xlsx" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          Download Excel (.xlsx)
        </Button>
        <Button variant="outline" onClick={() => run("dups")} disabled={download.status === "working"}>
          <CopyX className="size-4" aria-hidden="true" /> Open in Remove Duplicates
        </Button>
        <Button variant="outline" onClick={() => apiRef.current.reset()}>
          Add or remove files
        </Button>
      </div>
      <div aria-live="polite">
        {download.status === "working" && <p className="mt-3 text-sm text-muted">Creating the file and checking it cell by cell…</p>}
        {download.status === "done" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {download.name} ({formatBytes(download.bytes)}) was checked and downloaded. Your files are unchanged.
            </span>
          </p>
        )}
        {download.status === "error" && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{download.message}</span>
          </p>
        )}
      </div>
    </Card>
  );
}
