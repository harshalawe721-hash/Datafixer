"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { SplitFilePanel } from "./SplitFilePanel";

/** Split File (Stage 16): the shared workspace with the split controls above the table. */
export function SplitFileWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          Open a CSV or Excel file to split it. Everything happens on your device, and your original file is never changed: the parts are new files.
        </span>
      </p>
      <SpreadsheetWorkspace renderTool={(api) => <SplitFilePanel api={api} />} />
    </div>
  );
}
