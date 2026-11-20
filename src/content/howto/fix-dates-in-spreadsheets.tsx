import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const fixDatesInSpreadsheets: HowToGuide = {
  slug: "fix-dates-in-spreadsheets",
  title: "How to fix dates in a spreadsheet: numbers, wrong and mixed formats",
  seoTitle: "How to Fix Dates in Excel: Numbers and Mixed Formats",
  description:
    "Dates showing as numbers like 45292, or written in different formats? Learn how to fix dates in Excel, Google Sheets and free with MyDataFixer.",
  summary: "Dates that show as numbers, or are written in different ways in one column. Here's how to make them right.",
  updated: "2026-11-20",
  tools: ["spreadsheet-error-detector", "spreadsheet-cleaner"],
  related: ["numbers-stored-as-text", "keep-leading-zeros-in-csv", "remove-extra-spaces"],
  quickAnswer: (
    <p>
      If a date shows as a number like <strong>45292</strong>, it is a real date with the wrong format: change the cell format to Date. If one
      column mixes formats like <strong>2024-03-15</strong> and <strong>15/03/2024</strong>, convert them all to one format.
    </p>
  ),
  body: (
    <>
      <h2>Two common problems</h2>
      <ul>
        <li>
          <strong>Dates shown as numbers.</strong> Excel stores dates as numbers (45292 is 1 January 2024). If the cell is formatted as a number,
          you see the number.
        </li>
        <li>
          <strong>Mixed formats.</strong> Data from different places is written differently, so sorting and filtering by date doesn&apos;t work.
          A date like 03/04/2024 is also unclear: it can mean 3 April or March 4.
        </li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="One date column with three different formats"
        headers={["order date"]}
        rows={[["2024-03-15"], ["15/03/2024"], ["45366"]]}
      />

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <ul>
        <li>
          <strong>Numbers instead of dates:</strong> select the cells, go to <strong>Home</strong> → the number format box →{" "}
          <strong>Short Date</strong>.
        </li>
        <li>
          <strong>Dates stored as text:</strong> select the column, go to <strong>Data</strong> → <strong>Text to Columns</strong> →{" "}
          <strong>Next</strong> → <strong>Next</strong>, choose <strong>Date</strong> and the order the dates are written in (DMY for day/month/year),
          then click <strong>Finish</strong>.
        </li>
      </ul>

      <h2>Fix it in Google Sheets</h2>
      <p>
        Select the cells and go to <strong>Format</strong> → <strong>Number</strong> → <strong>Date</strong>. For a different style, choose{" "}
        <strong>Custom date and time</strong>.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open the file in the <Link href="/spreadsheet-error-detector">Error Detector</Link>. It finds dates that don&apos;t match the column&apos;s
        usual format, dates that can&apos;t exist (like 31 April), and dates that could be read two ways. The fix lets you choose one format for
        the whole column and asks you whether a date like 03/04/2024 means 3 April or March 4: MyDataFixer never guesses. You see every change
        before it&apos;s applied, and your file stays on your device. The same fix is in the{" "}
        <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link>.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Why does my date show as 45292?",
      a: "Excel counts days since 1900, so 45292 is 1 January 2024. Change the cell format to a date format to see it as a date.",
    },
    {
      q: "Which date format is best?",
      a: "Year-month-day (2024-03-15) can't be misread and sorts correctly, so it's the safest when files are shared between countries.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is checked and fixed in your browser, on your device.",
    },
  ],
};
