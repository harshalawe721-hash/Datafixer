"use client";

import { ScanSearch } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";

/**
 * Error Detector workspace. Stage 2: open, explore, search and sort a file.
 * Automatic problem scanning is added in Stage 3.
 */
export function DetectorWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ScanSearch className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
        <span>
          Automatic problem scanning is still being built. For now you can open a spreadsheet to check its details, browse
          worksheets, and search and sort the data.
        </span>
      </p>
      <SpreadsheetWorkspace />
    </div>
  );
}
