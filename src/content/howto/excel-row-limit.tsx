import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const excelRowLimit: HowToGuide = {
  slug: "excel-row-limit",
  title: "Excel's row limit (1,048,576 rows): what to do with bigger files",
  seoTitle: "Excel Row Limit (1,048,576): Open Bigger CSV Files",
  description:
    "Excel shows at most 1,048,576 rows per sheet. Learn what happens to bigger CSV files, and how to open, split or convert them without losing data.",
  summary: "Excel can't show more than 1,048,576 rows in one sheet. Here's what to do when your file is bigger.",
  updated: "2026-11-20",
  tools: ["csv-to-excel", "csv-validator"],
  related: ["csv-opens-in-one-column", "check-csv-before-import", "convert-excel-to-csv"],
  quickAnswer: (
    <p>
      One Excel sheet holds at most <strong>1,048,576 rows</strong> and <strong>16,384 columns</strong>. If a CSV file has more rows, Excel loads
      only the first 1,048,576 and the rest are not shown. If you then save, they are lost. Split the data over several sheets or files, or load
      it with Data → From Text/CSV into the Data Model.
    </p>
  ),
  body: (
    <>
      <h2>The limits</h2>
      <ExampleTable
        caption="Size limits of one sheet"
        headers={["Program", "Limit"]}
        rows={[
          ["Excel: rows per sheet", "1,048,576"],
          ["Excel: columns per sheet", "16,384 (up to column XFD)"],
          ["Excel: characters in one cell", "32,767"],
          ["Google Sheets: cells per spreadsheet", "10 million (all sheets together)"],
        ]}
      />
      <p>
        Google Sheets counts cells, not rows. A file with 20 columns reaches its limit at 500,000 rows, half of what Excel can show.
      </p>

      <h2>What happens when a file is too big</h2>
      <p>
        When you open a CSV with more than 1,048,576 rows, Excel shows a message that the file was not loaded completely. The rows after the limit
        are simply not there. Nothing looks wrong in the sheet, so it&apos;s easy to miss.
      </p>
      <p>
        The real danger is saving. If you save the file from Excel, only the rows Excel loaded are written, and the rest of your data is gone from
        that file. Always keep the original.
      </p>

      <h2>How to know how many rows a file has</h2>
      <ul>
        <li>Look at the file size: a CSV over about 100 MB with a few columns can easily have more than a million rows.</li>
        <li>In Excel, press Ctrl+Down Arrow: if you land on row 1,048,576, the file may be cut off.</li>
        <li>MyDataFixer&apos;s CSV Validator counts all rows and warns when a file is over Excel&apos;s or Google Sheets&apos; limits.</li>
      </ul>

      <h2>Your options</h2>
      <h3>1. Load it into Excel&apos;s Data Model</h3>
      <ExcelNote />
      <ol>
        <li>
          Go to <strong>Data</strong> → <strong>From Text/CSV</strong> and choose the file.
        </li>
        <li>
          Click the arrow next to <strong>Load</strong> and choose <strong>Load To…</strong>.
        </li>
        <li>
          Choose <strong>Only Create Connection</strong> and tick <strong>Add this data to the Data Model</strong>.
        </li>
        <li>
          Use <strong>Insert</strong> → <strong>PivotTable</strong> → <strong>From Data Model</strong> to summarise all rows.
        </li>
      </ol>
      <p>
        The Data Model can hold many millions of rows, but you work with summaries (pivot tables), not with a normal sheet you can scroll through.
      </p>
      <h3>2. Split the data over several sheets or files</h3>
      <p>
        Split the rows into parts under the limit, each with the column names on top. You can then open, filter and edit each part like a normal
        sheet. Splitting by hand is slow for big files; a tool does it in one step.
      </p>
      <h3>3. Filter before you open</h3>
      <p>
        If you only need part of the data, such as one year or one region, ask for a smaller export, or use the Power Query editor (Data → From
        Text/CSV → Transform Data) to filter rows before loading them.
      </p>
      <h3>4. Use a database for very big data</h3>
      <p>
        For many millions of rows that you query every day, a database is the right tool. Spreadsheets are best for data you can see and edit.
      </p>

      <h2>Do it with MyDataFixer</h2>
      <p>
        Open the CSV in <Link href="/csv-to-excel">CSV to Excel</Link>. If the file has more rows than one Excel sheet can hold, the rows continue
        on a second sheet (and a third if needed), and each sheet starts with the column names. No rows are left out, and the summary tells you
        how the data was split. Before the download, the new workbook is checked cell by cell.
      </p>
      <p>
        To check a big CSV first, open it in the <Link href="/csv-validator">CSV Validator</Link>: it reports when the file has more rows or
        columns than Excel can show, or more cells than Google Sheets allows, and finds other structure problems at the same time.
      </p>
      <p>
        MyDataFixer accepts files up to 150 MB. Everything runs on your device, so very large files need a computer or a recent phone with enough
        memory; if a file is too large for your device, MyDataFixer tells you. Your file is never uploaded.
      </p>

      <h2>How to avoid problems next time</h2>
      <ul>
        <li>Ask for exports split by month or by region instead of one huge file.</li>
        <li>Never save a file that Excel warned was not loaded completely.</li>
        <li>Check the row count before sending a CSV to someone who will open it in Excel.</li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Rohan downloads a year of website orders: a 120 MB CSV with 1.6 million rows. Excel opens it with the warning “File not loaded completely”,
        and the last months are missing. He closes it without saving. In CSV to Excel, he converts the file: the workbook has two sheets, the first
        with 1,048,575 orders below the column names, the second with the remaining orders, also under the column names. He can now filter each
        sheet normally, and nothing is lost.
      </p>

      <h2>Quick summary</h2>
      <p>
        Excel shows at most 1,048,576 rows per sheet and silently leaves out the rest. Keep the original, then load the data into the Data Model,
        filter it before loading, or split it over several sheets, which CSV to Excel does automatically with the column names repeated.
      </p>
    </>
  ),
  faqs: [
    {
      q: "What is the maximum number of rows in Excel?",
      a: "1,048,576 rows and 16,384 columns per sheet, in all recent versions of Excel.",
    },
    {
      q: "Did I lose data when Excel said the file wasn't loaded completely?",
      a: "Not if you didn't save over the original. The CSV still has every row. Open it with one of the options in this guide.",
    },
    {
      q: "How many rows can Google Sheets hold?",
      a: "Google Sheets allows 10 million cells per spreadsheet, so the row limit depends on the number of columns.",
    },
    {
      q: "Can MyDataFixer open files with more than a million rows?",
      a: "Yes, files up to 150 MB, if your device has enough memory. CSV to Excel continues the rows on extra sheets, with the column names on each.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Big or small, the file is processed in your browser, on your device.",
    },
  ],
};
