import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolInDevelopment } from "@/components/tools/ToolInDevelopment";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Excel to CSV Converter – Convert XLSX & XLS to CSV",
  description:
    "Convert Excel XLSX or XLS worksheets to CSV online. Choose a sheet, preview the data and download a CSV file, processed in your browser.",
  path: "/excel-to-csv",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="excel-to-csv"
      intro="Choose a worksheet from an XLSX or XLS workbook, preview the data and download it as a CSV file."
    >
      <ToolInDevelopment toolName="Excel to CSV Converter" />
    </ToolPageShell>
  );
}
