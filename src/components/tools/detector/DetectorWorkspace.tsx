"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { ScanPanel } from "./ScanPanel";

/**
 * Error Detector: open a file, it is checked automatically on this device, each
 * problem is explained, and many can be fixed after a preview (Stage 4).
 * The original file is never changed.
 */
export function DetectorWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          DataFixer checks your spreadsheet for common problems, explains each one, and can fix many of them for you after
          showing a preview. Everything happens on your device, and your original file is never changed.
        </span>
      </p>
      <SpreadsheetWorkspace allowEditing renderTool={(api) => <ScanPanel api={api} />} />
    </div>
  );
}
