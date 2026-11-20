import Link from "next/link";
import { ExampleTable, FileLines } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const csvOpensInOneColumn: HowToGuide = {
  slug: "csv-opens-in-one-column",
  title: "Why a CSV file opens in one column, and how to fix it",
  seoTitle: "CSV Opens in One Column? Why and How to Fix It",
  description:
    "Your CSV opens with everything in column A? Learn why Excel splits on the wrong separator and how to fix it in Excel, Google Sheets or your browser.",
  summary: "Everything squeezed into column A? The file uses a different separator than your computer expects. Here's how to open it correctly.",
  updated: "2026-11-20",
  tools: ["csv-to-excel", "csv-validator"],
  related: ["keep-leading-zeros-in-csv", "csv-encoding-strange-characters", "check-csv-before-import"],
  quickAnswer: (
    <p>
      A CSV file separates values with a character, usually a comma, sometimes a semicolon or a tab. Excel splits each line using the separator
      your computer is set up for. If the file uses a different one, everything lands in column A. Your data is fine: open it with the right
      separator.
    </p>
  ),
  body: (
    <>
      <h2>Why it happens</h2>
      <ul>
        <li>
          <strong>Different country settings.</strong> Computers in many European countries expect semicolons; computers set up for India, the
          US or the UK expect commas.
        </li>
        <li>
          <strong>Tabs in a .csv file.</strong> Some programs save tab-separated text but name it .csv.
        </li>
      </ul>

      <h2>Example</h2>
      <FileLines caption="sales.csv as plain text (semicolons between values)" lines={["id;name;city", "1001;Asha Patil;Pune", "1002;Ben Müller;Berlin"]} />
      <ExampleTable caption="What Excel shows on a computer that expects commas" headers={["A"]} rows={[["id;name;city"], ["1001;Asha Patil;Pune"], ["1002;Ben Müller;Berlin"]]} />
      <ExampleTable caption="What it should look like" headers={["id", "name", "city"]} rows={[["1001", "Asha Patil", "Pune"], ["1002", "Ben Müller", "Berlin"]]} />

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <ol>
        <li>Select column A.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Text to Columns</strong>, choose <strong>Delimited</strong> and click <strong>Next</strong>.
        </li>
        <li>
          Tick the separator your file uses (for example <strong>Semicolon</strong>), untick the others and click <strong>Finish</strong>.
        </li>
      </ol>

      <h2>Fix it in Google Sheets</h2>
      <ol>
        <li>
          Go to <strong>File</strong> → <strong>Import</strong> → <strong>Upload</strong> and choose the file.
        </li>
        <li>
          Under <strong>Separator type</strong>, choose the right one (or <em>Detect automatically</em>) and click <strong>Import data</strong>.
        </li>
      </ol>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open the file in <Link href="/csv-to-excel">CSV to Excel</Link>. It detects the separator (comma, semicolon, tab or pipe) and creates an
        Excel file with proper columns, which opens correctly on any computer. To get a CSV with a different separator instead, use the{" "}
        <Link href="/csv-validator">CSV Validator</Link> and choose comma, semicolon or tab when you download. Your file stays on your device.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Is my data lost when a CSV opens in one column?",
      a: "No. The file is unchanged; Excel only used the wrong separator. Close it without saving and open it again with one of the methods above.",
    },
    {
      q: "Why does the same file open fine on another computer?",
      a: "That computer expects a different separator because of its country settings.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is read and converted in your browser, on your device. Its contents are not sent to any server.",
    },
  ],
};
