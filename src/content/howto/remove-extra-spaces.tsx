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
      A space at the start or end of a cell, like <code>&quot;Pune &quot;</code>, is almost invisible, but Excel treats it as a different value
      from <code>&quot;Pune&quot;</code>. Use the <strong>TRIM</strong> function in Excel, <strong>Data → Data cleanup → Trim whitespace</strong> in
      Google Sheets, or <strong>Remove extra spaces</strong> in MyDataFixer&apos;s Spreadsheet Cleaner.
    </p>
  ),
  body: (
    <>
      <h2>Why a small space causes big problems</h2>
      <p>
        To a person, “Pune” and “Pune ” look the same. To a spreadsheet they are two different pieces of text, because one has an extra
        character at the end. That small difference breaks many everyday tasks:
      </p>
      <ul>
        <li>
          <strong>Lookups fail.</strong> VLOOKUP and XLOOKUP return #N/A because “Pune ” isn&apos;t found in a list that contains “Pune”.
        </li>
        <li>
          <strong>Filters split values.</strong> The filter list shows “Pune” twice, and you only see half the rows when you pick one.
        </li>
        <li>
          <strong>Pivot tables and counts are wrong.</strong> The same city is counted as two different cities.
        </li>
        <li>
          <strong>Duplicates are missed.</strong> Two rows that should be identical are not, so they aren&apos;t removed.
        </li>
        <li>
          <strong>Numbers become text.</strong> “ 500” with a space in front may be treated as text, and it is left out of totals.
        </li>
      </ul>

      <h2>Where extra spaces come from</h2>
      <ul>
        <li>Typing: an extra tap on the space bar at the end of a name.</li>
        <li>Copying from web pages, PDFs or emails, which often adds spaces or special invisible spaces.</li>
        <li>Exports from other systems that pad values with spaces to a fixed width.</li>
      </ul>
      <p>
        Text copied from web pages often contains <strong>non-breaking spaces</strong>. They look exactly like normal spaces, but they are a
        different character, and not every tool removes them. Some files also contain <strong>hidden control characters</strong>, such as stray
        line breaks or tab characters, which can break imports.
      </p>

      <h2>Example</h2>
      <ExampleTable
        caption="The same city typed three ways (· marks a space)"
        headers={["city as typed", "what Excel sees"]}
        rows={[
          ["Pune", "Pune"],
          ["·Pune", "a different value"],
          ["Pune··", "a different value"],
        ]}
      />
      <p>A count of orders per city would show three cities instead of one.</p>

      <h2>How to spot extra spaces</h2>
      <ul>
        <li>Click a cell and look at the formula bar: a space at the end shows as a gap before the cursor.</li>
        <li>
          Use <code>=LEN(A2)</code> to count characters. “Pune” has 4; if you see 5 or 6, there are extra spaces.
        </li>
        <li>
          Compare with <code>=A2=TRIM(A2)</code>. If the result is FALSE, the cell has extra spaces.
        </li>
      </ul>

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <ol>
        <li>
          Insert an empty column next to the column you want to clean (right-click the column letter → <strong>Insert</strong>).
        </li>
        <li>
          In the first data row of the new column, type <code>=TRIM(A2)</code>, using the letter of your column.
        </li>
        <li>Double-click the small square at the bottom right of the cell to copy the formula down.</li>
        <li>
          Copy the new column, then right-click the original column → <strong>Paste Special</strong> → <strong>Values</strong>.
        </li>
        <li>Delete the helper column.</li>
      </ol>
      <p>
        TRIM removes spaces at the start and end, and it also turns double spaces between words into single ones. It does{" "}
        <strong>not</strong> remove non-breaking spaces. For those, use this formula instead:{" "}
        <code>=TRIM(SUBSTITUTE(A2,CHAR(160),&quot; &quot;))</code>. To remove hidden control characters, wrap it in CLEAN:{" "}
        <code>=CLEAN(TRIM(A2))</code>.
      </p>

      <h2>Fix it in Google Sheets</h2>
      <ol>
        <li>Select the cells or columns to clean.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Data cleanup</strong> → <strong>Trim whitespace</strong>.
        </li>
      </ol>
      <p>This works directly on the cells, without helper columns. The TRIM function also works in Google Sheets, just like in Excel.</p>

      <h2>Fix it with MyDataFixer</h2>
      <ol>
        <li>
          Open your Excel or CSV file in the <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link>.
        </li>
        <li>
          Choose <strong>Remove extra spaces</strong>. It removes spaces, tabs and non-breaking spaces from the start and end of every cell, and
          it keeps the spaces between words.
        </li>
        <li>Check the preview, which shows each cell before and after, then apply.</li>
        <li>Download the clean file.</li>
      </ol>
      <p>
        For CSV files, the <Link href="/csv-validator">CSV Validator</Link> also finds hidden control characters and can remove them, with a
        preview first. Both tools work on phones and tablets, and your file stays on your device.
      </p>

      <h2>Clean spaces first, then everything else</h2>
      <p>
        Removing extra spaces is a good first step before other cleaning. After it, duplicates are found correctly, capitalization differences
        are easier to see, and numbers stored as text can often be converted.
      </p>

      <h2>How to avoid extra spaces next time</h2>
      <ul>
        <li>
          <strong>Paste as values.</strong> When copying from a web page, use Paste Special → Values (or Ctrl+Shift+V in Google Sheets) to leave
          most hidden formatting behind.
        </li>
        <li>
          <strong>Use drop-down lists</strong> for values like cities or categories, so people choose instead of typing.
        </li>
        <li>
          <strong>Clean imported data straight away</strong>, before you build formulas and reports on it.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Extra spaces are hard to see but break lookups, filters and duplicate checks. Find them with LEN or TRIM, remove them with TRIM in
        Excel, Trim whitespace in Google Sheets, or Remove extra spaces in MyDataFixer, which also removes non-breaking spaces and keeps the
        spaces between words.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Using Find and Replace on all spaces.</strong> Replacing every space with nothing also joins words: “Asha Patil” becomes
          “AshaPatil”.
        </li>
        <li>
          <strong>Keeping formulas instead of values.</strong> If you delete the original column while the TRIM column still holds formulas, the
          formulas break. Paste as values first.
        </li>
        <li>
          <strong>Forgetting non-breaking spaces.</strong> If TRIM doesn&apos;t seem to work, the space is probably a non-breaking one.
        </li>
      </ul>
    </>
  ),
  faqs: [
    {
      q: "How can I see extra spaces?",
      a: "Click the cell and look at the formula bar, or use =LEN(A2) to count the characters: a higher number than expected means extra spaces.",
    },
    {
      q: "Why doesn't TRIM remove some spaces?",
      a: "They are non-breaking spaces, often copied from web pages. Use =TRIM(SUBSTITUTE(A2,CHAR(160),\" \")) in Excel, or MyDataFixer, which removes them too.",
    },
    {
      q: "Will removing spaces change my numbers?",
      a: "No, it only removes the spaces. A number that had spaces around it may then be recognised as a number again.",
    },
    {
      q: "Does MyDataFixer remove spaces between words?",
      a: "No. It only removes spaces at the start and end of a cell. Spaces between words stay as they are.",
    },
    {
      q: "Why does my VLOOKUP return #N/A when the value is clearly there?",
      a: "Very often one of the two values has an extra space or a non-breaking space. Clean both the lookup value and the lookup list, then try again.",
    },
    {
      q: "Can I remove extra spaces on my phone?",
      a: "The Excel phone app has no Trim tool. Google Sheets in a browser has Data cleanup → Trim whitespace, and MyDataFixer's Spreadsheet Cleaner works on phones and tablets.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is cleaned in your browser, on your device.",
    },
  ],
};
