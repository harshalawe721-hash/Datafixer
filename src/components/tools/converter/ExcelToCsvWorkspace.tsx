"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { ExcelToCsvPanel } from "./ExcelToCsvPanel";

/** Excel to CSV converter (Stage 6). */
export function ExcelToCsvWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>Open an Excel workbook to save a sheet, or every sheet, as CSV. Everything happens on your device: the file is not uploaded and is never changed.</span>
      </p>
      <SpreadsheetWorkspace accept={[".xlsx", ".xls"]} renderTool={(api) => <ExcelToCsvPanel api={api} />} />
    </div>
  );
}
