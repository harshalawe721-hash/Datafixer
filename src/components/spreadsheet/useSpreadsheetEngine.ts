"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EngineClient } from "@/engine/client";
import { EngineError } from "@/engine/errors";
import type { OpenOptions } from "@/engine/protocol";
import type { ProgressEvent, WorkbookSummary } from "@/engine/types";
import type { RowPage, RowQuery } from "@/engine/query/query";
import type { ScanOptions, ScanResult } from "@/engine/scan/scan";
import type { SpreadsheetFormat } from "@/lib/file-validation";
import type { FixId, FixOptions } from "@/engine/fix/fixes";

export type EngineState =
  | { status: "idle" }
  | { status: "working"; file: File; format: SpreadsheetFormat; progress: ProgressEvent | null; startedAt: number; summary: WorkbookSummary | null }
  | { status: "ready"; file: File; format: SpreadsheetFormat; summary: WorkbookSummary }
  | { status: "error"; file: File | null; format: SpreadsheetFormat | null; error: { code: string; message: string }; summary: WorkbookSummary | null };

/**
 * React wrapper around EngineClient. Owns one worker for the component's
 * lifetime and terminates it on unmount (releasing all file data).
 */
export function useSpreadsheetEngine() {
  const clientRef = useRef<EngineClient | null>(null);
  const [state, setState] = useState<EngineState>({ status: "idle" });
  /** Increments per operation; results of superseded operations are ignored. */
  const opSeq = useRef(0);

  const client = useCallback(() => (clientRef.current ??= new EngineClient()), []);

  useEffect(
    () => () => {
      opSeq.current++;
      clientRef.current?.dispose();
      clientRef.current = null;
    },
    [],
  );

  const toError = (err: unknown) =>
    err instanceof EngineError
      ? { code: err.code, message: err.message }
      : { code: "internal", message: "Something went wrong while reading this file. Your file has not been changed." };

  const open = useCallback(
    async (file: File, format: SpreadsheetFormat, options?: OpenOptions) => {
      const seq = ++opSeq.current;
      const startedAt = Date.now();
      setState({ status: "working", file, format, progress: null, startedAt, summary: null });
      try {
        const summary = await client().open(file, format, options, (progress) => {
          if (seq === opSeq.current) setState((s) => (s.status === "working" ? { ...s, progress } : s));
        });
        if (seq === opSeq.current) setState({ status: "ready", file, format, summary });
      } catch (err) {
        if (seq === opSeq.current) setState({ status: "error", file, format, error: toError(err), summary: null });
      }
    },
    [client],
  );

  const selectSheet = useCallback(
    async (name: string) => {
      if (state.status !== "ready") return;
      const { file, format, summary: prev } = state;
      const seq = ++opSeq.current;
      setState({ status: "working", file, format, progress: null, startedAt: Date.now(), summary: prev });
      try {
        const summary = await client().loadSheet(name, (progress) => {
          if (seq === opSeq.current) setState((s) => (s.status === "working" ? { ...s, progress } : s));
        });
        if (seq === opSeq.current) setState({ status: "ready", file, format, summary });
      } catch (err) {
        // A failed or cancelled sheet load: the worker may have been reset, so the file must be reopened.
        if (seq === opSeq.current) setState({ status: "error", file, format, error: toError(err), summary: null });
      }
    },
    [client, state],
  );

  const cancel = useCallback(() => clientRef.current?.cancel(), []);

  const reset = useCallback(() => {
    opSeq.current++;
    clientRef.current?.dispose();
    clientRef.current = null;
    setState({ status: "idle" });
  }, []);

  const getRows = useCallback((sheet: string, query: RowQuery): Promise<RowPage> => client().getRows(sheet, query), [client]);

  /** Run the Error Detector checks on a loaded sheet (read-only). */
  const scan = useCallback(
    (sheet: string, options: ScanOptions, onProgress?: (p: ProgressEvent) => void): Promise<ScanResult> => client().scan(sheet, options, onProgress),
    [client],
  );

  /** Stop running scans without unloading the file. */
  const abortScans = useCallback(() => void clientRef.current?.abortScans().catch(() => {}), []);

  // ---- Stage 4: fixing and editing (in the worker, on this device)
  const previewFix = useCallback(
    (sheet: string, fixId: FixId, options: FixOptions, onProgress?: (p: ProgressEvent) => void) => client().previewFix(sheet, fixId, options, onProgress),
    [client],
  );
  const previewFixAll = useCallback(
    (sheet: string, options: { headerRow: boolean }, onProgress?: (p: ProgressEvent) => void) => client().previewFixAll(sheet, options, onProgress),
    [client],
  );
  const applyFix = useCallback((sheet: string, token: string) => client().applyFix(sheet, token), [client]);
  const cellInfo = useCallback((sheet: string, row: number, col: number) => client().cellInfo(sheet, row, col), [client]);
  const editCell = useCallback(
    (sheet: string, row: number, col: number, text: string, replaceFormula = false) => client().editCell(sheet, row, col, text, replaceFormula),
    [client],
  );
  const exportCsv = useCallback((sheet: string, onProgress?: (p: ProgressEvent) => void) => client().exportCsv(sheet, onProgress), [client]);
  const undo = useCallback((sheet: string) => client().undo(sheet), [client]);
  const redo = useCallback((sheet: string) => client().redo(sheet), [client]);
  const history = useCallback((sheet: string) => client().history(sheet), [client]);
  const historyDetails = useCallback(
    (sheet: string, entry: number, offset: number, limit: number) => client().historyDetails(sheet, entry, offset, limit),
    [client],
  );

  return { state, open, selectSheet, cancel, reset, getRows, scan, abortScans, previewFix, previewFixAll, applyFix, cellInfo, editCell, exportCsv, undo, redo, history, historyDetails };
}
