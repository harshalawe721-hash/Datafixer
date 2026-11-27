import Link from "next/link";
import { ExampleTable, FileLines } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const convertTsvToCsv: HowToGuide = {
  slug: "convert-tsv-to-csv",
  title: "How to convert a TSV file to CSV (and open TSV files in Excel)",
  seoTitle: "How to Convert TSV to CSV and Open TSV Files in Excel",
  description:
    "A TSV file separates values with tabs instead of commas. How to open it in Excel or Google Sheets, convert it to CSV safely, or convert it free in your browser.",
  summary: "Got a .tsv or tab-separated .txt file? Here's how to open it properly and turn it into a CSV.",
  updated: "2026-11-27",
  tools: ["tsv-to-csv"],
  related: ["csv-opens-in-one-column", "change-csv-separator", "keep-leading-zeros-in-csv", "csv-encoding-strange-characters"],
  quickAnswer: (
    <p>
      A TSV file is like a CSV file, but the values are separated by <strong>tabs</strong> instead of commas. To convert it, open it in Excel with{" "}
      <strong>Data → From Text/CSV</strong> (choose <em>Tab</em> as the delimiter) and save it as <strong>CSV UTF-8</strong>, or import it into
      Google Sheets and download it as CSV. The quickest way is MyDataFixer&apos;s free <strong>TSV to CSV</strong> converter, which runs in your
      browser and keeps every value exactly as written.
    </p>
  ),
  body: (
    <>
      <h2>What a TSV file is</h2>
      <p>
        TSV means “tab-separated values”. Each line is one row, and a tab marks where one value ends and the next begins. Databases, analytics tools,
        research software and Google Sheets (<strong>File → Download → Tab-separated values</strong>) all produce TSV files. Some name them .tsv, some
        .tab, and many just use .txt.
      </p>
      <FileLines caption="customers.tsv as plain text (⇥ shows a tab)" lines={["id⇥name⇥city", "00123⇥Patil, Asha⇥Pune", "00124⇥Ben⇥Rome"]} />
      <p>
        TSV has one advantage: commas inside values, like “Patil, Asha”, cause no trouble, because the separator is a tab. That&apos;s why many
        systems prefer it for export. But many programs, online forms and import tools only accept CSV.
      </p>

      <h2>What changes when it becomes CSV</h2>
      <ExampleTable
        caption="The same rows in each format"
        headers={["TSV", "CSV"]}
        rows={[
          ["00123⇥Patil, Asha⇥Pune", '00123,"Patil, Asha",Pune'],
          ["00124⇥Ben⇥Rome", "00124,Ben,Rome"],
        ]}
      />
      <p>
        The tabs become commas. A value that contains a comma is put in double quotes, so it stays in one cell. A value that contains a double quote
        gets the quote doubled (<code>says &quot;hi&quot;</code> becomes <code>&quot;says &quot;&quot;hi&quot;&quot;&quot;</code>). Everything else
        stays exactly the same.
      </p>

      <h2>Open and convert a TSV in Excel</h2>
      <ExcelNote />
      <p>
        Double-clicking a .tsv or .txt file may open it with everything in column A, because Excel doesn&apos;t always recognise tabs. Import it
        instead:
      </p>
      <ol>
        <li>Open a new, empty workbook.</li>
        <li>
          Go to <strong>Data</strong> → <strong>From Text/CSV</strong> and choose the file. (If you don&apos;t see a .tsv file, change the file type
          in the window to <em>All files</em>.)
        </li>
        <li>
          Set <strong>Delimiter</strong> to <strong>Tab</strong>. The preview shows the columns.
        </li>
        <li>
          If the file has codes such as 00123, set <strong>Data Type Detection</strong> to <em>Do not detect data types</em> so they keep their
          zeros.
        </li>
        <li>
          Click <strong>Load</strong>.
        </li>
        <li>
          To make a CSV, use <strong>File</strong> → <strong>Save As</strong> and choose <strong>CSV UTF-8 (Comma delimited)</strong>.
        </li>
      </ol>
      <p>
        One catch: on computers set up for countries that write decimals with a comma (3,5), Excel saves “CSV” with semicolons instead of commas.
        If the file is for a system that expects commas, check it in a text editor, or use a converter where you choose the separator.
      </p>

      <h2>Convert a TSV in Google Sheets</h2>
      <ol>
        <li>
          Go to <strong>File</strong> → <strong>Import</strong> → <strong>Upload</strong> and choose the file.
        </li>
        <li>
          Under <strong>Separator type</strong>, choose <strong>Tab</strong>, and untick <strong>Convert text to numbers, dates and formulas</strong>{" "}
          to keep codes as they are.
        </li>
        <li>
          Click <strong>Import data</strong>, then <strong>File</strong> → <strong>Download</strong> → <strong>Comma-separated values (.csv)</strong>.
        </li>
      </ol>

      <h2>Why not just replace tabs with commas?</h2>
      <p>
        In a text editor you could replace every tab with a comma, and for simple files it works. But any value that already contains a comma, like
        “Patil, Asha” or an address, is then split into two columns, and quotes inside values break the file. A proper converter adds the quotes CSV
        needs.
      </p>

      <h2>Convert TSV to CSV with MyDataFixer</h2>
      <p>
        Open the file in <Link href="/tsv-to-csv">TSV to CSV</Link>. It works in your browser, on a computer, tablet or phone, and your file is never
        uploaded.
      </p>
      <ol>
        <li>The separator (tabs) and the text encoding are found automatically; you can change them if the table looks wrong.</li>
        <li>
          A quick structure check shows whether every row has the same number of values. If not, “Check and repair in the CSV Validator” opens the
          same file there.
        </li>
        <li>
          Choose the separator for the new file: comma, or semicolon for Excel in countries that write decimals with a comma. Line endings and a
          UTF-8 marker (BOM) are under “More options”; the defaults suit Excel.
        </li>
        <li>Download the CSV, or an Excel workbook. Each file is read back and checked before it is offered.</li>
      </ol>
      <p>
        Codes keep their leading zeros, long numbers keep every digit, and values with commas or quotes are quoted correctly. To go the other way,
        open a CSV and choose <strong>Tab</strong>: you get a TSV file.
      </p>

      <h2>Common problems</h2>
      <ul>
        <li>
          <strong>Everything in one column.</strong> The tabs weren&apos;t recognised. Import the file with Tab as the delimiter, or convert it first.
        </li>
        <li>
          <strong>Codes lose their zeros.</strong> 00123 becomes 123 when Excel guesses it&apos;s a number. Turn off data type detection, or use a
          converter that keeps values as written.
        </li>
        <li>
          <strong>Strange characters such as Ã©.</strong> The file&apos;s text encoding was read wrongly. Choose UTF-8 when importing; MyDataFixer
          detects it and lets you change it.
        </li>
        <li>
          <strong>Rows with too many or too few values.</strong> Usually a value contained a tab or a line break. The CSV Validator shows which rows.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        A TSV file uses tabs between values. Import it into Excel with Data → From Text/CSV and Tab as the delimiter, or into Google Sheets with
        Separator type Tab, then save or download it as CSV. Don&apos;t just replace tabs with commas. MyDataFixer&apos;s TSV to CSV does it in one
        step, quotes values correctly, keeps codes and long numbers exactly, and can also make TSV from CSV.
      </p>
    </>
  ),
  faqs: [
    {
      q: "What is the difference between TSV and CSV?",
      a: "Only the separator: TSV uses tabs between values, CSV uses commas (or semicolons in some countries). TSV rarely needs quotes, because values seldom contain tabs.",
    },
    {
      q: "How do I open a TSV file in Excel?",
      a: "Use Data → From Text/CSV, choose the file and set Delimiter to Tab. Double-clicking it may put everything in one column.",
    },
    {
      q: "My TSV file is called .txt. Is that a problem?",
      a: "No. Many tools save tab-separated data with a .txt name. Import it the same way, or open it in MyDataFixer's TSV to CSV.",
    },
    {
      q: "How do I convert CSV to TSV?",
      a: "In Google Sheets, import the CSV and download it as Tab-separated values. In MyDataFixer's TSV to CSV, open the CSV and choose Tab as the separator.",
    },
    {
      q: "Can I convert TSV on my phone?",
      a: "The Excel phone app can't import with a chosen delimiter. MyDataFixer's TSV to CSV works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is read and converted in your browser, on your device.",
    },
  ],
};
