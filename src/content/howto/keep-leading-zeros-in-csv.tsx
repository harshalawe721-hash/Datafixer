import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const keepLeadingZerosInCsv: HowToGuide = {
  slug: "keep-leading-zeros-in-csv",
  title: "How to Keep Leading Zeros in Excel CSV Files (Opening a CSV)",
  seoTitle: "How to Keep Leading Zeros in Excel CSV Files",
  description:
    "Excel turns 00123 into 123 when it opens a CSV. Learn how to keep leading zeros in codes, PIN codes and phone numbers in Excel and Google Sheets.",
  summary: "Excel removes the zeros at the start of codes like 00123. Here's how to keep them.",
  updated: "2026-11-26",
  tools: ["csv-to-excel"],
  related: ["csv-opens-in-one-column", "numbers-stored-as-text", "convert-excel-to-csv"],
  quickAnswer: (
    <p>
      When Excel opens a CSV file, it sees 00123 and thinks it is the number 123, so it drops the zeros. The CSV file itself still has them, as
      long as you don&apos;t save over it. To keep the zeros, open the file so the column is read as <strong>text</strong> instead of as a number.
    </p>
  ),
  body: (
    <>
      <h2>Why Excel removes the zeros</h2>
      <p>
        A CSV file is plain text, so it has no way to say “this column is a code, not a number”. When you double-click a CSV, Excel looks at every
        value and decides what it is. Anything made of digits becomes a number. And for a number, zeros at the start mean nothing: 00123 and 123
        are the same amount. So Excel shows 123.
      </p>
      <p>
        For amounts and quantities that is fine. But many values only look like numbers. They are really codes, and every digit matters.
      </p>

      <h2>Where this matters</h2>
      <ul>
        <li>Product codes, customer numbers and order numbers (00123)</li>
        <li>PIN codes and postal codes (011001)</li>
        <li>Phone numbers saved without a country code (09876543210)</li>
        <li>Bank sort codes, employee IDs and invoice numbers</li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="The same values: in the CSV file, and after double-clicking it in Excel"
        headers={["In the CSV file", "Shown by Excel"]}
        rows={[
          ["00123", "123"],
          ["011001", "11001"],
          ["09876543210", "9876543210"],
        ]}
      />
      <p>
        If you now save the file from Excel as CSV, the zeros are really gone: the new file contains 123, not 00123. That is why the most
        important rule is: don&apos;t save over the original after double-clicking it.
      </p>

      <h2>Long numbers have a similar problem</h2>
      <p>
        Excel stores at most 15 digits of a number. If a value is longer, like a 16-digit card number or a long ID, Excel changes the extra digits
        to zeros, and it may show the number in a short form such as 1.23457E+15. The fix is the same as for leading zeros: open the column as
        text.
      </p>

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <h3>Method 1: open the file without changing any values</h3>
      <ol>
        <li>Open a new, empty workbook.</li>
        <li>
          Go to <strong>Data</strong> → <strong>From Text/CSV</strong> and choose your file.
        </li>
        <li>
          Check that the preview shows the right columns. If not, change <strong>Delimiter</strong>.
        </li>
        <li>
          Set <strong>Data Type Detection</strong> to <em>Do not detect data types</em>.
        </li>
        <li>
          Click <strong>Load</strong>. Every value is shown exactly as it is in the file, zeros included.
        </li>
      </ol>
      <h3>Method 2: choose text only for the code columns</h3>
      <ol>
        <li>
          In the same window, click <strong>Transform Data</strong> instead of Load.
        </li>
        <li>
          Click the small icon at the left of the column name (for example “123”) and choose <strong>Text</strong>.
        </li>
        <li>
          If Excel asks, choose <strong>Replace current</strong>. Then click <strong>Close &amp; Load</strong>.
        </li>
      </ol>
      <p>This keeps amounts as numbers, so you can still add them up, while codes stay as text.</p>

      <h2>Fix it in Google Sheets</h2>
      <ol>
        <li>
          Go to <strong>File</strong> → <strong>Import</strong> → <strong>Upload</strong> and choose the file.
        </li>
        <li>
          Untick <strong>Convert text to numbers, dates and formulas</strong>.
        </li>
        <li>
          Click <strong>Import data</strong>. The zeros stay.
        </li>
      </ol>
      <p>
        To type a new code with a leading zero in Google Sheets, select the column first and choose <strong>Format</strong> →{" "}
        <strong>Number</strong> → <strong>Plain text</strong>.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open the CSV in <Link href="/csv-to-excel">CSV to Excel</Link> and download the Excel file. MyDataFixer decides for each value whether it
        is safe to turn into a number:
      </p>
      <ul>
        <li>Values with leading zeros stay text, so 00123 stays 00123.</li>
        <li>Numbers with more than 15 digits stay text, so nothing is rounded.</li>
        <li>Plain amounts such as 12.50 become real numbers you can add up.</li>
      </ul>
      <p>
        Because the result is an Excel file, not a CSV, Excel doesn&apos;t guess again when you open it: the zeros are kept every time. The
        summary tells you how many values were kept as text and why. It works on phones and tablets too, and your file stays on your device.
      </p>

      <h2>Typing codes with zeros in Excel</h2>
      <ul>
        <li>
          Type an apostrophe first: <code>&apos;00123</code>. The apostrophe isn&apos;t shown in the cell.
        </li>
        <li>
          Or select the column, right-click → <strong>Format Cells</strong> → <strong>Text</strong>, then type the codes.
        </li>
      </ul>

      <h2>How to avoid losing zeros next time</h2>
      <ul>
        <li>
          <strong>Never double-click a CSV with codes.</strong> Open it with Data → From Text/CSV, or convert it to an Excel file first.
        </li>
        <li>
          <strong>Ask for an Excel file.</strong> If someone sends you data regularly, an .xlsx file keeps text columns as text.
        </li>
        <li>
          <strong>Format code columns as Text</strong> before typing or pasting into them, in your own sheets.
        </li>
        <li>
          <strong>Check after saving.</strong> Open a saved CSV in a text editor such as Notepad. If you see 00123 there, the zeros are safe,
          whatever Excel shows.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Excel drops leading zeros because it thinks codes are numbers. The CSV file still has them until you save over it. Open the file as text
        with From Text/CSV in Excel or Import in Google Sheets, or turn it into an Excel file with CSV to Excel, which keeps the zeros for good.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Adding zeros back by hand.</strong> It&apos;s easy to add the wrong number of zeros. Open the original file again instead.
        </li>
        <li>
          <strong>Using a number format with zeros.</strong> A custom format like 00000 makes 123 look like 00123, but the cell still holds 123.
          When saved as CSV, the zeros may disappear again.
        </li>
        <li>
          <strong>Opening and saving in a hurry.</strong> If Excel asks whether to keep the CSV format, the zeros may already be gone. Keep the
          original.
        </li>
      </ul>
    </>
  ),
  faqs: [
    {
      q: "Are the zeros gone from my CSV file?",
      a: "Not unless you saved the file from Excel. Open the original again with one of the methods above.",
    },
    {
      q: "How do I type a number with a leading zero in Excel?",
      a: "Type an apostrophe first ('00123), or format the cells as Text before typing.",
    },
    {
      q: "Why do long numbers like card or ID numbers change?",
      a: "Excel keeps only 15 digits of a number and changes the rest to zeros. Open such columns as text.",
    },
    {
      q: "Will my amounts still work if I open everything as text?",
      a: "Text can't be added up. Open only the code columns as text (Method 2), or use CSV to Excel, which keeps plain amounts as numbers.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is converted in your browser, on your device.",
    },
  ],
};
