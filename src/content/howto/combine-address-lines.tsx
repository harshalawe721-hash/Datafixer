import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const combineAddressLines: HowToGuide = {
  slug: "combine-address-lines",
  title: "How to combine address lines into one cell",
  seoTitle: "How to Combine Address Columns Into One Cell in Excel",
  description:
    "Join street, city, postcode and country into one address without double commas where a line is empty: TEXTJOIN in Excel and Sheets, or a free browser tool.",
  summary: "Address split over several columns, and a label printer or form needs it in one? Here's how to join it without stray commas.",
  updated: "2026-11-28",
  tools: ["combine-columns"],
  related: ["combine-columns-in-excel", "split-cells-in-excel", "remove-extra-spaces", "find-blank-cells"],
  quickAnswer: (
    <p>
      Join the address columns with a comma and a space, leaving out the empty ones. In Excel 2019 or later and Google Sheets, use{" "}
      <code>=TEXTJOIN(&quot;, &quot;, TRUE, B2:F2)</code>: the TRUE skips empty cells. Or use MyDataFixer&apos;s free <strong>Combine Columns</strong>{" "}
      with “Comma and space” and “Skip empty values”, which shows a preview and runs in your browser.
    </p>
  ),
  body: (
    <>
      <h2>When you need the address in one cell</h2>
      <ul>
        <li>Shipping labels, mail merges and invoices often expect one address field.</li>
        <li>Some online forms, CRMs and delivery services import a single “Address” column.</li>
        <li>To check addresses on a map or remove duplicates, one full address is easier to compare than five columns.</li>
      </ul>

      <h2>The problem with empty lines</h2>
      <ExampleTable
        caption="Address columns, some of them empty"
        headers={["street", "line 2", "city", "postcode", "country"]}
        rows={[
          ["12 MG Road", "Flat 4B", "Pune", "411001", "India"],
          ["8 High Street", "", "Leeds", "LS1 4AB", "United Kingdom"],
          ["", "", "Lima", "", "Peru"],
        ]}
      />
      <p>
        Gluing every column together with commas gives “8 High Street, , Leeds, LS1 4AB, United Kingdom” for the second row and “, , Lima, , Peru” for
        the third. The double commas look careless on a label, and some systems reject them. What you want:
      </p>
      <ExampleTable
        caption="Combined, empty lines left out"
        headers={["address"]}
        rows={[["12 MG Road, Flat 4B, Pune, 411001, India"], ["8 High Street, Leeds, LS1 4AB, United Kingdom"], ["Lima, Peru"]]}
      />

      <h2>Combine address columns in Excel</h2>
      <ExcelNote />
      <p>
        In Excel for Microsoft 365, Excel 2019 or later, and Excel for the web, use <strong>TEXTJOIN</strong>. With the address in columns B to F
        and the first address in row 2:
      </p>
      <ol>
        <li>
          In an empty column, type <code>=TEXTJOIN(&quot;, &quot;, TRUE, B2:F2)</code>. The first part is what goes between the values, and TRUE
          means “skip empty cells”.
        </li>
        <li>Fill the formula down to the last row.</li>
        <li>
          To keep the result as text, copy the column and use <strong>Paste Special → Values</strong>. Otherwise it changes, or shows errors, when
          the original columns are edited or deleted.
        </li>
      </ol>
      <p>
        In older versions without TEXTJOIN, the ampersand works but doesn&apos;t skip empty cells: <code>=B2&amp;&quot;, &quot;&amp;C2&amp;&quot;,
        &quot;&amp;D2</code> leaves a double comma whenever C2 is empty. You can avoid it with IF for each part, for example{" "}
        <code>=B2&amp;IF(C2=&quot;&quot;, &quot;&quot;, &quot;, &quot;&amp;C2)&amp;IF(D2=&quot;&quot;, &quot;&quot;, &quot;, &quot;&amp;D2)</code>,
        which quickly gets long.
      </p>

      <h2>One address line per row in the cell</h2>
      <p>
        For labels, you may want each part on its own line inside the cell. Use a line break instead of the comma:{" "}
        <code>=TEXTJOIN(CHAR(10), TRUE, B2:F2)</code>, then turn on <strong>Home → Wrap Text</strong> so the lines show. Note that a CSV file keeps
        such a value in quotes, and some programs that import CSV files don&apos;t expect line breaks inside a value; use commas unless you know the
        line breaks are wanted.
      </p>

      <h2>In Google Sheets</h2>
      <p>
        TEXTJOIN works the same way: <code>=TEXTJOIN(&quot;, &quot;, TRUE, B2:F2)</code>. To fill a whole column at once, use{" "}
        <code>=BYROW(B2:F, LAMBDA(r, TEXTJOIN(&quot;, &quot;, TRUE, r)))</code>, which returns one address per row and leaves rows with no address
        empty.
      </p>

      <h2>Combine address columns with MyDataFixer</h2>
      <p>
        Open <Link href="/combine-columns">Combine Columns</Link> and choose your CSV or Excel file. It works in your browser on a computer, tablet
        or phone, and the file is never uploaded.
      </p>
      <ol>
        <li>
          Under <strong>Columns to combine</strong>, tick the address columns, and use the up and down buttons to put them in order (street first,
          country last).
        </li>
        <li>
          Under <strong>Between the values</strong>, choose <strong>Comma and space</strong>.
        </li>
        <li>
          Keep <strong>Skip empty values (no extra separators)</strong> ticked, so an empty line 2 doesn&apos;t leave a double comma.
        </li>
        <li>
          Type a <strong>Name of the new column</strong>, such as “Address”, check the preview, and click <strong>Apply: add the combined column</strong>.
        </li>
        <li>
          Download the changed file: a CSV file as CSV, an Excel file as Excel or CSV. Each download is checked before it&apos;s offered, and your
          original file isn&apos;t changed.
        </li>
      </ol>
      <p>
        The original columns are kept unless you tick <strong>Remove the original columns</strong>, so you can still sort by city or postcode later.
        Codes such as postcodes keep their leading zeros, and you can undo the change before downloading.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Ana runs a small online shop and exports 600 orders to print shipping labels. The export has five address columns, and many customers left
        “line 2” or “region” empty. She opens the file in Combine Columns, ticks the five columns, chooses “Comma and space” with empty values
        skipped, names the new column “Full address”, and downloads the result. The label tool imports the one column, and none of the labels show
        a double comma.
      </p>

      <h2>Before you combine</h2>
      <ul>
        <li>
          <strong>Remove extra spaces.</strong> “Pune ” with a trailing space gives “Pune , 411001”.{" "}
          <Link href="/guides/remove-extra-spaces">Trim the spaces</Link> first.
        </li>
        <li>
          <strong>Check cells that look empty.</strong> A cell holding only a space isn&apos;t empty, so it isn&apos;t skipped.{" "}
          <Link href="/guides/find-blank-cells">Find blank-looking cells</Link> before combining.
        </li>
        <li>
          <strong>Keep the order the destination expects.</strong> Countries differ: some put the postcode before the city.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        To combine address lines into one cell without double commas, skip the empty parts. In Excel 2019 or later and Google Sheets, use
        TEXTJOIN(&quot;, &quot;, TRUE, …). In older Excel versions, use IF for each part. MyDataFixer&apos;s Combine Columns joins the columns in the
        order you choose, skips empty values, keeps the originals and runs in your browser.
      </p>
    </>
  ),
  faqs: [
    {
      q: "How do I combine address columns without extra commas?",
      a: "Use =TEXTJOIN(\", \", TRUE, B2:F2) in Excel 2019 or later or Google Sheets; TRUE skips empty cells. MyDataFixer's Combine Columns does the same with “Skip empty values”.",
    },
    {
      q: "What can I use instead of TEXTJOIN in older Excel?",
      a: "Join the parts with & and wrap each optional part in IF, for example B2&IF(C2=\"\",\"\",\", \"&C2), so empty parts add nothing.",
    },
    {
      q: "How do I put each address line on a new line in the cell?",
      a: "Use CHAR(10) as the separator in TEXTJOIN and turn on Wrap Text. Check that the program you import into accepts line breaks inside values.",
    },
    {
      q: "Will the postcode lose its leading zero?",
      a: "Not in MyDataFixer: values are combined as text, exactly as they are. In Excel, a postcode stored as a number may already have lost its zero before you combine.",
    },
    {
      q: "Can I do this on my phone?",
      a: "Yes. MyDataFixer's Combine Columns works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is read and changed in your browser, on your device, and the original file isn't changed.",
    },
  ],
};
