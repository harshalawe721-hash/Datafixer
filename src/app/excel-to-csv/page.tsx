import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ExcelToCsvWorkspace } from "@/components/tools/converter/ExcelToCsvWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Excel to CSV Converter – Convert XLSX & XLS to CSV",
  description:
    "Convert Excel XLSX or XLS worksheets to CSV online: one sheet or all sheets as a ZIP, values as shown or plain values for databases, comma, semicolon or tab. Nothing is uploaded.",
  path: "/excel-to-csv",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="excel-to-csv"
      intro="Choose a worksheet from an XLSX or XLS workbook, preview it and download it as CSV, or download every sheet at once as a ZIP of CSV files."
    >
      <ExcelToCsvWorkspace />
    </ToolPageShell>
  );
}
