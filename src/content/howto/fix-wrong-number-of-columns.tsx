import Link from "next/link";
import { ExampleTable, FileLines } from "@/components/guides/ExampleTable";
import type { HowToGuide } from "./types";

export const fixWrongNumberOfColumns: HowToGuide = {
  slug: "fix-wrong-number-of-columns",
  title: "How to fix “wrong number of columns” errors in a CSV file",
  seoTitle: "Fix “Wrong Number of Columns” Errors in a CSV File",
  description:
    "Import failed with 'unexpected number of columns' or 'row has too many fields'? Learn why CSV rows go uneven and how to find and fix them, for free.",
  summary: "Some rows have more or fewer values than the header, so imports fail. Here's how to find and fix them.",
  updated: "2026-11-24",
  tools: ["csv-validator"],
  related: ["check-csv-before-import", "fix-broken-quotes-in-csv", "change-csv-separator"],
  quickAnswer: (
    <p>
      Every row of a CSV must have the same number of values as the header row. When one row has more or fewer, import tools stop with errors
      like “unexpected number of columns” or “row 341 has too many fields”. The usual cause is a comma inside a value that isn&apos;t in quotes.
      Find the uneven rows, compare them with the original data, and put such values in double quotes.
    </p>
  ),
  body: (
    <>
      <h2>Why rows become uneven</h2>
      <ul>
        <li>
          <strong>A separator inside a value.</strong> An address like “Shop 4, MG Road” in a comma-separated file splits into two values unless
          it is written in quotes: <code>&quot;Shop 4, MG Road&quot;</code>. This is by far the most common cause.
        </li>
        <li>
          <strong>Missing values at the end.</strong> Some programs leave off empty values at the end of a line, so the row is shorter.
        </li>
        <li>
          <strong>An extra separator at the end of lines</strong>, which creates an empty extra column.
        </li>
        <li>
          <strong>A broken quote</strong> that joins several lines into one value, or splits one value into many.
        </li>
        <li>
          <strong>The wrong separator.</strong> If the file is read with commas but really uses semicolons, the column counts make no sense.
        </li>
      </ul>

      <h2>Example</h2>
      <FileLines
        caption="customers.csv: 4 column names, but line 3 has 5 values"
        lines={["id,name,city,email", "1001,Asha Patil,Pune,asha@example.com", "1002,Ravi Kumar,Shop 4, MG Road,ravi@example.com", "1003,Meera Shah,Mumbai"]}
      />
      <ExampleTable
        caption="What an import tool sees"
        headers={["Line", "Values", "Problem"]}
        rows={[
          ["2", "4", "fine"],
          ["3", "5", "too many: the comma in “Shop 4, MG Road” splits it"],
          ["4", "3", "too few: the email is missing"],
        ]}
      />
      <p>
        If the tool doesn&apos;t stop, it is worse: “MG Road” ends up in the email column, and every value after it moves one place to the right.
      </p>

      <h2>How to find the uneven rows</h2>
      <h3>In a text editor</h3>
      <p>
        For a small file, open it in Notepad or any text editor and look at lines with addresses, descriptions or names that might contain
        commas. Count the separators on a suspicious line and compare with the first line.
      </p>
      <h3>In Excel or Google Sheets</h3>
      <p>
        Open the file and look at the column after the last one that should exist. Rows with values there have too many values. Sort or filter
        that column to bring them together. Be careful not to save the CSV from the spreadsheet afterwards, because it may change other values.
      </p>
      <h3>With MyDataFixer</h3>
      <p>
        Open the file in the <Link href="/csv-validator">CSV Validator</Link>. The check “Rows with the wrong number of fields” lists every uneven
        row with its line number and shows the line exactly as it is written in the file, so you can see where the extra comma is. It also says
        how many fields most rows have, and whether the extra fields are empty.
      </p>

      <h2>How to fix them</h2>
      <h3>Too many values</h3>
      <ul>
        <li>
          <strong>A value with a comma:</strong> put the whole value in double quotes, or fix it in the program that made the file so it adds the
          quotes itself.
        </li>
        <li>
          <strong>Empty extra values</strong> (usually an extra separator at the end): these can be removed safely. The CSV Validator offers
          “Remove empty extra fields” for exactly this, with a preview.
        </li>
      </ul>
      <h3>Too few values</h3>
      <ul>
        <li>
          If values are simply missing at the end, the row can be filled with empty cells. The CSV Validator offers “Add empty cells”, always
          with a before-and-after preview, because a short row can also mean values have shifted into the wrong columns.
        </li>
        <li>Check short rows against the original data before filling them.</li>
      </ul>
      <h3>Rows with real extra data</h3>
      <p>
        MyDataFixer never guesses which value belongs where. Tap the cells in the table to correct the row, then download the file. The download
        is checked again before it&apos;s offered.
      </p>

      <h2>Why not just delete the bad rows?</h2>
      <p>
        Deleting uneven rows makes the import work, but you lose data without noticing: a customer, an order or a product is simply gone. Fixing
        a handful of rows by hand is usually quick once you can see exactly which ones they are.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Farhan exports 5,000 customers from an old billing program and tries to import them into a new CRM, which stops at “row 2,318: expected 6
        columns, found 7”. He opens the export in the CSV Validator, which lists 12 uneven rows. Ten have an address with a comma, which he
        corrects by tapping the cells; two have an empty extra field at the end, which “Remove empty extra fields” fixes in one step. He
        downloads the file and the CRM imports all 5,000 customers.
      </p>

      <h2>How to avoid it next time</h2>
      <ul>
        <li>Export with a program that puts quotes around values containing separators (Excel and Google Sheets do).</li>
        <li>Don&apos;t build CSV files by joining text with commas by hand.</li>
        <li>Check every CSV before a big import.</li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Uneven rows usually come from a comma inside a value without quotes. Find them with the CSV Validator, which shows each line as written,
        quote values that contain separators, remove empty extra fields, and check short rows before filling them.
      </p>
    </>
  ),
  faqs: [
    {
      q: "What does 'unexpected number of columns' mean?",
      a: "At least one row has more or fewer values than the header row. Usually a value contains the separator without being in quotes.",
    },
    {
      q: "How do I put a value with a comma in a CSV?",
      a: "Wrap the whole value in double quotes: \"Shop 4, MG Road\". A double quote inside such a value is written twice: \"He said \"\"hi\"\"\".",
    },
    {
      q: "Can MyDataFixer fix uneven rows automatically?",
      a: "Only when it's safe: empty extra fields can be removed, and short rows can be filled with empty cells after a preview. Rows with real extra data are shown for you to correct.",
    },
    {
      q: "Why did my values move into the wrong columns?",
      a: "One value contained a separator and was split in two, so every value after it moved one column to the right.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is checked in your browser, on your device.",
    },
  ],
};
