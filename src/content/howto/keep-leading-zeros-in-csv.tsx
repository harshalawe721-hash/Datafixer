import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const keepLeadingZerosInCsv: HowToGuide = {
  slug: "keep-leading-zeros-in-csv",
  title: "How to keep leading zeros when opening a CSV file",
  seoTitle: "How to Keep Leading Zeros in a CSV File",
  description:
    "Excel turns 00123 into 123 when it opens a CSV. Learn how to keep leading zeros in codes, PIN codes and phone numbers in Excel and Google Sheets.",
  summary: "Excel removes the zeros at the start of codes like 00123. Here's how to keep them.",
  updated: "2026-11-20",
  tools: ["csv-to-excel"],
  related: ["csv-opens-in-one-column", "numbers-stored-as-text", "convert-excel-to-csv"],
  quickAnswer: (
    <p>
      When Excel opens a CSV, it treats 00123 as the number 123 and drops the zeros. The CSV file itself still has them. To keep them, open the
      file so that the column is read as <strong>text</strong>, not as a number.
    </p>
  ),
  body: (
    <>
      <h2>Where this matters</h2>
      <ul>
        <li>Product and customer codes (00123)</li>
        <li>PIN and ZIP codes (011001)</li>
        <li>Phone numbers saved without a country code (09876543210)</li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="The same file: in the CSV, and after double-clicking it in Excel"
        headers={["In the CSV file", "Shown by Excel"]}
        rows={[
          ["00123", "123"],
          ["011001", "11001"],
          ["09876543210", "9876543210"],
        ]}
      />

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <ol>
        <li>Open a blank workbook.</li>
        <li>
          Go to <strong>Data</strong> → <strong>From Text/CSV</strong> and choose the file.
        </li>
        <li>
          Set <strong>Data Type Detection</strong> to <em>Do not detect data types</em>, then click <strong>Load</strong>. Every value stays exactly as
          written.
        </li>
      </ol>
      <p>
        Don&apos;t save over the CSV from Excel after double-clicking it: the zeros would then really be lost.
      </p>

      <h2>Fix it in Google Sheets</h2>
      <ol>
        <li>
          Go to <strong>File</strong> → <strong>Import</strong> → <strong>Upload</strong> and choose the file.
        </li>
        <li>
          Untick <strong>Convert text to numbers, dates and formulas</strong>, then click <strong>Import data</strong>.
        </li>
      </ol>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open the CSV in <Link href="/csv-to-excel">CSV to Excel</Link> and download the Excel file. Values with leading zeros are kept as text, so
        they open correctly in Excel every time. Numbers longer than 15 digits are also kept as text, because Excel would round them. The summary
        tells you how many values were kept this way. Your file stays on your device.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Are the zeros gone from my CSV file?",
      a: "No, not unless you saved the file from Excel. Open the original again with one of the methods above.",
    },
    {
      q: "How do I type a number with a leading zero in Excel?",
      a: "Type an apostrophe first ('00123), or format the cells as Text before typing.",
    },
    {
      q: "Why do long numbers like card or ID numbers change?",
      a: "Excel only keeps 15 digits of a number and changes the rest to zeros. Open such columns as text.",
    },
  ],
};
