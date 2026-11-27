import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const findDuplicatesInExcel: HowToGuide = {
  slug: "find-duplicates-in-excel",
  title: "How to find and highlight duplicates in Excel (without deleting them)",
  seoTitle: "How to Find Duplicates in Excel Without Deleting Them",
  description:
    "Highlight duplicate values, mark duplicate rows with COUNTIF, and filter them in Excel and Google Sheets, or mark them free in your browser with MyDataFixer.",
  summary: "Want to see the duplicates before you delete anything? Here's how to highlight and mark them.",
  updated: "2026-11-27",
  tools: ["remove-duplicates"],
  related: ["remove-duplicate-rows", "remove-extra-spaces", "fix-inconsistent-capitalization", "combine-columns-in-excel"],
  quickAnswer: (
    <p>
      To see duplicates without deleting them, select the column and use <strong>Home → Conditional Formatting → Highlight Cells Rules →
      Duplicate Values</strong>. To mark whole rows instead, add a helper column with <code>=COUNTIF($B$2:B2,B2)&gt;1</code>, which says TRUE for
      every copy after the first. Or use <strong>Remove Duplicates</strong> in MyDataFixer and choose <strong>Mark them in a new column</strong>:
      each copy gets “Duplicate of row N” and nothing is removed.
    </p>
  ),
  body: (
    <>
      <h2>Why look before you delete</h2>
      <p>
        Removing duplicates is quick, but it can&apos;t tell a mistake from a real repeat. Two orders with the same customer and amount might be one
        order entered twice, or two real orders on different days. Two rows with the same email might be one person, or one person with an old and a
        new address. If you delete first, you may lose information you needed.
      </p>
      <p>Highlighting or marking the duplicates first lets you check them, sort them, ask someone, and then decide.</p>

      <h2>Duplicate values or duplicate rows?</h2>
      <ul>
        <li>
          A <strong>duplicate value</strong> is the same value appearing more than once in a column, such as the same email twice.
        </li>
        <li>
          A <strong>duplicate row</strong> is a row whose values match another row, in every column or in the columns you care about.
        </li>
      </ul>
      <p>Excel&apos;s highlighting works on values, cell by cell. To mark rows, use a formula or a tool, as shown below.</p>

      <h2>Example</h2>
      <ExampleTable
        caption="A helper column marks every copy after the first"
        headers={["Row", "name", "email", "Copy?"]}
        rows={[
          ["2", "Asha", "asha@example.com", "FALSE"],
          ["3", "Ben", "ben@example.com", "FALSE"],
          ["4", "Asha", "asha@example.com", "TRUE"],
          ["5", "Asha P", "asha@example.com", "TRUE"],
        ]}
      />
      <p>
        Here the helper column checks the email column. Row 2 is the first “asha@example.com”, so it stays FALSE; rows 4 and 5 repeat it, so they
        are TRUE. Filter on TRUE to see only the copies.
      </p>

      <h2>Find duplicates in Excel</h2>
      <ExcelNote />
      <h3>Method 1: highlight duplicate values</h3>
      <ol>
        <li>Select the column, for example the emails.</li>
        <li>
          Go to <strong>Home</strong> → <strong>Conditional Formatting</strong> → <strong>Highlight Cells Rules</strong> →{" "}
          <strong>Duplicate Values</strong>.
        </li>
        <li>
          Keep <strong>Duplicate</strong> and a colour, and click <strong>OK</strong>.
        </li>
      </ol>
      <p>
        Every value that appears more than once is coloured, <em>including the first one</em>. To bring the coloured cells together, use{" "}
        <strong>Data → Filter</strong>, then the arrow on the column → <strong>Filter by Color</strong>. To remove the colours later, use{" "}
        <strong>Conditional Formatting → Clear Rules</strong>.
      </p>

      <h3>Method 2: mark copies with COUNTIF</h3>
      <ol>
        <li>Add a heading such as “Copy?” in an empty column, for example D1.</li>
        <li>
          In D2, type <code>=COUNTIF($B$2:B2,B2)&gt;1</code>, where B is the column to check, and copy it down.
        </li>
      </ol>
      <p>
        The range <code>$B$2:B2</code> grows as the formula goes down, so each row only looks at the rows above it. The first copy shows FALSE and
        every later copy TRUE. To mark all copies, including the first, use the whole column instead: <code>=COUNTIF($B$2:$B$1000,B2)&gt;1</code>.
      </p>

      <h3>Method 3: duplicate rows across several columns</h3>
      <p>
        To compare more than one column, use COUNTIFS with one pair per column. For name in A and email in B:{" "}
        <code>=COUNTIFS($A$2:A2,A2,$B$2:B2,B2)&gt;1</code>. It says TRUE only when both values have appeared together before.
      </p>
      <p>
        Another way is to combine the columns into one helper column first, for example <code>=A2&amp;&quot;|&quot;&amp;B2</code>, and run COUNTIF
        on that.
      </p>

      <h3>See the unique values</h3>
      <p>
        In Excel for Microsoft 365 and Excel 2021 or later, <code>=UNIQUE(B2:B1000)</code> lists each value once in a separate place, without
        changing your data. Comparing the two lengths shows how many repeats there are.
      </p>

      <h2>Find duplicates in Google Sheets</h2>
      <ol>
        <li>Select the column, for example B2:B1000.</li>
        <li>
          Go to <strong>Format</strong> → <strong>Conditional formatting</strong>.
        </li>
        <li>
          Under <strong>Format rules</strong>, choose <strong>Custom formula is</strong> and type <code>=COUNTIF($B$2:$B$1000,B2)&gt;1</code>.
        </li>
        <li>
          Pick a colour and click <strong>Done</strong>.
        </li>
      </ol>
      <p>
        The COUNTIF helper column and the UNIQUE function from the Excel section work in Google Sheets in the same way.
      </p>

      <h2>Find duplicates with MyDataFixer</h2>
      <p>
        Open your Excel or CSV file in <Link href="/remove-duplicates">Remove Duplicates</Link>. It works in your browser, on a computer, tablet or
        phone, and your file stays on your device.
      </p>
      <ol>
        <li>Choose how rows are compared: all columns, or only the columns you pick, such as email.</li>
        <li>
          Tick <strong>Ignore capital letters</strong> or <strong>Ignore extra spaces</strong> if “Asha@Example.com” and “asha@example.com ” should
          count as the same.
        </li>
        <li>Choose which copy counts as the original: the first or the last.</li>
        <li>
          Choose <strong>Mark them in a new column (remove nothing)</strong> and check the preview of the groups of matching rows.
        </li>
        <li>Apply, then download the file as CSV or Excel.</li>
      </ol>
      <p>
        A new “Duplicate” column is added at the right of the sheet. Each copy says which row it repeats, for example “Duplicate of row 2”, and
        the original rows are left empty in that column. In Excel you can filter on it, check the copies, and delete the ones you don&apos;t want.
        Or come back and choose <strong>Remove them</strong> once you are sure. Nothing is uploaded, and Undo works at every step.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Thinking a coloured cell means a duplicate row.</strong> Conditional formatting checks one column at a time. Two rows with the same
          name but different emails are both coloured in the name column.
        </li>
        <li>
          <strong>Forgetting the first copy is coloured too.</strong> Highlighting colours every repeat, including the original. Use the growing range
          in COUNTIF to mark only the later copies.
        </li>
        <li>
          <strong>Missing the $ signs.</strong> Without <code>$B$2</code>, the start of the range moves as you copy the formula down and the results
          are wrong.
        </li>
        <li>
          <strong>Spaces and capitals.</strong> COUNTIF ignores capital letters, but a space at the end makes values different. Remove extra spaces
          first, or use a tool that can ignore them.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Look at duplicates before you delete them. In Excel or Google Sheets, highlight duplicate values with conditional formatting, or mark
        copies with <code>=COUNTIF($B$2:B2,B2)&gt;1</code> (COUNTIFS for several columns) and filter on TRUE. In MyDataFixer, use Remove
        Duplicates with “Mark them in a new column” to label every copy with the row it repeats, and remove them later if you want.
      </p>
    </>
  ),
  faqs: [
    {
      q: "How do I highlight duplicates in Excel?",
      a: "Select the column and use Home → Conditional Formatting → Highlight Cells Rules → Duplicate Values. Every repeated value is coloured, including the first one.",
    },
    {
      q: "How do I find duplicate rows, not just values?",
      a: "Use COUNTIFS with every column you want to compare, for example =COUNTIFS($A$2:A2,A2,$B$2:B2,B2)>1, or MyDataFixer's Remove Duplicates, which compares whole rows or chosen columns.",
    },
    {
      q: "How do I mark only the second and later copies?",
      a: "Use a growing range: =COUNTIF($B$2:B2,B2)>1. The first copy is FALSE and every later copy is TRUE.",
    },
    {
      q: "Does COUNTIF see “Paris” and “PARIS” as the same?",
      a: "Yes, COUNTIF ignores capital letters. It doesn't ignore spaces, so “Paris ” with a space at the end is different.",
    },
    {
      q: "Can I find duplicates on my phone?",
      a: "Google Sheets in a browser has conditional formatting, and MyDataFixer's Remove Duplicates works on phones and tablets.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is read and checked in your browser, on your device, and the original file is never changed.",
    },
  ],
};
