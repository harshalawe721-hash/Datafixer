"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { TsvToCsvPanel } from "./TsvToCsvPanel";

/** TSV to CSV (Stage 13): the shared workspace (separator and encoding detection) with the conversion panel. */
export function TsvToCsvWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>Open a .tsv, .txt or .tab file. It is read on your device, never uploaded, and your original file is never changed.</span>
      </p>
      <SpreadsheetWorkspace accept={[".tsv", ".txt", ".tab", ".csv"]} csvTools renderTool={(api) => <TsvToCsvPanel api={api} />} />
    </div>
  );
}
