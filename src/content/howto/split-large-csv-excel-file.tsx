import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const splitLargeCsvExcelFile: HowToGuide = {
  slug: "split-large-csv-excel-file",
  title: "How to split a large CSV or Excel file into smaller files",
  seoTitle: "How to Split a Large CSV or Excel File Into Smaller Files",
  description:
    "File too big for Excel, an email or an import tool? Split it by number of rows, into equal parts or one file per value, with the column names in every part.",
  summary: "A file that's too big to open, send or import? Here's how to split it into smaller files without losing rows or the column names.",
  updated: "2026-11-28",
  tools: ["split-file"],
  related: ["excel-row-limit", "merge-csv-excel-files", "check-csv-before-import", "csv-vs-excel"],
  quickAnswer: (
    <p>
      To split a large file, copy its rows into several smaller files, putting the column names at the top of each one. In Excel you can copy blocks of
      rows into new workbooks by hand. With very large files, or to make one file per city or month, use MyDataFixer&apos;s free{" "}
      <strong>Split File</strong>: choose rows per part, a number of equal parts or a column, and download the parts as a .zip. It runs in your browser.
    </p>
  ),
  body: (
    <>
      <h2>When you need to split a file</h2>
      <ul>
        <li>
          <strong>It&apos;s too big for Excel.</strong> One Excel sheet holds 1,048,576 rows. A larger CSV opens only partly, with a warning that the
          file wasn&apos;t loaded completely.
        </li>
        <li>
          <strong>An import tool has a limit.</strong> Many CRMs, online shops and mailing tools accept only a certain number of rows or megabytes per
          upload.
        </li>
        <li>
          <strong>It&apos;s too big to email</strong> or to upload to a form with a size limit.
        </li>
        <li>
          <strong>Different people need different parts</strong>: each branch, region or sales rep should get only their own rows.
        </li>
      </ul>

      <h2>Two ways to split</h2>
      <p>
        <strong>By size</strong>: a number of rows in each part (for example 100,000), or a number of equal parts. Use this for limits in Excel, import
        tools and email.
      </p>
      <p>
        <strong>By value</strong>: one file for each value of a column, such as one file per city, per month or per customer. Use this when the parts
        go to different people or places.
      </p>
      <ExampleTable
        caption="orders.csv, split by the city column"
        headers={["File", "Rows inside"]}
        rows={[
          ["orders-Pune.csv", "order id, city, amount + every Pune order"],
          ["orders-Oslo.csv", "order id, city, amount + every Oslo order"],
          ["orders-Lima.csv", "order id, city, amount + every Lima order"],
        ]}
      />
      <p>Either way, every part should start with the column names, so each file still makes sense on its own.</p>

      <h2>Split a file in Excel (by hand)</h2>
      <ExcelNote />
      <p>This works when Excel can open the whole file, and when only a few parts are needed.</p>
      <ol>
        <li>Open the file. Click row 1&apos;s number to select the column names and copy them (Ctrl+C, or Cmd+C on a Mac).</li>
        <li>Create a new workbook (Ctrl+N) and paste the names into row 1.</li>
        <li>
          Back in the original, click the number of the first data row, then press <strong>Ctrl+Shift+↓</strong> to extend the selection, or type a range
          such as <code>2:100001</code> in the Name Box (left of the formula bar) and press Enter to select exactly 100,000 rows.
        </li>
        <li>Copy, and paste into row 2 of the new workbook. Save it as “part 1”.</li>
        <li>Repeat for the next block (for example rows 100002 to 200001) until every row has been copied.</li>
      </ol>
      <p>
        Check the row counts at the end: the parts together should have exactly as many rows as the original, without the header row counted twice. This
        is where mistakes happen, such as a block that starts one row too late.
      </p>

      <h2>One file per value in Excel</h2>
      <ol>
        <li>
          Click in the table and turn on <strong>Data → Filter</strong>.
        </li>
        <li>Open the filter on the column (for example City), untick “Select All” and tick one value.</li>
        <li>Select the visible rows with the column names, copy them and paste them into a new workbook. Only the visible rows are copied.</li>
        <li>Save the workbook under the value&apos;s name, then repeat for every other value.</li>
      </ol>
      <p>
        Watch out for values written in different ways, such as “Pune” and “pune ”: the filter lists them separately. Tidy them first, for example with{" "}
        <Link href="/guides/fix-inconsistent-capitalization">consistent capitalization</Link> and{" "}
        <Link href="/guides/remove-extra-spaces">no extra spaces</Link>.
      </p>

      <h2>What about the command line?</h2>
      <p>
        On macOS and Linux, <code>split -l 100000 data.csv part-</code> cuts a file into pieces of 100,000 lines. But only the first piece gets the
        column names, and it counts lines, not rows: a value with a line break inside quotes (such as an address over two lines) can be cut in half,
        breaking both pieces. Use it only for simple files you can check afterwards.
      </p>

      <h2>Split a file with MyDataFixer</h2>
      <p>
        Open <Link href="/split-file">Split File</Link> and choose your file. It works in your browser, on a computer, tablet or phone, and the file is
        never uploaded.
      </p>
      <ol>
        <li>Open a CSV, TSV, TXT or Excel file of up to 150 MB, more than Excel can show in one sheet. For a workbook, choose the sheet.</li>
        <li>
          Choose <strong>A number of rows in each part</strong>, <strong>A number of equal parts</strong>, or <strong>One part for each value in a
          column</strong> and pick the column.
        </li>
        <li>Check the list of parts: each one shows its file name, its rows and which rows of your file it holds.</li>
        <li>
          Choose CSV or Excel parts, then click <strong>Download all parts (.zip)</strong>, or download the parts one at a time (easier on a phone).
        </li>
      </ol>
      <p>
        The column names are repeated at the top of every part, and every row ends up in exactly one part, in its original order. CSV parts keep your
        file&apos;s separator, and codes keep their leading zeros. Each part is read back and checked against your file before it is offered. By value,
        up to 200 different values are possible; rows with no value go in a part called “(empty)”.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Tomás exports 380,000 newsletter subscribers from an old system, but the new mailing tool imports at most 100,000 contacts at a time. He opens
        the file in Split File, keeps “A number of rows in each part” at 100,000, and sees four parts: three with 100,000 rows and one with 80,000. He
        downloads the .zip and imports the four files one after another. Each file has the column names, so the mailing tool matches the email and name
        columns every time.
      </p>

      <h2>Tips</h2>
      <ul>
        <li>
          <strong>Leave some room.</strong> If a tool accepts 100,000 rows, parts of 99,000 avoid problems with a header row or a blank line at the end.
        </li>
        <li>
          <strong>Name the parts clearly.</strong> Numbered names with a leading zero (part-01, part-02 …) sort in the right order.
        </li>
        <li>
          <strong>Need it back in one piece?</strong> <Link href="/guides/merge-csv-excel-files">Merge the files</Link> again; matching column names
          make this easy.
        </li>
        <li>
          <strong>Google Sheets</strong> has a limit of 10 million cells per spreadsheet, so a big file may need splitting for Sheets too.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Split a file by size (rows per part or equal parts) for Excel, import and email limits, or by value (one file per city, month or customer) to
        share it out. In Excel, copy blocks of rows or filtered rows into new workbooks, with the column names each time. MyDataFixer&apos;s Split File
        does all of it in your browser, puts the column names in every part, checks each part, and downloads them together as a .zip.
      </p>
    </>
  ),
  faqs: [
    {
      q: "How do I split a CSV file that is too big for Excel?",
      a: "Excel shows at most 1,048,576 rows per sheet, so split the file into parts of up to 1,000,000 rows, then open each part. MyDataFixer's Split File reads files Excel can't show completely.",
    },
    {
      q: "Will every part have the column names?",
      a: "When you split by hand, copy them into every part yourself. MyDataFixer's Split File repeats them at the top of every part automatically.",
    },
    {
      q: "Can I make one file per city, month or customer?",
      a: "Yes. In Excel, filter the column one value at a time and copy the visible rows to a new workbook. MyDataFixer's Split File makes all the files in one go.",
    },
    {
      q: "Can I split an Excel file into several Excel files?",
      a: "Yes. Copy blocks of rows into new workbooks, or use MyDataFixer's Split File and choose Excel parts; codes keep their leading zeros.",
    },
    {
      q: "Can I split a file on my phone?",
      a: "Excel's phone app isn't made for it. MyDataFixer's Split File works in a phone or tablet browser, and you can download the parts one at a time.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is read and split in your browser, on your device.",
    },
  ],
};
