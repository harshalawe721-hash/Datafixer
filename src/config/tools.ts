import type { LucideIcon } from "lucide-react";
import { ScanSearch, Sparkles, FileCheck2, FileSpreadsheet, Sheet } from "lucide-react";

export type ToolId =
  | "spreadsheet-error-detector"
  | "spreadsheet-cleaner"
  | "csv-validator"
  | "excel-to-csv"
  | "csv-to-excel";

export interface ToolDefinition {
  id: ToolId;
  name: string;
  /** Short label for navigation menus. */
  shortName: string;
  href: `/${ToolId}`;
  /** One-sentence summary used in cards and menus. */
  summary: string;
  icon: LucideIcon;
  /** File types the tool accepts. */
  accepts: readonly (".xlsx" | ".xls" | ".csv")[];
  /** Shown in "Popular tools" on the homepage. */
  featured: boolean;
}

/**
 * Single registry of every tool. Navigation, footer, homepage cards, sitemap and
 * related-tool links all read from here, so a new tool only needs one entry.
 */
export const tools: readonly ToolDefinition[] = [
  {
    id: "spreadsheet-error-detector",
    name: "Spreadsheet Error Detector",
    shortName: "Error Detector",
    href: "/spreadsheet-error-detector",
    summary: "Scan Excel or CSV files for duplicates, blanks, bad dates, invalid emails and more.",
    icon: ScanSearch,
    accepts: [".xlsx", ".xls", ".csv"],
    featured: true,
  },
  {
    id: "spreadsheet-cleaner",
    name: "Spreadsheet Cleaner",
    shortName: "Cleaner",
    href: "/spreadsheet-cleaner",
    summary: "Remove duplicates, trim spaces, fix capitalization, split or merge columns, with undo.",
    icon: Sparkles,
    accepts: [".xlsx", ".xls", ".csv"],
    featured: true,
  },
  {
    id: "csv-validator",
    name: "CSV Validator",
    shortName: "CSV Validator",
    href: "/csv-validator",
    summary: "Check CSV structure: headers, row lengths, quoting, delimiters and encoding.",
    icon: FileCheck2,
    accepts: [".csv"],
    featured: true,
  },
  {
    id: "excel-to-csv",
    name: "Excel to CSV Converter",
    shortName: "Excel to CSV",
    href: "/excel-to-csv",
    summary: "Pick a worksheet from an XLSX or XLS workbook and download it as CSV.",
    icon: FileSpreadsheet,
    accepts: [".xlsx", ".xls"],
    featured: true,
  },
  {
    id: "csv-to-excel",
    name: "CSV to Excel Converter",
    shortName: "CSV to Excel",
    href: "/csv-to-excel",
    summary: "Turn a CSV file into a clean XLSX workbook with automatic delimiter detection.",
    icon: Sheet,
    accepts: [".csv"],
    featured: false,
  },
];

export function getTool(id: ToolId): ToolDefinition {
  const tool = tools.find((t) => t.id === id);
  if (!tool) throw new Error(`Unknown tool: ${id}`);
  return tool;
}

export function relatedTools(id: ToolId, count = 3): ToolDefinition[] {
  return tools.filter((t) => t.id !== id).slice(0, count);
}
