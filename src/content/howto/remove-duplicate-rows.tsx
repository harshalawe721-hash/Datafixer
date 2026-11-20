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
      A duplicate row is a row that is the same as another row in every column. In Excel use <strong>Data → Remove Duplicates</strong>, in Google
      Sheets <strong>Data → Data cleanup → Remove duplicates</strong>. Both keep the first copy. Make a copy of your file first.
    </p>
  ),
  body: (
    <>
      <h2>Why duplicates happen</h2>
      <ul>
        <li>The same data was pasted or imported twice.</li>
        <li>Two exports were combined and some rows were in both.</li>
        <li>A form was submitted twice.</li>
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
      <p>The total looks like 1,300, but the real total is 800.</p>

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <ol>
        <li>Click any cell in your data.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Remove Duplicates</strong>.
        </li>
        <li>
          Keep all columns ticked (so only rows that match in every column count as duplicates) and click <strong>OK</strong>. Excel says how many
          rows it removed.
        </li>
      </ol>
      <p>
        To see duplicates before removing them, select the column and use <strong>Home</strong> → <strong>Conditional Formatting</strong> →{" "}
        <strong>Highlight Cells Rules</strong> → <strong>Duplicate Values</strong>.
      </p>

      <h2>Fix it in Google Sheets</h2>
      <ol>
        <li>Select your data.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Data cleanup</strong> → <strong>Remove duplicates</strong>.
        </li>
        <li>
          Tick <em>Data has header row</em> if the first row holds column names, keep all columns selected and click{" "}
          <strong>Remove duplicates</strong>.
        </li>
      </ol>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open your Excel or CSV file in the <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link> and choose <strong>Remove duplicate rows</strong>.
        You see every row that will be removed, listed as “Exact copy of row N”, before anything changes. The first copy is kept, you can undo, and
        the file never leaves your device. The <Link href="/spreadsheet-error-detector">Error Detector</Link> finds duplicates together with other
        problems.
      </p>

      <h2>Good to know</h2>
      <ul>
        <li>
          Rows that differ only by a space or capital letters (“Asha ” and “asha”) aren&apos;t exact copies. Remove extra spaces and fix
          capitalization first, then remove duplicates.
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
      a: "In Excel and Google Sheets, untick the other columns so only the email column is compared. Be careful: you may lose rows that had different details.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is checked and cleaned in your browser, on your device.",
    },
  ],
};
