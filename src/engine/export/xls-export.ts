/**
 * Stage 4, Step 7 (risk R8): old Excel 97–2003 (.xls) files can't be patched
 * in place, so the corrected workbook is rebuilt as a new .xlsx with SheetJS.
 * What the rebuild can't keep was measured on test workbooks and is listed to
 * the user before and after the download.
 */
import { EngineError } from "../errors.ts";
import { throwIfCancelled, type CancelToken } from "../cancel.ts";
import { splitCellKey, type CellValue } from "../types.ts";
import { loadSheetJS } from "../xlsx/read-workbook.ts";

export { XLS_REBUILD_LOSSES } from "./xls-losses.ts";

export async function rebuildXlsAsXlsx(
  file: Blob,
  sheetIndex: number,
  edits: Map<number, { value: CellValue; format?: string }>,
  cancel?: CancelToken,
): Promise<Blob> {
  const XLSX = await loadSheetJS(true);
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellFormula: true, cellNF: true, cellStyles: true, cellDates: false, bookVBA: false });
  throwIfCancelled(cancel);
  const name = wb.SheetNames[sheetIndex];
  const ws = name !== undefined ? (wb.Sheets[name] as Record<string, unknown>) : undefined;
  if (!ws) throw new EngineError("sheet-not-found", "That sheet could not be found in this file.");
  const range = XLSX.utils.decode_range(typeof ws["!ref"] === "string" ? ws["!ref"] : "A1:A1");
  for (const [key, e] of edits) {
    const { row, col } = splitCellKey(key);
    const addr = XLSX.utils.encode_cell({ r: row, c: col });
    const old = ws[addr] as { z?: string } | undefined;
    if (e.value === null || e.value === "") {
      delete ws[addr];
      continue;
    }
    const cell: Record<string, unknown> =
      typeof e.value === "number" ? { t: "n", v: e.value } : typeof e.value === "boolean" ? { t: "b", v: e.value } : { t: "s", v: e.value };
    const z = e.format ?? (typeof e.value === "number" ? old?.z : undefined);
    if (z) cell.z = z;
    ws[addr] = cell; // no formula: an edited cell holds the typed value
    range.e.r = Math.max(range.e.r, row);
    range.e.c = Math.max(range.e.c, col);
  }
  ws["!ref"] = XLSX.utils.encode_range(range);
  // SheetJS writes an attribute ("level") that isn't valid in XLSX column/row records; other apps reject it.
  for (const n of wb.SheetNames) {
    const s = wb.Sheets[n] as Record<string, unknown>;
    for (const k of ["!cols", "!rows"]) for (const c of (s[k] as Record<string, unknown>[] | undefined) ?? []) if (c) delete c.level;
  }
  const out = XLSX.write(wb, { bookType: "xlsx", type: "array", compression: true }) as ArrayBuffer;
  return new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
