import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolInDevelopment } from "@/components/tools/ToolInDevelopment";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Spreadsheet Cleaner – Clean Excel & CSV Data Online",
  description:
    "Clean Excel and CSV files online: remove duplicates and empty rows, trim spaces, fix capitalization, convert text to numbers, split or merge columns, with undo.",
  path: "/spreadsheet-cleaner",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="spreadsheet-cleaner"
      intro="Remove duplicates, trim spaces, standardize capitalization and dates, split or merge columns, preview every change, undo mistakes and download a clean copy."
    >
      <ToolInDevelopment toolName="Spreadsheet Cleaner" />
    </ToolPageShell>
  );
}
