import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import type { HowToGuide } from "./types";

export const csvVsExcel: HowToGuide = {
  slug: "csv-vs-excel",
  title: "CSV or Excel (XLSX): which file format should you use?",
  seoTitle: "CSV vs Excel (XLSX): Which File Format to Use?",
  description:
    "What's the difference between CSV and Excel files? A simple comparison of CSV and XLSX, when to use each, and how to convert between them for free.",
  summary: "CSV and XLSX both hold tables, but they work very differently. Here's when to use each one.",
  updated: "2026-11-24",
  tools: ["csv-to-excel", "excel-to-csv"],
  related: ["convert-excel-to-csv", "keep-leading-zeros-in-csv", "csv-opens-in-one-column"],
  quickAnswer: (
    <p>
      Use <strong>CSV</strong> when a program needs to import your data: online shops, CRMs, email tools and databases. Use{" "}
      <strong>Excel (XLSX)</strong> when people will open, read and work with the file: it keeps several sheets, formulas, formatting, and
      exact values like codes with leading zeros. You can convert between them in seconds, in either direction.
    </p>
  ),
  body: (
    <>
      <h2>What each format is</h2>
      <p>
        A <strong>CSV file</strong> (comma-separated values) is plain text. Each line is a row, and a character such as a comma separates the
        values. You can open it in Notepad and read it. That simplicity is its strength: almost every program in the world can read a CSV.
      </p>
      <p>
        An <strong>XLSX file</strong> is Excel&apos;s own format. Inside, it is a small package of files that store not only the values but also
        their types (number, date, text), several sheets, formulas, colours, column widths, charts and much more. Google Sheets, LibreOffice and
        Numbers can open it too.
      </p>

      <h2>The main differences</h2>
      <ExampleTable
        caption="CSV compared with XLSX"
        headers={["Feature", "CSV", "Excel (XLSX)"]}
        rows={[
          ["Sheets", "one table only", "many sheets"],
          ["Formulas", "no, only results", "yes"],
          ["Formatting, colours, charts", "no", "yes"],
          ["Value types", "everything is text", "numbers, dates, text are stored as such"],
          ["Leading zeros (00123)", "kept in the file, often lost when Excel opens it", "kept if the cell is text"],
          ["Opened by import tools", "almost all", "many, but not all"],
          ["Readable in a text editor", "yes", "no"],
          ["Separator problems", "yes (comma or semicolon)", "no"],
          ["Text encoding problems", "yes (UTF-8 or not)", "no"],
          ["Rows per sheet in Excel", "Excel shows at most 1,048,576", "1,048,576 per sheet"],
        ]}
      />

      <h2>When to use CSV</h2>
      <ul>
        <li>Importing products into an online shop, contacts into a CRM, or subscribers into an email tool.</li>
        <li>Loading data into a database or a script.</li>
        <li>Exchanging data between two different programs.</li>
        <li>Keeping a simple, long-lasting copy of a table that any program will read in the future.</li>
      </ul>

      <h2>When to use Excel (XLSX)</h2>
      <ul>
        <li>Sending a report or list to people who will read it.</li>
        <li>Data with several sheets, formulas or charts.</li>
        <li>Data with codes, phone numbers or PIN codes that start with zeros, which Excel would change when opening a CSV.</li>
        <li>Files shared with people in other countries, so the separator and encoding can&apos;t cause trouble.</li>
      </ul>

      <h2>Common problems with CSV files</h2>
      <ul>
        <li>
          <strong>Everything in one column:</strong> the file uses a different separator than the computer expects.
        </li>
        <li>
          <strong>Strange characters like Ã©:</strong> the file was opened with the wrong text encoding.
        </li>
        <li>
          <strong>Lost zeros and changed numbers:</strong> Excel turns 00123 into 123 and long numbers into rounded ones when it opens a CSV.
        </li>
        <li>
          <strong>Broken rows:</strong> a comma inside a value that isn&apos;t in quotes splits it into two columns.
        </li>
      </ul>
      <p>None of these can happen inside an XLSX file, because it stores columns and value types directly.</p>

      <h2>Common problems with Excel files</h2>
      <ul>
        <li>Some import tools, scripts and older systems can&apos;t read them.</li>
        <li>They hide things: hidden sheets, hidden rows, formulas that show one thing and store another.</li>
        <li>They are larger and slower to process than the same data as CSV.</li>
      </ul>

      <h2>How to convert between them</h2>
      <h3>CSV to Excel</h3>
      <p>
        Opening a CSV in Excel and saving it as XLSX works, but Excel may already have changed values while opening (zeros, long numbers,
        dates). <Link href="/csv-to-excel">MyDataFixer&apos;s CSV to Excel</Link> converts more carefully: plain numbers and year-month-day dates
        become real numbers and dates, while codes with leading zeros, numbers longer than 15 digits and dates that could be read two ways stay
        text, exactly as written. It detects the separator and encoding, and the new workbook is checked cell by cell before you download it.
      </p>
      <h3>Excel to CSV</h3>
      <p>
        In Excel, File → Save As → CSV UTF-8 saves the current sheet. <Link href="/excel-to-csv">MyDataFixer&apos;s Excel to CSV</Link> can save
        one sheet or all sheets at once (as a ZIP file), and lets you choose the separator, the encoding and whether values are written as shown
        in Excel or as plain values for databases. Both tools work in your browser; your file is never uploaded.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Deepak keeps his shop&apos;s product list in Excel, with a sheet for prices and a sheet for stock. His new online store asks for a CSV
        upload. He keeps the Excel file as his master copy and uses Excel to CSV to save just the products sheet, with commas and UTF-8 without
        BOM, as the store&apos;s help page asks. When the store sends back an order report as CSV, he converts it with CSV to Excel so the order
        numbers keep their leading zeros, and shares that workbook with his accountant.
      </p>

      <h2>Quick summary</h2>
      <p>
        CSV is simple text that every program can import; XLSX is a full spreadsheet that keeps sheets, formulas, formatting and exact values.
        Keep your working copy in Excel, make a CSV when a program asks for one, and convert carefully so codes, numbers and dates stay right.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Is a CSV file the same as an Excel file?",
      a: "No. Excel can open CSV files, but a CSV is plain text with one table and no formatting, while an XLSX file is a full workbook.",
    },
    {
      q: "Which is better for importing data?",
      a: "CSV. Almost every import tool reads it. Check which separator and encoding the tool expects.",
    },
    {
      q: "Why does my data change when I open a CSV in Excel?",
      a: "Excel guesses what each value is: 00123 becomes 123, long numbers get rounded, and some text becomes dates. Convert the CSV to XLSX carefully, or open it with Data → From Text/CSV.",
    },
    {
      q: "Can a CSV file have more than one sheet?",
      a: "No. Each sheet needs its own CSV file. MyDataFixer's Excel to CSV can save all sheets at once as a ZIP of CSV files.",
    },
    {
      q: "Does MyDataFixer upload my file to convert it?",
      a: "No. The conversion runs in your browser, on your device.",
    },
  ],
};
