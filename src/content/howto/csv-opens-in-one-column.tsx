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
      A CSV file is plain text. On each line, the values are separated by a character: usually a comma, sometimes a semicolon or a tab. When you
      double-click a CSV, Excel splits each line using the separator your computer is set up for. If the file uses a different one, Excel can&apos;t
      split the lines and puts everything into column A. Your data is not damaged. You only need to open the file with the right separator.
    </p>
  ),
  body: (
    <>
      <h2>What a CSV file really is</h2>
      <p>
        CSV means “comma-separated values”. It is one of the simplest ways to store a table. There are no colours, no formulas and no sheets: just
        lines of text. Each line is one row, and a special character marks where one value ends and the next begins. You can open a CSV in Notepad
        and read it like a normal text file.
      </p>
      <p>
        The problem is that the file itself doesn&apos;t say which separator it uses. Excel has to guess, and when you double-click the file, it
        simply uses the separator from your computer&apos;s settings. If the guess is wrong, every line stays in one piece.
      </p>

      <h2>Why it happens</h2>
      <ul>
        <li>
          <strong>Different country settings.</strong> In countries that write decimals with a comma (3,5 instead of 3.5), such as Germany,
          France, Italy, Spain and Brazil, computers usually expect a semicolon between values. Computers set up for India, the US or the UK expect
          a comma. So a file made in Germany often opens in one column in India, and the other way round.
        </li>
        <li>
          <strong>Tabs or pipes in a .csv file.</strong> Some programs save values separated by tabs or by the pipe sign (|) but still name the
          file .csv.
        </li>
        <li>
          <strong>Whole lines in quotes.</strong> Some exports put quotation marks around every line, for example{" "}
          <code>&quot;1001,Asha,Pune&quot;</code>. The quotes tell Excel that the commas are part of the value, so the whole line stays in one
          cell.
        </li>
      </ul>

      <h2>Example</h2>
      <p>This file was saved on a computer in Germany. It uses semicolons between values:</p>
      <FileLines caption="sales.csv as plain text" lines={["id;name;city", "1001;Asha Patil;Pune", "1002;Ben Müller;Berlin"]} />
      <p>Double-clicked on a computer that expects commas, Excel finds no commas, so each line stays in column A:</p>
      <ExampleTable caption="What Excel shows" headers={["A"]} rows={[["id;name;city"], ["1001;Asha Patil;Pune"], ["1002;Ben Müller;Berlin"]]} />
      <p>Opened with the semicolon as the separator, the same file shows three proper columns:</p>
      <ExampleTable caption="What it should look like" headers={["id", "name", "city"]} rows={[["1001", "Asha Patil", "Pune"], ["1002", "Ben Müller", "Berlin"]]} />

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <h3>Method 1: split column A (quickest)</h3>
      <p>Use this when the file is already open with everything in column A.</p>
      <ol>
        <li>Click the letter A at the top to select the whole column.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Text to Columns</strong>.
        </li>
        <li>
          Choose <strong>Delimited</strong> and click <strong>Next</strong>.
        </li>
        <li>
          Tick the separator your file uses, for example <strong>Semicolon</strong>, and untick the others. The preview at the bottom shows the
          columns.
        </li>
        <li>
          Click <strong>Finish</strong>.
        </li>
      </ol>
      <h3>Method 2: import the file (best for codes and leading zeros)</h3>
      <ol>
        <li>Open a new, empty workbook.</li>
        <li>
          Go to <strong>Data</strong> → <strong>From Text/CSV</strong> and choose your file.
        </li>
        <li>
          In the window that opens, set <strong>Delimiter</strong> to the right separator. Excel often finds it by itself here.
        </li>
        <li>
          If your file has codes such as 00123, set <strong>Data Type Detection</strong> to <em>Do not detect data types</em> so they stay
          exactly as written.
        </li>
        <li>
          Click <strong>Load</strong>.
        </li>
      </ol>

      <h2>Fix it in Google Sheets</h2>
      <ol>
        <li>Open a new spreadsheet.</li>
        <li>
          Go to <strong>File</strong> → <strong>Import</strong> → <strong>Upload</strong> and choose the file.
        </li>
        <li>
          Under <strong>Separator type</strong>, keep <em>Detect automatically</em> or pick Comma, Semicolon, Tab or Custom.
        </li>
        <li>
          Click <strong>Import data</strong>.
        </li>
      </ol>
      <p>
        If the data is already in one column, select it and use <strong>Data</strong> → <strong>Split text to columns</strong>, then choose the
        separator from the small box that appears.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>MyDataFixer works in your browser, also on a phone or tablet. Your file is read on your device and is never uploaded.</p>
      <ul>
        <li>
          <Link href="/csv-to-excel">CSV to Excel</Link> finds the separator by itself (comma, semicolon, tab or pipe), and you can change it if
          needed. It makes an Excel file with the columns already split. An Excel file remembers its columns, so it opens correctly on every
          computer, whatever its settings. Codes with leading zeros stay as they are.
        </li>
        <li>
          <Link href="/csv-validator">CSV Validator</Link> shows which separator the file uses and checks that every row has the same number of
          values. You can download a copy with a comma, semicolon or tab, whichever the next program needs.
        </li>
      </ul>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Replacing all semicolons with commas.</strong> If a value already contains a comma, like an address or a price such as 12,50,
          it gets split into two columns. Use one of the methods above instead.
        </li>
        <li>
          <strong>Saving over the original.</strong> When Excel saves a CSV, it can change the separator and the way dates and numbers are
          written. Keep the original file and save your work under a new name.
        </li>
        <li>
          <strong>Thinking the data is broken.</strong> Nothing is lost. Close the file without saving and open it again the right way.
        </li>
      </ul>

      <h2>How to avoid it next time</h2>
      <ul>
        <li>Ask the sender which separator they use, or ask for an Excel file (.xlsx) instead of a CSV.</li>
        <li>When you send a CSV to someone in another country, tell them the separator, or send an Excel file.</li>
        <li>Open CSV files with Data → From Text/CSV instead of double-clicking them.</li>
      </ul>
    </>
  ),
  faqs: [
    {
      q: "Is my data lost when a CSV opens in one column?",
      a: "No. The file is unchanged; Excel only used the wrong separator. Close it without saving and open it again with one of the methods above.",
    },
    {
      q: "Why does the same file open fine on another computer?",
      a: "That computer expects a different separator because of its country settings. Excel uses that setting when a CSV is double-clicked.",
    },
    {
      q: "Which separator should I use for my own CSV files?",
      a: "Use whatever the program you send the file to expects. Commas are the most widely accepted. Semicolons are common in countries that write decimals with a comma.",
    },
    {
      q: "Can I fix this on my phone?",
      a: "The Excel app on phones doesn't have Text to Columns. Use Google Sheets in a browser, or open the file in MyDataFixer's CSV to Excel, which works on phones and tablets.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is read and converted in your browser, on your device. Its contents are not sent to any server.",
    },
  ],
};
