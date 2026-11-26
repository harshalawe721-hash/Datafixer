import Link from "next/link";
import { ExampleTable, FileLines } from "@/components/guides/ExampleTable";
import type { HowToGuide } from "./types";

export const fixBrokenQuotesInCsv: HowToGuide = {
  slug: "fix-broken-quotes-in-csv",
  title: "How to fix broken quotes in a CSV file",
  seoTitle: "How to Fix Broken Quotes in a CSV File",
  description:
    "A quote that never closes can swallow the rest of a CSV file. Learn how quotes work in CSV, how to find broken ones and how to fix them safely.",
  summary: "One missing quotation mark can turn the rest of a CSV into a single value. Here's how quotes work and how to fix them.",
  updated: "2026-11-24",
  tools: ["csv-validator"],
  related: ["fix-wrong-number-of-columns", "check-csv-before-import", "csv-opens-in-one-column"],
  quickAnswer: (
    <p>
      In a CSV file, double quotes (<code>&quot;</code>) wrap values that contain commas, quotes or line breaks. Every opening quote needs a
      closing quote, and a quote inside a quoted value is written twice (<code>&quot;&quot;</code>). If a quote never closes, everything after
      it can be read as one huge value. Find the line where it starts, and add the missing quote or double the quote inside the value.
    </p>
  ),
  body: (
    <>
      <h2>How quotes work in a CSV file</h2>
      <p>The rules are simple, but easy to break when files are made by hand or by a careless program:</p>
      <ExampleTable
        caption="Quote rules in CSV"
        headers={["Value", "Written in the file as", "Why"]}
        rows={[
          ["Lyon", "Lyon", "no special characters, no quotes needed"],
          ["Shop 4, Main Street", "\"Shop 4, Main Street\"", "contains a comma"],
          ["He said \"hi\"", "\"He said \"\"hi\"\"\"", "a quote inside is written twice"],
          ["Line one + line two", "\"Line one(line break)line two\"", "contains a line break"],
        ]}
      />

      <h2>Two kinds of broken quotes</h2>
      <h3>1. A quote that never closes</h3>
      <p>
        A value starts with <code>&quot;</code> but the closing quote is missing. The program keeps reading, including commas and line breaks,
        looking for the end of the value. It may read the rest of the file as one value, so you suddenly have far fewer rows than expected, or a
        cell with thousands of characters.
      </p>
      <h3>2. Quotes in unexpected places</h3>
      <p>
        A quote appears in the middle of a value that isn&apos;t wrapped in quotes, like <code>Monitor 5&quot; screen</code>. Different programs
        read these differently: one keeps the quote, another splits or joins values. (When text follows a closing quote, as in{" "}
        <code>&quot;Lyon&quot;x</code>, many readers lose track of where the value ends, which looks like the first kind.)
      </p>

      <h2>Example</h2>
      <FileLines
        caption="products.csv: the inch sign in line 2 breaks the quoting"
        lines={["id,name,price", '101,"Tablet 10" screen,15999', "102,Phone case,299", "103,Charger,499"]}
      />
      <p>
        On line 2, the value starts with a quote, and the inch sign after “10” is meant as part of the name, but to a CSV reader it is just
        another quote. The value no longer closes where it should, so the reader keeps going and the following lines can be swallowed into it.
        MyDataFixer&apos;s CSV Validator reports this line as “A quote that never closes”. Written correctly, it is{" "}
        <code>&quot;Tablet 10&quot;&quot; screen&quot;</code>, or simply <code>Tablet 10 inch screen</code>.
      </p>

      <h2>How to find broken quotes</h2>
      <h3>Signs in Excel or Google Sheets</h3>
      <ul>
        <li>Far fewer rows than the file should have.</li>
        <li>One cell containing a very long text with commas and several records in it.</li>
        <li>Values shifted into the wrong columns from a certain row onwards.</li>
      </ul>
      <h3>In a text editor</h3>
      <p>
        Search for <code>&quot;</code> and check that quotes come in pairs on each value. Pay special attention to sizes in inches (10&quot;),
        quotes in product names and copied text.
      </p>
      <h3>With MyDataFixer</h3>
      <p>
        Open the file in the <Link href="/csv-validator">CSV Validator</Link>. Two checks look at quotes: “A quote that never closes” says on which
        row the unclosed value starts, and “Quote characters in unexpected places” lists rows where a quote sits inside a value that isn&apos;t
        wrapped in quotes. Each problem shows the line exactly as written in the file, with its line number.
      </p>

      <h2>How to fix them</h2>
      <ul>
        <li>
          <strong>Missing closing quote:</strong> add the quote where the value was meant to end. Only you can know where that is, so MyDataFixer
          never repairs this automatically; it shows you where it starts.
        </li>
        <li>
          <strong>A quote inside a value:</strong> wrap the whole value in quotes and write the inner quote twice, or replace it with a word (10
          inch).
        </li>
        <li>
          <strong>Best fix:</strong> export the file again from the original program, which usually writes quotes correctly.
        </li>
      </ul>
      <p>
        After correcting the file in a text editor, open it in the CSV Validator again to confirm the quote problems are gone and every row has
        the same number of fields.
      </p>

      <h2>Values with line breaks</h2>
      <p>
        A line break inside a quoted value is valid CSV, for example an address on two lines. But some programs and simple scripts read the file
        line by line and split such values into separate rows. The CSV Validator reports these as “Values that contain line breaks” so you can
        decide whether the program you import into handles them.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Lakshmi exports 800 products from her supplier&apos;s portal. Her shop&apos;s import says it found only 312 products. In the CSV Validator,
        “A quote that never closes” points to row 313: the product name starts with a quote, <code>&quot;Monitor 24 inch, Full HD</code>, but the
        export never wrote the closing quote, so the rest of the file was read as one value. She opens the file in a text editor, adds the
        missing quote after “Full HD”, checks it again in the validator (no quote problems, 800 rows), and the import finds all 800 products.
      </p>

      <h2>How to avoid it next time</h2>
      <ul>
        <li>Write sizes as “24 inch” instead of using the inch sign in product names.</li>
        <li>Let Excel, Google Sheets or the original program write CSV files; avoid building them by hand.</li>
        <li>Check exports from unfamiliar systems before importing them.</li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Quotes wrap values with commas, quotes or line breaks, must always close, and are doubled inside a value. A broken quote can swallow
        the rest of the file. Find it with the CSV Validator, fix it where the value was meant to end, and check the file again.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Why does my CSV have fewer rows than expected?",
      a: "Often a quote never closes, so several lines are read as one value. Find where it starts and add the missing quote.",
    },
    {
      q: "How do I write a quote inside a CSV value?",
      a: "Wrap the whole value in quotes and write the inner quote twice: \"Tablet 10\"\" screen\".",
    },
    {
      q: "Can MyDataFixer fix an unclosed quote automatically?",
      a: "No, because where the value was meant to end can't be known. It shows the row where the quote starts so you can fix it.",
    },
    {
      q: "Are line breaks inside values allowed in CSV?",
      a: "Yes, inside quotes. But some programs and scripts split them into separate rows, so check what the program you import into supports.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is checked in your browser, on your device.",
    },
  ],
};
