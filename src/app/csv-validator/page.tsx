import type { Metadata } from "next";
import { ToolPageShell } from "@/components/tools/ToolPageShell";
import { ToolGuide } from "@/components/tools/ToolGuide";
import { validatorGuide } from "@/content/guides";
import { ValidatorWorkspace } from "@/components/tools/validator/ValidatorWorkspace";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = pageMetadata({
  title: "CSV Validator – Check CSV Files for Structural Errors",
  description:
    "Validate CSV files online: find uneven rows, broken quotes, duplicate headers, wrong separators and encoding problems, see the exact lines, and repair them.",
  path: "/csv-validator",
});

export default function Page() {
  return (
    <ToolPageShell
      toolId="csv-validator"
      content={<ToolGuide toolName="the CSV Validator" guide={validatorGuide} />}
      intro="Check a CSV file for missing or duplicate headers, uneven rows, broken quotes, the wrong delimiter and encoding problems before you import it anywhere."
    >
      <ValidatorWorkspace />
    </ToolPageShell>
  );
}
