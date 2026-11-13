"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { ValidatorPanel } from "./ValidatorPanel";

/** CSV Validator (Stage 5): structural checks of a CSV file before it is imported anywhere. */
export function ValidatorWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          Open a CSV file to check it. Repairs are shown before they are applied and can be undone. Everything happens on your device: the file is not uploaded and
          is never changed; you download a repaired copy.
        </span>
      </p>
      <SpreadsheetWorkspace accept={[".csv", ".tsv", ".txt"]} csvTools allowEditing renderTool={(api) => <ValidatorPanel api={api} />} />
    </div>
  );
}
