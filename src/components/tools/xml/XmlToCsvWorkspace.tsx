"use client";

import { ShieldCheck } from "lucide-react";
import { SpreadsheetWorkspace } from "@/components/spreadsheet/SpreadsheetWorkspace";
import { XmlToCsvPanel } from "./XmlToCsvPanel";

/** XML to CSV (Stage 14): open an XML file, see it as a table, download CSV or Excel. */
export function XmlToCsvWorkspace() {
  return (
    <div className="space-y-6">
      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-muted">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
        <span>Open an .xml file of up to 150 MB. It is read on your device, never uploaded, and your original file is never changed.</span>
      </p>
      <SpreadsheetWorkspace accept={[".xml"]} renderTool={(api) => <XmlToCsvPanel api={api} />} />
    </div>
  );
}
