import Link from "next/link";
import { ExampleTable, FileLines } from "@/components/guides/ExampleTable";
import type { HowToGuide } from "./types";

export const checkCsvBeforeImport: HowToGuide = {
  slug: "check-csv-before-import",
  title: "How to check a CSV file before importing it",
  seoTitle: "How to Check a CSV File Before Importing It",
  description:
    "Avoid failed imports into shops, CRMs and databases. A simple checklist to check a CSV file for broken rows, quotes, headers and encoding before you import.",
  summary: "Imports fail because of small problems in the CSV. Here's a simple checklist to catch them first.",
  updated: "2026-11-20",
  tools: ["csv-validator"],
  related: ["csv-opens-in-one-column", "csv-encoding-strange-characters", "convert-excel-to-csv"],
  quickAnswer: (
    <p>
      Before importing a CSV into an online shop, a CRM, an email tool or a database, check five things: every row has the same number of
      values, the column names are present and unique, quotes are closed, the separator is the one the program expects, and the file is saved as
      UTF-8. A free validator can check all of this in seconds.
    </p>
  ),
  body: (
    <>
      <h2>Why imports fail</h2>
      <p>
        Import tools are strict. A person can understand a slightly messy file, but a program stops at the first line it can&apos;t read, or worse,
        imports data into the wrong columns without warning. A few minutes of checking saves hours of fixing wrong records afterwards.
      </p>

      <h2>The most common problems</h2>
      <ul>
        <li>
          <strong>Rows with too many or too few values.</strong> Usually a comma inside a value that wasn&apos;t put in quotes, like an address
          “Shop 4, MG Road”.
        </li>
        <li>
          <strong>Broken quotes.</strong> A quotation mark that opens but never closes makes the program read the rest of the file as one value.
        </li>
        <li>
          <strong>Missing or duplicate column names.</strong> An empty header, or two columns both called “email”.
        </li>
        <li>
          <strong>The wrong separator.</strong> The program expects commas, but the file uses semicolons.
        </li>
        <li>
          <strong>The wrong encoding.</strong> Names with accents or non-English letters turn into strange characters.
        </li>
        <li>
          <strong>Blank lines and hidden characters</strong> that create empty records or break a line in the middle.
        </li>
        <li>
          <strong>Values that start with =, +, - or @.</strong> Spreadsheet programs may treat them as formulas when the file is opened.
        </li>
      </ul>

      <h2>Example</h2>
      <FileLines
        caption="customers.csv: line 3 has one value too many"
        lines={["id,name,city,email", "1001,Asha Patil,Pune,asha@example.com", "1002,Ravi Kumar,Shop 4, MG Road,ravi@example.com"]}
      />
      <p>
        Line 3 has five values instead of four, because of the comma in “Shop 4, MG Road”. Written correctly, the address is in quotes:{" "}
        <code>&quot;Shop 4, MG Road&quot;</code>. An import tool would either reject this line or put “MG Road” in the email column.
      </p>

      <h2>A simple checklist</h2>
      <ExampleTable
        caption="Check these before every import"
        headers={["Check", "What to look for"]}
        rows={[
          ["Column names", "First line has every name, none empty, none repeated"],
          ["Same number of values", "Every row has as many values as there are column names"],
          ["Quotes", "Values with commas or line breaks are in quotes, and every quote closes"],
          ["Separator", "Comma, semicolon or tab: whatever the program asks for"],
          ["Encoding", "UTF-8 (with or without BOM, as the program needs)"],
          ["Required columns", "Names match the program's template exactly"],
        ]}
      />

      <h2>How to check by hand</h2>
      <ol>
        <li>Open the file in a plain text editor (Notepad on Windows, TextEdit on Mac, or any text editor app on a phone).</li>
        <li>Look at the first line: are the column names right?</li>
        <li>Look at a few lines in the middle and at the end: do they look like the first data line?</li>
        <li>Search for quotation marks and check they come in pairs.</li>
        <li>Compare the column names with the import template of the program you&apos;re using.</li>
      </ol>
      <p>This works for small files. For files with thousands of lines, a validator is much faster and doesn&apos;t miss anything.</p>

      <h2>Check it in Excel or Google Sheets</h2>
      <p>
        Opening the CSV in Excel or Google Sheets shows rows that spill into an extra column, which is a good sign of a missing quote or an extra
        comma. Sort by the last column to bring those rows to the top. But be careful: spreadsheets also change values (dates, leading zeros), so
        don&apos;t save the CSV from there unless you have to.
      </p>

      <h2>Check it with MyDataFixer</h2>
      <p>
        Open the file in the <Link href="/csv-validator">CSV Validator</Link>. It runs nine checks: text encoding, separator, the number of values
        in every row, column names, quotes, line endings and blank lines, hidden characters, Excel and Google Sheets limits, and extra separators
        at the end of lines. It then says clearly whether the file is valid and whether it will import cleanly.
      </p>
      <p>
        Each problem shows the exact line as written in the file, with its line number. Safe repairs are offered with a preview: fix column names,
        remove blank lines, remove hidden characters, remove empty extra fields, add an apostrophe before values that look like formulas, and more.
        Problems that can&apos;t be fixed safely, like a row with real extra data, are explained so you can correct them by tapping the cells.
      </p>
      <p>
        Then download the file with the separator, line endings and encoding the program needs. It is checked again before the download. Your
        file stays on your device.
      </p>

      <h2>How to avoid import problems next time</h2>
      <ul>
        <li>Start from the import template the program provides, and keep its column names.</li>
        <li>Export with a tool that puts quotes around values with commas (Excel and Google Sheets do this).</li>
        <li>Test with a small file of five rows before importing thousands.</li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Anita wants to import 2,000 products into her online shop. The first try fails with “row 341: unexpected number of columns”. She opens the
        file in the CSV Validator, which shows line 341 exactly: a product name with a comma that isn&apos;t in quotes. It also finds two columns
        both called “price” and three blank lines at the end. She fixes the column names and removes the blank lines with the offered repairs,
        corrects line 341 by hand, and downloads the file with commas and UTF-8 without BOM, as the shop asks. The second import works.
      </p>

      <h2>Quick summary</h2>
      <p>
        Most failed imports come from uneven rows, broken quotes, bad column names, the wrong separator or the wrong encoding. Check these by hand
        for small files, or run the CSV Validator, repair, and download in the format the program expects.
      </p>
    </>
  ),
  faqs: [
    {
      q: "What makes a CSV file invalid?",
      a: "Rows with a different number of values, quotes that never close, unreadable characters, hidden control characters, and empty or duplicate column names.",
    },
    {
      q: "Why does my import say 'unexpected number of columns'?",
      a: "At least one row has more or fewer values than the header, usually because of a comma inside a value without quotes.",
    },
    {
      q: "Should I use commas or semicolons?",
      a: "Whatever the program you import into asks for. Most online tools expect commas.",
    },
    {
      q: "Can I check a file without a header row?",
      a: "Yes. In the CSV Validator, untick “First row contains column names”, and column names are not checked.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is checked in your browser, on your device.",
    },
  ],
};
