import Link from "next/link";
import { Construction } from "lucide-react";
import { Card } from "@/components/ui/Card";

/**
 * Honest status panel shown in place of a tool's workspace until that tool is
 * implemented. It deliberately has no upload control, so no one is led to
 * believe a file will be processed.
 */
export function ToolInDevelopment({ toolName }: { toolName: string }) {
  return (
    <Card className="flex flex-col items-start gap-4 border-dashed sm:flex-row sm:items-center">
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-warning-soft text-warning" aria-hidden="true">
        <Construction className="size-6" />
      </span>
      <div className="flex-1">
        <h2 className="text-lg font-semibold">The {toolName} is being built</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          This tool is not available yet, so it cannot open files today. In the meantime, browse the{" "}
          <Link href="/#tools" className="font-medium text-primary hover:underline">
            other DataFixer tools
          </Link>
          .
        </p>
      </div>
    </Card>
  );
}
