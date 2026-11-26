import Link from "next/link";
import { ExampleTable, FileLines } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const changeCsvSeparator: HowToGuide = {
  slug: "change-csv-separator",
  title: "How to change a CSV file's separator (comma, semicolon or tab)",
  seoTitle: "Change a CSV Separator: Comma, Semicolon or Tab",
  description:
    "Need a comma CSV but have semicolons, or the other way round? Learn how to convert a CSV file to another separator safely, without breaking values.",
  summary: "Turn a semicolon CSV into a comma CSV (or into tabs) without splitting values that contain commas.",
  updated: "2026-11-24",
  tools: ["csv-validator"],
  related: ["csv-opens-in-one-column", "fix-wrong-number-of-columns", "utf-8-bom-explained"],
  quickAnswer: (
    <p>
      Don&apos;t use Find and Replace: values that already contain commas would break. Instead, open the file with its current separator and save
      it again with the new one. In Excel this depends on your computer&apos;s settings; the simplest way is a tool that reads the file properly
      and lets you choose the separator when you download, such as MyDataFixer&apos;s CSV Validator.
    </p>
  ),
  body: (
    <>
      <h2>Why you might need a different separator</h2>
      <ul>
        <li>An online shop, CRM or database only accepts commas, but your file uses semicolons.</li>
        <li>Colleagues in Europe use Excel with semicolons, and your comma file opens in one column for them.</li>
        <li>Your data contains many commas (addresses, descriptions), and tabs would be cleaner.</li>
      </ul>

      <h2>Why Find and Replace breaks files</h2>
      <FileLines caption="A semicolon file with a comma inside an address" lines={["name;address;amount", "Asha Patil;Shop 4, Main Street;1250,50"]} />
      <p>
        Replacing every <code>;</code> with <code>,</code> gives <code>Asha Patil,Shop 4, Main Street,1250,50</code>: five values instead of three,
        because the commas that were already there now look like separators too. A proper conversion writes{" "}
        <code>Asha Patil,&quot;Shop 4, Main Street&quot;,&quot;1250,50&quot;</code>, putting values with commas in quotes.
      </p>

      <h2>The three common separators</h2>
      <ExampleTable
        caption="Which separator to choose"
        headers={["Separator", "Looks like", "Use when"]}
        rows={[
          ["Comma", "Asha,Lyon,500", "most import tools and databases, in the US, UK, Canada and Australia"],
          ["Semicolon", "Asha;Lyon;500", "Excel in countries that use a decimal comma"],
          ["Tab", "Asha  Lyon  500", "data with many commas; often saved as .tsv"],
        ]}
      />

      <h2>Change it in Excel</h2>
      <ExcelNote />
      <ol>
        <li>
          Open the file with <strong>Data</strong> → <strong>From Text/CSV</strong> and choose its current separator under{" "}
          <strong>Delimiter</strong>, then <strong>Load</strong>.
        </li>
        <li>
          Save it with <strong>File</strong> → <strong>Save As</strong> → <strong>CSV UTF-8</strong>.
        </li>
      </ol>
      <p>
        The catch: Excel saves a CSV using the list separator from your computer&apos;s regional settings, so on a computer set up for Europe it
        may write semicolons again. Changing that setting affects every program. Excel may also change how dates and numbers are written when it
        saves. For a tab-separated file, choose <strong>Text (Tab delimited)</strong> instead.
      </p>

      <h2>Change it in Google Sheets</h2>
      <ol>
        <li>
          Import the file with <strong>File</strong> → <strong>Import</strong> and choose its current separator.
        </li>
        <li>
          Download it with <strong>File</strong> → <strong>Download</strong> → <strong>Comma-separated values (.csv)</strong> or{" "}
          <strong>Tab-separated values (.tsv)</strong>.
        </li>
      </ol>
      <p>Google Sheets always writes commas for CSV and tabs for TSV; it has no semicolon option.</p>

      <h2>Change it with MyDataFixer</h2>
      <ol>
        <li>
          Open the file in the <Link href="/csv-validator">CSV Validator</Link>. It detects the current separator (comma, semicolon, tab or pipe);
          if the preview looks wrong, choose the right one.
        </li>
        <li>Check the result: the validator also tells you if any row has the wrong number of values, which you should fix first.</li>
        <li>
          Download a copy and choose the new separator: <strong>comma</strong>, <strong>semicolon</strong> or <strong>tab</strong>. You can also
          choose the line endings (Windows CRLF or Unix LF) and the encoding (UTF-8 with or without BOM).
        </li>
      </ol>
      <p>
        Values that contain the new separator, quotes or line breaks are put in quotes automatically, and the downloaded file is read back and
        compared with the original before it is offered. The values themselves never change, only how the file is written. Everything runs in
        your browser; the file is never uploaded.
      </p>

      <h2>Decimal commas</h2>
      <p>
        A file from Europe may write numbers like <code>1250,50</code>. Changing the separator doesn&apos;t change these numbers: in a comma file
        they are kept in quotes, exactly as written. If the program you import into expects <code>1250.50</code>, the numbers themselves need
        converting, which is a separate step, so check a few rows after importing.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Nikhil receives a product list from a supplier in Germany, separated by semicolons, and his online store only accepts commas. He opens it
        in the CSV Validator, which confirms the separator is a semicolon and that every row has 8 fields. He downloads a copy with commas and
        UTF-8 without BOM. Product names with commas, like “Cable, 2 m”, are written in quotes, and the store imports all products correctly.
      </p>

      <h2>How to avoid separator problems next time</h2>
      <ul>
        <li>Ask the program you import into which separator it needs, and write it down for next time.</li>
        <li>When you send a CSV abroad, mention the separator in your message, or send an Excel file instead.</li>
        <li>Prefer tabs when your data contains many commas, such as addresses or product descriptions.</li>
        <li>Never edit separators by hand in a text editor.</li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Never swap separators with Find and Replace. Read the file with its current separator and write it with the new one, so values with
        commas are quoted. Google Sheets writes commas, Excel writes your computer&apos;s separator, and the CSV Validator lets you pick comma,
        semicolon or tab.
      </p>
    </>
  ),
  faqs: [
    {
      q: "How do I convert a semicolon CSV to a comma CSV?",
      a: "Open it with its semicolon separator and save it as comma CSV, so values with commas get quotes. MyDataFixer's CSV Validator lets you choose comma when you download.",
    },
    {
      q: "Why does Excel save my CSV with semicolons?",
      a: "Excel uses the list separator from your computer's regional settings. In many European countries that is a semicolon.",
    },
    {
      q: "What's the difference between CSV and TSV?",
      a: "Only the separator: CSV uses commas (or semicolons), TSV uses tabs. Tab-separated files are often saved with the .tsv extension.",
    },
    {
      q: "Will changing the separator change my numbers?",
      a: "No. Only how the file is written changes. Numbers with decimal commas stay exactly as they are, in quotes if needed.",
    },
    {
      q: "Can I use a pipe (|) as a separator?",
      a: "MyDataFixer can read pipe-separated files and save them with a comma, semicolon or tab. Saving with a pipe isn't offered.",
    },
    {
      q: "Does changing the separator change line endings or encoding?",
      a: "Not unless you choose to. In the CSV Validator you pick the separator, line endings (CRLF or LF) and encoding (UTF-8 with or without BOM) separately when you download.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is read and saved in your browser, on your device.",
    },
  ],
};
