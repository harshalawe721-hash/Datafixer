import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { jsonToCsvGuide } from "@/content/guides";
import { JsonToCsvWorkspace } from "@/components/tools/json/JsonToCsvWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "JSON to CSV Converter – Convert JSON to CSV or Excel Online",
  description:
    "Convert JSON or JSON Lines to CSV or Excel online. Nested data becomes columns, long numbers stay exact, and mistakes show their line. Free, in your browser.",
  path: "/json-to-csv",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="json-to-csv"
      content={<ToolGuide toolName="JSON to CSV" guide={jsonToCsvGuide} />}
      intro="Turn JSON or JSON Lines into a table you can open in Excel. Nested data becomes its own columns, long numbers stay exact, and if the JSON has a mistake you see the line and column. Download as CSV or Excel."
    >
      <JsonToCsvWorkspace />
    </ToolPageShell>
  );
}
