import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const removeExtraSpaces: HowToGuide = {
  slug: "remove-extra-spaces",
  title: "How to remove extra spaces and hidden characters from cells",
  seoTitle: "How to Remove Extra Spaces in Excel and CSV Files",
  description:
    "Extra spaces break lookups, filters and duplicate checks. Learn how to remove them in Excel and Google Sheets, or free in your browser with MyDataFixer.",
  summary: "Spaces you can't see break searches, lookups and duplicate checks. Here's how to remove them.",
  updated: "2026-11-20",
  tools: ["spreadsheet-cleaner", "csv-validator"],
  related: ["remove-duplicate-rows", "fix-inconsistent-capitalization", "numbers-stored-as-text"],
  quickAnswer: (
    <p>
      Spaces at the start or end of a cell, like <code>&quot;Pune &quot;</code>, are easy to miss but make Excel treat the value as different from{" "}
      <code>&quot;Pune&quot;</code>. Use the <strong>TRIM</strong> function in Excel, <strong>Data → Data cleanup → Trim whitespace</strong> in
      Google Sheets, or the Spreadsheet Cleaner.
    </p>
  ),
  body: (
    <>
      <h2>Why it matters</h2>
      <ul>
        <li>Lookups (VLOOKUP, XLOOKUP) don&apos;t find the value.</li>
        <li>Filters show “Pune” and “Pune ” as two different cities.</li>
        <li>Duplicate rows aren&apos;t recognised.</li>
      </ul>
      <p>
        Text copied from web pages often contains <strong>non-breaking spaces</strong>, which look like normal spaces but aren&apos;t removed by
        every tool.
      </p>

      <h2>Example</h2>
      <ExampleTable
        caption="The same city, written three ways (· marks a space)"
        headers={["city as typed", "what Excel sees"]}
        rows={[
          ["Pune", "Pune"],
          ["·Pune", "a different value"],
          ["Pune··", "a different value"],
        ]}
      />

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <ol>
        <li>
          In an empty column next to your data, type <code>=TRIM(A2)</code> (use your column letter) and copy it down.
        </li>
        <li>
          Copy the new column, then <strong>Paste Special</strong> → <strong>Values</strong> over the original column, and delete the helper
          column.
        </li>
      </ol>
      <p>
        TRIM also turns double spaces between words into single ones. It doesn&apos;t remove non-breaking spaces; for those use{" "}
        <code>=TRIM(SUBSTITUTE(A2,CHAR(160),&quot; &quot;))</code>.
      </p>

      <h2>Fix it in Google Sheets</h2>
      <p>
        Select the cells and go to <strong>Data</strong> → <strong>Data cleanup</strong> → <strong>Trim whitespace</strong>.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open your file in the <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link> and choose <strong>Remove extra spaces</strong>. It
        removes spaces, tabs and non-breaking spaces from the start and end of every cell and keeps the spaces between words. You see every
        change first, and your file stays on your device. For CSV files with hidden control characters (invisible characters that can break
        imports), the <Link href="/csv-validator">CSV Validator</Link> finds and removes them.
      </p>
    </>
  ),
  faqs: [
    {
      q: "How can I see extra spaces?",
      a: "Click the cell and look at the formula bar, or use =LEN(A2) to count the characters: a higher number than expected means extra spaces.",
    },
    {
      q: "Will removing spaces change my numbers?",
      a: "No, it only removes the spaces. A number with spaces around it may then be recognised as a number again.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is cleaned in your browser, on your device.",
    },
  ],
};
