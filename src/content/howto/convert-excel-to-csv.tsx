import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const convertExcelToCsv: HowToGuide = {
  slug: "convert-excel-to-csv",
  title: "How to convert Excel to CSV without losing data",
  seoTitle: "How to Convert Excel to CSV Without Losing Data",
  description:
    "Convert an Excel file to CSV the right way: keep special characters, save every sheet and avoid surprises with dates and formulas. Free and simple.",
  summary: "Save an Excel sheet as CSV while keeping special characters, all your sheets and the right values.",
  updated: "2026-11-20",
  tools: ["excel-to-csv"],
  related: ["csv-encoding-strange-characters", "keep-leading-zeros-in-csv", "check-csv-before-import"],
  quickAnswer: (
    <p>
      In Excel, use <strong>File → Save As → CSV UTF-8 (Comma delimited)</strong>. A CSV file keeps only one sheet and only values, so formulas,
      formatting and the other sheets are not saved. Choose UTF-8 so letters like é and symbols like € stay correct.
    </p>
  ),
  body: (
    <>
      <h2>Why convert to CSV at all?</h2>
      <p>
        Many programs can&apos;t read Excel files but can read CSV: online shops, email tools, accounting software, CRMs, databases and most
        upload forms. CSV is plain text, so almost every program understands it. That is why “please send it as CSV” is such a common request.
      </p>

      <h2>What a CSV file can&apos;t keep</h2>
      <p>Before you convert, know what will be lost. A CSV file holds only the values of one table:</p>
      <ul>
        <li>
          <strong>Only one sheet.</strong> A workbook with three sheets needs three CSV files.
        </li>
        <li>
          <strong>No formulas.</strong> Each formula is replaced by its result. =A2*B2 becomes, for example, 250.
        </li>
        <li>
          <strong>No formatting.</strong> Colours, bold text, column widths, borders and merged cells are gone.
        </li>
        <li>
          <strong>No charts, images or comments.</strong>
        </li>
        <li>
          <strong>Hidden rows and columns are included.</strong> A CSV can&apos;t hide anything, so hidden data appears in the file.
        </li>
      </ul>
      <p>Keep your Excel file as the master copy, and make the CSV only for sending or importing.</p>

      <h2>Example</h2>
      <ExampleTable
        caption="The same cell in Excel and in the CSV file"
        headers={["In Excel", "In the CSV file"]}
        rows={[
          ["=B2*C2 (shows 250)", "250"],
          ["$1,250.00 (formatted)", "$1,250.00 or 1250, depending on how it's saved"],
          ["15/03/2024 (a date)", "15/03/2024 or 2024-03-15"],
          ["Bold, red text", "plain text"],
        ]}
      />

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <ol>
        <li>Open the workbook and click the sheet you want to save.</li>
        <li>
          Go to <strong>File</strong> → <strong>Save As</strong> (or <strong>Save a Copy</strong>).
        </li>
        <li>
          In the file type list, choose <strong>CSV UTF-8 (Comma delimited) (*.csv)</strong>. Plain “CSV (Comma delimited)” can turn special
          characters into question marks.
        </li>
        <li>Give the file a new name, so the Excel original stays untouched, and click Save.</li>
        <li>Excel warns that only the active sheet is saved. Click OK. Repeat for every other sheet you need.</li>
      </ol>
      <p>
        Excel writes numbers and dates the way they are shown on screen. If a column shows 1,250.00, the CSV gets 1,250.00 too. Some programs
        can&apos;t read that, so check what the program you import into expects.
      </p>

      <h2>Fix it in Google Sheets</h2>
      <ol>
        <li>Open the file in Google Sheets (an Excel file can be opened from Google Drive).</li>
        <li>Click the sheet tab you want to save.</li>
        <li>
          Go to <strong>File</strong> → <strong>Download</strong> → <strong>Comma-separated values (.csv)</strong>.
        </li>
      </ol>
      <p>Only the current sheet is downloaded. Google Sheets always saves CSV files as UTF-8.</p>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open your workbook (.xlsx or the older .xls) in <Link href="/excel-to-csv">Excel to CSV</Link>. It works in your browser, also on phones
        and tablets, and your workbook never leaves your device. You can choose:
      </p>
      <ul>
        <li>
          <strong>Which sheets:</strong> download one sheet, or every sheet at once as a ZIP file with one CSV per sheet. Hidden sheets are
          marked so you know what you are saving.
        </li>
        <li>
          <strong>How values are written:</strong> <em>As shown in Excel</em> (dates and numbers formatted as you see them) or{" "}
          <em>Plain values</em> (dates as 2024-03-15, numbers without thousands separators or currency, TRUE and FALSE as words). Plain values are
          best for databases and imports.
        </li>
        <li>
          <strong>The separator:</strong> comma, semicolon or tab.
        </li>
        <li>
          <strong>The encoding:</strong> UTF-8 with BOM (helps Excel show special characters) or without BOM (what most databases expect).
        </li>
      </ul>
      <p>
        Before the download is offered, the new file is read back and every cell is compared with the workbook, so nothing is lost or changed
        by mistake. A summary lists what the CSV can&apos;t keep, such as formulas or formatting.
      </p>

      <h2>Checklist before you send a CSV</h2>
      <ul>
        <li>Does the program need commas or semicolons?</li>
        <li>Does it need dates in a special style, such as 2024-03-15?</li>
        <li>Do codes like 00123 still have their zeros? (Open the CSV in a text editor to check.)</li>
        <li>Are hidden rows or test data included by mistake?</li>
      </ul>

      <h2>How to make CSV exports easier next time</h2>
      <ul>
        <li>
          <strong>Keep one table per sheet.</strong> No titles, notes or totals above or below the data: the CSV should start with the column
          names on the first line.
        </li>
        <li>
          <strong>Use clear column names</strong> without line breaks, and don&apos;t repeat the same name twice.
        </li>
        <li>
          <strong>Write dates as year-month-day</strong> if the CSV is for a database or another country.
        </li>
        <li>
          <strong>Ask the receiver</strong> which separator, encoding and date style they need, and save a note of it for next time.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Save as CSV UTF-8 in Excel, or download as CSV in Google Sheets, one sheet at a time. A CSV keeps only values. MyDataFixer&apos;s Excel to
        CSV can save every sheet at once, write plain values for databases, and checks every cell before you download.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Choosing the wrong CSV type in Excel.</strong> Use CSV UTF-8 to keep letters like ü and symbols like €.
        </li>
        <li>
          <strong>Saving over the Excel file.</strong> Always save the CSV under a new name.
        </li>
        <li>
          <strong>Forgetting other sheets.</strong> Only the active sheet is saved by Excel and Google Sheets.
        </li>
      </ul>
    </>
  ),
  faqs: [
    {
      q: "Why do special characters look wrong in my CSV?",
      a: "The file wasn't saved as UTF-8. In Excel choose “CSV UTF-8”. MyDataFixer always saves CSV files as UTF-8.",
    },
    {
      q: "Can I save all sheets at once?",
      a: "Not with Excel's Save As. MyDataFixer's Excel to CSV can download every sheet as a ZIP file with one CSV per sheet.",
    },
    {
      q: "Are my formulas kept?",
      a: "No. A CSV file can't hold formulas, so it gets the result each formula showed in Excel.",
    },
    {
      q: "Can I convert an old .xls file?",
      a: "Yes. Excel and MyDataFixer both convert old .xls workbooks to CSV.",
    },
    {
      q: "Which should I choose: “As shown in Excel” or “Plain values”?",
      a: "Choose “As shown in Excel” when people will read the file. Choose “Plain values” for databases, scripts and imports: dates are written as 2024-03-15 and numbers without commas or currency signs, which programs read reliably.",
    },
    {
      q: "Why does my CSV show strange characters when I open it in Excel?",
      a: "Excel may not recognise UTF-8 when you double-click a CSV. Save it as UTF-8 with BOM (MyDataFixer offers this), or open it with Data → From Text/CSV.",
    },
    {
      q: "What happens to hidden rows and columns?",
      a: "They are included in the CSV, because a CSV file can't hide anything. MyDataFixer's summary lists them so you can delete them first if they shouldn't be shared.",
    },
    {
      q: "Does MyDataFixer upload my workbook?",
      a: "No. The workbook is converted in your browser, on your device.",
    },
  ],
};
