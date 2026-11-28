import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const compareTwoExcelCsvFiles: HowToGuide = {
  slug: "compare-two-excel-csv-files",
  title: "How to compare two Excel or CSV files and find the differences",
  seoTitle: "How to Compare Two Excel or CSV Files and Find Differences",
  description:
    "Find what changed between two versions of a spreadsheet: added, removed and changed rows. Excel formulas, conditional formatting, or a free browser tool.",
  summary: "Two versions of the same file and you need to know what changed? Here's how to compare them without checking every cell by eye.",
  updated: "2026-11-28",
  tools: ["compare-files"],
  related: ["find-duplicates-in-excel", "merge-csv-excel-files", "fix-column-names", "remove-extra-spaces"],
  quickAnswer: (
    <p>
      To compare two files, match each row of the newer file with the same row in the older one, using a column that identifies it (such as an ID,
      SKU or email). Then compare the other values. In Excel, use <strong>XLOOKUP</strong> or <strong>VLOOKUP</strong> to fetch the old value
      next to the new one. Or use MyDataFixer&apos;s free <strong>Compare Spreadsheets</strong>, which lists every added, removed and changed row and
      runs in your browser.
    </p>
  ),
  body: (
    <>
      <h2>When you need to compare files</h2>
      <ul>
        <li>This month&apos;s price list or stock export against last month&apos;s.</li>
        <li>A customer list before and after a cleanup, to check that nothing was lost.</li>
        <li>A file a colleague sent back: what did they change?</li>
        <li>A system export against the spreadsheet it was imported from.</li>
      </ul>

      <h2>Three kinds of difference</h2>
      <ExampleTable
        caption="prices-march.csv against prices-april.csv, matched by id"
        headers={["id", "March", "April", "Result"]}
        rows={[
          ["001", "Tea, 10", "Tea, 10", "Unchanged"],
          ["002", "Coffee, 20", "Coffee, 25", "Changed: price 20 → 25"],
          ["003", "Juice, 30", "(missing)", "Removed"],
          ["005", "(missing)", "Water, 50", "Added"],
        ]}
      />
      <p>
        The key to a good comparison is the <strong>id</strong> column: a value that identifies each row and appears only once. With it, rows can
        be matched even when the files are sorted differently. Without it, you can only tell which rows are identical.
      </p>

      <h2>Look at both files side by side</h2>
      <ExcelNote />
      <p>
        Open both files and go to <strong>View → View Side by Side</strong>. With <strong>Synchronous Scrolling</strong> on, both windows
        scroll together. This works for a quick look at small files with rows in the same order, but it&apos;s easy to miss a change, and it
        doesn&apos;t help when rows were added or sorted.
      </p>

      <h2>Compare by key with XLOOKUP or VLOOKUP</h2>
      <p>This is the most reliable method in Excel, because it matches rows by their key, not by their position.</p>
      <ol>
        <li>Put both tables in one workbook: the older one on a sheet called “Old”, the newer one on a sheet called “New”.</li>
        <li>
          On the New sheet, add a column “Old price” next to the price. In its first row, enter{" "}
          <code>=XLOOKUP(A2, Old!A:A, Old!D:D, &quot;not found&quot;)</code>, where column A holds the id and column D the price on the Old sheet. In
          older versions of Excel, use <code>=IFERROR(VLOOKUP(A2, Old!A:D, 4, FALSE), &quot;not found&quot;)</code>.
        </li>
        <li>
          Add a column “Changed?” with <code>=IF(E2=&quot;not found&quot;, &quot;Added&quot;, IF(D2=E2, &quot;&quot;, &quot;Changed&quot;))</code>,
          and fill both formulas down.
        </li>
        <li>Filter the Changed? column to see only the added and changed rows.</li>
        <li>To find removed rows, do the same in the other direction: look up each id of the Old sheet in the New sheet.</li>
      </ol>
      <p>
        One pair of lookup columns compares one column. To compare five columns, you need five lookups, or a longer formula that joins the values.
        Watch out for ids stored as numbers in one file and as text in the other: 00123 and 123 don&apos;t match.
      </p>

      <h2>Highlight differences with conditional formatting</h2>
      <p>When both sheets have exactly the same rows in the same order, you can colour every cell that differs:</p>
      <ol>
        <li>On the New sheet, select the data starting at A2.</li>
        <li>
          Go to <strong>Home → Conditional Formatting → New Rule → Use a formula to determine which cells to format</strong>.
        </li>
        <li>
          Enter <code>=A2&lt;&gt;Old!A2</code>, choose a fill colour and click OK.
        </li>
      </ol>
      <p>
        Every cell that isn&apos;t the same as the cell in the same position on the Old sheet is coloured. But if one row was added in the middle,
        every row below it looks changed. This compares positions, not rows.
      </p>

      <h2>What about Spreadsheet Compare and the command line?</h2>
      <p>
        Microsoft&apos;s Spreadsheet Compare tool (part of Inquire) is only included in some Windows editions of Office, so many people don&apos;t
        have it. On the command line, <code>diff</code> (macOS and Linux) or <code>fc</code> (Windows) compare files line by line. They work for
        CSV files in the same order, but they show whole lines, not which value changed, and a sorted file looks completely different.
      </p>

      <h2>Compare files with MyDataFixer</h2>
      <p>
        Open <Link href="/compare-files">Compare Spreadsheets</Link>. It works in your browser on a computer, tablet or phone, and the files are
        never uploaded.
      </p>
      <ol>
        <li>Choose the older and the newer file: CSV, TSV, TXT or Excel, even a CSV against a workbook. For a workbook, choose the sheet.</li>
        <li>
          Check <strong>Match rows by</strong>. MyDataFixer suggests a column whose values are all different, such as id or email. Several
          columns can be used together, or whole rows when there&apos;s no key.
        </li>
        <li>
          Read the summary: rows changed, added, removed and unchanged, and columns found in only one file. The list shows every changed value as
          old → new.
        </li>
        <li>
          Download the report as Excel, with changed values highlighted, or as CSV. Each row has a “Change” column and a “What changed” column.
        </li>
      </ol>
      <p>
        Columns are matched by name, so a column that moved isn&apos;t a change. Rows are matched by the key, so sorting doesn&apos;t matter.
        Tick <strong>Ignore capital letters</strong> or <strong>Ignore spaces at the start and end</strong> when those differences don&apos;t
        count. If a key appears more than once, the page says so, so no difference is hidden.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Mei manages an online shop. Her supplier sends a new price list every month, with 4,000 products, and she needs to update only the
        prices that changed. She compares last month&apos;s file with this month&apos;s in Compare Spreadsheets, matched by SKU. The summary shows 37
        changed rows, 12 new products and 5 discontinued ones. She downloads the Excel report, filters the Change column to “Changed”, and updates
        37 prices instead of checking 4,000.
      </p>

      <h2>Tips for a clean comparison</h2>
      <ul>
        <li>
          <strong>Choose a good key.</strong> An id, SKU, order number or email works; a name usually doesn&apos;t, because two people can share
          one.
        </li>
        <li>
          <strong>Use the same column names.</strong> “E-mail” and “Email” are different columns. <Link href="/guides/fix-column-names">Tidy
          the names</Link> first if they differ.
        </li>
        <li>
          <strong>Clean small differences first</strong>, such as <Link href="/guides/remove-extra-spaces">extra spaces</Link>, or use the
          ignore options, so the comparison shows only real changes.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        To compare two files, match rows by a key column and compare the other values. In Excel, use XLOOKUP or VLOOKUP by key, or conditional
        formatting when the rows are in the same order. MyDataFixer&apos;s Compare Spreadsheets matches columns by name and rows by key, lists
        every added, removed and changed row, and downloads a highlighted report, all in your browser.
      </p>
    </>
  ),
  faqs: [
    {
      q: "How do I compare two Excel files for differences?",
      a: "Match rows by a key column with XLOOKUP or VLOOKUP and compare the values, or use MyDataFixer's Compare Spreadsheets, which lists every added, removed and changed row.",
    },
    {
      q: "Can I compare files whose rows are in a different order?",
      a: "Yes, if you match rows by a key column such as an id. Conditional formatting and side-by-side views only work when the rows are in the same order.",
    },
    {
      q: "Can I compare a CSV file with an Excel file?",
      a: "Yes. In Excel, open the CSV and copy it into the workbook first. MyDataFixer compares a CSV and an Excel file directly.",
    },
    {
      q: "How do I find rows that were added or removed?",
      a: "Look up each key of one file in the other: keys not found in the older file were added, keys not found in the newer file were removed.",
    },
    {
      q: "Can I compare files on my phone?",
      a: "Excel's phone app isn't made for it. MyDataFixer's Compare Spreadsheets works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my files?",
      a: "No. Both files are read and compared in your browser, on your device.",
    },
  ],
};
