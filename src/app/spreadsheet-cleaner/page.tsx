import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { cleanerGuide } from "@/content/guides";
import { CleanerWorkspace } from "@/components/tools/cleaner/CleanerWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Spreadsheet Cleaner – Clean Excel & CSV Data Online",
  description:
    "Clean Excel and CSV files online: remove duplicates and empty rows, trim spaces, fix capitalization and dates, edit cells, undo, and download a clean copy.",
  path: "/spreadsheet-cleaner",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="spreadsheet-cleaner"
      content={<ToolGuide toolName="the Cleaner" guide={cleanerGuide} />}
      intro="Remove duplicates and empty rows, trim spaces, fix capitalization, dates, phone layouts and numbers stored as text, edit any cell, preview every change, undo mistakes and download a clean copy."
    >
      <CleanerWorkspace />
    </ToolPageShell>
  );
}
