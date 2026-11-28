import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const convertAllExcelSheetsToCsv: HowToGuide = {
  slug: "convert-all-excel-sheets-to-csv",
  title: "How to convert every sheet of an Excel workbook to CSV at once",
  seoTitle: "How to Convert All Excel Sheets to CSV at Once",
  description:
    "Excel saves only the active sheet as CSV. How to export every sheet: one by one, with a short macro, or free in your browser as one CSV per sheet in a ZIP file.",
  summary: "Excel's Save As CSV keeps only the sheet you're looking at. Here's how to get a CSV file for every sheet in a workbook.",
  updated: "2026-11-28",
  tools: ["excel-to-csv"],
  related: ["convert-excel-to-csv", "utf-8-bom-explained", "keep-leading-zeros-in-csv", "csv-vs-excel"],
  quickAnswer: (
    <p>
      A CSV file holds one table, so Excel&apos;s <strong>Save As → CSV</strong> saves only the active sheet. To convert every sheet, repeat Save As
      for each one, run a short macro, or use MyDataFixer&apos;s free <strong>Excel to CSV</strong>: click <strong>All … sheets (ZIP)</strong> to get one
      checked CSV file per sheet in a single download, in your browser.
    </p>
  ),
  body: (
    <>
      <h2>Why Excel saves only one sheet</h2>
      <p>
        A CSV file is plain text: rows and values, nothing else. It has no tabs, so it can&apos;t hold several sheets. When you save a workbook as CSV,
        Excel warns that only the active sheet will be saved, and the other sheets are left out. You need one CSV file per sheet.
      </p>
      <ExampleTable
        caption="sales-2026.xlsx with three sheets becomes three CSV files"
        headers={["Sheet in the workbook", "CSV file"]}
        rows={[
          ["January", "January.csv"],
          ["February", "February.csv"],
          ["Customers", "Customers.csv"],
        ]}
      />

      <h2>Save each sheet in Excel, one at a time</h2>
      <ExcelNote />
      <ol>
        <li>Click the first sheet&apos;s tab.</li>
        <li>
          Go to <strong>File → Save As</strong> (or <strong>Save a Copy</strong>), choose <strong>CSV UTF-8 (Comma delimited) (*.csv)</strong>, give
          the file the sheet&apos;s name and save.
        </li>
        <li>Excel warns that only the active sheet is saved. Click OK.</li>
        <li>
          Click the next sheet&apos;s tab and save again under that sheet&apos;s name. The other sheets stay open until you close the window; when you
          close it, don&apos;t save the changes, and keep your original .xlsx file.
        </li>
      </ol>
      <p>
        This is fine for two or three sheets. With twenty, it&apos;s slow and easy to skip one or save one sheet under another sheet&apos;s name.
        Choose <strong>CSV UTF-8</strong> rather than plain “CSV (Comma delimited)”, so accents and other alphabets survive.
      </p>

      <h2>Save every sheet with a macro</h2>
      <p>
        A macro does the same for every sheet in one go. Save your workbook first, then press <strong>Alt+F11</strong> (on a Mac, <strong>Tools →
        Macro → Visual Basic Editor</strong>), choose <strong>Insert → Module</strong> and paste:
      </p>
      <pre className="overflow-x-auto rounded-xl border border-line bg-surface-muted p-3 text-xs">
        <code>{`Sub SaveEverySheetAsCsv()
    Dim ws As Worksheet
    Dim folder As String
    folder = ThisWorkbook.Path & Application.PathSeparator
    For Each ws In ThisWorkbook.Worksheets
        ws.Copy
        ActiveWorkbook.SaveAs Filename:=folder & ws.Name & ".csv", FileFormat:=xlCSVUTF8
        ActiveWorkbook.Close SaveChanges:=False
    Next ws
End Sub`}</code>
      </pre>
      <p>
        Run it with <strong>F5</strong>. Each sheet is copied into a new workbook, saved as a UTF-8 CSV file next to the original workbook, and
        closed. The <code>xlCSVUTF8</code> format exists in Excel 2016 and later; in older versions use <code>xlCSV</code>. Macros need the macro
        setting turned on, and many offices block them, so only run code you understand.
      </p>

      <h2>In Google Sheets</h2>
      <p>
        <strong>File → Download → Comma-separated values (.csv)</strong> downloads only the current sheet, just like Excel. Switch to each sheet
        and download it in turn.
      </p>

      <h2>Convert every sheet with MyDataFixer</h2>
      <p>
        Open <Link href="/excel-to-csv">Excel to CSV</Link> and choose your .xlsx or .xls file. It works in your browser on a computer, tablet or
        phone, and the workbook is never uploaded.
      </p>
      <ol>
        <li>
          Choose how values are written: <strong>As shown in Excel</strong> (dates and numbers as they look on screen, recommended) or{" "}
          <strong>Plain values (for databases)</strong> (dates as 2026-11-13, numbers in full precision).
        </li>
        <li>
          Click <strong>All … sheets (ZIP)</strong>. The button says how many sheets the workbook has, such as “All 13 sheets (ZIP)”.
        </li>
        <li>
          Every sheet becomes its own CSV file, named after the sheet, and all of them come in one ZIP file named after the workbook, such as
          “sales-2026 - all sheets.zip”.
        </li>
      </ol>
      <p>
        Each CSV file is checked cell by cell against its sheet, and the ZIP file is read back before it&apos;s offered. Hidden sheets are included
        and marked in the list; chart sheets have no cells and are listed as left out. The files are UTF-8 with a byte-order mark, so Excel shows
        accents correctly when you open them. To convert a single sheet instead, choose it and click <strong>Download this sheet as CSV</strong>.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Kofi&apos;s accountant asks for last year&apos;s sales as CSV files. The workbook has a sheet for each of the 12 months, plus a summary sheet.
        Instead of saving 13 times, he opens it in Excel to CSV, keeps “As shown in Excel”, and clicks “All 13 sheets (ZIP)”. One download holds
        January.csv to December.csv and Summary.csv, each with the dates and amounts exactly as they appear in Excel. He emails the ZIP file.
      </p>

      <h2>What a CSV file can&apos;t keep</h2>
      <ul>
        <li>Formatting, colours, column widths, charts and images: CSV holds values only.</li>
        <li>
          Formulas: the value each formula shows is saved instead.
        </li>
        <li>
          Merged cells: the value is saved once, in the first cell.
        </li>
      </ul>
      <p>
        Keep the original workbook. The CSV files are for sharing or importing, not a replacement for it. If the CSV files will be opened in
        Excel again, read how to <Link href="/guides/keep-leading-zeros-in-csv">keep leading zeros</Link>, because Excel can drop them when it opens
        a CSV file.
      </p>

      <h2>Quick summary</h2>
      <p>
        Excel and Google Sheets save only the active sheet as CSV. Repeat Save As for each sheet, run a short macro that saves every sheet, or use
        MyDataFixer&apos;s Excel to CSV and click All … sheets (ZIP): one checked CSV file per sheet, named after the sheet, in one download, in your
        browser.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Why does Excel only save one sheet as CSV?",
      a: "A CSV file is a single table of plain text, so it can't hold several sheets. Excel saves the active sheet and warns that the others aren't saved.",
    },
    {
      q: "How do I convert all sheets to CSV at once?",
      a: "Use a macro that saves each worksheet as its own CSV file, or MyDataFixer's Excel to CSV, which puts one CSV file per sheet in a ZIP file.",
    },
    {
      q: "Are hidden sheets included?",
      a: "In MyDataFixer, yes: hidden sheets are included and marked in the list. The macro above also saves hidden worksheets.",
    },
    {
      q: "Which CSV format should I choose in Excel?",
      a: "CSV UTF-8 (Comma delimited). It keeps accents and other alphabets; the older “CSV (Comma delimited)” can turn them into question marks.",
    },
    {
      q: "Can I do this on my phone?",
      a: "Excel's phone app can't save every sheet at once. MyDataFixer's Excel to CSV works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my workbook?",
      a: "No. The workbook is read in your browser, on your device, and the CSV files are created there.",
    },
  ],
};
