import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { duplicatesGuide } from "@/content/guides";
import { DuplicatesWorkspace } from "@/components/tools/duplicates/DuplicatesWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Remove Duplicates – Delete Duplicate Rows in Excel & CSV",
  description:
    "Remove duplicate rows from Excel and CSV files online: compare all or chosen columns, ignore capitals and spaces, keep the first or last copy, or mark them.",
  path: "/remove-duplicates",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="remove-duplicates"
      content={<ToolGuide toolName="Remove Duplicates" guide={duplicatesGuide} />}
      intro="Find and remove duplicate rows in Excel and CSV files. Compare whole rows or just the columns you choose, such as email, keep the first or the last copy, or mark the duplicates without deleting anything. See every match first and undo any time."
    >
      <DuplicatesWorkspace />
    </ToolPageShell>
  );
}
