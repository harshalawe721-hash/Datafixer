"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { CsvToJsonPanel } from "./CsvToJsonPanel";

/** CSV to JSON (Stage 12): the shared workspace with the JSON options above the table. */
export function CsvToJsonWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>Open a CSV or Excel file and choose how the JSON should look. Everything happens on your device; your file is never uploaded or changed.</span>
      </p>
      <SpreadsheetWorkspace accept={[".csv", ".tsv", ".txt", ".xlsx", ".xls"]} csvTools renderTool={(api) => <CsvToJsonPanel api={api} />} />
    </div>
  );
}
