import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { csvToExcelGuide } from "@/content/guides";
import { CsvToExcelWorkspace } from "@/components/tools/converter/CsvToExcelWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "CSV to Excel Converter – Convert CSV to XLSX Online",
  description:
    "Convert CSV files to Excel XLSX online. Numbers and dates become real Excel values, leading zeros and long IDs stay exactly as written, and nothing is uploaded.",
  path: "/csv-to-excel",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="csv-to-excel"
      content={<ToolGuide toolName="the converter" guide={csvToExcelGuide} />}
      intro="Turn a CSV file into an Excel workbook. Clear numbers and dates become real Excel values; codes with leading zeros, long IDs and anything ambiguous stay exactly as written."
    >
      <CsvToExcelWorkspace />
    </ToolPageShell>
  );
}
