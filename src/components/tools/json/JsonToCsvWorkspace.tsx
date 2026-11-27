"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { JsonToCsvPanel, PasteJson } from "./JsonToCsvPanel";

/** JSON to CSV (Stage 12): upload or paste JSON, see it as a table, download CSV or Excel. */
export function JsonToCsvWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>
          Open a .json or .jsonl file, or paste JSON. It is read on your device and never uploaded. .json files can be up to 50 MB and .jsonl files up to
          150 MB.
        </span>
      </p>
      <SpreadsheetWorkspace accept={[".json", ".jsonl"]} renderIdle={(open) => <PasteJson open={open} />} renderTool={(api) => <JsonToCsvPanel api={api} />} />
    </div>
  );
}
