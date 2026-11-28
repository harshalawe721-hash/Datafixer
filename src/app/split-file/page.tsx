import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { splitFileGuide } from "@/content/guides";
import { SplitFileWorkspace } from "@/components/tools/split-file/SplitFileWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Split a Large CSV or Excel File Into Smaller Files",
  description:
    "Split a large CSV or Excel file into smaller files online: by number of rows, into equal parts or one file per column value. Column names in every part. Free.",
  path: "/split-file",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="split-file"
      content={<ToolGuide toolName="Split File" guide={splitFileGuide} />}
      intro="Split a file that is too big for Excel, an email or an import tool into smaller files. Choose a number of rows per part, a number of equal parts, or one file for each value of a column, such as each city or month. The column names are repeated in every part."
    >
      <SplitFileWorkspace />
    </ToolPageShell>
  );
}
