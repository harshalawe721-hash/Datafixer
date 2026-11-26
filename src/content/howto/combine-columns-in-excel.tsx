import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const combineColumnsInExcel: HowToGuide = {
  slug: "combine-columns-in-excel",
  title: "How to combine two columns in Excel (without losing data)",
  seoTitle: "How to Combine Two Columns in Excel Without Losing Data",
  description:
    "Join first and last names, or city and state, into one column. How to combine columns in Excel and Google Sheets with &, CONCAT and TEXTJOIN, or free online.",
  summary: "First and last names in separate columns? Here's how to join them into one, with a space or comma in between.",
  updated: "2026-11-26",
  tools: ["combine-columns"],
  related: ["split-cells-in-excel", "remove-extra-spaces", "change-case-proper-case", "remove-empty-rows-and-columns"],
  quickAnswer: (
    <p>
      To combine two columns in Excel, type <code>=A2&amp;&quot; &quot;&amp;B2</code> in an empty column and copy it down. It joins A2 and B2 with a
      space between them. <strong>TEXTJOIN</strong> does the same for many columns and can skip empty cells. Don&apos;t use <strong>Merge
      Cells</strong> for this: it keeps only one value and deletes the rest. Or use the free <strong>Combine Columns</strong> tool in MyDataFixer,
      which shows a preview first and lets you undo.
    </p>
  ),
  body: (
    <>
      <h2>Combine, not merge</h2>
      <p>
        Excel has a <strong>Merge &amp; Center</strong> button, and it sounds like the right tool. It isn&apos;t. Merging two cells keeps only the
        value in the upper-left cell and throws the other one away. Excel even warns you: “Merging cells only keeps the upper-left value and
        discards other values.”
      </p>
      <p>
        What you want is to <strong>combine</strong> (or <em>join</em>, or <em>concatenate</em>) the text: put “Asha” and “Patil” together as
        “Asha Patil” in a new column, and keep both originals until you are sure the result is right.
      </p>

      <h2>When you need it</h2>
      <ul>
        <li>A mailing list needs one “full name” column, but your sheet has first and last names apart.</li>
        <li>An online shop or delivery app wants a single address line.</li>
        <li>You want a unique key, such as country code plus customer number (IN-0042).</li>
        <li>A report needs “City, State” as one label.</li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="First and last names combined with a space"
        headers={["first", "last", "full name"]}
        rows={[
          ["Asha", "Patil", "Asha Patil"],
          ["Ben", "Rome", "Ben Rome"],
          ["Cher", "", "Cher"],
        ]}
      />
      <p>
        The last row has no last name. A simple formula would give “Cher ” with a space at the end, which is easy to miss and can cause trouble later
        when you search or remove duplicates. The methods below show how to avoid that.
      </p>

      <h2>Combine columns in Excel</h2>
      <ExcelNote />
      <h3>Method 1: the &amp; sign (any version)</h3>
      <ol>
        <li>Click the first data cell of an empty column, for example C2.</li>
        <li>
          Type <code>=A2&amp;&quot; &quot;&amp;B2</code> and press Enter. The <code>&quot; &quot;</code> is the space between the two values; use{" "}
          <code>&quot;, &quot;</code> for a comma and a space, or <code>&quot;-&quot;</code> for a dash.
        </li>
        <li>Double-click the small square at the bottom right of C2 to copy the formula down the column.</li>
        <li>Type a heading in C1, such as “full name”.</li>
      </ol>
      <p>
        <code>=CONCAT(A2,&quot; &quot;,B2)</code> gives the same result in Excel 2019 and later. Older versions have{" "}
        <code>CONCATENATE</code>, which works the same way.
      </p>

      <h3>Method 2: TEXTJOIN for many columns (Excel 2019 and later)</h3>
      <p>
        <code>=TEXTJOIN(&quot; &quot;,TRUE,A2:C2)</code> joins every cell from A2 to C2 with a space. The <code>TRUE</code> tells Excel to skip
        empty cells, so “Cher” doesn&apos;t get an extra space. This is the best choice for addresses with optional parts, such as a second address
        line.
      </p>

      <h3>Method 3: Flash Fill (Excel 2013 and later)</h3>
      <ol>
        <li>In the empty column, type the combined value for the first row by hand, for example “Asha Patil”.</li>
        <li>Click the cell below it.</li>
        <li>
          Press <strong>Ctrl+E</strong> (or <strong>Data</strong> → <strong>Flash Fill</strong>). Excel fills the column by following your example.
        </li>
      </ol>
      <p>Flash Fill writes plain values, not formulas, but it guesses the pattern. Check rows with missing or unusual values.</p>

      <h3>Dates and numbers</h3>
      <p>
        If one of the columns holds dates, <code>=A2&amp;&quot; &quot;&amp;B2</code> shows a number such as 45366 instead of the date, because that
        is how Excel stores dates. Use <code>TEXT</code> to choose how the date is written:{" "}
        <code>=A2&amp;&quot; &quot;&amp;TEXT(B2,&quot;yyyy-mm-dd&quot;)</code>. The same works for amounts:{" "}
        <code>TEXT(C2,&quot;0.00&quot;)</code> keeps two decimals.
      </p>

      <h3>Before you delete the original columns</h3>
      <p>
        A formula column depends on the columns it reads. If you delete “first” and “last”, the full names turn into <code>#REF!</code> errors. So
        first copy the new column, then right-click it and choose <strong>Paste Special</strong> → <strong>Values</strong>. Now it holds plain text,
        and you can delete the originals safely.
      </p>

      <h2>Combine columns in Google Sheets</h2>
      <p>
        The &amp; sign, <code>CONCATENATE</code> and <code>TEXTJOIN</code> work exactly as in Excel, for example{" "}
        <code>=TEXTJOIN(&quot; &quot;,TRUE,A2:B2)</code>. Copy the formula down, then use <strong>Edit</strong> → <strong>Paste special</strong> →{" "}
        <strong>Values only</strong> before deleting the originals.
      </p>

      <h2>Combine columns with MyDataFixer</h2>
      <p>
        Open your CSV or .xlsx file in <Link href="/combine-columns">Combine Columns</Link>. It works in your browser, on a computer, tablet or phone,
        and your file stays on your device.
      </p>
      <ol>
        <li>Tick the columns to combine. They are joined in the order you tick them; move them up or down to change the order.</li>
        <li>Choose what goes between the values: a space, a comma and space, a dash, nothing, or any text you type.</li>
        <li>Name the new column, for example “full name”.</li>
        <li>Check the preview of the first rows, then tap Apply.</li>
      </ol>
      <p>
        The new column is added at the right of the sheet and holds plain values, not formulas, so you never need Paste Special. Empty values are
        skipped without extra spaces, so “Cher” stays “Cher”. Dates and numbers are joined as they appear in the sheet (2024-03-15, not 45366). The
        original columns are kept unless you tick <strong>Remove the original columns</strong>, and Undo puts everything back. Download the result as
        CSV, or as Excel for .xlsx files, with your formatting kept.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Using Merge &amp; Center.</strong> It deletes every value except the first. Use a formula or a combine tool instead.
        </li>
        <li>
          <strong>Forgetting the space.</strong> <code>=A2&amp;B2</code> gives “AshaPatil”. Put <code>&quot; &quot;</code> between the cells.
        </li>
        <li>
          <strong>Deleting the originals too early.</strong> Formulas break with #REF!. Paste the results as values first.
        </li>
        <li>
          <strong>Extra spaces in the data.</strong> If “Asha ” already ends with a space, the result has two spaces. Remove extra spaces first, or
          use <code>TRIM</code>: <code>=TRIM(A2&amp;&quot; &quot;&amp;B2)</code>.
        </li>
        <li>
          <strong>Dates turning into numbers.</strong> Wrap date cells in <code>TEXT</code>, as shown above.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Don&apos;t merge cells: combine their text. In Excel or Google Sheets, use <code>=A2&amp;&quot; &quot;&amp;B2</code>, CONCAT or TEXTJOIN
        (which can skip empty cells), use TEXT for dates, and paste the results as values before deleting the originals. Or use Combine Columns in
        MyDataFixer, which writes plain values, skips empty cells, shows a preview first and lets you undo.
      </p>
    </>
  ),
  faqs: [
    {
      q: "How do I combine two columns in Excel without losing data?",
      a: "Use a formula in a new column, such as =A2&\" \"&B2, instead of Merge & Center, which keeps only one value. Paste the results as values before deleting the original columns.",
    },
    {
      q: "How do I combine first and last names with a space?",
      a: "Type =A2&\" \"&B2 (or =CONCAT(A2,\" \",B2)) and copy it down. In MyDataFixer's Combine Columns, tick the two columns and choose Space.",
    },
    {
      q: "How do I skip empty cells when combining?",
      a: "Use =TEXTJOIN(\" \",TRUE,A2:C2) in Excel 2019 and later or Google Sheets. MyDataFixer skips empty values by default.",
    },
    {
      q: "Why does my date show as a number after combining?",
      a: "Excel stores dates as numbers. Use TEXT to write it as a date, for example =A2&\" \"&TEXT(B2,\"yyyy-mm-dd\").",
    },
    {
      q: "Can I combine columns on my phone?",
      a: "Google Sheets in a browser supports the same formulas, and MyDataFixer's Combine Columns works on phones and tablets.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is read and changed in your browser, on your device, and the original file is never changed.",
    },
  ],
};
