"use client";

import { useId, useRef, useState } from "react";
import { AlertCircle, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { siteConfig } from "@/config/site";
import { formatLimit, readFileHead, validateSpreadsheet, type SpreadsheetFormat } from "@/lib/file-validation";
import { cn } from "@/lib/cn";

export interface FileDropzoneProps {
  /** Accepted extensions, e.g. [".xlsx", ".xls", ".csv"]. */
  accept?: readonly string[];
  /** Called with a file that passed extension, size and signature checks. */
  onFileAccepted: (file: File, format: SpreadsheetFormat, warning?: string) => void;
  title?: string;
  className?: string;
  /** Larger padding for hero placement. */
  size?: "default" | "large";
  disabled?: boolean;
  /** Fixed id for the file input, so an external button can open the picker. */
  inputId?: string;
}

/**
 * Drag-and-drop / click-to-browse file picker. Keyboard accessible (the native
 * file input stays focusable) and validates files locally before handing them on.
 */
export function FileDropzone({
  accept = siteConfig.acceptedExtensions,
  onFileAccepted,
  title = "Drag and drop your spreadsheet here",
  className,
  size = "default",
  disabled = false,
  inputId: inputIdProp,
}: FileDropzoneProps) {
  const generatedId = useId();
  const inputId = inputIdProp ?? generatedId;
  const hintId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const formats = accept.map((e) => e.slice(1).toUpperCase()).join(", ");

  async function handleFiles(list: FileList | null) {
    if (disabled || checking) return;
    const files = Array.from(list ?? []);
    if (files.length === 0) return;
    if (files.length > 1) {
      setError("Please choose one file at a time.");
      return;
    }
    const file = files[0]!;
    setError(null);
    setChecking(true);
    try {
      const head = await readFileHead(file);
      // Drag-and-drop and the file picker both end up here, so one rule set applies.
      const result = validateSpreadsheet(file, head, {
        accept,
        maxBytes: siteConfig.maxFileSizeBytes,
        warnAboveBytes: siteConfig.largeFileWarningBytes,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onFileAccepted(file, result.format, result.warning);
    } catch {
      setError("The file could not be read. It may have been moved, or your browser blocked access to it.");
    } finally {
      setChecking(false);
      // Allow re-selecting the same file after an error.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className={className}>
      <label
        htmlFor={inputId}
        onDragEnter={(e) => {
          e.preventDefault();
          dragDepth.current++;
          setDragging(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = disabled ? "none" : "copy";
        }}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          void handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-surface text-center transition-colors",
          "focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring",
          size === "large" ? "px-6 py-12 sm:py-16" : "px-6 py-10",
          dragging ? "border-primary bg-secondary/60" : "border-line-strong hover:border-primary hover:bg-surface-muted",
          error && !dragging && "border-danger/60",
          (disabled || checking) && "cursor-not-allowed opacity-70",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex size-14 items-center justify-center rounded-2xl bg-secondary text-secondary-foreground transition-transform",
            dragging && "scale-110",
          )}
        >
          {checking ? <Loader2 className="size-7 animate-spin" /> : <FileUp className="size-7" />}
        </span>
        <span className="mt-4 text-lg font-semibold text-foreground">
          {checking ? "Checking file…" : dragging ? "Drop to select this file" : title}
        </span>
        <span id={hintId} className="mt-1 text-sm text-muted">
          or <span className="font-semibold text-primary underline-offset-2 group-hover:underline">browse your device</span>
          {" · "}
          {formats} up to {formatLimit(siteConfig.maxFileSizeBytes)}
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={accept.join(",")}
          className="sr-only"
          disabled={disabled || checking}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          aria-invalid={error ? true : undefined}
          onChange={(e) => void handleFiles(e.target.files)}
        />
      </label>

      <div aria-live="polite">
        {error && (
          <p
            id={errorId}
            role="alert"
            className="mt-3 flex items-start gap-2 rounded-xl bg-danger-soft px-4 py-3 text-sm text-danger"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>

      <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted">
        <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
        Your file is read by your browser on this device. It is not uploaded to our servers.
      </p>
    </div>
  );
}
