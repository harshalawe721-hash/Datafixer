"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { SplitPanel } from "./SplitPanel";

/** Split a Column (Stage 10): the shared workspace with the split controls above the table. */
export function SplitWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          Open a CSV or .xlsx file, choose a column and a separator, and check the preview. Everything happens on your device, and your original file is
          never changed: you download a new copy.
        </span>
      </p>
      <SpreadsheetWorkspace accept={[".xlsx", ".csv", ".tsv", ".txt"]} renderTool={(api) => <SplitPanel api={api} />} />
    </div>
  );
}
