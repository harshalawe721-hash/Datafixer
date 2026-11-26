import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { combineGuide } from "@/content/guides";
import { CombineWorkspace } from "@/components/tools/combine/CombineWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Combine Columns – Merge Two Columns in Excel & CSV Online",
  description:
    "Combine two or more columns into one online: first and last names, city and state, codes. Choose the separator, preview, undo and download as Excel or CSV.",
  path: "/combine-columns",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="combine-columns"
      content={<ToolGuide toolName="Combine Columns" guide={combineGuide} />}
      intro="Join two or more columns into one, with a space, comma, dash or any text between the values, such as first and last names into a full name. See a preview first, undo any time, and download the result as Excel or CSV."
    >
      <CombineWorkspace />
    </ToolPageShell>
  );
}
