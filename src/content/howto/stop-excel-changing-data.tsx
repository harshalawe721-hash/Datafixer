import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const stopExcelChangingData: HowToGuide = {
  slug: "stop-excel-changing-data",
  title: "How to stop Excel from changing your data when it opens a CSV",
  seoTitle: "Stop Excel Changing Numbers and Dates in a CSV",
  description:
    "Excel turns 1-2 into a date, 00123 into 123 and long numbers into 1.23E+15. Learn why it happens and how to open CSV files without Excel changing them.",
  summary: "Excel guesses what each value is and sometimes guesses wrong: dates, zeros and long numbers change. Here's how to stop it.",
  updated: "2026-11-24",
  tools: ["csv-to-excel"],
  related: ["keep-leading-zeros-in-csv", "fix-dates-in-spreadsheets", "csv-vs-excel"],
  quickAnswer: (
    <p>
      When you double-click a CSV, Excel looks at every value and converts what it thinks are numbers and dates. That&apos;s how 1-2 becomes 2
      January, 00123 becomes 123 and a 16-digit ID becomes 1.23457E+15. Your CSV file is unchanged until you save it. To avoid this, open the
      file with <strong>Data → From Text/CSV</strong> and keep the columns as text, or convert it to an Excel file carefully first.
    </p>
  ),
  body: (
    <>
      <h2>What Excel changes</h2>
      <ExampleTable
        caption="Typical changes when a CSV is double-clicked in Excel"
        headers={["In the CSV", "Excel shows", "What happened"]}
        rows={[
          ["1-2", "2-Jan", "read as a date"],
          ["3/4", "4-Mar or 3-Apr", "read as a date (order depends on your country settings)"],
          ["00123", "123", "leading zeros removed"],
          ["1234567890123456", "1.23457E+15", "long number rounded to 15 digits and shown in scientific notation"],
          ["1E5", "1.00E+05", "read as 1 × 10⁵"],
          ["MARCH1", "1-Mar", "a code that looks like a date (a well-known problem with gene names)"],
        ]}
      />
      <p>
        Once you save the file from Excel, the changed values are written into it and the original values are gone. That&apos;s the real danger:
        open, save, and your product codes or IDs are permanently wrong.
      </p>

      <h2>Why it happens</h2>
      <p>
        A CSV file is plain text, so it can&apos;t say “this column is a code”. Excel tries to be helpful and converts everything that looks like a
        number or a date. For amounts that&apos;s useful; for codes, IDs, part numbers, phone numbers and PIN codes it&apos;s harmful, because those
        only look like numbers.
      </p>

      <h2>Fix it in Excel: open the file the safe way</h2>
      <ExcelNote />
      <ol>
        <li>Open a new, empty workbook.</li>
        <li>
          Go to <strong>Data</strong> → <strong>From Text/CSV</strong> and choose the file.
        </li>
        <li>
          Set <strong>Data Type Detection</strong> to <em>Do not detect data types</em> to keep every value as text, or click{" "}
          <strong>Transform Data</strong> and set only the code columns to <strong>Text</strong>.
        </li>
        <li>
          Click <strong>Load</strong> (or <strong>Close &amp; Load</strong>).
        </li>
      </ol>
      <p>
        Recent versions of Excel for Microsoft 365 also have settings under <strong>File</strong> → <strong>Options</strong> →{" "}
        <strong>Data</strong> → <strong>Automatic Data Conversion</strong>, where you can turn off removing leading zeros, converting long numbers
        and converting text to dates. These settings apply to everything you open, so check your version has them before relying on them.
      </p>

      <h2>Fix it in Google Sheets</h2>
      <p>
        Use <strong>File</strong> → <strong>Import</strong> and untick <strong>Convert text to numbers, dates and formulas</strong>. Every value
        is then imported exactly as written.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        <Link href="/csv-to-excel">CSV to Excel</Link> converts a CSV into an Excel file and decides carefully, value by value, what becomes a
        number or a date:
      </p>
      <ul>
        <li>Plain numbers (500, 12.50) become real numbers you can add up.</li>
        <li>Only dates written year-month-day (2024-03-15) become real dates.</li>
        <li>
          Everything else stays text, exactly as written: codes with leading zeros (00123), numbers longer than 15 digits, values like 1-2, 3/4 or
          1E5, numbers with commas or percent signs, and dates that could be read two ways.
        </li>
        <li>Values that start like formulas (=, +, -, @) stay text and are never run.</li>
      </ul>
      <p>
        Because the result is an Excel file, Excel doesn&apos;t guess again when you open it. The summary tells you how many values became
        numbers, dates and text, and why some were kept as text. The new workbook is checked cell by cell before it&apos;s downloaded, and your
        file never leaves your device.
      </p>

      <h2>What to do if Excel already changed your data</h2>
      <ul>
        <li>
          <strong>If you haven&apos;t saved:</strong> close without saving and open the original again the safe way.
        </li>
        <li>
          <strong>If you saved over the CSV:</strong> the original values are gone from that file. Get the original again from where it came
          from (the export, the email, the download).
        </li>
        <li>
          <strong>Dates that should be text</strong> can&apos;t always be turned back, because 2-Jan doesn&apos;t say whether it was 1-2 or 1/2.
        </li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Ritika manages spare parts with codes like 0042-7 and 3-12. Every time she opened the supplier&apos;s CSV in Excel, some codes turned into
        dates, and she once sent a wrong order because 3-12 had turned into a date. Now she opens each new file in CSV to Excel. The summary shows that
        the part codes were kept as text and the prices became numbers, and the downloaded workbook opens in Excel with every code exactly as the
        supplier wrote it.
      </p>

      <h2>How to avoid it next time</h2>
      <ul>
        <li>Never double-click a CSV that contains codes, IDs or phone numbers.</li>
        <li>Ask senders for an Excel file, or convert CSV files before opening them.</li>
        <li>Never save over an original CSV from Excel; save your work as a new file.</li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Excel converts anything that looks like a number or date when it opens a CSV, which damages codes and IDs once you save. Open CSV files
        with From Text/CSV (or Import in Google Sheets) and keep codes as text, or convert them with CSV to Excel, which only converts values that
        are safe to convert.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Why does Excel change 1-2 into a date?",
      a: "Excel reads values that look like dates as dates when it opens a CSV. Open the file with Data → From Text/CSV and set the column to Text.",
    },
    {
      q: "Why do my long numbers end in zeros?",
      a: "Excel stores only 15 digits of a number. Longer IDs and card numbers lose their last digits. Keep such columns as text.",
    },
    {
      q: "Is my CSV file damaged?",
      a: "Not unless you saved it from Excel. The file still has the original values; only what Excel shows is different.",
    },
    {
      q: "Does CSV to Excel change any values?",
      a: "Only plain numbers and year-month-day dates are turned into real numbers and dates. Everything else stays text, exactly as written.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is converted in your browser, on your device.",
    },
  ],
};
