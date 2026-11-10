"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { ProgressEvent } from "@/engine/types";
import { formatBytes } from "@/lib/format";

const PHASE_LABEL: Record<ProgressEvent["phase"], string> = {
  reading: "Reading file",
  inspecting: "Checking workbook structure and safety",
  parsing: "Reading data",
  indexing: "Preparing preview",
};

/** Progress bar with a Cancel button. Indeterminate when a step can't report a fraction. */
export function ProcessingProgress({
  fileName,
  progress,
  startedAt,
  onCancel,
}: {
  fileName: string;
  progress: ProgressEvent | null;
  startedAt: number;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);

  const fraction =
    progress && progress.loaded !== null && progress.total ? Math.min(1, progress.loaded / progress.total) : null;
  const pct = fraction === null ? null : Math.round(fraction * 100);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000));

  return (
    <Card>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Loader2 className="size-6 shrink-0 animate-spin text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold" title={fileName}>
            {fileName}
          </p>
          <p className="text-sm text-muted" aria-live="polite">
            {progress ? PHASE_LABEL[progress.phase] : "Starting"}
            {pct !== null && ` · ${pct}%`}
            {progress?.loaded != null && progress.total ? ` (${formatBytes(progress.loaded)} of ${formatBytes(progress.total)})` : ""}
            {` · ${seconds}s`}
          </p>
          <div
            className="mt-3 h-2 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-label="Processing progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct ?? undefined}
          >
            {pct !== null ? (
              <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${pct}%` }} />
            ) : (
              <div className="h-full w-1/3 animate-pulse rounded-full bg-primary/60" />
            )}
          </div>
          {pct === null && progress?.phase === "parsing" && (
            <p className="mt-2 text-xs text-muted">This step can&apos;t show a percentage. Large workbooks can take a while.</p>
          )}
        </div>
        <Button variant="outline" onClick={onCancel}>
          <X className="size-4" aria-hidden="true" />
          Cancel
        </Button>
      </div>
    </Card>
  );
}
