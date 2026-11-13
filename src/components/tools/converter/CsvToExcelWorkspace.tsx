"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { CsvToExcelPanel } from "./CsvToExcelPanel";

/** CSV to Excel converter (Stage 6). */
export function CsvToExcelWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>Open a CSV file to turn it into an Excel workbook. Everything happens on your device: the file is not uploaded and is never changed.</span>
      </p>
      <SpreadsheetWorkspace accept={[".csv", ".tsv", ".txt"]} csvTools renderTool={(api) => <CsvToExcelPanel api={api} />} />
    </div>
  );
}
