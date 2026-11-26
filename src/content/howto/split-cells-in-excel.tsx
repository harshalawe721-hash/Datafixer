import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const splitCellsInExcel: HowToGuide = {
  slug: "split-cells-in-excel",
  title: "How to split a cell in Excel (names, addresses and codes)",
  seoTitle: "How to Split a Cell in Excel: Text to Columns & More",
  description:
    "Split full names into first and last names, or addresses at commas. How to split cells in Excel and Google Sheets, or free in your browser with MyDataFixer.",
  summary: "Full names in one cell? Addresses joined with commas? Here's how to split them into separate columns.",
  updated: "2026-11-26",
  tools: ["split-column"],
  related: ["combine-columns-in-excel", "csv-opens-in-one-column", "remove-extra-spaces", "change-case-proper-case"],
  quickAnswer: (
    <p>
      To split a cell, you split its <strong>text</strong> into the columns next to it. In Excel, select the column and use{" "}
      <strong>Data → Text to Columns</strong>, choose the separator (for example a space or a comma) and pick an empty column as the destination. You
      can also use <strong>Flash Fill</strong>, the <strong>TEXTSPLIT</strong> function, or the free <strong>Split a Column</strong> tool in
      MyDataFixer, which shows a preview first and lets you undo.
    </p>
  ),
  body: (
    <>
      <h2>What “splitting a cell” means</h2>
      <p>
        A spreadsheet cell can&apos;t be cut in half like a table in a document. When people say “split a cell”, they mean: take the text in one
        cell and put each part in its own column. “Asha Patil” becomes “Asha” in one column and “Patil” in the next.
      </p>
      <p>
        To do that, you tell the spreadsheet where one part ends and the next begins. That mark is called the <strong>separator</strong> (Excel
        calls it a <em>delimiter</em>). Common separators are a space, a comma, a semicolon, a dash or a slash.
      </p>
      <p>
        If you are trying to undo a <strong>merged cell</strong> (one big cell across several columns), that&apos;s different: select it and choose{" "}
        <strong>Home → Merge &amp; Center → Unmerge Cells</strong>.
      </p>

      <h2>When you need it</h2>
      <ul>
        <li>Full names in one column, but a form or a mail merge needs first and last names separately.</li>
        <li>Addresses like “Pune, Maharashtra, India” that need city, state and country columns.</li>
        <li>Codes like “IN-MH-0042” where each part means something.</li>
        <li>Dates and times together (“2024-03-15 09:30”) when you only need the date.</li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="A name column split at the first space"
        headers={["name", "name (1)", "name (2)"]}
        rows={[
          ["Asha Patil", "Asha", "Patil"],
          ["Ben Rome", "Ben", "Rome"],
          ["Mary Ann Lopez", "Mary", "Ann Lopez"],
          ["Cher", "Cher", ""],
        ]}
      />
      <p>
        Notice the last two rows. “Mary Ann Lopez” has two spaces, so splitting only at the first space keeps “Ann Lopez” together. “Cher” has no
        space at all, so the second column stays empty. Real lists always have a few names like these, so check the result before you rely on it.
      </p>

      <h2>Split cells in Excel</h2>
      <ExcelNote />
      <h3>Method 1: Text to Columns (any version)</h3>
      <ol>
        <li>Click an empty column to the right of your data and remember its letter, for example C. The parts will go there.</li>
        <li>Select the column you want to split by clicking its letter at the top.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Text to Columns</strong>.
        </li>
        <li>
          Choose <strong>Delimited</strong> and click <strong>Next</strong>.
        </li>
        <li>
          Tick the separator, for example <strong>Space</strong> or <strong>Comma</strong>. For any other character, tick <strong>Other</strong> and
          type it. The preview at the bottom shows the result.
        </li>
        <li>
          Click <strong>Next</strong>, then set <strong>Destination</strong> to the first cell of the empty column, for example <code>$C$1</code>.
        </li>
        <li>
          Click <strong>Finish</strong>.
        </li>
      </ol>
      <p>
        The destination matters. If you leave it as it is, Excel writes the parts over your original column and the columns to its right. If those
        columns have data, Excel asks “There&apos;s already data here. Do you want to replace it?”. Click Cancel and choose an empty destination
        instead.
      </p>
      <p>
        Text to Columns splits at <em>every</em> separator. “Mary Ann Lopez” becomes three columns, not two. To keep the rest of the name together,
        use one of the formulas below.
      </p>

      <h3>Method 2: Flash Fill (Excel 2013 and later)</h3>
      <ol>
        <li>In the empty column next to the names, type the first name of the first row, for example “Asha”.</li>
        <li>Click the cell below it.</li>
        <li>
          Press <strong>Ctrl+E</strong>, or go to <strong>Data</strong> → <strong>Flash Fill</strong>. Excel fills the rest of the column by
          copying your pattern.
        </li>
        <li>Do the same in the next column for the last names.</li>
      </ol>
      <p>
        Flash Fill is quick, but it guesses. Scroll down and check the unusual rows, such as names with three words.
      </p>

      <h3>Method 3: formulas</h3>
      <p>
        In <strong>Excel for Microsoft 365, Excel for the web and Excel 2024</strong>, these functions do the job in one step:
      </p>
      <ul>
        <li>
          <code>=TEXTSPLIT(A2,&quot; &quot;)</code> puts every part of A2 in its own column.
        </li>
        <li>
          <code>=TEXTBEFORE(A2,&quot; &quot;)</code> gives the text before the first space (Asha), and <code>=TEXTAFTER(A2,&quot; &quot;)</code> the
          text after it (Patil, or Ann Lopez).
        </li>
      </ul>
      <p>In older versions, use these instead:</p>
      <ul>
        <li>
          First part: <code>=LEFT(A2,FIND(&quot; &quot;,A2)-1)</code>
        </li>
        <li>
          The rest: <code>=MID(A2,FIND(&quot; &quot;,A2)+1,LEN(A2))</code>
        </li>
      </ul>
      <p>
        If a cell has no space, these formulas show an error (#VALUE! or #N/A). Wrap them in <code>IFERROR</code>, for example{" "}
        <code>=IFERROR(LEFT(A2,FIND(&quot; &quot;,A2)-1),A2)</code>, to show the whole value instead. Formulas stay linked to the original column, so
        when you&apos;re happy, copy the new columns and use <strong>Paste Special → Values</strong> before you delete anything.
      </p>

      <h2>Split cells in Google Sheets</h2>
      <ol>
        <li>Make sure the columns to the right are empty, because Google Sheets writes the parts there.</li>
        <li>Select the column.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Split text to columns</strong>.
        </li>
        <li>
          In the small box that appears, choose the separator, or <strong>Custom</strong> to type your own.
        </li>
      </ol>
      <p>
        You can also use a formula: <code>=SPLIT(A2,&quot; &quot;)</code> splits A2 at every space into the cells to the right.
      </p>

      <h2>Split cells with MyDataFixer</h2>
      <p>
        Open your CSV or .xlsx file in <Link href="/split-column">Split a Column</Link>. It works in your browser, on a computer, tablet or phone, and
        your file stays on your device.
      </p>
      <ol>
        <li>Choose the column to split.</li>
        <li>Choose where to split it: at a space, comma, semicolon, dash, tab, or any text you type.</li>
        <li>
          Choose <strong>At the first separator only</strong> (two parts, like first name and the rest) or <strong>At every separator</strong>, and
          how many parts to keep.
        </li>
        <li>Check the preview of the first rows, then tap Apply.</li>
      </ol>
      <p>
        The new columns are added at the right of the sheet, named after the column (“name (1)”, “name (2)”), so nothing is written over your other
        data. Values without the separator, such as “Cher”, go into the first new column. The original column is kept unless you tick{" "}
        <strong>Remove the original column</strong>, and Undo puts everything back. Download the result as CSV, or as Excel for .xlsx files, with
        your formatting kept.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Writing over other columns.</strong> Text to Columns and Split text to columns use the columns to the right. Insert empty columns
          first, or choose an empty destination.
        </li>
        <li>
          <strong>Splitting at every space.</strong> Names like “Mary Ann Lopez” or “Ana de la Cruz” fall apart. Split at the first space only, and
          check the long names by hand.
        </li>
        <li>
          <strong>A separator inside a value.</strong> Splitting addresses at commas also splits “Lee, Jr”. Look at the preview before you apply it.
        </li>
        <li>
          <strong>Extra spaces.</strong> A double space or a space at the end gives empty or odd parts. Remove extra spaces first, or tick “Treat
          consecutive delimiters as one” in Text to Columns.
        </li>
        <li>
          <strong>Codes losing their zeros.</strong> Text to Columns may turn “0042” into 42. In its last step, select that column and choose{" "}
          <strong>Text</strong> as the column data format.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Splitting a cell means splitting its text into columns at a separator. In Excel, use Data → Text to Columns with an empty destination, Flash
        Fill, or TEXTSPLIT and TEXTBEFORE in newer versions. In Google Sheets, use Data → Split text to columns or SPLIT. Or use Split a Column in
        MyDataFixer, which adds the new columns at the right, shows a preview first and lets you undo.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Can I split one cell into two cells in Excel?",
      a: "Not the cell itself, but its text: Data → Text to Columns puts each part in its own column. To undo a merged cell, use Home → Merge & Center → Unmerge Cells.",
    },
    {
      q: "How do I split first and last names in Excel?",
      a: "Use Text to Columns with Space as the separator, or type =TEXTBEFORE(A2,\" \") and =TEXTAFTER(A2,\" \") in Excel for Microsoft 365. In older versions use LEFT and MID with FIND. Check names with more than two words.",
    },
    {
      q: "Why did Text to Columns replace my data?",
      a: "It writes the parts into the columns to the right unless you choose another destination. Undo with Ctrl+Z, insert empty columns or set Destination to an empty column, and try again.",
    },
    {
      q: "How do I split a cell at a comma?",
      a: "In Text to Columns, tick Comma (and untick Space). In MyDataFixer's Split a Column, choose Comma, and tick “Remove spaces around each part” so “Pune, Maharashtra” gives “Pune” and “Maharashtra”.",
    },
    {
      q: "Can I split cells on my phone?",
      a: "The Excel app on phones doesn't have Text to Columns. Use Google Sheets in a browser, or MyDataFixer's Split a Column, which works on phones and tablets.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is read and changed in your browser, on your device, and the original file is never changed.",
    },
  ],
};
