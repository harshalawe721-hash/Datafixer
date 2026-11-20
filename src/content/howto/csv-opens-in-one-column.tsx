import Link from "next/link";
import { ExampleTable, FileLines } from "@/components/guides/ExampleTable";
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
      A CSV file is plain text in which the values on each line are separated by a character, usually a comma, but in many countries a semicolon,
      and sometimes a tab. When you double-click a CSV, Excel splits each line using the <strong>list separator</strong> set in your
      computer&apos;s regional settings. If the file uses a different character, Excel can&apos;t find it and puts each whole line into column A.
      Your data isn&apos;t damaged: it only needs to be opened with the right separator.
    </p>
  ),
  body: (
    <>
      <h2>Why it happens</h2>
      <ul>
        <li>
          <strong>Regional settings.</strong> In countries that write decimals with a comma (3,5 instead of 3.5), such as Germany, France,
          Italy, Spain and Brazil, Windows usually uses a semicolon as the list separator. A comma-separated file from a US system then opens in
          one column there, and a semicolon-separated file from Europe opens in one column on computers set up for the US, UK or India, which
          expect commas.
        </li>
        <li>
          <strong>Tabs or pipes in a file called .csv.</strong> Some programs export tab-separated or pipe-separated (|) text but still name the
          file .csv.
        </li>
        <li>
          <strong>Whole lines in quotes.</strong> Some exports wrap every line in quotation marks, for example <code>&quot;1001,Asha,Pune&quot;</code>.
          The quotes tell every spreadsheet program that the commas belong to the value, so the whole line stays in one cell.
        </li>
      </ul>

      <h2>Example</h2>
      <p>This file was exported on a computer in Germany. It uses semicolons between values and a comma as the decimal mark:</p>
      <FileLines caption="sales.csv as plain text" lines={["id;name;city;amount", "1001;Asha Patil;Pune;1250,50", "1002;Ben Müller;Berlin;980,00"]} />
      <p>Double-clicked on a computer that expects commas, Excel finds no commas outside the amounts and shows:</p>
      <ExampleTable
        caption="What Excel shows: everything in column A, cut at the decimal comma (Excel turns “00” into 0)"
        headers={["A", "B"]}
        rows={[
          ["id;name;city;amount", ""],
          ["1001;Asha Patil;Pune;1250", "50"],
          ["1002;Ben Müller;Berlin;980", "0"],
        ]}
      />
      <p>Opened with the semicolon as separator, it shows four proper columns:</p>
      <ExampleTable
        caption="What it should look like"
        headers={["id", "name", "city", "amount"]}
        rows={[
          ["1001", "Asha Patil", "Pune", "1250,50"],
          ["1002", "Ben Müller", "Berlin", "980,00"],
        ]}
      />

      <h2>How to fix it in Excel</h2>
      <h3>Method 1: import the file with the right separator (recommended)</h3>
      <p>This doesn&apos;t change the file, and it works in Excel for Microsoft 365 and Excel 2016 or later.</p>
      <ol>
        <li>Open a blank workbook.</li>
        <li>
          Go to <strong>Data</strong> → <strong>From Text/CSV</strong> and choose the file.
        </li>
        <li>
          In the preview, set <strong>Delimiter</strong> to the character your file uses (Semicolon, Comma, Tab, or Custom for a pipe). Excel
          often detects it correctly here, even when double-clicking failed.
        </li>
        <li>
          If the file has codes with leading zeros, such as 00123, set <strong>Data Type Detection</strong> to <em>Do not detect data types</em>{" "}
          so they stay exactly as written.
        </li>
        <li>
          Click <strong>Load</strong>.
        </li>
      </ol>
      <h3>Method 2: split column A with Text to Columns</h3>
      <p>Use this when the file is already open with everything in column A.</p>
      <ol>
        <li>Select column A.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Text to Columns</strong>, choose <strong>Delimited</strong> and click <strong>Next</strong>.
        </li>
        <li>Tick the separator your file uses (for example Semicolon) and untick the others. The preview shows the columns.</li>
        <li>
          Optionally, select a column in the preview and choose <strong>Text</strong> to keep codes and leading zeros unchanged, then click{" "}
          <strong>Finish</strong>.
        </li>
      </ol>
      <h3>Method 3: change the list separator in Windows (last resort)</h3>
      <p>
        The list separator is set in Windows under <strong>Region</strong> settings → <strong>Additional settings</strong>. Changing it affects
        every program on the computer, including how formulas are typed in Excel, so only do this if you always work with files that use the other
        separator.
      </p>

      <h2>How to fix it in Google Sheets</h2>
      <ol>
        <li>
          Go to <strong>File</strong> → <strong>Import</strong> → <strong>Upload</strong> and choose the file.
        </li>
        <li>
          Under <strong>Separator type</strong>, keep <em>Detect automatically</em> or pick Comma, Semicolon, Tab or Custom.
        </li>
        <li>
          To keep codes with leading zeros, untick <strong>Convert text to numbers, dates and formulas</strong>, then click{" "}
          <strong>Import data</strong>.
        </li>
      </ol>
      <p>
        If the data is already in one column, select it and use <strong>Data</strong> → <strong>Split text to columns</strong>, then choose the
        separator.
      </p>

      <h2>How to fix it with MyDataFixer</h2>
      <p>Both tools run in your browser. The file is read on your device and is never uploaded.</p>
      <ul>
        <li>
          <Link href="/csv-to-excel">CSV to Excel</Link> detects the separator (comma, semicolon, tab or pipe), and you can change it if it was
          read wrongly. It creates an .xlsx workbook with the columns already split, so it opens correctly in Excel on any computer, whatever its
          regional settings. Codes with leading zeros, numbers longer than 15 digits and dates that could be read two ways stay as text, exactly
          as written. Numbers written with a decimal comma, like 1250,50, also stay as text, because they could mean different things.
        </li>
        <li>
          <Link href="/csv-validator">CSV Validator</Link> shows which separator the file uses and checks that every row has the same number of
          fields. You can download a copy with a comma, semicolon or tab as separator, and choose UTF-8 with BOM so Excel shows accented letters
          correctly.
        </li>
      </ul>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Replacing every semicolon with a comma in a text editor.</strong> Values that contain commas, such as addresses or decimal
          commas, then get split into extra columns. Use one of the methods above instead.
        </li>
        <li>
          <strong>Saving over the original from Excel.</strong> When Excel saves a CSV, it may use your computer&apos;s separator and change how
          dates and numbers are written. Keep the original and save under a new name.
        </li>
        <li>
          <strong>Assuming every program accepts semicolons.</strong> Many online shops, CRMs and databases expect commas. Check what the program
          you import into needs, and download a copy with that separator.
        </li>
      </ul>
    </>
  ),
  faqs: [
    {
      q: "Is my data lost when a CSV opens in one column?",
      a: "No. The file is unchanged; Excel only displayed it with the wrong separator. Close it without saving and open it again with one of the methods in this guide.",
    },
    {
      q: "Why does the same file open correctly on a colleague's computer?",
      a: "Their computer probably uses a different list separator in its regional settings. Excel uses that setting when a CSV is double-clicked.",
    },
    {
      q: "Which separator should I use for my CSV files?",
      a: "Use whatever the program you send the file to expects. Commas are the most widely accepted; semicolons are common when the file is opened in Excel in countries that use a decimal comma.",
    },
    {
      q: "Can I make Excel open my CSV correctly every time?",
      a: "Import it with Data → From Text/CSV, or convert it to an Excel workbook (.xlsx) once. A workbook stores the columns, so the separator no longer matters.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. MyDataFixer reads and converts the file in your browser, on your device. The contents of your file are not sent to any server.",
    },
  ],
};
