import Link from "next/link";
import { ExampleTable, FileLines } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const convertXmlToCsv: HowToGuide = {
  slug: "convert-xml-to-csv",
  title: "How to convert XML to CSV or Excel",
  seoTitle: "How to Convert XML to CSV or Excel (Step by Step)",
  description:
    "Turn an XML file (a product feed, accounting export or sitemap) into a table for Excel. How to do it in Excel, and free in your browser with MyDataFixer.",
  summary: "Got data as XML from a shop, an accounting tool or a government portal? Here's how to turn it into a spreadsheet.",
  updated: "2026-11-27",
  tools: ["xml-to-csv"],
  related: ["convert-json-to-csv", "convert-tsv-to-csv", "keep-leading-zeros-in-csv", "csv-vs-excel"],
  quickAnswer: (
    <p>
      To convert XML to a spreadsheet, find the element that repeats for every record (such as <code>&lt;product&gt;</code>), and turn each one into
      a row and each field inside it into a column. In Excel, use <strong>Data → Get Data → From File → From XML</strong> and load the table. Or open
      the file in MyDataFixer&apos;s free <strong>XML to CSV</strong> converter, which finds the records for you and downloads a CSV or Excel file.
    </p>
  ),
  body: (
    <>
      <h2>What an XML file looks like</h2>
      <p>
        XML stores data as text with named tags around each value. Online shops use it for product feeds, accounting and billing software for
        exports, banks and government portals for statements and e-invoices, and websites for sitemaps and RSS feeds. A typical file:
      </p>
      <FileLines
        caption="products.xml"
        lines={[
          "<products>",
          '  <product id="1"><sku>00123</sku><name>Kurta</name><price>499</price></product>',
          '  <product id="2"><sku>00124</sku><name>Saree</name><price>1299</price></product>',
          "</products>",
        ]}
      />
      <p>
        Every value sits between an opening tag such as <code>&lt;name&gt;</code> and a closing tag <code>&lt;/name&gt;</code>. Some values are
        written as attributes inside a tag, like <code>id=&quot;1&quot;</code>. Spreadsheets need this as rows and columns.
      </p>

      <h2>How XML becomes a table</h2>
      <ExampleTable
        caption="The same data as a table"
        headers={["id", "sku", "name", "price"]}
        rows={[
          ["1", "00123", "Kurta", "499"],
          ["2", "00124", "Saree", "1299"],
        ]}
      />
      <ul>
        <li>The element that repeats, here <code>&lt;product&gt;</code>, is one record, so one row.</li>
        <li>Each tag inside it (sku, name, price) and each attribute (id) becomes a column.</li>
        <li>
          A tag inside a tag, such as <code>&lt;address&gt;&lt;city&gt;</code>, becomes a column such as address.city.
        </li>
        <li>A tag that appears more than once in one record, such as two phone numbers, needs to share a cell or get extra columns.</li>
      </ul>

      <h2>Convert XML in Excel</h2>
      <ExcelNote />
      <h3>Method 1: Get Data (Excel for Microsoft 365 and 2016 or later, Windows)</h3>
      <ol>
        <li>
          Go to <strong>Data</strong> → <strong>Get Data</strong> → <strong>From File</strong> → <strong>From XML</strong> and choose the file.
        </li>
        <li>
          The <strong>Navigator</strong> shows the parts of the file. Click the one that holds your records (for example <em>product</em>); the
          preview on the right shows it as a table.
        </li>
        <li>
          Click <strong>Transform Data</strong> if you need to change something: columns that show <em>Table</em> can be expanded with the
          two-arrow icon in their header, and code columns can be set to <strong>Text</strong> so they keep their zeros.
        </li>
        <li>
          Click <strong>Load</strong> (or <strong>Close &amp; Load</strong>). To make a CSV, use <strong>File → Save As</strong> and choose{" "}
          <strong>CSV UTF-8</strong>.
        </li>
      </ol>
      <h3>Method 2: open the XML file directly</h3>
      <p>
        In Excel for Windows you can also open an .xml file with <strong>File → Open</strong>. Excel asks how to open it; choose{" "}
        <strong>As an XML table</strong>. This works well for simple files, but Excel may spread nested data over many rows.
      </p>

      <h2>What about Google Sheets?</h2>
      <p>
        Google Sheets can&apos;t import an XML file from your computer. Its IMPORTXML function only reads web addresses and needs an XPath query,
        which is hard to get right. Convert the file to CSV first and import that with <strong>File → Import</strong>.
      </p>

      <h2>Convert XML with MyDataFixer</h2>
      <p>
        Open the file in <Link href="/xml-to-csv">XML to CSV</Link>. It works in your browser, on a computer, tablet or phone, and your file is never
        uploaded.
      </p>
      <ol>
        <li>
          The element that holds the records is found for you: the one that repeats and has fields of its own, such as every product or every
          voucher. If the file has several lists, choose another above the table.
        </li>
        <li>
          Each record becomes a row. Tags and attributes become columns, nested tags get dotted names such as address.city, and a tag repeated inside
          one record (two phone numbers) is joined in one cell with “; ”.
        </li>
        <li>Download the table as CSV or as an Excel file. Each file is read back and checked before it is offered.</li>
      </ol>
      <p>
        Codes keep their leading zeros, long numbers keep all their digits, and entities such as <code>&amp;amp;</code> become a plain “&amp;”.
        Product feeds keep their prefixes, such as <code>g:price</code>. The file&apos;s own text encoding is used, and if the XML has a mistake, you
        see what is wrong and on which line and column.
      </p>

      <h2>Common problems</h2>
      <ul>
        <li>
          <strong>Codes lose their zeros or long numbers change.</strong> Excel turns 00123 into 123 and keeps only 15 digits. Set such columns to
          Text, or use a converter that keeps values as written.
        </li>
        <li>
          <strong>“The XML file is not valid”.</strong> A tag isn&apos;t closed, tags are closed in the wrong order, or a plain “&amp;” appears in
          the text (it must be written <code>&amp;amp;</code>). MyDataFixer shows the line and column so you can fix it in a text editor.
        </li>
        <li>
          <strong>Too many rows or columns.</strong> The wrong element was used as the record. Choose the one that repeats once per item.
        </li>
        <li>
          <strong>Strange characters.</strong> The encoding was read wrongly. XML files usually say their encoding in the first line; a good converter
          uses it.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Converting XML to CSV turns each repeated element into a row and each tag or attribute inside it into a column. In Excel, use Data → Get Data →
        From XML, pick the records in the Navigator and load them. Google Sheets can&apos;t import XML files. MyDataFixer&apos;s XML to CSV finds the
        records for you, handles nested and repeated tags, keeps values exactly, and downloads CSV or Excel.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Can Excel open XML files?",
      a: "Yes. Use Data → Get Data → From File → From XML in Excel for Microsoft 365 and 2016 or later on Windows, or File → Open and choose “As an XML table”.",
    },
    {
      q: "Which part of the XML becomes the rows?",
      a: "The element that repeats once for every record, such as <product> in a product feed or <VOUCHER> in an accounting export. MyDataFixer finds it for you and lets you choose another.",
    },
    {
      q: "What happens to attributes?",
      a: "Attributes such as id=\"1\" become columns too. In MyDataFixer, an attribute column gets an @ in front only when a tag has the same name.",
    },
    {
      q: "Can I convert XML in Google Sheets?",
      a: "Not from a file on your computer. Convert it to CSV first, then import the CSV.",
    },
    {
      q: "Can I convert XML on my phone?",
      a: "The Excel phone app can't import XML. MyDataFixer's XML to CSV works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is read and converted in your browser, on your device.",
    },
  ],
};
