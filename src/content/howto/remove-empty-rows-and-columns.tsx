import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const removeEmptyRowsAndColumns: HowToGuide = {
  slug: "remove-empty-rows-and-columns",
  title: "How to remove empty rows and columns",
  seoTitle: "How to Remove Empty Rows and Columns in Excel",
  description:
    "Empty rows break sorting, filtering and imports. Learn how to delete empty rows and columns safely in Excel and Google Sheets, or free with MyDataFixer.",
  summary: "Empty rows in the middle of your data break sorting, filters and imports. Here's how to remove them safely.",
  updated: "2026-11-20",
  tools: ["spreadsheet-cleaner"],
  related: ["find-blank-cells", "remove-duplicate-rows", "remove-extra-spaces"],
  quickAnswer: (
    <p>
      In Excel, add a filter, filter a column that is always filled for <strong>(Blanks)</strong>, check that the shown rows are completely empty,
      and delete them. In Google Sheets, sorting the data moves empty rows to the bottom. Be careful with “Go To Special → Blanks → Delete”: it can
      delete cells from rows that are only partly empty.
    </p>
  ),
  body: (
    <>
      <h2>Why empty rows cause problems</h2>
      <ul>
        <li>
          <strong>Sorting and filtering stop early.</strong> Excel sees an empty row as the end of the table, so the rows below may be left out.
        </li>
        <li>
          <strong>Imports create empty records</strong> or stop at the first empty row.
        </li>
        <li>
          <strong>Counts are wrong.</strong> COUNTA and row numbers include them.
        </li>
        <li>
          <strong>Empty columns</strong> make files wider, confuse import tools that expect a fixed number of columns, and can hide data that
          ended up in the wrong place.
        </li>
      </ul>

      <h2>Where they come from</h2>
      <ul>
        <li>Rows left between blocks of data to make it “look nicer”.</li>
        <li>Rows where data was deleted but the row stayed.</li>
        <li>Exports that add empty lines between records or at the end of the file.</li>
        <li>Columns that were used once and then cleared.</li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="Row 3 is empty, so a sort may stop at row 2"
        headers={["Row", "name", "city", "amount"]}
        rows={[
          ["2", "Asha Patil", "Lyon", "500"],
          ["3", "", "", ""],
          ["4", "Ravi Kumar", "Berlin", "300"],
        ]}
      />

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <h3>Method 1: filter for empty rows (safe)</h3>
      <ol>
        <li>Save a copy of your file.</li>
        <li>
          Click a cell in your data and go to <strong>Data</strong> → <strong>Filter</strong>.
        </li>
        <li>
          Open the filter arrow of a column that is filled in every real row (such as name or ID) and tick only <strong>(Blanks)</strong>.
        </li>
        <li>Check that the rows shown are empty in every column, not just that one.</li>
        <li>
          Select those rows by their row numbers, right-click → <strong>Delete Row</strong>.
        </li>
        <li>Turn the filter off again (Data → Filter).</li>
      </ol>
      <h3>Method 2: sort</h3>
      <p>
        Sorting by a column that is always filled moves empty rows to the bottom, where they no longer get in the way. Only do this if the order of
        your rows doesn&apos;t matter, or add a column with numbers 1, 2, 3… first so you can sort back.
      </p>
      <h3>Empty columns</h3>
      <p>
        Click the column letter, check the column is empty (Ctrl+Down Arrow jumps to the next filled cell), then right-click →{" "}
        <strong>Delete</strong>.
      </p>
      <p>
        <strong>Careful:</strong> the trick “Go To Special → Blanks → Delete → Entire row” deletes every row that has at least one blank cell, not
        only completely empty rows. You can lose real data that way.
      </p>

      <h2>Fix it in Google Sheets</h2>
      <ol>
        <li>
          Select the data and go to <strong>Data</strong> → <strong>Create a filter</strong>.
        </li>
        <li>
          On a column that is always filled, choose <strong>Filter by condition</strong> → <strong>Is empty</strong>.
        </li>
        <li>
          Check the rows are fully empty, select them, right-click → <strong>Delete selected rows</strong>, then remove the filter.
        </li>
      </ol>
      <p>Or sort the data by a column that is always filled: empty rows move to the bottom.</p>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open your file in the <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link>. It has two separate tools:
      </p>
      <ul>
        <li>
          <strong>Remove empty rows</strong> removes rows with no data at all. Rows that contain only spaces count as empty too. Rows with even one
          value are never touched.
        </li>
        <li>
          <strong>Remove empty columns</strong> removes columns with no data.
        </li>
      </ul>
      <p>
        You see a preview of what will be removed before anything changes, and you can undo. In Excel workbooks, MyDataFixer never removes rows or
        columns that formulas, charts or named ranges elsewhere in the workbook refer to, so nothing breaks. In old .xls files, rows and columns
        are not removed at all, because MyDataFixer can&apos;t check what refers to them there. Your file stays on your device.
      </p>

      <h2>How to avoid empty rows next time</h2>
      <ul>
        <li>Keep data in one solid block: no empty rows or columns to separate groups. Use a “group” column instead.</li>
        <li>When you delete data, delete the whole row (right-click → Delete), not just its contents.</li>
        <li>Use row height or borders for spacing in printed reports, not empty rows.</li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Sneha&apos;s team keeps a shared expense sheet. Over the months, people left empty rows between weeks, and one column called “notes 2” was
        never used. A filter on the amount column stops at the first empty row, so half the expenses are missing from her monthly total. She opens
        the file in the Spreadsheet Cleaner, sees that Remove empty rows would take out 23 rows with no data at all, and Remove empty columns would
        take out “notes 2”. She applies both, downloads the file, and her filter and total now include every expense.
      </p>

      <h2>Quick summary</h2>
      <p>
        Empty rows stop sorting, filtering and imports. Remove them with a filter on (Blanks) in Excel or “Is empty” in Google Sheets, after
        checking the rows are fully empty, or use Remove empty rows and Remove empty columns in the Cleaner, which never touches rows that hold data.
      </p>
    </>
  ),
  faqs: [
    {
      q: "What's the fastest safe way to delete empty rows?",
      a: "Filter a column that is always filled for (Blanks), check the rows are completely empty, and delete them. Or use MyDataFixer's Remove empty rows.",
    },
    {
      q: "Why did Go To Special delete rows with data?",
      a: "Deleting the entire row for every blank cell also removes rows that are only partly empty. Use a filter instead.",
    },
    {
      q: "Do rows with only spaces count as empty?",
      a: "In Excel no, because a space is a character. In MyDataFixer yes: rows containing only spaces are treated as empty.",
    },
    {
      q: "Will removing rows break my formulas?",
      a: "It can, if formulas refer to those rows. MyDataFixer never removes rows or columns that other formulas, charts or named ranges use.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is cleaned in your browser, on your device.",
    },
  ],
};
