import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { compareGuide } from "@/content/guides";
import { CompareWorkspace } from "@/components/tools/compare/CompareWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Compare Two Excel or CSV Files – Find the Differences",
  description: "Compare two versions of an Excel or CSV file online: see added, removed and changed rows, matched by an ID column, and download a highlighted report. Free.",
  path: "/compare-files",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="compare-files"
      content={<ToolGuide toolName="Compare Spreadsheets" guide={compareGuide} />}
      intro="Find what changed between two versions of a spreadsheet: last month's and this month's export, a file before and after a cleanup, or one sent back by a colleague. See every added, removed and changed row, and download a report with the changes highlighted."
    >
      <CompareWorkspace />
    </ToolPageShell>
  );
}
