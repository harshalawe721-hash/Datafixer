import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolInDevelopment } from "@/components/tools/ToolInDevelopment";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "CSV to Excel Converter – Convert CSV to XLSX Online",
  description:
    "Convert CSV files to Excel XLSX online. Automatic delimiter detection, a data preview and an instant XLSX download, processed in your browser.",
  path: "/csv-to-excel",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="csv-to-excel"
      intro="Turn a CSV file into an Excel XLSX workbook, with automatic delimiter detection and a preview before you download."
    >
      <ToolInDevelopment toolName="CSV to Excel Converter" />
    </ToolPageShell>
  );
}
