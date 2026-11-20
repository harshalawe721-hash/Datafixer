import Link from "next/link";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const convertExcelToCsv: HowToGuide = {
  slug: "convert-excel-to-csv",
  title: "How to convert Excel to CSV without losing data",
  seoTitle: "How to Convert Excel to CSV Without Losing Data",
  description:
    "Convert an Excel file to CSV the right way: keep special characters, save every sheet and avoid surprises with dates and formulas. Free and simple.",
  summary: "Save an Excel sheet as CSV while keeping special characters, all your sheets and the right values.",
  updated: "2026-11-20",
  tools: ["excel-to-csv"],
  related: ["csv-encoding-strange-characters", "keep-leading-zeros-in-csv", "check-csv-before-import"],
  quickAnswer: (
    <p>
      In Excel, use <strong>File → Save As → CSV UTF-8 (Comma delimited)</strong>. Remember that a CSV keeps only one sheet and only values: no
      formulas, formatting or other sheets.
    </p>
  ),
  body: (
    <>
      <h2>What a CSV can&apos;t keep</h2>
      <ul>
        <li>Only one sheet per file. Other sheets need their own CSV.</li>
        <li>Formulas are replaced by their results.</li>
        <li>Formatting, colours, charts and comments are lost.</li>
      </ul>

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <ol>
        <li>Open the sheet you want to save.</li>
        <li>
          Go to <strong>File</strong> → <strong>Save As</strong> and choose <strong>CSV UTF-8 (Comma delimited)</strong>. UTF-8 keeps characters like
          é, ü and ₹.
        </li>
        <li>Click Save. Excel warns that only the current sheet is saved; repeat for each sheet you need.</li>
      </ol>

      <h2>Fix it in Google Sheets</h2>
      <p>
        Open the sheet and go to <strong>File</strong> → <strong>Download</strong> → <strong>Comma-separated values (.csv)</strong>. Only the
        current sheet is downloaded.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>Open the workbook (.xlsx or .xls) in <Link href="/excel-to-csv">Excel to CSV</Link>. You can:</p>
      <ul>
        <li>download one sheet, or every sheet at once as a ZIP file with one CSV per sheet;</li>
        <li>
          choose <strong>As shown in Excel</strong> (dates and numbers as you see them) or <strong>Plain values</strong> (dates as 2024-03-15,
          numbers without formatting, best for databases);
        </li>
        <li>choose the separator (comma, semicolon or tab) and UTF-8 with or without BOM.</li>
      </ul>
      <p>
        Every file is checked cell by cell before it&apos;s offered, and your workbook never leaves your device.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Why do special characters look wrong in my CSV?",
      a: "The file wasn't saved as UTF-8. In Excel choose “CSV UTF-8”; in MyDataFixer files are always UTF-8.",
    },
    {
      q: "Can I save all sheets at once?",
      a: "Not with Excel's Save As. MyDataFixer's Excel to CSV can download every sheet as a ZIP file.",
    },
    {
      q: "Does MyDataFixer upload my workbook?",
      a: "No. The workbook is converted in your browser, on your device.",
    },
  ],
};
