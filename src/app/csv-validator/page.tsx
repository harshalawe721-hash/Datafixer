import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ValidatorWorkspace } from "@/components/tools/validator/ValidatorWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "CSV Validator – Check CSV Files for Structural Errors",
  description:
    "Validate CSV files online. Detect missing or duplicate headers, uneven row lengths, broken quotes, the wrong separator, hidden characters and encoding problems, see the exact lines, and repair them with a preview.",
  path: "/csv-validator",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="csv-validator"
      intro="Check a CSV file for missing or duplicate headers, uneven rows, broken quotes, the wrong delimiter and encoding problems before you import it anywhere."
    >
      <ValidatorWorkspace />
    </ToolPageShell>
  );
}
