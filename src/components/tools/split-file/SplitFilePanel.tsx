"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Download, FileArchive, Loader2, Scissors } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import { saveBlob } from "@/components/tools/fix/DownloadDialog";
import type { SplitFilePreview, SplitOutput } from "@/engine/core";
import type { SplitFileInput, SplitFileMode } from "@/engine/split/split-file";
import { EngineError } from "@/engine/errors";
import { formatBytes } from "@/lib/format";

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

type Work =
  | { status: "idle" }
  | { status: "working"; what: string; done: number; total: number }
  | { status: "done"; text: string }
  | { status: "error"; message: string };

/** A whole number from what was typed (empty or not a number: 0, which the engine explains). */
const whole = (s: string) => (/^\s*\d[\d,\s]*$/.test(s) ? Number(s.replace(/[,\s]/g, "")) : 0);

/**
 * Split File (Stage 16): rows per part, equal parts or one part per column value
 * (decision 1A); CSV or Excel parts (3A); every part checked before it is offered,
 * all together as one .zip or one at a time (2A). The original file is never changed.
 */
export function SplitFilePanel({ api }: { api: ToolApi }) {
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const rows = api.summary.sheetStats[api.summary.activeSheet]?.rows ?? 0;
  const dataRows = Math.max(0, rows - (api.headerRow ? 1 : 0));
  const excelFile = api.format === "xlsx" || api.format === "xls";
  const [mode, setMode] = useState<SplitFileMode>("rows");
  const [rowsText, setRowsText] = useState("");
  const [partsText, setPartsText] = useState("2");
  const [column, setColumn] = useState(0);
  const [output, setOutput] = useState<SplitOutput>(excelFile ? "xlsx" : "csv");
  const [columns, setColumns] = useState<{
    key: string;
    list: { index: number; name: string; example: string }[];
  } | null>(null);
  const [preview, setPreview] = useState<{
    key: string;
    value: SplitFilePreview | null;
    error: string | null;
  } | null>(null);
  const [work, setWork] = useState<Work>({ status: "idle" });
  const seq = useRef(0);

  // A different file or sheet: start again with a sensible number of rows per part.
  const [fileKey, setFileKey] = useState(api.viewKey);
  if (fileKey !== api.viewKey) {
    setFileKey(api.viewKey);
    setRowsText("");
    setColumn(0);
    setOutput(excelFile ? "xlsx" : "csv");
    setWork({ status: "idle" });
  }
  const defaultRows = dataRows >= 200_000 ? 100_000 : Math.max(1, Math.ceil(dataRows / 2));
  const rowsPerPart = rowsText === "" ? defaultRows : whole(rowsText);

  const input: Omit<SplitFileInput, "headerRow"> =
    mode === "rows" ? { mode, rowsPerPart } : mode === "parts" ? { mode, parts: whole(partsText) } : { mode, column };
  const key = JSON.stringify([input, output, api.headerRow, api.viewKey]);

  useEffect(() => {
    if (!api.sheetReady) return;
    let live = true;
    apiRef.current.columns().then(
      (list) => live && setColumns({ key: `${api.viewKey}:${api.headerRow}`, list }),
      () => live && setColumns(null),
    );
    return () => {
      live = false;
    };
  }, [api.viewKey, api.headerRow, api.sheetReady]);

  useEffect(() => {
    if (!api.sheetReady) return;
    let live = true;
    const [inp, out] = JSON.parse(key) as [Omit<SplitFileInput, "headerRow">, SplitOutput];
    apiRef.current.previewSplitFile(inp, out).then(
      (value) => live && setPreview({ key, value, error: null }),
      (err: unknown) =>
        live &&
        setPreview({
          key,
          value: null,
          error: err instanceof Error ? err.message : "These parts can't be made.",
        }),
    );
    return () => {
      live = false;
    };
  }, [key, api.sheetReady]);

  if (!api.sheetReady) return null;
  const current = preview?.key === key ? preview : null;
  const p = current?.value ?? null;
  const busy = work.status === "working";

  const change = (fn: () => void) => {
    setWork({ status: "idle" });
    fn();
  };
  const failed = (err: unknown) =>
    setWork({
      status: "error",
      message:
        err instanceof EngineError && err.code === "cancelled"
          ? "Cancelled. Nothing was downloaded."
          : err instanceof Error
            ? err.message
            : "The parts could not be created.",
    });

  const downloadAll = () => {
    if (!p) return;
    const mySeq = ++seq.current;
    setWork({
      status: "working",
      what: "Creating and checking every part",
      done: 0,
      total: p.parts.length,
    });
    apiRef.current
      .exportSplitZip(input, output, (progress) => {
        if (mySeq === seq.current && progress.loaded !== null && progress.phase === "exporting")
          setWork((w) => (w.status === "working" ? { ...w, done: progress.loaded ?? 0 } : w));
      })
      .then(
        (r) => {
          if (mySeq !== seq.current) return;
          saveBlob(r.blob, r.summary.downloadName);
          setWork({
            status: "done",
            text: `${r.summary.downloadName} (${formatBytes(r.summary.bytes)}) with ${plural(r.summary.files.length, "part")} was checked and downloaded. Every part was read back and matches your file. Your file is unchanged.`,
          });
        },
        (err: unknown) => mySeq === seq.current && failed(err),
      );
  };
  const downloadOne = (index: number) => {
    const part = p?.parts[index];
    if (!part) return;
    const mySeq = ++seq.current;
    setWork({
      status: "working",
      what: `Creating and checking ${part.fileName}`,
      done: 0,
      total: 0,
    });
    apiRef.current.exportSplitPart(input, index, output).then(
      (r) => {
        if (mySeq !== seq.current) return;
        saveBlob(r.blob, r.fileName);
        setWork({
          status: "done",
          text: `${r.fileName} (${formatBytes(r.blob.size)}, ${plural(r.rows, "row")}) was checked and downloaded. Your file is unchanged.`,
        });
      },
      (err: unknown) => mySeq === seq.current && failed(err),
    );
  };

  const colList = columns?.key === `${api.viewKey}:${api.headerRow}` ? columns.list : [];
  const ext = output === "xlsx" ? ".xlsx" : p?.csv?.delimiter === "\t" ? ".tsv" : ".csv";
  const radio = "size-5 shrink-0 accent-[var(--primary)]";
  const field = "mt-1 block w-full min-h-11 rounded-lg border border-line bg-surface px-3 text-base sm:max-w-56";

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Scissors className="size-5 text-primary" aria-hidden="true" /> Split into parts
      </h2>
      <p className="mt-1 text-sm text-muted">
        This table has {plural(dataRows, "row")} of data.{" "}
        {api.headerRow
          ? "The column names are repeated at the top of every part."
          : "The first row is treated as data, so no column names are added to the parts."}{" "}
        Your file is not uploaded and is never changed.
      </p>

      <div className="mt-4 grid gap-5 md:grid-cols-2">
        <fieldset>
          <legend className="text-sm font-semibold">How to split</legend>
          <div className="mt-1 space-y-2">
            <div>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" className={radio} name="split-mode" checked={mode === "rows"} onChange={() => change(() => setMode("rows"))} />A number of
                rows in each part
              </label>
              {mode === "rows" && (
                <label className="ml-7 block text-sm">
                  Rows per part
                  <input
                    className={field}
                    inputMode="numeric"
                    value={rowsText === "" ? String(defaultRows) : rowsText}
                    onChange={(e) => change(() => setRowsText(e.target.value))}
                  />
                </label>
              )}
            </div>
            <div>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" className={radio} name="split-mode" checked={mode === "parts"} onChange={() => change(() => setMode("parts"))} />A number of
                equal parts
              </label>
              {mode === "parts" && (
                <label className="ml-7 block text-sm">
                  Number of parts (2–1,000)
                  <input className={field} inputMode="numeric" value={partsText} onChange={(e) => change(() => setPartsText(e.target.value))} />
                </label>
              )}
            </div>
            <div>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" className={radio} name="split-mode" checked={mode === "column"} onChange={() => change(() => setMode("column"))} />
                One part for each value in a column
              </label>
              {mode === "column" && (
                <div className="ml-7 text-sm">
                  <label className="block" htmlFor="split-file-column">
                    Column
                  </label>
                  <select id="split-file-column" className={field} value={column} onChange={(e) => change(() => setColumn(Number(e.target.value)))}>
                    {colList.map((c) => (
                      <option key={c.index} value={c.index}>
                        {c.name}
                        {c.example ? ` (e.g. ${c.example.slice(0, 30)})` : ""}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-muted">
                    For example one file per city or per month. Up to 200 different values; rows with no value go in a part called “(empty)”. Values must match
                    exactly, so “Pune” and “pune” become two parts; make them consistent first with Change case in the{" "}
                    <Link href="/spreadsheet-cleaner" className="underline">
                      Spreadsheet Cleaner
                    </Link>
                    .
                  </p>
                </div>
              )}
            </div>
          </div>
        </fieldset>

        <div className="space-y-4">
          <fieldset>
            <legend className="text-sm font-semibold">Save the parts as</legend>
            <div className="mt-1 space-y-0.5">
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" className={radio} name="split-output" checked={output === "csv"} onChange={() => change(() => setOutput("csv"))} />
                {p?.csv?.delimiter === "\t" ? "TSV files (.tsv)" : "CSV files (.csv)"}
              </label>
              <label className="flex min-h-10 cursor-pointer items-center gap-2 text-sm">
                <input type="radio" className={radio} name="split-output" checked={output === "xlsx"} onChange={() => change(() => setOutput("xlsx"))} />
                Excel workbooks (.xlsx)
              </label>
            </div>
            <p className="text-xs text-muted">
              {output === "csv"
                ? excelFile
                  ? "Values are saved as they are shown in Excel, separated by commas."
                  : `Each part keeps your file's separator${p?.csv?.delimiter === ";" ? " (semicolon)" : ""} and line endings, as UTF-8 that Excel reads correctly.`
                : "Values are kept as shown; codes keep their leading zeros, and plain numbers and year-month-day dates become numbers and dates. Formulas and formatting aren't copied."}
            </p>
          </fieldset>
        </div>
      </div>

      <div className="mt-5 border-t border-line pt-4" aria-live="polite">
        {!current ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Working out the parts…
          </p>
        ) : current.error ? (
          <p className="flex items-start gap-2 rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{current.error}</span>
          </p>
        ) : (
          p && (
            <>
              <h3 className="text-sm font-semibold">
                {plural(p.parts.length, "part")}
                {p.columnName ? `, one for each value in “${p.columnName}”` : ""}
              </h3>
              {p.overSheetLimit > 0 && (
                <p className="mt-1 text-xs text-muted">
                  {plural(p.overSheetLimit, "part has", "parts have")} more rows than one Excel sheet holds (1,048,576); those rows continue on more sheets in
                  the same workbook.
                </p>
              )}
            </>
          )
        )}
      </div>
      {p && !current?.error && (
        <>
          <ul className="mt-2 max-h-96 divide-y divide-line overflow-auto rounded-xl border border-line" aria-label="Parts" tabIndex={0}>
            {p.parts.map((part, i) => (
              <li key={part.fileName} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium break-all">{part.fileName}</span>
                  <span className="text-muted">
                    {plural(part.rows, "row")}
                    {p.columnName ? "" : ` (rows ${fmt(part.firstRow)}–${fmt(part.lastRow)} of your file)`}
                  </span>
                </span>
                <Button variant="outline" onClick={() => downloadOne(i)} disabled={busy} aria-label={`Download ${part.fileName}`}>
                  <Download className="size-4" aria-hidden="true" /> {ext}
                </Button>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button onClick={downloadAll} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <FileArchive className="size-4" aria-hidden="true" />}
              Download all parts (.zip)
            </Button>
            {busy && (
              <Button variant="outline" onClick={() => apiRef.current.abortScans()}>
                Cancel
              </Button>
            )}
          </div>
        </>
      )}
      <div aria-live="polite">
        {work.status === "working" && (
          <p className="mt-3 text-sm text-muted">
            {work.what}
            {work.total > 1 ? ` (${fmt(Math.min(work.done + 1, work.total))} of ${fmt(work.total)})` : ""}…
          </p>
        )}
        {work.status === "done" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{work.text}</span>
          </p>
        )}
        {work.status === "error" && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{work.message}</span>
          </p>
        )}
      </div>
      <p className="mt-4 text-xs text-muted">
        On a phone, downloading the parts one at a time can be easier than opening a .zip file. To join parts back together, use{" "}
        <Link href="/merge-files" className="underline">
          Merge Files
        </Link>
        .
      </p>
    </Card>
  );
}
