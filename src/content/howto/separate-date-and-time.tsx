import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const separateDateAndTime: HowToGuide = {
  slug: "separate-date-and-time",
  title: "How to separate date and time into two columns",
  seoTitle: "How to Separate Date and Time Into Two Columns in Excel",
  description:
    "Split “2026-11-13 14:30” into a date and a time column: INT and MOD for real Excel dates, Text to Columns for text, or a free browser tool for CSV exports.",
  summary: "One column holds the date and the time together, and you need them apart. How you split it depends on whether Excel sees a real date or text.",
  updated: "2026-11-28",
  tools: ["split-column"],
  related: ["fix-dates-in-spreadsheets", "split-cells-in-excel", "stop-excel-changing-data", "numbers-stored-as-text"],
  quickAnswer: (
    <p>
      If Excel treats the value as a real date-time, use <code>=INT(A2)</code> for the date and <code>=MOD(A2, 1)</code> for the time, then format
      the cells as a date and a time. If the value is text (common in CSV exports), split it at the space with Text to Columns, or with
      MyDataFixer&apos;s free <strong>Split a Column</strong> at the first space.
    </p>
  ),
  body: (
    <>
      <h2>Why split date and time?</h2>
      <ul>
        <li>To count orders or visits per day, the time gets in the way.</li>
        <li>To see what time of day things happen, you need the time on its own.</li>
        <li>Some imports and reports expect separate date and time fields.</li>
      </ul>
      <ExampleTable
        caption="One column becomes two"
        headers={["created", "date", "time"]}
        rows={[
          ["2026-11-13 14:30", "2026-11-13", "14:30"],
          ["2026-11-14 09:05:12", "2026-11-14", "09:05:12"],
          ["13/11/2026 2:30 PM", "13/11/2026", "2:30 PM"],
        ]}
      />

      <h2>First: is it a real date, or text?</h2>
      <p>
        Excel stores a real date-time as a number: the whole part counts the days, and the fraction is the time of day (0.5 is noon). Text only looks
        like a date. To tell which you have, click a cell and look at the alignment: real dates and times align to the right by default, text to the
        left. Or temporarily change the format to <strong>General</strong>: a real date-time turns into a number such as 46339.60417; text stays as
        it is.
      </p>

      <h2>Real Excel date-times: INT and MOD</h2>
      <ExcelNote />
      <ol>
        <li>
          Date: in B2, type <code>=INT(A2)</code>. INT drops the fraction, so only the day is left. Format B2 as a date (
          <strong>Home → Number Format → Short Date</strong>).
        </li>
        <li>
          Time: in C2, type <code>=MOD(A2, 1)</code>. MOD keeps only the fraction. Format C2 as a time (<strong>Home → Number Format → Time</strong>,
          or a custom format such as <code>hh:mm</code>).
        </li>
        <li>Fill both formulas down.</li>
      </ol>
      <p>
        Without the right format, the date column shows numbers such as 46339 and the time column decimals such as 0.60417; the values are right,
        only the display is wrong. If you need text instead, for example for a CSV file, use <code>=TEXT(A2, &quot;yyyy-mm-dd&quot;)</code> and{" "}
        <code>=TEXT(A2, &quot;hh:mm&quot;)</code>.
      </p>

      <h2>Date-times stored as text: Text to Columns</h2>
      <ol>
        <li>Insert two empty columns to the right, so nothing is overwritten.</li>
        <li>
          Select the column and go to <strong>Data → Text to Columns</strong>, choose <strong>Delimited</strong> and tick <strong>Space</strong>.
        </li>
        <li>
          On the last step, set each new column&apos;s format. Choose <strong>Text</strong> to keep the values exactly as written, or a date format
          that matches the order in your data (DMY for 13/11/2026, YMD for 2026-11-13).
        </li>
        <li>Click Finish.</li>
      </ol>
      <p>
        Watch out for a time with AM or PM: “13/11/2026 2:30 PM” has two spaces, so Text to Columns makes three columns (13/11/2026, 2:30, PM). Join
        the last two again, or use a formula: in Excel for Microsoft 365, <code>=TEXTBEFORE(A2, &quot; &quot;)</code> gives the date and{" "}
        <code>=TEXTAFTER(A2, &quot; &quot;)</code> the rest, “2:30 PM”.
      </p>

      <h2>In Google Sheets</h2>
      <p>
        For real date-times, <code>=INT(A2)</code> and <code>=MOD(A2, 1)</code> work as in Excel; format them with <strong>Format → Number → Date</strong>{" "}
        and <strong>Time</strong>. For text, <code>=SPLIT(A2, &quot; &quot;)</code> splits at every space, and{" "}
        <code>=REGEXEXTRACT(A2, &quot;^\S+&quot;)</code> returns everything before the first space.
      </p>

      <h2>Split date and time with MyDataFixer</h2>
      <p>
        <Link href="/split-column">Split a Column</Link> splits text, so it suits date-times stored as text, such as those in CSV and TSV exports. It
        works in your browser on a computer, tablet or phone, and the file is never uploaded.
      </p>
      <ol>
        <li>Choose your CSV, TSV, TXT or Excel file, and the date-time column.</li>
        <li>
          Under <strong>Split at</strong>, choose <strong>Space</strong>.
        </li>
        <li>
          Under <strong>How many times</strong>, choose <strong>At the first separator only (2 parts)</strong>. The date goes into the first new
          column and everything after the first space, including “PM”, into the second.
        </li>
        <li>Check the preview, click Apply, and download the changed file (a CSV file as CSV, an Excel file as Excel or CSV).</li>
      </ol>
      <p>
        The values are split exactly as written: “13/11/2026” stays “13/11/2026”, and nothing is reinterpreted as a different date. Cells in an Excel
        file that hold a real date-time are numbers, not text, so they are copied into the first new column unchanged; use INT and MOD for those, as
        described above. To make the dates consistent afterwards, see <Link href="/guides/fix-dates-in-spreadsheets">how to fix dates</Link>.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Omar exports 40,000 support tickets as a CSV file with a “created” column like “2026-11-13 14:30:05”. He wants a chart of tickets per day and
        another per hour. In Split a Column he splits “created” at the first space, then downloads the file. In Excel, a pivot table on the new date
        column counts tickets per day, and the first two characters of the time column, <code>=LEFT(C2, 2)</code>, give the hour.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Splitting a real date as if it were text.</strong> Text to Columns on real date-times splits the displayed text, and can lose
          seconds that aren&apos;t shown. Use INT and MOD.
        </li>
        <li>
          <strong>Letting Excel guess the date order.</strong> 03/04/2026 can be 3 April or March 4. Keep the values as text, or choose the order
          explicitly.
        </li>
        <li>
          <strong>Forgetting the time zone.</strong> Splitting doesn&apos;t change it; if the export is in UTC, the times stay in UTC.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        For real Excel date-times, =INT(A2) gives the date and =MOD(A2, 1) the time; format both cells. For date-times stored as text, split at the
        first space with Text to Columns, TEXTBEFORE and TEXTAFTER, or MyDataFixer&apos;s Split a Column, which keeps the values exactly as written and
        runs in your browser.
      </p>
    </>
  ),
  faqs: [
    {
      q: "What is the formula to get the date from a date-time in Excel?",
      a: "=INT(A2), formatted as a date. For the time, =MOD(A2, 1), formatted as a time.",
    },
    {
      q: "Why does my date column show numbers like 46339?",
      a: "Excel stores dates as numbers of days. The value is right; format the cell as a date to see it as one.",
    },
    {
      q: "How do I split a date-time that has AM or PM?",
      a: "Split at the first space only, so the date goes in one column and “2:30 PM” in the other. In Excel for Microsoft 365, use TEXTBEFORE and TEXTAFTER with a space.",
    },
    {
      q: "Can MyDataFixer split real Excel date-time cells?",
      a: "No. Split a Column splits text, such as date-times in CSV exports; real Excel date-time cells are numbers and are copied unchanged. Use INT and MOD for those.",
    },
    {
      q: "Can I do this on my phone?",
      a: "Yes, for text date-times. MyDataFixer's Split a Column works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is read and changed in your browser, on your device, and the original file isn't changed.",
    },
  ],
};
