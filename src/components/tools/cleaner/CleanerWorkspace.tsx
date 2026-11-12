"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { ScanPanel } from "@/components/tools/detector/ScanPanel";

/**
 * Spreadsheet Cleaner: the same engine as the Error Detector (Stage 4), laid
 * out tools-first: each cleaning tool shows what it would fix, every change is
 * previewed, undoable and listed, and the result is downloaded as a new file.
 */
export function CleanerWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          Open a file to see what can be cleaned. Every change is shown before it is applied and can be undone. Everything happens on your device, and your
          original file is never changed: you download a cleaned copy.
        </span>
      </p>
      <SpreadsheetWorkspace allowEditing renderTool={(api) => <ScanPanel api={api} variant="cleaner" />} />
    </div>
  );
}
