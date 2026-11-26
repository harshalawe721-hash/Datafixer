import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { splitGuide } from "@/content/guides";
import { SplitWorkspace } from "@/components/tools/split/SplitWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Split a Column – Split Cells in Excel & CSV Online",
  description:
    "Split one column into several online: full names into first and last names, addresses at commas, codes at dashes. Preview, undo and download as Excel or CSV.",
  path: "/split-column",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="split-column"
      content={<ToolGuide toolName="Split a Column" guide={splitGuide} />}
      intro="Split one column into several at a space, comma, dash or any separator, such as full names into first and last names. See a preview first, undo any time, and download the result as Excel or CSV."
    >
      <SplitWorkspace />
    </ToolPageShell>
  );
}
