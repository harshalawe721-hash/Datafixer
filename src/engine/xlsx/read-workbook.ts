/**
 * Excel cell reader (XLSX and XLS → SheetModel).
 *
 * NOT YET IMPLEMENTED. It will use the official SheetJS build, vendored into
 * vendor/ with a pinned checksum (approved Stage 2 decision). Until that
 * package is in the repository this function throws a clear "not available
 * yet" error; XLSX files still get the full safety inspection and sheet list.
 */
import { EngineError } from "../errors.ts";
import type { SheetModel } from "../types.ts";
import type { InspectionResult } from "./inspect.ts";

export interface ReadSheetOptions {
  sheetName: string;
  inspection: InspectionResult | null;
}

export const EXCEL_READER_AVAILABLE = false;

export async function readExcelSheet(file: Blob, format: "xlsx" | "xls", options: ReadSheetOptions): Promise<SheetModel> {
  void file;
  void options;
  throw new EngineError(
    "not-implemented",
    format === "xls"
      ? "Opening older Excel 97–2003 (.xls) files is not available yet; this part of DataFixer is still being built. You can save the file as CSV in Excel to use it now."
      : "Showing the contents of Excel workbooks is not available yet; this part of DataFixer is still being built. The workbook's structure and safety check are shown above. You can save a sheet as CSV in Excel to use it now.",
  );
}
