import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { DetectorWorkspace } from "@/components/tools/detector/DetectorWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Spreadsheet Error Detector – Find Errors in Excel & CSV Files",
  description:
    "Upload an Excel or CSV file and instantly find duplicate rows, missing cells, inconsistent dates, invalid emails, numbers stored as text and other data problems.",
  path: "/spreadsheet-error-detector",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="spreadsheet-error-detector"
      intro="Scan an Excel or CSV file for duplicate rows, missing cells, extra spaces, inconsistent dates, invalid emails and other hidden problems, then review fixes before anything changes."
    >
      <DetectorWorkspace />
    </ToolPageShell>
  );
}
