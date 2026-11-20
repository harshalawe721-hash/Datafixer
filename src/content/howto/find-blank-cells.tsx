import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const findBlankCells: HowToGuide = {
  slug: "find-blank-cells",
  title: "How to find blank and missing cells in a spreadsheet",
  seoTitle: "How to Find Blank and Missing Cells in Excel",
  description:
    "Missing values make totals, averages and lookups wrong. Learn how to find and count blank cells in Excel, Google Sheets and free with MyDataFixer.",
  summary: "Empty cells in the middle of your data make totals and averages wrong. Here's how to find them all.",
  updated: "2026-11-20",
  tools: ["spreadsheet-error-detector"],
  related: ["remove-empty-rows-and-columns", "remove-extra-spaces", "excel-formula-errors"],
  quickAnswer: (
    <p>
      In Excel, select your data and use <strong>Home → Find &amp; Select → Go To Special → Blanks</strong> to select every empty cell. To count
      them, use <strong>=COUNTBLANK(A2:A100)</strong>. In Google Sheets, filter a column by “Is empty”. Then decide for each gap: fill it in from
      the source, or leave it empty on purpose.
    </p>
  ),
  body: (
    <>
      <h2>Why missing cells matter</h2>
      <ul>
        <li>
          <strong>Averages change.</strong> AVERAGE skips empty cells, so an average of sales may look higher than it really is.
        </li>
        <li>
          <strong>Lookups fail.</strong> A missing ID or email means a VLOOKUP finds nothing.
        </li>
        <li>
          <strong>Imports reject rows.</strong> Many systems need certain fields, such as email or product code, in every row.
        </li>
        <li>
          <strong>Reports are incomplete.</strong> A customer without a city disappears from a report by city.
        </li>
      </ul>

      <h2>Blank cells that aren&apos;t really empty</h2>
      <p>
        Some cells look empty but contain a space. Excel doesn&apos;t count them as blank, so COUNTBLANK and Go To Special miss them, but for your
        data they are just as empty. Other cells contain placeholders such as “-”, “n/a” or “none”. Look out for both.
      </p>

      <h2>Example</h2>
      <ExampleTable
        caption="Two missing values in an order list"
        headers={["order", "customer", "city", "amount"]}
        rows={[
          ["1001", "Asha Patil", "Pune", "500"],
          ["1002", "Ravi Kumar", "", "300"],
          ["1003", "Meera Shah", "Mumbai", ""],
        ]}
      />
      <p>Order 1002 has no city, and order 1003 has no amount, so the total and the report by city are both wrong.</p>

      <h2>Find blank cells in Excel</h2>
      <ExcelNote />
      <h3>Select all blank cells</h3>
      <ol>
        <li>Select your data (click a cell inside it and press Ctrl+A).</li>
        <li>
          Go to <strong>Home</strong> → <strong>Find &amp; Select</strong> → <strong>Go To Special</strong>.
        </li>
        <li>
          Choose <strong>Blanks</strong> and click <strong>OK</strong>. All empty cells are selected.
        </li>
        <li>
          Give them a fill colour (Home → the paint bucket) so you can see them while you work.
        </li>
      </ol>
      <h3>Count them</h3>
      <p>
        Use <code>=COUNTBLANK(B2:B500)</code> for one column. Put one at the bottom of each column to see where most values are missing.
      </p>
      <h3>See the rows with a blank in one column</h3>
      <p>
        Select the data, go to <strong>Data</strong> → <strong>Filter</strong>, open the filter arrow of a column and tick only{" "}
        <strong>(Blanks)</strong>.
      </p>

      <h2>Find blank cells in Google Sheets</h2>
      <ol>
        <li>
          Select the data and go to <strong>Data</strong> → <strong>Create a filter</strong>.
        </li>
        <li>
          Open the filter icon of a column, choose <strong>Filter by condition</strong> → <strong>Is empty</strong>.
        </li>
      </ol>
      <p>
        <code>=COUNTBLANK(B2:B500)</code> works in Google Sheets too. You can also highlight blanks with Format → Conditional formatting → “Is empty”.
      </p>

      <h2>Find blank cells with MyDataFixer</h2>
      <p>
        Open your Excel or CSV file in the <Link href="/spreadsheet-error-detector">Error Detector</Link>. Under <strong>Missing cells</strong>, it
        counts blank cells in rows that otherwise contain data, column by column. Cells that contain only spaces are counted as missing too, so
        nothing hides. “View affected data” filters the table to exactly those rows.
      </p>
      <p>
        MyDataFixer doesn&apos;t fill in missing values by itself, because it can&apos;t know the right value: guessing would put wrong data in your
        file. Tap a cell in the table to type the right value from your source, then download the corrected file. Completely empty rows are
        reported separately and can be removed in one step. Your file stays on your device.
      </p>

      <h2>What to do with each gap</h2>
      <ul>
        <li>
          <strong>Fill it in</strong> from the original source, such as an invoice or form.
        </li>
        <li>
          <strong>Leave it empty on purpose</strong> when the value really doesn&apos;t exist, like a second phone number.
        </li>
        <li>
          <strong>Use 0 only for real zeros.</strong> A missing amount and an amount of 0 are not the same thing.
        </li>
        <li>
          <strong>Remove the row</strong> if it is a test or an unfinished record.
        </li>
      </ul>

      <h2>How to avoid missing values next time</h2>
      <ul>
        <li>Mark required columns clearly, for example with a colour or “(required)” in the column name.</li>
        <li>Use forms that don&apos;t allow empty required fields.</li>
        <li>Check new data for blanks as soon as it arrives, not at the end of the month.</li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Vikram prepares a list of 800 students for an exam portal that needs a name, roll number and email in every row. He adds COUNTBLANK at
        the bottom of each column: names 0, roll numbers 2, emails 17. He filters the email column for (Blanks), copies the 17 names and asks the
        class teachers for the missing addresses. The two missing roll numbers turn out to be test rows, which he deletes. The upload then works on
        the first try.
      </p>

      <h2>Quick summary</h2>
      <p>
        Blank cells make averages, lookups and reports wrong. Find them with Go To Special → Blanks or a filter, count them with COUNTBLANK, or
        let the Error Detector list them, including cells that only hold spaces. Fill gaps from the source; never guess.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Why doesn't COUNTBLANK count some empty-looking cells?",
      a: "Those cells contain a space or an empty text from a formula. Remove extra spaces first, then count again.",
    },
    {
      q: "Should I put 0 in empty cells?",
      a: "Only if the real value is zero. Otherwise totals and averages become wrong in a different way.",
    },
    {
      q: "Can I fill all blanks with the value above?",
      a: "Yes in Excel: select the blanks with Go To Special, type = and press the up arrow, then press Ctrl+Enter. Check the result, because it's only right when the value above really applies.",
    },
    {
      q: "Does MyDataFixer fill in missing values?",
      a: "No. It shows where values are missing, and you type the right ones. It never invents data.",
    },
    {
      q: "Do formulas that return \"\" count as blank?",
      a: "COUNTBLANK counts them as blank, but Go To Special → Blanks doesn't select them, because the cell holds a formula. Keep this in mind when the two give different numbers.",
    },
    {
      q: "How do I find blank cells in a CSV file?",
      a: "Open it in Excel or Google Sheets and use the methods above, or open it in MyDataFixer's Error Detector, which lists missing cells in CSV and Excel files, including cells that only contain spaces.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is checked in your browser, on your device.",
    },
  ],
};
