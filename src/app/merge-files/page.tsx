import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { mergeGuide } from "@/content/guides";
import { MergeWorkspace } from "@/components/tools/merge/MergeWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Merge CSV and Excel Files – Combine Files Into One Online",
  description:
    "Combine several CSV or Excel files into one online. Columns are matched by name, each row can show its source file, and duplicates can be removed. Free.",
  path: "/merge-files",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="merge-files"
      content={<ToolGuide toolName="Merge Files" guide={mergeGuide} />}
      intro="Combine monthly exports, branch reports or files from different people into one table. Columns are matched by name even when their order differs, each row can show which file it came from, and you download one CSV or Excel file."
    >
      <MergeWorkspace />
    </ToolPageShell>
  );
}
