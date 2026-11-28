import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const createUniqueIdFromColumns: HowToGuide = {
  slug: "create-unique-id-from-columns",
  title: "How to combine columns into a unique ID or key",
  seoTitle: "How to Create a Unique ID by Combining Columns in Excel",
  description:
    "No ID column? Build a key from several columns, such as order number and line, check that it's unique, and use it to compare or match files. Excel and browser.",
  summary: "When no single column identifies a row, two or three together usually do. Here's how to join them into one key you can rely on.",
  updated: "2026-11-28",
  tools: ["combine-columns"],
  related: ["combine-columns-in-excel", "compare-two-excel-csv-files", "find-duplicates-in-excel", "keep-leading-zeros-in-csv"],
  quickAnswer: (
    <p>
      Join the columns that together identify a row, with a separator that never appears in the values, for example{" "}
      <code>=A2&amp;&quot;|&quot;&amp;B2</code>. Format dates and codes as text first, then check that every key appears once. MyDataFixer&apos;s free{" "}
      <strong>Combine Columns</strong> joins the columns as they&apos;re shown, with a preview, in your browser.
    </p>
  ),
  body: (
    <>
      <h2>When you need a key</h2>
      <p>
        Many tasks need one value that identifies each row: comparing two versions of a file, looking up values with XLOOKUP, removing duplicates,
        or importing into a database. Often no single column is enough:
      </p>
      <ul>
        <li>An order has several lines: “order number” repeats, but order number + line number doesn&apos;t.</li>
        <li>Two customers share a name, but name + date of birth + postcode is very unlikely to repeat.</li>
        <li>A product comes in sizes: the SKU stem repeats, but SKU + size doesn&apos;t.</li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="Order lines with a combined key"
        headers={["order", "line", "product", "key"]}
        rows={[
          ["10045", "1", "Tea", "10045|1"],
          ["10045", "2", "Mug", "10045|2"],
          ["10046", "1", "Tea", "10046|1"],
        ]}
      />

      <h2>Choose the separator carefully</h2>
      <p>
        Without a separator, different rows can give the same key: order 1 line 23 and order 12 line 3 both become “123”. With “-” as separator, the
        key can still be ambiguous if the values contain dashes themselves (a code such as AB-12). Use a character that never appears in the
        values; <strong>|</strong> (the pipe) is a common choice.
      </p>

      <h2>Combine columns into a key in Excel</h2>
      <ExcelNote />
      <ol>
        <li>
          In an empty column, type <code>=A2&amp;&quot;|&quot;&amp;B2</code> (or <code>=CONCAT(A2, &quot;|&quot;, B2)</code>) and fill it down.
        </li>
        <li>
          In Excel 2019 or later, <code>=TEXTJOIN(&quot;|&quot;, FALSE, A2:C2)</code> joins a range. Use FALSE, so empty cells still get their
          separator and every part stays in its place: “10045||Tea” is different from “10045|Tea|”.
        </li>
        <li>
          Copy the key column and use <strong>Paste Special → Values</strong> if the key must stay the same when the other columns change.
        </li>
      </ol>

      <h2>Dates and codes need TEXT</h2>
      <p>
        Excel joins the stored value, not what you see. A date becomes a number (13/11/2026 turns into 46339), and a code shown as 00123 because of
        its number format becomes 123. Use TEXT to fix the format:
      </p>
      <ul>
        <li>
          Dates: <code>=A2&amp;&quot;|&quot;&amp;TEXT(B2, &quot;yyyy-mm-dd&quot;)</code>
        </li>
        <li>
          Codes with a fixed length: <code>=TEXT(A2, &quot;00000&quot;)&amp;&quot;|&quot;&amp;B2</code>
        </li>
      </ul>

      <h2>Check that the key is unique</h2>
      <p>
        A key is only useful if it appears once. Next to the key column, type <code>=COUNTIF(D:D, D2)</code> and fill it down: every row should show
        1. Or select the key column and use <strong>Home → Conditional Formatting → Highlight Cells Rules → Duplicate Values</strong>. If some keys
        repeat, add another column to the key, or check whether those rows are real duplicates.
      </p>

      <h2>In Google Sheets</h2>
      <p>
        The ampersand, CONCATENATE and <code>=TEXTJOIN(&quot;|&quot;, FALSE, A2:C2)</code> work as in Excel, and so do TEXT and COUNTIF.
      </p>

      <h2>Create a key with MyDataFixer</h2>
      <p>
        Open <Link href="/combine-columns">Combine Columns</Link> and choose your CSV or Excel file. It works in your browser on a computer, tablet or
        phone, and the file is never uploaded.
      </p>
      <ol>
        <li>
          Under <strong>Columns to combine</strong>, tick the key columns and put them in order with the up and down buttons.
        </li>
        <li>
          Under <strong>Between the values</strong>, choose <strong>Other text</strong> and type <code>|</code> (or choose Dash if no value contains
          a dash).
        </li>
        <li>
          Untick <strong>Skip empty values (no extra separators)</strong>, so every part keeps its place even when a cell is empty.
        </li>
        <li>
          Name the new column, for example “key”, check the preview and click <strong>Apply: add the combined column</strong>. Download the changed
          file (a CSV file as CSV, an Excel file as Excel or CSV).
        </li>
      </ol>
      <p>
        Values are combined as they&apos;re shown: a date shown as 13/11/2026 in Excel is combined as “13/11/2026”, and codes keep their leading
        zeros, so no TEXT formulas are needed. To check that the key is unique, open the file in{" "}
        <Link href="/remove-duplicates">Remove Duplicates</Link>, compare only the key column and choose “Mark them in a new column (remove nothing)”:
        if it says “No duplicate rows found in the chosen columns”, every key is unique.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Grace wants to compare this week&apos;s stock file with last week&apos;s, but the SKU repeats for each warehouse. In Combine Columns she
        joins “sku” and “warehouse” with “|” into a new “key” column, in both files. Remove Duplicates finds no duplicate keys, so the key is unique.
        In <Link href="/compare-files">Compare Spreadsheets</Link> she chooses “key” under Match rows by, and sees exactly which stock levels changed
        in which warehouse.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>No separator</strong>, so different rows give the same key.
        </li>
        <li>
          <strong>Skipping empty cells</strong>, so “A||C” and “A|C|” both become “A|C”.
        </li>
        <li>
          <strong>Dates turning into numbers</strong> in Excel formulas: use TEXT.
        </li>
        <li>
          <strong>Spaces and capitals</strong>: “Pune” and “pune ” give different keys. <Link href="/guides/remove-extra-spaces">Clean them</Link>{" "}
          first.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Combine the columns that together identify a row, with a separator that never appears in the values, keep empty parts in place, and check
        that each key appears once. In Excel, use &amp; or TEXTJOIN with FALSE, and TEXT for dates and codes. MyDataFixer&apos;s Combine Columns
        joins the values as they&apos;re shown, with a preview, in your browser.
      </p>
    </>
  ),
  faqs: [
    {
      q: "How do I create a unique ID from two columns in Excel?",
      a: "Join them with a separator, for example =A2&\"|\"&B2, then check with COUNTIF that every key appears once.",
    },
    {
      q: "Why does my date turn into a number when I combine columns?",
      a: "Excel joins the stored value. Use TEXT(B2, \"yyyy-mm-dd\") inside the formula. MyDataFixer combines the date as it's shown.",
    },
    {
      q: "Which separator should I use?",
      a: "One that never appears in the values. The pipe | is a common choice; a dash is fine if no value contains one.",
    },
    {
      q: "How do I check that the key is unique?",
      a: "Use =COUNTIF(D:D, D2) next to each key, or MyDataFixer's Remove Duplicates on the key column with “Mark them in a new column”.",
    },
    {
      q: "Can I do this on my phone?",
      a: "Yes. MyDataFixer's Combine Columns works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is read and changed in your browser, on your device, and the original file isn't changed.",
    },
  ],
};
