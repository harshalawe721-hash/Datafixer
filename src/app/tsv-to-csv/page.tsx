import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { tsvToCsvGuide } from "@/content/guides";
import { TsvToCsvWorkspace } from "@/components/tools/tsv/TsvToCsvWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "TSV to CSV Converter – Convert Tab-Separated Files Online",
  description:
    "Convert TSV and tab-separated TXT files to CSV or Excel online. Choose comma or semicolon, line endings and BOM; codes keep their zeros. Free, in your browser.",
  path: "/tsv-to-csv",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="tsv-to-csv"
      content={<ToolGuide toolName="TSV to CSV" guide={tsvToCsvGuide} />}
      intro="Turn a tab-separated file (.tsv or .txt) into a CSV that opens correctly in Excel and other programs, with a comma or semicolon. Or turn a CSV into TSV, or either into an Excel workbook. Every value stays exactly as written."
    >
      <TsvToCsvWorkspace />
    </ToolPageShell>
  );
}
