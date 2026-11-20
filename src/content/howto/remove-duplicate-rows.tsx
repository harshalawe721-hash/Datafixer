import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const removeDuplicateRows: HowToGuide = {
  slug: "remove-duplicate-rows",
  title: "How to find and remove duplicate rows in Excel and CSV files",
  seoTitle: "How to Remove Duplicate Rows in Excel and CSV",
  description:
    "Duplicate rows make totals wrong. Learn how to find and remove them in Excel, Google Sheets, or free in your browser with MyDataFixer.",
  summary: "Rows that appear twice make totals and counts wrong. Here's how to find them and keep just one copy.",
  updated: "2026-11-20",
  tools: ["spreadsheet-cleaner", "spreadsheet-error-detector"],
  related: ["remove-extra-spaces", "remove-empty-rows-and-columns", "fix-inconsistent-capitalization"],
  quickAnswer: (
    <p>
      A duplicate row is a row that is the same as another row in every column. In Excel, use <strong>Data → Remove Duplicates</strong>. In
      Google Sheets, use <strong>Data → Data cleanup → Remove duplicates</strong>. Both keep the first copy and delete the others. Always keep a
      copy of the original file before you remove anything.
    </p>
  ),
  body: (
    <>
      <h2>Why duplicate rows are a problem</h2>
      <p>
        One extra copy of a row may not look like much, but it changes every number that uses it. A sale counted twice makes your total too
        high. A customer listed twice gets two emails. A product listed twice can show the wrong stock. Charts, pivot tables and reports all
        include the extra rows without telling you.
      </p>

      <h2>Why duplicates happen</h2>
      <ul>
        <li>
          <strong>Copy and paste.</strong> The same block of data was pasted twice, often without noticing.
        </li>
        <li>
          <strong>Joining files.</strong> Two exports were combined, and some rows were in both, for example a January and a February report
          that both include 31 January.
        </li>
        <li>
          <strong>Forms and apps.</strong> Someone pressed “submit” twice, or an app saved the same record again after a connection problem.
        </li>
        <li>
          <strong>Imports run twice.</strong> A file was imported into a system, and then imported again.
        </li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="Row 4 is an exact copy of row 2"
        headers={["Row", "name", "email", "amount"]}
        rows={[
          ["2", "Asha Patil", "asha@example.com", "500"],
          ["3", "Ravi Kumar", "ravi@example.com", "300"],
          ["4", "Asha Patil", "asha@example.com", "500"],
        ]}
      />
      <p>
        The total of the amount column looks like 1,300, but the real total is 800. After removing row 4, the sheet has two customers and the
        right total.
      </p>

      <h2>Step 1: find the duplicates first</h2>
      <p>
        It&apos;s a good idea to look at the duplicates before you delete them. Sometimes two rows look the same but are both real, for example
        two separate orders of the same amount on the same day. If your sheet has an order number or ID column, rows with different IDs are
        usually not duplicates.
      </p>

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <h3>See the duplicates</h3>
      <ol>
        <li>Select the column you want to check, for example the email column.</li>
        <li>
          Go to <strong>Home</strong> → <strong>Conditional Formatting</strong> → <strong>Highlight Cells Rules</strong> →{" "}
          <strong>Duplicate Values</strong>.
        </li>
        <li>
          Click <strong>OK</strong>. Every value that appears more than once is coloured.
        </li>
      </ol>
      <h3>Remove the duplicate rows</h3>
      <ol>
        <li>Save a copy of your file.</li>
        <li>Click any cell inside your data.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Remove Duplicates</strong>.
        </li>
        <li>
          Tick <strong>My data has headers</strong> if the first row holds column names.
        </li>
        <li>
          Keep <strong>all columns ticked</strong>. Then only rows that match in every column are removed.
        </li>
        <li>
          Click <strong>OK</strong>. Excel tells you how many duplicate rows it removed and how many unique rows are left.
        </li>
      </ol>

      <h2>Fix it in Google Sheets</h2>
      <ol>
        <li>Make a copy of the sheet (right-click the sheet tab → Duplicate).</li>
        <li>Select your data, including the column names.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Data cleanup</strong> → <strong>Remove duplicates</strong>.
        </li>
        <li>
          Tick <strong>Data has header row</strong> if the first row holds column names.
        </li>
        <li>
          Keep all columns selected and click <strong>Remove duplicates</strong>. Google Sheets tells you how many rows were removed.
        </li>
      </ol>

      <h2>Fix it with MyDataFixer</h2>
      <p>MyDataFixer works in your browser, also on a phone or tablet, and your file never leaves your device.</p>
      <ol>
        <li>
          Open your Excel or CSV file in the <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link>.
        </li>
        <li>
          Choose <strong>Remove duplicate rows</strong>. You see a preview of every row that will be removed, each marked “Exact copy of row N”,
          so you know which row it repeats.
        </li>
        <li>Apply the change. The first copy is kept. If you change your mind, use Undo.</li>
        <li>Download the clean file as CSV, or as Excel if you opened an Excel file.</li>
      </ol>
      <p>
        If you want to check for other problems at the same time, such as empty rows, bad dates or extra spaces, open the file in the{" "}
        <Link href="/spreadsheet-error-detector">Error Detector</Link> instead. It finds duplicates together with ten other kinds of problem.
      </p>

      <h2>Rows that almost match</h2>
      <p>
        Excel, Google Sheets and MyDataFixer remove rows that match exactly. Rows that differ in a small way are not removed, for example:
      </p>
      <ul>
        <li>“Asha Patil” and “Asha Patil ” (a space at the end)</li>
        <li>“asha@example.com” and “ASHA@example.com” (capital letters)</li>
        <li>“500” and “500.00” in a CSV file</li>
      </ul>
      <p>
        To catch these, clean the data first: remove extra spaces and make capitalization the same, then remove duplicates. MyDataFixer&apos;s
        Cleaner has a tool for each of these steps.
      </p>

      <h2>How to avoid duplicates next time</h2>
      <ul>
        <li>
          <strong>Give every row an ID.</strong> An order number, invoice number or customer ID makes real duplicates easy to spot, because two
          rows with the same ID are almost always a mistake.
        </li>
        <li>
          <strong>Check before you combine files.</strong> When you join two exports, look at the date range of each one so the same days
          aren&apos;t included twice.
        </li>
        <li>
          <strong>Import once.</strong> Write down when a file was imported into a system, so it isn&apos;t imported again by someone else.
        </li>
        <li>
          <strong>Clean regularly.</strong> Checking a shared sheet once a week takes a minute and stops small problems from growing.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Duplicate rows make totals and counts wrong. Look at them first, keep a copy of the original, then remove them with Remove Duplicates in
        Excel, Data cleanup in Google Sheets, or the Spreadsheet Cleaner in your browser. Clean spaces and capitalization first if rows only
        almost match.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Removing duplicates by one column only.</strong> If you only compare the email column, two different orders from the same
          customer count as duplicates, and one of them is deleted.
        </li>
        <li>
          <strong>Not keeping a copy.</strong> Once you save, the removed rows are gone. Keep the original file.
        </li>
        <li>
          <strong>Forgetting the header row.</strong> Without “has header row”, the column names are treated as data.
        </li>
      </ul>
    </>
  ),
  faqs: [
    {
      q: "Which copy is kept?",
      a: "The first one. Excel, Google Sheets and MyDataFixer all keep the first copy and remove the later ones.",
    },
    {
      q: "Can I remove rows with the same email even if other columns differ?",
      a: "Yes: in Excel or Google Sheets, untick every column except email. Be careful, because you may delete rows that had different and useful details.",
    },
    {
      q: "Is it safe to remove duplicates from a file with formulas?",
      a: "Removing rows can break formulas that refer to them. MyDataFixer never removes rows that contain formulas or that formulas elsewhere in the workbook refer to.",
    },
    {
      q: "Can I do this on my phone?",
      a: "The Excel phone app doesn't have Remove Duplicates. MyDataFixer's Spreadsheet Cleaner works in the browser on phones and tablets.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is checked and cleaned in your browser, on your device.",
    },
  ],
};
