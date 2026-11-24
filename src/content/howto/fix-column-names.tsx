import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import type { HowToGuide } from "./types";

export const fixColumnNames: HowToGuide = {
  slug: "fix-column-names",
  title: "How to fix empty, duplicate and messy column names",
  seoTitle: "Fix Empty or Duplicate Column Names in a CSV",
  description:
    "Imports fail when a column has no name or two columns share one. Learn how to find and fix empty, duplicate and badly spaced column names in CSV files.",
  summary: "Empty or repeated column names break imports and lookups. Here's how to find and fix them in the first row.",
  updated: "2026-11-24",
  tools: ["csv-validator"],
  related: ["check-csv-before-import", "fix-wrong-number-of-columns", "remove-extra-spaces"],
  quickAnswer: (
    <p>
      The first row of a CSV usually holds the column names. Import tools and databases need every column to have a name, and every name to be
      different. Give empty columns a name, rename duplicates (for example “email” and “email (2)”), and remove spaces around names, so “email ”
      and “email” match.
    </p>
  ),
  body: (
    <>
      <h2>Why column names matter</h2>
      <p>
        When you import a file, the program matches your columns to its own fields by name: “email” goes to the email field, “phone” to the phone
        field. If a name is missing, repeated or slightly different, the import fails, data lands in the wrong place, or a column is silently
        ignored. Lookups and pivot tables in spreadsheets also rely on names.
      </p>

      <h2>Common problems</h2>
      <ExampleTable
        caption="Column name problems in the first row"
        headers={["Problem", "Example", "What goes wrong"]}
        rows={[
          ["Empty name", "id, name, , city", "databases and many import tools refuse a column without a name"],
          ["Duplicate name", "email, phone, email", "only one of the two columns is used, or the import fails"],
          ["Spaces around a name", "\"email \"", "a program looking for “email” doesn't find it"],
          ["Very long name", "a 90-character sentence", "some databases limit names to 64 characters"],
          ["No header row at all", "1001, Asha, Pune", "the first record is treated as column names"],
        ]}
      />

      <h2>Where these problems come from</h2>
      <ul>
        <li>A column was added in Excel and never given a title.</li>
        <li>Two exports were joined side by side, both with an “email” column.</li>
        <li>Someone typed a space after a name, or the export padded names with spaces.</li>
        <li>Every line ends with an extra separator, which creates an empty column at the end without a name.</li>
        <li>The file was exported without its header row.</li>
      </ul>

      <h2>Fix it in Excel or Google Sheets</h2>
      <ol>
        <li>Open the file and look at row 1.</li>
        <li>Type a name into every empty header cell.</li>
        <li>Rename repeated names so each is unique, for example “email” and “email_work”.</li>
        <li>
          To remove spaces around names, use <code>=TRIM(A1)</code> in a spare row, then copy and paste the results back as values.
        </li>
        <li>If there&apos;s no header row, insert a row at the top and type the names your import tool expects.</li>
      </ol>
      <p>
        Saving the CSV from Excel can change other values (zeros, dates, long numbers). If that worries you, fix the names with the tool below
        instead, which changes nothing else.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open the file in the <Link href="/csv-validator">CSV Validator</Link> with “First row contains column names” ticked. It checks the names
        and reports:
      </p>
      <ul>
        <li>
          <strong>Columns without a name</strong>, with their column letters.
        </li>
        <li>
          <strong>Duplicate column names</strong>, compared ignoring capitals and spaces at the edges, so “Email” and “email ” count as the same.
        </li>
        <li>
          <strong>Spaces around column names.</strong>
        </li>
        <li>
          <strong>Very long column names</strong> (more than 64 characters).
        </li>
        <li>
          <strong>A first row that may be data</strong>, when it looks like a record (numbers, empty cells, repeated values) rather than names.
        </li>
      </ul>
      <p>Two repairs, both with a preview first:</p>
      <ul>
        <li>
          <strong>Fix column names:</strong> empty names become “Column C” (using the column letter) and duplicates become “email (2)”. A new name
          never creates another duplicate, and no data cell is changed. An empty column at the end caused by an extra separator on every line is
          left unnamed and explained, because it is an empty column rather than a missing name.
        </li>
        <li>
          <strong>Remove spaces around names:</strong> trims spaces at the start and end of the names only.
        </li>
      </ul>
      <p>
        After the repairs, you can rename any column to what your import tool expects by tapping the pencil next to its name in the table. Then
        download the file. Everything runs in your browser.
      </p>

      <h2>Files without a header row</h2>
      <p>
        If your file has no column names, untick “First row contains column names” so the first row is treated as data. Many import tools need a
        header row, so add one with the names they expect; their help page usually lists them.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Harish merges two customer exports side by side and tries to import the result into an email tool, which complains about a duplicate
        field. The CSV Validator shows “Duplicate column names: “email” in C, F” and one column without a name. Fix column names renames them to
        “email” and “email (2)” and names the empty one “Column H”. He renames “email (2)” to “email_work” with the pencil, downloads the file,
        and the import maps every column correctly.
      </p>

      <h2>How to avoid it next time</h2>
      <ul>
        <li>Keep one clear, unique name per column, without spaces at the start or end.</li>
        <li>Use the names from the import tool&apos;s template when you build a file for it.</li>
        <li>Check the first row after joining files from different sources.</li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Every column needs a unique name without extra spaces. Find problems with the CSV Validator, fix them with Fix column names and Remove
        spaces around names, rename columns with the pencil, and download the file without any other value changing.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Why does my import say 'duplicate column'?",
      a: "Two columns have the same name, sometimes differing only in capitals or spaces. Rename one of them.",
    },
    {
      q: "What name does MyDataFixer give an empty column?",
      a: "“Column” plus its letter, such as “Column C”. You can rename it afterwards with the pencil next to the name.",
    },
    {
      q: "Does fixing column names change my data?",
      a: "No. Only the names in the first row change; every data cell stays the same.",
    },
    {
      q: "Why is there an empty column at the end of my file?",
      a: "Every line probably ends with an extra separator. The CSV Validator reports this, and the extra empty field can be removed.",
    },
    {
      q: "What makes a good column name?",
      a: "Short, unique and clear, without spaces at the start or end, for example customer_id, email or city. Use the names your import tool's template asks for.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is checked and fixed in your browser, on your device.",
    },
  ],
};
