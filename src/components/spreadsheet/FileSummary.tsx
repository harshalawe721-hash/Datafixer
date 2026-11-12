"use client";

import { AlertTriangle, FileSpreadsheet, Info, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import type { WorkbookSummary } from "@/engine/types";
import { FORMAT_LABELS } from "@/lib/file-validation";
import { formatBytes } from "@/lib/format";

const DELIMITER_NAMES: Record<string, string> = { ",": "Comma (,)", ";": "Semicolon (;)", "\t": "Tab", "|": "Pipe (|)" };
/** Encodings offered by the CSV Validator (decision 4). UTF-16 is listed only when the file uses it. */
const ENCODINGS: Record<string, string> = {
  "utf-8": "UTF-8",
  "windows-1252": "Windows-1252 (Western, older Excel)",
  "iso-8859-1": "ISO-8859-1 (Latin-1)",
  "utf-16le": "UTF-16 LE",
  "utf-16be": "UTF-16 BE",
};
const LINE_ENDINGS: Record<string, string> = { "\n": "LF (Unix/macOS)", "\r\n": "CRLF (Windows)", "\r": "CR (old Mac)", mixed: "Mixed", none: "None (single line)" };

function Stat({ label, value, title }: { label: string; value: React.ReactNode; title?: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="truncate font-semibold" title={title}>
        {value}
      </dd>
    </div>
  );
}

export function FileSummary({
  summary,
  onSelectSheet,
  onChangeDelimiter,
  onChangeEncoding,
  onReset,
}: {
  summary: WorkbookSummary;
  onSelectSheet: (name: string) => void;
  onChangeDelimiter?: (delimiter: string) => void;
  /** CSV Validator: read the file again with another text encoding. */
  onChangeEncoding?: (encoding: string) => void;
  onReset: () => void;
}) {
  const stats = summary.sheetStats[summary.activeSheet];
  const declared = summary.sheets.find((s) => s.name === summary.activeSheet)?.declared;
  const worksheets = summary.sheets.length;

  return (
    <Card className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <FileSpreadsheet className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold" title={summary.fileName}>
              {summary.fileName}
            </h2>
            <p className="text-sm text-muted">Opened on your device in {(summary.timings.totalMs / 1000).toFixed(1)}s. Nothing was uploaded.</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={onReset}>
          <RotateCcw className="size-4" aria-hidden="true" />
          Open another file
        </Button>
      </div>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="File size" value={formatBytes(summary.fileSize)} />
        <Stat label="Format" value={summary.format.toUpperCase()} title={FORMAT_LABELS[summary.format]} />
        <Stat label="Sheets" value={worksheets || "—"} />
        <Stat
          label="Total rows"
          value={stats ? stats.rows.toLocaleString("en-US") : declared ? `${declared.rows.toLocaleString("en-US")} (declared)` : "—"}
        />
        <Stat
          label="Columns"
          value={stats ? stats.columns.toLocaleString("en-US") : declared ? `${declared.columns.toLocaleString("en-US")} (declared)` : "—"}
        />
        {summary.csv ? (
          <Stat label="Encoding" value={`${summary.csv.encoding.toUpperCase()}${summary.csv.hadBom ? " + BOM" : ""}`} />
        ) : (
          <Stat label="Active sheet" value={summary.activeSheet || "—"} title={summary.activeSheet} />
        )}
      </dl>

      {summary.csv && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {onChangeDelimiter && (
            <label className="inline-flex items-center gap-2">
              Column separator
              <select
                value={summary.csv.delimiter}
                onChange={(e) => onChangeDelimiter(e.target.value)}
                className="h-9 rounded-lg border border-line-strong bg-background px-2"
              >
                {Object.entries(DELIMITER_NAMES).map(([v, label]) => (
                  <option key={v} value={v}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {onChangeEncoding && (
            <label className="inline-flex items-center gap-2">
              Text encoding
              <select
                value={summary.csv.encoding}
                onChange={(e) => onChangeEncoding(e.target.value)}
                aria-describedby="encoding-help"
                className="h-9 max-w-[14rem] rounded-lg border border-line-strong bg-background px-2"
              >
                {Object.entries(ENCODINGS)
                  .filter(([v]) => !v.startsWith("utf-16") || v === summary.csv!.encoding)
                  .map(([v, label]) => (
                    <option key={v} value={v}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <span className="text-muted">Line endings: {LINE_ENDINGS[summary.csv.lineEnding]}</span>
        </div>
      )}
      {summary.csv && onChangeEncoding && (
        <p id="encoding-help" className="-mt-2 text-xs text-muted">
          The text encoding decides how the bytes in your file are turned into letters.{" "}
          {summary.csv.encodingChosen
            ? `You chose ${ENCODINGS[summary.csv.encoding] ?? summary.csv.encoding}; DataFixer detected ${ENCODINGS[summary.csv.detectedEncoding ?? ""] ?? summary.csv.detectedEncoding ?? "—"}.`
            : `DataFixer detected ${ENCODINGS[summary.csv.encoding] ?? summary.csv.encoding}${summary.csv.hadBom ? " from the file's byte-order mark" : ""}.`}{" "}
          If accented letters look wrong (é shown as Ã© or �), choose another one: the file is read again, and never changed.
        </p>
      )}

      {summary.sheets.length > 1 && (
        <div>
          <p id="sheet-picker-label" className="mb-2 text-sm font-medium">
            Worksheets
          </p>
          <div role="group" aria-labelledby="sheet-picker-label" className="flex flex-wrap gap-2">
            {summary.sheets.map((s) => {
              const active = s.name === summary.activeSheet;
              return (
                <button
                  key={s.name}
                  type="button"
                  aria-pressed={active}
                  onClick={() => !active && onSelectSheet(s.name)}
                  className={`inline-flex max-w-full items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm ${
                    active ? "border-primary bg-secondary font-semibold text-secondary-foreground" : "border-line-strong hover:bg-surface-muted"
                  }`}
                >
                  <span className="truncate">{s.name}</span>
                  {s.state !== "visible" && <span className="rounded bg-surface-muted px-1.5 text-[11px] text-muted">hidden</span>}
                  {s.kind === "chartsheet" && <span className="rounded bg-surface-muted px-1.5 text-[11px] text-muted">chart</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(summary.warnings.length > 0 || summary.issueCount > 0) && (
        <ul className="space-y-2">
          {summary.warnings.map((w) => (
            <li key={w} className="flex items-start gap-2 rounded-xl bg-warning-soft px-3 py-2 text-sm text-warning">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{w}</span>
            </li>
          ))}
          {summary.issues.slice(0, 5).map((issue, i) => (
            <li key={`${issue.code}-${i}`} className="flex items-start gap-2 rounded-xl bg-surface-muted px-3 py-2 text-sm">
              <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>{issue.message}</span>
            </li>
          ))}
          {summary.issueCount > 5 && (
            <li className="px-3 text-sm text-muted">…and {(summary.issueCount - 5).toLocaleString("en-US")} more structural notes.</li>
          )}
        </ul>
      )}
    </Card>
  );
}
