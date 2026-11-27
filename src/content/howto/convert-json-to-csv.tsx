import Link from "next/link";
import { ExampleTable, FileLines } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const convertJsonToCsv: HowToGuide = {
  slug: "convert-json-to-csv",
  title: "How to convert JSON to CSV and open it in Excel",
  seoTitle: "How to Convert JSON to CSV or Excel (Step by Step)",
  description:
    "Turn a JSON file into a table you can open in Excel. How to convert JSON to CSV with Excel's Power Query, or free in your browser with MyDataFixer.",
  summary: "Got data as JSON from an app or website? Here's how to turn it into a table for Excel or Google Sheets.",
  updated: "2026-11-27",
  tools: ["json-to-csv"],
  related: ["convert-csv-to-json", "keep-leading-zeros-in-csv", "csv-opens-in-one-column", "csv-vs-excel"],
  quickAnswer: (
    <p>
      JSON stores data as records with named values, and a CSV file stores it as rows and columns. To convert one to the other, each record becomes
      a row and each name becomes a column. In Excel, use <strong>Data → Get Data → From File → From JSON</strong> and turn the records into a
      table. Or open the file in MyDataFixer&apos;s free <strong>JSON to CSV</strong> converter, which does it in one step and downloads a CSV or
      Excel file.
    </p>
  ),
  body: (
    <>
      <h2>What a JSON file looks like</h2>
      <p>
        JSON is a way of writing data as text. Apps, websites and online services use it to send data to each other, so it is what you often get
        when you export from a tool, download from a website or ask a developer for “the data”. A typical file is a list of records:
      </p>
      <FileLines
        caption="customers.json"
        lines={[
          "[",
          '  {"id": "00123", "name": "Asha", "city": "Pune", "phones": ["+91 98200 00001"]},',
          '  {"id": "00124", "name": "Ben", "city": "Rome"}',
          "]",
        ]}
      />
      <p>
        Square brackets <code>[ ]</code> hold a list, curly brackets <code>{"{ }"}</code> hold one record, and each value has a name in quotes.
        Spreadsheets can&apos;t open this directly: they need rows and columns.
      </p>

      <h2>How JSON becomes a table</h2>
      <ExampleTable
        caption="The same data as a table"
        headers={["id", "name", "city", "phones"]}
        rows={[
          ["00123", "Asha", "Pune", '["+91 98200 00001"]'],
          ["00124", "Ben", "Rome", ""],
        ]}
      />
      <ul>
        <li>Each record becomes a row, and each name (id, name, city) becomes a column.</li>
        <li>A record without a value leaves the cell empty, like Ben&apos;s phones.</li>
        <li>
          A record inside a record, such as <code>&quot;address&quot;: {"{"}&quot;city&quot;: &quot;Pune&quot;{"}"}</code>, becomes a column with
          a dotted name, address.city.
        </li>
        <li>A list inside a record, like several phone numbers, has no natural place in one cell, so converters either spread it out or keep it as text.</li>
      </ul>

      <h2>Convert JSON in Excel</h2>
      <ExcelNote />
      <p>
        Excel can read JSON with Power Query, in Excel for Microsoft 365 and Excel 2016 or later on Windows. On a Mac the JSON option may be missing,
        depending on your version.
      </p>
      <ol>
        <li>
          Go to <strong>Data</strong> → <strong>Get Data</strong> → <strong>From File</strong> → <strong>From JSON</strong> and choose your file.
        </li>
        <li>
          The Power Query Editor opens and shows a <strong>List</strong>. Click <strong>To Table</strong> on the ribbon, then <strong>OK</strong>.
        </li>
        <li>
          The column header now has a small icon with two arrows. Click it, keep the names you want ticked, untick{" "}
          <strong>Use original column name as prefix</strong>, and click <strong>OK</strong>. Each name becomes a column.
        </li>
        <li>
          If a column still says <em>Record</em> or <em>List</em>, click the same icon on that column to expand it too.
        </li>
        <li>
          Check codes such as 00123: click the icon at the left of the column header and choose <strong>Text</strong>, so the zeros are kept.
        </li>
        <li>
          Click <strong>Close &amp; Load</strong>. The data appears as a table on a new sheet. To get a CSV, use <strong>File → Save As</strong> and
          choose <strong>CSV UTF-8</strong>.
        </li>
      </ol>
      <p>
        If the records are inside another object, for example under <code>&quot;results&quot;</code>, Power Query first shows that object. Click{" "}
        <strong>List</strong> next to results to go into it, then continue with step 2.
      </p>

      <h2>Convert JSON in Google Sheets</h2>
      <p>
        Google Sheets has no built-in way to open JSON. You need an add-on or a script, or you convert the file to CSV first and open that with{" "}
        <strong>File → Import</strong>. A browser converter is usually the quickest way.
      </p>

      <h2>Convert JSON with MyDataFixer</h2>
      <p>
        Open the file in <Link href="/json-to-csv">JSON to CSV</Link>, or paste the JSON into the box. It works in your browser, on a computer,
        tablet or phone, and nothing is uploaded.
      </p>
      <ol>
        <li>Each record becomes a row, and each name a column, in the order the names first appear.</li>
        <li>Records inside records become dotted columns, such as address.city. Lists inside a record stay as JSON text in one cell, so nothing is lost.</li>
        <li>If the file holds the records inside another object, the largest list is shown, and you can choose another.</li>
        <li>Download the table as CSV or as an Excel file. Each file is checked before it is downloaded.</li>
      </ol>
      <p>
        Codes with leading zeros stay as they are, and numbers longer than 15 digits, such as long IDs, are kept exactly. If the JSON has a mistake,
        such as a missing quote or an extra comma, it tells you what is wrong and on which line and column. Files with one record per line (JSON
        Lines, .jsonl) work too.
      </p>

      <h2>Common problems</h2>
      <ul>
        <li>
          <strong>“Unexpected token” or the file won&apos;t open.</strong> The JSON has a mistake: often a comma after the last item, single quotes
          instead of double quotes, or a missing bracket. MyDataFixer shows the line and column so you can fix it in a text editor.
        </li>
        <li>
          <strong>Long numbers end in zeros.</strong> Excel keeps only 15 digits, so 12345678901234567890 becomes 12345678901234500000. Keep long IDs
          as text.
        </li>
        <li>
          <strong>Codes lose their zeros.</strong> 00123 becomes 123 when Excel treats it as a number. Set the column to Text in Power Query, or use a
          converter that keeps it.
        </li>
        <li>
          <strong>One record per line.</strong> Files from logs and data tools often have one JSON record on each line instead of a list. That is
          JSON Lines; save it as .jsonl.
        </li>
        <li>
          <strong>Too many columns.</strong> Deeply nested data gives many dotted columns. Delete the ones you don&apos;t need after converting.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Converting JSON to CSV turns each record into a row and each name into a column. In Excel, use Data → Get Data → From JSON, turn the list into
        a table and expand the columns. In Google Sheets, convert first. Or use MyDataFixer&apos;s JSON to CSV, which handles nested data, keeps long
        numbers and leading zeros, and downloads CSV or Excel.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Can Excel open a JSON file?",
      a: "Yes, with Data → Get Data → From File → From JSON in Excel for Microsoft 365 and Excel 2016 or later on Windows. You then turn the list into a table and expand the columns in Power Query.",
    },
    {
      q: "What happens to nested JSON?",
      a: "A record inside a record becomes columns with dotted names, such as address.city. Lists inside a record are either spread out or kept as JSON text in one cell, depending on the tool.",
    },
    {
      q: "Why do my long numbers change in Excel?",
      a: "Excel stores at most 15 digits of a number, so longer IDs get zeros at the end. Keep them as text. MyDataFixer's JSON to CSV keeps them exactly.",
    },
    {
      q: "What is JSON Lines (.jsonl)?",
      a: "A file with one JSON record on each line instead of one big list. Logs and data tools often use it. MyDataFixer opens .jsonl files directly.",
    },
    {
      q: "Can I convert JSON on my phone?",
      a: "The Excel phone app can't open JSON. MyDataFixer's JSON to CSV works in a phone or tablet browser, and you can paste the JSON instead of choosing a file.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file, or the JSON you paste, is read and converted in your browser, on your device.",
    },
  ],
};
