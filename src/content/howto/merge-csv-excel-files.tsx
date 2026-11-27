import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const mergeCsvExcelFiles: HowToGuide = {
  slug: "merge-csv-excel-files",
  title: "How to merge several CSV or Excel files into one",
  seoTitle: "How to Merge Multiple CSV or Excel Files Into One",
  description:
    "Combine monthly exports or reports from different people into one table. How to merge files in Excel with Power Query, safely by hand, or free in your browser.",
  summary: "Twelve monthly files and you need one? Here's how to combine CSV or Excel files without mixing up the columns.",
  updated: "2026-11-27",
  tools: ["merge-files"],
  related: ["remove-duplicate-rows", "fix-column-names", "csv-opens-in-one-column", "excel-row-limit"],
  quickAnswer: (
    <p>
      To merge files, put the rows of every file under one set of column names, making sure each value lands in the right column. In Excel, put the
      files in one folder and use <strong>Data → Get Data → From File → From Folder</strong>, then <strong>Combine</strong>. Or use
      MyDataFixer&apos;s free <strong>Merge Files</strong>, which matches columns by name, can add the source file to each row, and runs in your
      browser.
    </p>
  ),
  body: (
    <>
      <h2>When you need to merge files</h2>
      <ul>
        <li>A sales system exports one file per month, and you need the whole year.</li>
        <li>Each branch, shop or team member sends their own spreadsheet.</li>
        <li>A website or survey tool limits exports, so the data comes in several parts.</li>
      </ul>
      <p>
        Copying and pasting works for two small files, but it gets risky with more: one file has an extra column, another has the columns in a
        different order, and suddenly phone numbers sit under “city”.
      </p>

      <h2>Example</h2>
      <ExampleTable
        caption="Two files with the same columns in a different order"
        headers={["jan.csv", "feb.csv"]}
        rows={[
          ["id, name, city", "name, id, phone"],
          ["00123, Asha, Pune", "Ben, 00124, +39 06 1234"],
        ]}
      />
      <ExampleTable
        caption="Merged correctly: matched by column name"
        headers={["Source file", "id", "name", "city", "phone"]}
        rows={[
          ["jan.csv", "00123", "Asha", "Pune", ""],
          ["feb.csv", "00124", "Ben", "", "+39 06 1234"],
        ]}
      />
      <p>
        Pasting feb.csv straight under jan.csv would put “Ben” under id and “00124” under name. Matching by column name avoids that, and the
        columns that only one file has (city, phone) stay empty for the other.
      </p>

      <h2>Merge files in Excel with Power Query</h2>
      <ExcelNote />
      <p>This works best when the files have the same columns. In Excel for Microsoft 365 and Excel 2016 or later:</p>
      <ol>
        <li>Put all the files you want to merge in one folder, and nothing else.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Get Data</strong> → <strong>From File</strong> → <strong>From Folder</strong> and choose the folder.
        </li>
        <li>
          Click <strong>Combine</strong> → <strong>Combine &amp; Transform Data</strong> (or <strong>Combine &amp; Load</strong>).
        </li>
        <li>Choose the example file and, for Excel files, the sheet. Excel uses its columns for all the files.</li>
        <li>
          In the Power Query Editor, a <em>Source.Name</em> column shows which file each row came from. Set code columns to <strong>Text</strong>{" "}
          to keep leading zeros, then click <strong>Close &amp; Load</strong>.
        </li>
      </ol>
      <p>
        A nice bonus: when you add next month&apos;s file to the folder, <strong>Data → Refresh All</strong> adds it. The catch: Power Query is
        strict about column names, and files with different columns may need extra steps.
      </p>

      <h2>Merge files by copy and paste (small files)</h2>
      <ol>
        <li>Open the first file and save it under a new name, such as “all months.xlsx”.</li>
        <li>Open the next file, check that its columns are in exactly the same order, and copy its rows without the header.</li>
        <li>Paste them under the last row of the first file. Repeat for each file.</li>
        <li>If you need to know where rows came from, add a column with the file name before pasting.</li>
      </ol>
      <p>Check the column order every time; this is where most mistakes happen.</p>

      <h2>What about the command line?</h2>
      <p>
        On Windows, <code>copy *.csv all.csv</code> joins CSV files into one. But it copies every file&apos;s header row into the middle of the
        data, doesn&apos;t check the columns, and can join a last line to the next file&apos;s first line if a file doesn&apos;t end with a line
        break. Use it only for identical files you can check afterwards.
      </p>

      <h2>Merge files with MyDataFixer</h2>
      <p>
        Open <Link href="/merge-files">Merge Files</Link> and choose or drop all the files at once. It works in your browser, on a computer, tablet or
        phone, and the files are never uploaded.
      </p>
      <ol>
        <li>
          Add CSV, TSV, TXT and Excel files, even mixed. Each CSV&apos;s separator and text encoding are found on their own, so a semicolon file from
          Germany and a comma file from the US merge correctly.
        </li>
        <li>Change the order or remove files; the rows follow the order of the list.</li>
        <li>
          Keep <strong>Add a “Source file” column</strong> ticked to see where each row came from, and tick <strong>Remove rows that appear more than
          once</strong> if the files overlap.
        </li>
        <li>Merge, check the table and the notes, and download CSV or Excel. Each file is checked before it is downloaded.</li>
      </ol>
      <p>
        Columns are matched by name, ignoring capital letters and spaces, so “Email” and “ email ” line up and the order doesn&apos;t matter. A note
        lists columns that only some files have. Up to 50 files and 150 MB can be merged at once; for Excel files, the first visible sheet is used.
      </p>

      <h2>Before you merge</h2>
      <ul>
        <li>
          <strong>Make the column names match.</strong> “E-mail” in one file and “Email” in another become two columns. Rename them first.
        </li>
        <li>
          <strong>Check for overlaps.</strong> Exports that cover the same days twice create duplicate rows; remove them while merging or afterwards.
        </li>
        <li>
          <strong>Mind Excel&apos;s row limit.</strong> One Excel sheet holds 1,048,576 rows. Bigger merges should stay CSV.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        To merge files safely, match the columns by name, keep track of where each row came from, and watch for duplicates. In Excel, use Data → Get
        Data → From Folder and Combine. For small files, copy and paste while checking the column order. MyDataFixer&apos;s Merge Files matches
        columns by name, mixes CSV and Excel files, can add the source file and remove duplicates, and downloads CSV or Excel.
      </p>
    </>
  ),
  faqs: [
    {
      q: "How do I merge multiple CSV files into one?",
      a: "In Excel, put them in one folder and use Data → Get Data → From File → From Folder → Combine. Or open them all in MyDataFixer's Merge Files, which matches columns by name.",
    },
    {
      q: "What if the files have columns in a different order?",
      a: "Match by column name, not by position. Power Query and MyDataFixer both do this; copy and paste doesn't, so check the order by hand.",
    },
    {
      q: "Can I merge Excel and CSV files together?",
      a: "Yes. Power Query can combine files of one type per folder; MyDataFixer's Merge Files takes CSV and Excel files together in one merge.",
    },
    {
      q: "How do I know which file a row came from?",
      a: "Add a column with the file name. Power Query adds Source.Name, and MyDataFixer adds a “Source file” column.",
    },
    {
      q: "Can I merge files on my phone?",
      a: "The Excel phone app can't combine files. MyDataFixer's Merge Files works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my files?",
      a: "No. Your files are read and merged in your browser, on your device.",
    },
  ],
};
