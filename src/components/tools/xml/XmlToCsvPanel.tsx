"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Download, FileCode, Info, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { ToolApi } from "@/components/spreadsheet/tool-api";
import { saveBlob } from "@/components/tools/fix/DownloadDialog";
import { EngineError } from "@/engine/errors";
import { formatBytes } from "@/lib/format";

const fmt = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${fmt(n)} ${n === 1 ? one : many}`;

/** “product (in catalog › products)” for "catalog/products/product". */
function choiceLabel(path: string): string {
  const parts = path.split("/");
  const name = parts.pop()!;
  return parts.length ? `<${name}> (in ${parts.join(" › ")})` : `<${name}>`;
}

type DownloadState = { status: "idle" } | { status: "working"; kind: "csv" | "xlsx" } | { status: "done"; name: string; bytes: number } | { status: "error"; message: string };

/**
 * XML to CSV (Stage 14): which element holds the records (found automatically,
 * another can be chosen), notes on joined values and data left out, and CSV or
 * Excel downloads, each checked before it is offered.
 */
export function XmlToCsvPanel({ api }: { api: ToolApi }) {
  const apiRef = useRef(api);
  useEffect(() => {
    apiRef.current = api;
  });
  const [download, setDownload] = useState<DownloadState>({ status: "idle" });
  const seq = useRef(0);
  const xml = api.summary.xml;
  if (!api.sheetReady || !xml) return null;
  const columns = api.summary.sheetStats[api.summary.activeSheet]?.columns ?? 0;
  const element = xml.path.split("/").pop()!;

  const run = (kind: "csv" | "xlsx") => {
    const mySeq = ++seq.current;
    setDownload({ status: "working", kind });
    const p = kind === "csv" ? apiRef.current.exportCsv(undefined, { delimiter: ",", lineEnding: "\r\n", bom: true }) : apiRef.current.convertToXlsx();
    p.then(
      (r) => {
        if (mySeq !== seq.current) return;
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
        <FileCode className="size-5 text-primary" aria-hidden="true" /> Your XML as a table
      </h2>
      <p className="mt-1 text-sm text-muted" role="status">
        {plural(xml.records, "record")} (each &lt;{element}&gt;) · {plural(columns, "column")}
      </p>

      {xml.choices.length > 1 && (
        <div className="mt-4">
          <label htmlFor="xml-records" className="text-sm font-semibold">
            Which element is one record (one row)
          </label>
          <select
            id="xml-records"
            className="mt-1 block h-11 w-full max-w-lg rounded-xl border border-line bg-background px-3 text-sm"
            value={xml.path}
            onChange={(e) => {
              setDownload({ status: "idle" });
              apiRef.current.reopen({ xmlPath: e.target.value });
            }}
          >
            {xml.choices.map((c) => (
              <option key={c.path} value={c.path}>
                {choiceLabel(c.path)}: {plural(c.count, "time")}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-muted">These elements repeat in the file. The one that looks most like a list of records is chosen first.</p>
        </div>
      )}

      {(xml.joinedCells > 0 || xml.outside || xml.encoding !== "utf-8") && (
        <ul className="mt-4 space-y-1 text-sm">
          {xml.joinedCells > 0 && (
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              {plural(xml.joinedCells, "cell")} {xml.joinedCells === 1 ? "holds" : "hold"} values from repeated elements (for example several phone numbers), joined with “; ”.
            </li>
          )}
          {xml.outside && (
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              Some data outside the records (for example the file&apos;s own title or date) is not in the table.
            </li>
          )}
          {xml.encoding !== "utf-8" && (
            <li className="flex items-start gap-2">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              The file was read as {xml.encoding.toUpperCase()}, as it says in its first line. The downloads are UTF-8.
            </li>
          )}
        </ul>
      )}

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={() => run("csv")} disabled={download.status === "working"}>
          {download.status === "working" && download.kind === "csv" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          Download CSV
        </Button>
        <Button variant="outline" onClick={() => run("xlsx")} disabled={download.status === "working"}>
          {download.status === "working" && download.kind === "xlsx" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Download className="size-4" aria-hidden="true" />}
          Download Excel (.xlsx)
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted">
        The CSV uses commas and opens correctly in Excel. In the Excel file, plain numbers become numbers and year-month-day dates become dates; codes with leading zeros
        and long numbers stay text.
      </p>
      <div aria-live="polite">
        {download.status === "working" && <p className="mt-3 text-sm text-muted">Creating the file and checking it cell by cell…</p>}
        {download.status === "done" && (
          <p className="mt-3 flex items-start gap-2 rounded-xl bg-success-soft px-4 py-3 text-sm text-success">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {download.name} ({formatBytes(download.bytes)}) was checked and downloaded. Your XML file is unchanged.
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
