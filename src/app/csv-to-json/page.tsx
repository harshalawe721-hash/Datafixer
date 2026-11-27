import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { csvToJsonGuide } from "@/content/guides";
import { CsvToJsonWorkspace } from "@/components/tools/json/CsvToJsonWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "CSV to JSON Converter – Convert CSV or Excel to JSON Online",
  description:
    "Convert CSV or Excel files to JSON online: pretty, compact or JSON Lines, values as text or detected numbers. Codes keep their zeros. Free, in your browser.",
  path: "/csv-to-json",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="csv-to-json"
      content={<ToolGuide toolName="CSV to JSON" guide={csvToJsonGuide} />}
      intro="Turn a CSV or Excel file into JSON. The column names become the keys; keep every value as text or detect numbers, true/false and empty values; and choose pretty, compact or JSON Lines. Preview the first records before you download."
    >
      <CsvToJsonWorkspace />
    </ToolPageShell>
  );
}
