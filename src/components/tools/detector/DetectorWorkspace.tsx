"use client";

import { useEffect, useState } from "react";
import { FileSpreadsheet } from "lucide-react";
import { useFileHandoff, type HandoffFile } from "@/components/upload/FileHandoffProvider";
import { ToolInDevelopment } from "@/components/tools/ToolInDevelopment";
import { Card } from "@/components/ui/Card";
import { FORMAT_LABELS } from "@/lib/file-validation";
import { formatBytes } from "@/lib/format";

/**
 * Error Detector workspace. The scanning engine arrives in a later build; for
 * now this shows the details of a file passed from the homepage (already
 * validated locally) and an honest status message.
 */
export function DetectorWorkspace() {
  const { peekPending, clearPending } = useFileHandoff();
  const [handoff] = useState<HandoffFile | null>(() => peekPending());

  useEffect(() => {
    if (handoff) clearPending();
  }, [handoff, clearPending]);

  return (
    <div className="space-y-6">
      {handoff && (
        <Card>
          <div className="flex items-start gap-4">
            <FileSpreadsheet className="mt-0.5 size-6 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="text-lg font-semibold">Selected file</h2>
              <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
                <div className="min-w-0">
                  <dt className="text-muted">Filename</dt>
                  <dd className="truncate font-medium" title={handoff.file.name}>
                    {handoff.file.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">File size</dt>
                  <dd className="font-medium">{formatBytes(handoff.file.size)}</dd>
                </div>
                <div>
                  <dt className="text-muted">Detected format</dt>
                  <dd className="font-medium">{FORMAT_LABELS[handoff.format]}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs text-muted">
                The file passed the format check on your device. Nothing has been uploaded.
              </p>
            </div>
          </div>
        </Card>
      )}
      <ToolInDevelopment toolName="Spreadsheet Error Detector" />
    </div>
  );
}
