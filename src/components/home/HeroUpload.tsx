"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { ScanSearch } from "lucide-react";
import { FileDropzone } from "@/components/upload/FileDropzone";
import { useFileHandoff } from "@/components/upload/FileHandoffProvider";
import { buttonClasses } from "@/components/ui/Button";
import type { SpreadsheetFormat } from "@/lib/file-validation";

const HERO_INPUT_ID = "hero-file-input";

/** Hero call-to-action buttons. "Scan My Spreadsheet" opens the file picker directly. */
export function HeroActions() {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        className={buttonClasses("primary", "lg")}
        onClick={() => document.getElementById(HERO_INPUT_ID)?.click()}
      >
        <ScanSearch className="size-5" aria-hidden="true" />
        Scan My Spreadsheet
      </button>
      <Link href="/#tools" className={buttonClasses("outline", "lg")}>
        Explore Free Tools
      </Link>
    </div>
  );
}

/** Homepage upload area: validates the file locally, then opens it in the Error Detector. */
export function HeroDropzone() {
  const router = useRouter();
  const { setPending } = useFileHandoff();

  function onFileAccepted(file: File, format: SpreadsheetFormat, warning?: string) {
    setPending({ file, format, warning });
    router.push("/spreadsheet-error-detector");
  }

  return <FileDropzone inputId={HERO_INPUT_ID} size="large" onFileAccepted={onFileAccepted} />;
}
