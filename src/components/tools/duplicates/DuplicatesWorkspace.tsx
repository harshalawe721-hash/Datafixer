"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { DuplicatesPanel } from "./DuplicatesPanel";

/** Remove Duplicates (Stage 11): the shared workspace with the duplicate controls above the table. */
export function DuplicatesWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          Open an Excel or CSV file to see its duplicate rows. Everything happens on your device, and your original file is never changed: you download a
          new copy.
        </span>
      </p>
      <SpreadsheetWorkspace renderTool={(api) => <DuplicatesPanel api={api} />} />
    </div>
  );
}
