import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { excelToCsvGuide } from "@/content/guides";
import { ExcelToCsvWorkspace } from "@/components/tools/converter/ExcelToCsvWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Excel to CSV Converter – Convert XLSX & XLS to CSV",
  description:
    "Convert Excel XLSX or XLS sheets to CSV online: one sheet or all sheets as a ZIP, values as shown or plain for databases, comma, semicolon or tab.",
  path: "/excel-to-csv",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="excel-to-csv"
      content={<ToolGuide toolName="the converter" guide={excelToCsvGuide} />}
      intro="Choose a worksheet from an XLSX or XLS workbook, preview it and download it as CSV, or download every sheet at once as a ZIP of CSV files."
    >
      <ExcelToCsvWorkspace />
    </ToolPageShell>
  );
}
