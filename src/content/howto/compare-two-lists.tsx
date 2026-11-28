import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const compareTwoLists: HowToGuide = {
  slug: "compare-two-lists",
  title: "How to compare two lists and find missing or new items",
  seoTitle: "How to Compare Two Lists in Excel and Find Missing Items",
  description:
    "Which customers didn't order again? Which products are new? Find items in one list but not the other with COUNTIF or XLOOKUP, or a free browser tool.",
  summary: "Two lists, and you need what's only in one of them? Here's how to find the missing and the new items, and the ones in both.",
  updated: "2026-11-28",
  tools: ["compare-files"],
  related: ["compare-two-excel-csv-files", "find-duplicates-in-excel", "remove-extra-spaces", "fix-inconsistent-capitalization"],
  quickAnswer: (
    <p>
      To find items in list A that aren&apos;t in list B, count each item of A in B: <code>=COUNTIF(B:B, A2)=0</code> is TRUE for missing items.
      Do the same the other way round for items only in B. Or put each list in its own file and use MyDataFixer&apos;s free{" "}
      <strong>Compare Spreadsheets</strong>, which shows items only in the first list, only in the second, and in both.
    </p>
  ),
  body: (
    <>
      <h2>Typical questions</h2>
      <ul>
        <li>Which of last year&apos;s customers haven&apos;t ordered this year?</li>
        <li>Which products are in the new catalogue but not in our shop yet?</li>
        <li>Who registered for the event but didn&apos;t check in?</li>
        <li>Which invoice numbers are in the bank export but not in the accounts?</li>
      </ul>
      <p>Each one is the same task: compare two lists and sort every item into “only in A”, “only in B” or “in both”.</p>

      <h2>Example</h2>
      <ExampleTable
        caption="Registered and checked in"
        headers={["Registered (list A)", "Checked in (list B)", "Result"]}
        rows={[
          ["asha@acme.com", "asha@acme.com", "In both"],
          ["ben@shop.in", "", "Only in A: didn't come"],
          ["chen@uni.edu", "chen@uni.edu", "In both"],
          ["", "dev@media.co", "Only in B: came without registering"],
        ]}
      />

      <h2>Compare two lists in Excel with COUNTIF</h2>
      <ExcelNote />
      <p>Put list A in column A and list B in column B, each with a heading in row 1.</p>
      <ol>
        <li>
          In C2, type <code>=IF(COUNTIF(B:B, A2)=0, &quot;Only in A&quot;, &quot;In both&quot;)</code> and fill it down next to list A.
        </li>
        <li>
          In D2, type <code>=IF(COUNTIF(A:A, B2)=0, &quot;Only in B&quot;, &quot;&quot;)</code> and fill it down next to list B.
        </li>
        <li>
          Filter columns C and D (<strong>Data → Filter</strong>) to see only the missing or new items.
        </li>
      </ol>
      <p>
        COUNTIF ignores capital letters, so “ASHA@acme.com” counts as the same as “asha@acme.com”. It does not ignore spaces: “asha@acme.com ”
        with a space at the end is a different value. Clean the spaces first (see below).
      </p>

      <h2>With XLOOKUP or MATCH</h2>
      <p>
        <code>=ISNA(MATCH(A2, B:B, 0))</code> is TRUE when A2 isn&apos;t in list B, and works in every Excel version. In Excel for Microsoft 365, the
        newer functions can list the differences directly: <code>=FILTER(A2:A500, COUNTIF(B2:B500, A2:A500)=0)</code> returns every item of A that
        isn&apos;t in B, in one formula. XLOOKUP helps when the lists have more columns and you also want a value from the other list, such as the
        check-in time.
      </p>

      <h2>Highlight the items in both lists</h2>
      <p>
        For a quick look, select both columns and use <strong>Home → Conditional Formatting → Highlight Cells Rules → Duplicate Values</strong>. Items
        that appear in both lists are coloured. Be careful: a value repeated inside one list is coloured too, so this works best when each list has
        every item once.
      </p>

      <h2>In Google Sheets</h2>
      <p>
        COUNTIF and MATCH work the same way. To list the missing items in one go, use{" "}
        <code>=FILTER(A2:A, A2:A&lt;&gt;&quot;&quot;, COUNTIF(B2:B, A2:A)=0)</code>.
      </p>

      <h2>Compare two lists with MyDataFixer</h2>
      <p>
        <Link href="/compare-files">Compare Spreadsheets</Link> compares two files, so put each list in its own CSV or Excel file with the same column
        heading in both (for example “email”). It works in your browser on a computer, tablet or phone, and the files are never uploaded.
      </p>
      <ol>
        <li>Choose list A as the older file and list B as the newer file.</li>
        <li>
          Click Compare files. The column is matched by its name. If every item appears once, it&apos;s suggested under “Match rows by”;
          otherwise whole rows are compared, which for a one-column list gives the same result.
        </li>
        <li>
          Read the summary: <strong>Removed</strong> are the items only in list A, <strong>Added</strong> are the items only in list B, and{" "}
          <strong>Unchanged</strong> are the items in both. The filter buttons list each group.
        </li>
        <li>
          Tick <strong>Ignore capital letters</strong> and <strong>Ignore spaces at the start and end</strong> when those differences shouldn&apos;t
          count.
        </li>
        <li>
          Download the report as Excel or CSV. Its “Change” column says Added, Removed or Unchanged for every item, so you can filter it.
        </li>
      </ol>
      <p>
        If the lists have more columns, such as a name next to each email, the other columns come along in the report, and changed values are shown
        too. The headings must match (“Email” and “email” do; “E-mail” and “Email” don&apos;t); if they differ, rename one first.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Sofia has 1,850 customers who ordered last year and 1,410 who ordered this year, each list exported as a CSV file with a “customer id”
        column. She compares them in Compare Spreadsheets with last year as the older file. The summary shows 1,120 customers in both, 730 removed
        (they ordered last year but not this year) and 290 added (new customers). She downloads the report, filters the Change column to “Removed”,
        and sends those 730 customers a “we miss you” offer.
      </p>

      <h2>Before you compare</h2>
      <ul>
        <li>
          <strong>Remove spaces at the ends</strong> of the values, or tick the ignore option. <Link href="/guides/remove-extra-spaces">Here&apos;s how</Link>.
        </li>
        <li>
          <strong>Make the format the same</strong> in both lists: 00123 and 123 are different values, and so are “+91 98200 12345” and
          “9820012345”.
        </li>
        <li>
          <strong>Check for repeated items</strong> inside each list. A customer listed twice in A but once in B leaves one copy “only in A”.
          When you choose the column under “Match rows by”, MyDataFixer points out values that appear more than once.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        To compare two lists, check each item of one list against the other. In Excel and Google Sheets, COUNTIF(…)=0 or ISNA(MATCH(…)) finds the
        missing items, and FILTER lists them in one go. MyDataFixer&apos;s Compare Spreadsheets sorts every item into only in A (Removed), only in B
        (Added) and in both (Unchanged), and downloads a report you can filter, in your browser.
      </p>
    </>
  ),
  faqs: [
    {
      q: "How do I find values in one column that are not in another?",
      a: "Use =COUNTIF(B:B, A2)=0 next to each value of column A; TRUE means it isn't in column B. In Excel for Microsoft 365, =FILTER(A2:A500, COUNTIF(B2:B500, A2:A500)=0) lists them all.",
    },
    {
      q: "Does COUNTIF ignore capital letters?",
      a: "Yes, COUNTIF and MATCH ignore capital letters. They don't ignore spaces, so clean the spaces first.",
    },
    {
      q: "How do I find the items that are in both lists?",
      a: "COUNTIF(B:B, A2)>0 is TRUE for items in both. In MyDataFixer they are the “Unchanged” rows.",
    },
    {
      q: "What if my two lists are in the same file?",
      a: "Formulas work within one file. For MyDataFixer, save each list as its own CSV file with the same column heading.",
    },
    {
      q: "Can I compare lists on my phone?",
      a: "Yes. MyDataFixer's Compare Spreadsheets works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my lists?",
      a: "No. Both files are read and compared in your browser, on your device.",
    },
  ],
};
