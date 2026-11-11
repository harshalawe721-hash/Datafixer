"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { ScanPanel } from "./ScanPanel";

/**
 * Error Detector: open a file, it is checked automatically on this device, and
 * each problem is explained with guidance on how to fix it. Read-only.
 */
export function DetectorWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          DataFixer checks your spreadsheet for common problems and explains how to fix each one. Everything happens on
          your device, and your file is never changed.
        </span>
      </p>
      <SpreadsheetWorkspace renderTool={(api) => <ScanPanel api={api} />} />
    </div>
  );
}
