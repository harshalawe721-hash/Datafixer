import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const extractDomainFromEmail: HowToGuide = {
  slug: "extract-domain-from-email",
  title: "How to extract the domain from email addresses",
  seoTitle: "How to Extract the Domain From Email Addresses in Excel",
  description:
    "Get company.com from asha@company.com for a whole list: Excel formulas, Text to Columns, Google Sheets or a free browser tool. Plus counting emails per company.",
  summary: "Need the company domain from a list of email addresses? Here's how to take everything after the @ into its own column.",
  updated: "2026-11-28",
  tools: ["split-column"],
  related: ["split-cells-in-excel", "check-emails-and-phone-numbers", "fix-inconsistent-capitalization", "remove-extra-spaces"],
  quickAnswer: (
    <p>
      The domain is everything after the <strong>@</strong>. In Excel for Microsoft 365, use <code>=TEXTAFTER(A2, &quot;@&quot;)</code>; in older
      versions, <code>=MID(A2, FIND(&quot;@&quot;, A2) + 1, 255)</code>. Or split the column at “@” with MyDataFixer&apos;s free{" "}
      <strong>Split a Column</strong>, which shows a preview first and runs in your browser.
    </p>
  ),
  body: (
    <>
      <h2>Why you might need the domain</h2>
      <ul>
        <li>
          <strong>Group contacts by company.</strong> Everyone at company.com works for the same organisation, even when the company name is
          missing or spelled differently.
        </li>
        <li>
          <strong>Separate business and personal addresses.</strong> gmail.com, outlook.com or yahoo.com are personal; most other domains belong to
          a business.
        </li>
        <li>
          <strong>Find typos.</strong> Sorting by domain puts gmial.com and gmail.con right next to gmail.com, where they are easy to spot.
        </li>
        <li>
          <strong>Count sign-ups per organisation</strong> for a report or a sales list.
        </li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="An email column split at the @"
        headers={["email", "user", "domain"]}
        rows={[
          ["asha.patil@acme.co.in", "asha.patil", "acme.co.in"],
          ["Ben@Example.com", "Ben", "Example.com"],
          ["chen.li@gmail.com", "chen.li", "gmail.com"],
        ]}
      />
      <p>
        Note “Example.com” with a capital E. Domains don&apos;t depend on capital letters, so Example.com and example.com are the same. Make them all
        lower case before you count or group them, or they will be counted separately.
      </p>

      <h2>Extract the domain with a formula in Excel</h2>
      <ExcelNote />
      <p>Assuming the email addresses start in cell A2:</p>
      <ul>
        <li>
          <strong>Excel for Microsoft 365 and Excel 2024:</strong> <code>=TEXTAFTER(A2, &quot;@&quot;)</code> returns everything after the @.
        </li>
        <li>
          <strong>Older versions:</strong> <code>=MID(A2, FIND(&quot;@&quot;, A2) + 1, 255)</code> starts one character after the @ and takes up
          to 255 characters (more than any domain needs).
        </li>
        <li>
          <strong>In lower case and without stray spaces:</strong> wrap it, for example{" "}
          <code>=LOWER(TRIM(TEXTAFTER(A2, &quot;@&quot;)))</code>.
        </li>
      </ul>
      <p>
        Fill the formula down. A cell without an @ shows <code>#VALUE!</code> (with FIND) or <code>#N/A</code> (with TEXTAFTER): those are
        entries that aren&apos;t email addresses, worth checking by hand. To keep the domains when the email column changes or is deleted, copy
        the column and use <strong>Paste Special → Values</strong>.
      </p>

      <h2>Split the column with Text to Columns</h2>
      <ol>
        <li>Insert an empty column to the right of the emails, so nothing is overwritten.</li>
        <li>
          Select the email column and go to <strong>Data → Text to Columns</strong>.
        </li>
        <li>
          Choose <strong>Delimited</strong>, click Next, tick <strong>Other</strong> and type <code>@</code>.
        </li>
        <li>Click Finish. The part before the @ stays in the first column and the domain goes into the next one.</li>
      </ol>
      <p>
        This replaces the original email column with the part before the @. Work on a copy of the column if you still need the full addresses.
        Excel can also do this with <strong>Flash Fill</strong>: type the first domain by hand in the next column and press{" "}
        <strong>Ctrl+E</strong>. Check the result, because Flash Fill guesses the pattern from your example.
      </p>

      <h2>In Google Sheets</h2>
      <ul>
        <li>
          <code>=REGEXEXTRACT(A2, &quot;@(.+)$&quot;)</code> returns the domain.
        </li>
        <li>
          <code>=SPLIT(A2, &quot;@&quot;)</code> puts the user part and the domain in two cells.
        </li>
        <li>
          Or use <strong>Data → Split text to columns</strong> and choose a custom separator, <code>@</code>.
        </li>
      </ul>

      <h2>Extract the domain with MyDataFixer</h2>
      <p>
        Open <Link href="/split-column">Split a Column</Link> and choose your CSV or Excel file. It works in your browser on a computer, tablet or
        phone, and the file is never uploaded.
      </p>
      <ol>
        <li>Choose the email column.</li>
        <li>
          Under <strong>Split at</strong>, choose <strong>Other text</strong> and type <code>@</code>.
        </li>
        <li>
          Under <strong>How many times</strong>, choose <strong>At the first separator only (2 parts)</strong>.
        </li>
        <li>Check the preview of the first rows, then click Apply. The two new columns are added on the right, and the original column is kept.</li>
        <li>Download the changed file: a CSV file as CSV, an Excel file as Excel or CSV. Each download is checked before it&apos;s offered, and your original file isn&apos;t changed.</li>
      </ol>
      <p>
        Values without an @ go into the first new column and leave the domain empty, so they are easy to find by sorting. To make every domain lower
        case, use <strong>Change case</strong> in the <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link> afterwards.
      </p>

      <h2>Count emails per domain</h2>
      <p>Once the domains are in their own column:</p>
      <ul>
        <li>
          <strong>Pivot table:</strong> select the table, go to <strong>Insert → PivotTable</strong>, put “domain” in Rows and again in Values
          (it shows a count).
        </li>
        <li>
          <strong>Formula:</strong> <code>=COUNTIF(C:C, &quot;acme.co.in&quot;)</code> counts one domain.
        </li>
        <li>
          <strong>Excel for Microsoft 365:</strong> <code>=UNIQUE(C2:C1000)</code> lists each domain once, and a COUNTIF next to it counts them.
        </li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Rahul exports 2,400 webinar sign-ups and needs to know which companies sent the most people. He opens the file in Split a Column, splits the
        email column at “@” at the first separator only, and downloads the result. A pivot table on the new domain column shows 38
        sign-ups from one customer&apos;s domain, and 900 from personal addresses such as gmail.com. He also notices six addresses ending in
        “gmial.com”, which he fixes before sending the follow-up.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Counting “Example.com” and “example.com” separately.</strong> Make the domains lower case first.
        </li>
        <li>
          <strong>Spaces around the address.</strong> “asha@acme.com ” gives the domain “acme.com ” with a space at the end.{" "}
          <Link href="/guides/remove-extra-spaces">Remove extra spaces</Link> first.
        </li>
        <li>
          <strong>Taking subdomains for different companies.</strong> mail.acme.com and acme.com usually belong to the same organisation; group
          them by hand if it matters.
        </li>
        <li>
          <strong>Overwriting the email column.</strong> Text to Columns replaces it; keep a copy.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        The domain is everything after the @. In Excel, use TEXTAFTER or MID with FIND, or Text to Columns with “@” as the separator. In Google Sheets,
        use REGEXEXTRACT or SPLIT. MyDataFixer&apos;s Split a Column splits at “@” with a preview, keeps your original column and runs in your
        browser. Make domains lower case before counting them.
      </p>
    </>
  ),
  faqs: [
    {
      q: "What is the formula to get the domain from an email in Excel?",
      a: "In Excel for Microsoft 365 or Excel 2024: =TEXTAFTER(A2, \"@\"). In older versions: =MID(A2, FIND(\"@\", A2) + 1, 255).",
    },
    {
      q: "How do I get the part before the @ instead?",
      a: "Use =TEXTBEFORE(A2, \"@\") in Excel for Microsoft 365, or =LEFT(A2, FIND(\"@\", A2) - 1) in older versions. Splitting the column gives you both parts at once.",
    },
    {
      q: "Why do I get #VALUE! for some rows?",
      a: "Those cells have no @, so they aren't email addresses. Check them by hand; MyDataFixer's Error Detector also lists invalid email addresses.",
    },
    {
      q: "How do I count how many emails each company has?",
      a: "Put the domains in their own column, then use a pivot table with the domain in Rows and Values, or COUNTIF for one domain.",
    },
    {
      q: "Can I do this on my phone?",
      a: "Yes. MyDataFixer's Split a Column works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is read and changed in your browser, on your device, and the original file isn't changed.",
    },
  ],
};
