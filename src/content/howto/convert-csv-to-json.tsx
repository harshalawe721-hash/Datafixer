import Link from "next/link";
import { ExampleTable, FileLines } from "@/components/guides/ExampleTable";
import type { HowToGuide } from "./types";

export const convertCsvToJson: HowToGuide = {
  slug: "convert-csv-to-json",
  title: "How to convert a CSV or Excel file to JSON",
  seoTitle: "How to Convert CSV or Excel to JSON (Free, No Code)",
  description:
    "Turn a spreadsheet into JSON for an app, website or API. What the JSON looks like, how to keep codes and numbers right, and a free browser converter.",
  summary: "An app or developer wants your spreadsheet as JSON? Here's what that means and how to make it without code.",
  updated: "2026-11-27",
  tools: ["csv-to-json"],
  related: ["convert-json-to-csv", "fix-column-names", "keep-leading-zeros-in-csv", "check-csv-before-import"],
  quickAnswer: (
    <p>
      To convert a CSV or Excel file to JSON, each row becomes a record and each column name becomes a key: a row “00123, Asha, Pune” under the
      columns id, name, city becomes <code>{"{"}&quot;id&quot;: &quot;00123&quot;, &quot;name&quot;: &quot;Asha&quot;, &quot;city&quot;: &quot;Pune&quot;{"}"}</code>.
      Excel has no “Save as JSON”, so use a converter such as MyDataFixer&apos;s free <strong>CSV to JSON</strong>, which runs in your browser and
      shows the first records before you download.
    </p>
  ),
  body: (
    <>
      <h2>Why you might need JSON</h2>
      <p>
        Spreadsheets are made for people; JSON is made for programs. Websites, apps, online shops and other tools often import data as JSON, and
        developers usually ask for it. If someone says “send it as JSON”, they want the same data written as a list of records with named values.
      </p>

      <h2>How a table becomes JSON</h2>
      <ExampleTable
        caption="customers.csv"
        headers={["id", "name", "age", "active"]}
        rows={[
          ["00123", "Asha", "30", "true"],
          ["00124", "Ben", "", "false"],
        ]}
      />
      <FileLines
        caption="The same data as JSON"
        lines={[
          "[",
          '  {"id": "00123", "name": "Asha", "age": "30", "active": "true"},',
          '  {"id": "00124", "name": "Ben", "age": "", "active": "false"}',
          "]",
        ]}
      />
      <ul>
        <li>The whole file is a list, in square brackets.</li>
        <li>Each row becomes one record, in curly brackets.</li>
        <li>Each column name becomes a key, written in quotes, so the column names matter: they should be short, unique and filled in.</li>
      </ul>

      <h2>Text or numbers?</h2>
      <p>
        In the example above every value is in quotes, which means it is text. That is the safest choice: nothing changes. But a program may
        expect the age as a number (<code>30</code>, without quotes), <code>true</code> and <code>false</code> without quotes, and{" "}
        <code>null</code> for an empty value. Ask whoever will use the file which they need.
      </p>
      <p>Some values should always stay text, even when the rest are numbers:</p>
      <ul>
        <li>
          <strong>Codes with leading zeros</strong>, such as 00123, ZIP and PIN codes, or phone numbers. As numbers they lose their zeros.
        </li>
        <li>
          <strong>Long numbers</strong> such as card numbers or long IDs. Many programs keep only 15 or 16 digits of a number and change the rest.
        </li>
        <li>
          <strong>Dates</strong>, which JSON has no special type for. Write them as text, preferably as 2024-03-15.
        </li>
      </ul>

      <h2>Pretty, compact or JSON Lines</h2>
      <ul>
        <li>
          <strong>Pretty</strong> JSON has line breaks and indents, so people can read it.
        </li>
        <li>
          <strong>Compact</strong> JSON has no extra spaces, so the file is smaller. Programs read both the same way.
        </li>
        <li>
          <strong>JSON Lines</strong> (.jsonl) puts one record on each line instead of one big list. Data tools and databases often prefer it for
          large files.
        </li>
      </ul>

      <h2>Can Excel save as JSON?</h2>
      <p>
        No. Excel can read JSON with Power Query, but it can&apos;t save a sheet as JSON. People sometimes build the JSON text with long formulas,
        but it&apos;s easy to break with a quote or a comma inside a value. Google Sheets has no JSON export either. A converter is the reliable
        way.
      </p>

      <h2>Convert to JSON with MyDataFixer</h2>
      <p>
        Open your CSV, TSV or Excel file in <Link href="/csv-to-json">CSV to JSON</Link>. It works in your browser, on a computer, tablet or phone,
        and your file is never uploaded.
      </p>
      <ol>
        <li>
          Keep <strong>First row contains column names</strong> ticked so the column names become the keys. Empty names become column_2, and
          repeated names get _2, so every key is unique.
        </li>
        <li>
          Choose the values: <strong>As text, exactly as shown</strong>, or <strong>Detect numbers, true/false and empty values</strong>. With
          detection on, codes with leading zeros, numbers longer than 15 digits and dates still stay text.
        </li>
        <li>Choose pretty, compact or JSON Lines.</li>
        <li>Check the preview of the first records, then download. Every record is read back and checked before the file is offered.</li>
      </ol>

      <h2>Before you convert</h2>
      <ul>
        <li>
          <strong>Fix the column names.</strong> Short, unique names without spaces at the ends make good keys, such as <code>first_name</code>.
        </li>
        <li>
          <strong>Remove empty rows and columns</strong>, or they become empty records and keys.
        </li>
        <li>
          <strong>Check special characters.</strong> If accented letters look wrong in the table, the CSV encoding is wrong; fix that first, because
          JSON is always UTF-8.
        </li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Meera runs a small online shop and is moving her product list to a new shop builder that imports products as JSON. Her list is an Excel
        file with the columns sku, title, price and in stock. She opens it in CSV to JSON and ticks “Detect numbers, true/false and empty values”,
        because the builder wants prices as numbers. The preview shows <code>&quot;price&quot;: 499</code> without quotes, while the SKU 0071 stays
        <code>&quot;0071&quot;</code>, as it should. One column is called “in stock”, with a space, which the builder doesn&apos;t accept as a key, so
        she renames it to in_stock in Excel, opens the file again and downloads the JSON. The import works on the first try.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Turning every value into a number.</strong> Codes, phone numbers and IDs lose their zeros or their last digits. Keep them as
          text.
        </li>
        <li>
          <strong>Forgetting the header row.</strong> Without column names, the keys become column_1, column_2 and so on, which no program
          expects. Make sure the first row holds the names.
        </li>
        <li>
          <strong>Building JSON by hand.</strong> A single quote mark or comma inside a value breaks hand-written JSON. A converter puts in the
          backslashes and quotes JSON needs.
        </li>
        <li>
          <strong>Sending the wrong layout.</strong> A program that expects one list can&apos;t read JSON Lines, and the other way round. Check
          which one is needed.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Converting a spreadsheet to JSON turns each row into a record and each column name into a key. Decide whether values should be text or
        numbers, keep codes, long numbers and dates as text, and choose pretty, compact or JSON Lines. Excel and Google Sheets can&apos;t save JSON,
        so use a converter such as MyDataFixer&apos;s CSV to JSON.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Can I export JSON from Excel?",
      a: "Not directly: Excel has no Save as JSON. Use a converter such as MyDataFixer's CSV to JSON, which also reads .xlsx and .xls files.",
    },
    {
      q: "Why are all my values in quotes?",
      a: "Quotes mean text. Writing every value as text is the safe default. If the program needs numbers and true/false, choose to detect them.",
    },
    {
      q: "Why should 00123 stay in quotes?",
      a: "As a number it would become 123. Codes with leading zeros, phone numbers and long IDs should always stay text.",
    },
    {
      q: "What's the difference between JSON and JSON Lines?",
      a: "JSON holds all records in one list. JSON Lines (.jsonl) has one record per line, which large-data tools often prefer.",
    },
    {
      q: "Can I convert to JSON on my phone?",
      a: "Yes, MyDataFixer's CSV to JSON works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is read and converted in your browser, on your device.",
    },
  ],
};
