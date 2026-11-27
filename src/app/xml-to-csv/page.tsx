import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { xmlToCsvGuide } from "@/content/guides";
import { XmlToCsvWorkspace } from "@/components/tools/xml/XmlToCsvWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "XML to CSV Converter – Convert XML to CSV or Excel Online",
  description:
    "Convert XML to CSV or Excel online: product feeds, accounting exports, sitemaps. Records are found for you, nested data becomes columns. Free, in your browser.",
  path: "/xml-to-csv",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="xml-to-csv"
      content={<ToolGuide toolName="XML to CSV" guide={xmlToCsvGuide} />}
      intro="Turn an XML file into a table you can open in Excel: product feeds, accounting and invoice exports, bank statements, sitemaps. The records are found for you, nested data gets its own columns, and you download a CSV or Excel file."
    >
      <XmlToCsvWorkspace />
    </ToolPageShell>
  );
}
