"use client";

import { createContext, useContext, useMemo, useRef } from "react";
import type { SpreadsheetFormat } from "@/lib/file-validation";

export interface HandoffFile {
  file: File;
  format: SpreadsheetFormat;
  /** Large-file advisory from validation, if any. */
  warning?: string;
}

interface HandoffContextValue {
  /** Store a validated file in memory so the next tool page can pick it up. */
  setPending: (value: HandoffFile) => void;
  /** Read the waiting file without removing it (safe to call during render). */
  peekPending: () => HandoffFile | null;
  /** Drop the waiting file once it has been picked up. */
  clearPending: () => void;
}

const HandoffContext = createContext<HandoffContextValue | null>(null);

/**
 * Passes a selected file from one page to another (e.g. homepage → Error
 * Detector) during client-side navigation. The File object lives only in this
 * tab's memory: it is never uploaded or written to storage, and it is gone
 * after a page reload.
 */
export function FileHandoffProvider({ children }: { children: React.ReactNode }) {
  const pending = useRef<HandoffFile | null>(null);
  const value = useMemo<HandoffContextValue>(
    () => ({
      setPending: (v) => {
        pending.current = v;
      },
      peekPending: () => pending.current,
      clearPending: () => {
        pending.current = null;
      },
    }),
    [],
  );
  return <HandoffContext.Provider value={value}>{children}</HandoffContext.Provider>;
}

export function useFileHandoff(): HandoffContextValue {
  const ctx = useContext(HandoffContext);
  if (!ctx) throw new Error("useFileHandoff must be used inside FileHandoffProvider");
  return ctx;
}
