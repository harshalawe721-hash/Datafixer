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
      If a date shows as a number like <strong>45292</strong>, it is a real date in the wrong format: change the cell format to Date. If one
      column mixes styles like <strong>2024-03-15</strong> and <strong>15/03/2024</strong>, convert them all to one style. And if a date like{" "}
      <strong>03/04/2024</strong> could mean two things, check the source before changing it.
    </p>
  ),
  body: (
    <>
      <h2>How spreadsheets store dates</h2>
      <p>
        Excel and Google Sheets store every date as a number: the number of days since the start of 1900. 1 January 2024 is day 45292. This is
        what lets you subtract dates, sort them and count days between them. What you see on screen, such as 01/01/2024, is just a format laid
        over that number.
      </p>
      <p>
        Problems start when the format is lost, or when a date is saved as text instead of as a real date. A text date looks right, but Excel
        can&apos;t sort it, filter it by month or use it in calculations.
      </p>

      <h2>Three common date problems</h2>
      <ul>
        <li>
          <strong>Dates shown as numbers.</strong> You see 45292 instead of a date. The cell has a number format instead of a date format.
        </li>
        <li>
          <strong>Mixed styles in one column.</strong> Data from different people or systems is written differently: 2024-03-15, 15/03/2024,
          15.03.2024, 15 Mar 2024. Sorting puts them in the wrong order.
        </li>
        <li>
          <strong>Dates that can be read two ways.</strong> 03/04/2024 means 3 April in India and the UK, but March 4 in the US. A computer can&apos;t
          know which one was meant unless other dates in the column make it clear (13/04/2024 can only be day-first).
        </li>
      </ul>
      <p>
        There are also <strong>impossible dates</strong>, like 31 April or 30 February. These are usually typing mistakes, or day and month
        swapped.
      </p>

      <h2>Example</h2>
      <ExampleTable
        caption="One date column with four different styles"
        headers={["Row", "order date", "what it is"]}
        rows={[
          ["2", "2024-03-15", "year-month-day"],
          ["3", "15/03/2024", "day/month/year"],
          ["4", "45366", "a date shown as a number (15 March 2024)"],
          ["5", "31/04/2024", "impossible: April has 30 days"],
        ]}
      />
      <p>All four rows were probably meant to be 15 March 2024 or close to it, but sorting and filtering this column won&apos;t work.</p>

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <h3>Numbers instead of dates</h3>
      <ol>
        <li>Select the cells with numbers like 45292.</li>
        <li>
          Go to <strong>Home</strong> and open the number format box (it usually says “General” or “Number”).
        </li>
        <li>
          Choose <strong>Short Date</strong> or <strong>Long Date</strong>. The numbers turn into dates.
        </li>
      </ol>
      <h3>Dates saved as text</h3>
      <ol>
        <li>Select the date column.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Text to Columns</strong>, click <strong>Next</strong> twice.
        </li>
        <li>
          Choose <strong>Date</strong> and pick the order the dates are written in: <strong>DMY</strong> for day/month/year,{" "}
          <strong>MDY</strong> for month/day/year, <strong>YMD</strong> for year-month-day.
        </li>
        <li>
          Click <strong>Finish</strong>. The text becomes real dates.
        </li>
      </ol>
      <h3>One style for the whole column</h3>
      <p>
        Once all values are real dates, select the column, right-click → <strong>Format Cells</strong> → <strong>Date</strong> (or{" "}
        <strong>Custom</strong>, and type a format such as <code>yyyy-mm-dd</code> or <code>dd/mm/yyyy</code>).
      </p>

      <h2>Fix it in Google Sheets</h2>
      <ol>
        <li>Select the cells.</li>
        <li>
          Go to <strong>Format</strong> → <strong>Number</strong> → <strong>Date</strong>.
        </li>
        <li>
          For another style, choose <strong>Format</strong> → <strong>Number</strong> → <strong>Custom date and time</strong>.
        </li>
      </ol>
      <p>
        If dates are read the wrong way round, check the spreadsheet&apos;s country: <strong>File</strong> → <strong>Settings</strong> →{" "}
        <strong>Locale</strong>. With India or the UK, 03/04/2024 is read as 3 April.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open your Excel or CSV file in the <Link href="/spreadsheet-error-detector">Error Detector</Link>. It checks every date column and finds:
      </p>
      <ul>
        <li>dates that don&apos;t match the usual style of their column;</li>
        <li>impossible dates, such as 31 April or 29 February in a year that isn&apos;t a leap year;</li>
        <li>dates that could be read two ways, such as 03/04/2024.</li>
      </ul>
      <p>
        The date fix lets you choose one style for the whole column, for example 2024-03-15, 15/03/2024, 03/15/2024, 15.03.2024, 15 Mar 2024 or
        Mar 15, 2024. When dates could be day-first or month-first, it asks you which one the column uses. MyDataFixer never guesses. Impossible
        dates and two-digit years such as ’24 are never changed by themselves; they are listed so you can correct them by hand.
      </p>
      <p>
        You see a preview of every change before anything happens, you can undo, and your file stays on your device. The same fix is in the{" "}
        <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link>.
      </p>

      <h2>Which date style should you use?</h2>
      <p>
        <strong>Year-month-day (2024-03-15)</strong> is the safest when files are shared or imported. It can&apos;t be misread in any country, and
        it sorts correctly even as text. For reports read by people in one country, use the style they are used to, such as 15/03/2024 in India.
      </p>

      <h2>How to avoid date problems next time</h2>
      <ul>
        <li>
          <strong>Agree on one style.</strong> If several people fill in a sheet, write the date style in the column name, for example “order
          date (yyyy-mm-dd)”.
        </li>
        <li>
          <strong>Use data validation.</strong> In Excel, Data → Data Validation → Date lets only real dates into a column.
        </li>
        <li>
          <strong>Write the month as a word</strong> when sharing with other countries: 3 Apr 2024 can&apos;t be misread.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Numbers like 45292 are real dates that only need a date format. Text dates need converting with Text to Columns. Mixed styles should be
        changed to one style, and unclear dates checked at the source. MyDataFixer finds all of these and asks before it changes anything.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Changing only the look.</strong> A date format doesn&apos;t help text dates. Convert them to real dates first (Text to
          Columns).
        </li>
        <li>
          <strong>Guessing the order.</strong> If a column has only dates like 03/04/2024, ask the person who made the file which order they use.
        </li>
        <li>
          <strong>Ignoring impossible dates.</strong> 31/04/2024 is a sign that day and month may be swapped in other rows too.
        </li>
      </ul>
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
      q: "Why are my day and month swapped?",
      a: "The file was made with month-first dates (US style) and opened with day-first settings, or the other way round. Convert with Text to Columns and choose the order the file uses.",
    },
    {
      q: "Can MyDataFixer fix dates in a CSV file?",
      a: "Yes. It reads the dates in CSV and Excel files, and you choose the style they should all be written in.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is checked and fixed in your browser, on your device.",
    },
  ],
};
