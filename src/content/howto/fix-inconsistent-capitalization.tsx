import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const fixInconsistentCapitalization: HowToGuide = {
  slug: "fix-inconsistent-capitalization",
  title: "How to make capitalization consistent (Paris, paris, PARIS)",
  seoTitle: "How to Fix Inconsistent Capitalization in Excel",
  description:
    "Paris, paris and PARIS counted as three cities? Learn how to make capitalization consistent with PROPER, UPPER and LOWER, or free with MyDataFixer.",
  summary: "The same value written in different capitals splits your filters and reports. Here's how to make it consistent.",
  updated: "2026-11-23",
  tools: ["spreadsheet-cleaner"],
  related: ["change-case-proper-case", "remove-extra-spaces", "remove-duplicate-rows", "fix-dates-in-spreadsheets"],
  quickAnswer: (
    <p>
      When the same value is written as “Paris”, “paris” and “PARIS”, filters, pivot tables and duplicate checks may treat them as different. Pick
      one spelling and use it everywhere: with <strong>=PROPER()</strong>, <strong>=UPPER()</strong> or <strong>=LOWER()</strong> in Excel or
      Google Sheets, with Find and Replace for a few values, or with <strong>Fix capitalization</strong> in MyDataFixer.
    </p>
  ),
  body: (
    <>
      <h2>Why capitalization matters</h2>
      <p>
        Excel&apos;s own filters and most formulas ignore capital letters, so “Lyon” and “LYON” often look like one value inside Excel. But many
        other places don&apos;t ignore them:
      </p>
      <ul>
        <li>Pivot tables and reports in other tools may show them as separate rows.</li>
        <li>Databases, CRMs and online shops often treat “Lyon” and “lyon” as two different cities or categories.</li>
        <li>Exact duplicate checks see two different rows.</li>
        <li>It simply looks untidy in a report sent to a customer or a manager.</li>
      </ul>

      <h2>Where it comes from</h2>
      <ul>
        <li>Different people typing the same thing in their own way.</li>
        <li>Caps Lock left on.</li>
        <li>Data merged from systems that store text differently, for example one in capitals only.</li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="One city, three spellings"
        headers={["city", "orders"]}
        rows={[
          ["Lyon", "12"],
          ["lyon", "3"],
          ["LYON", "1"],
        ]}
      />
      <p>A report by city in another tool might show three rows. After fixing, it shows “Lyon” with 16 orders.</p>

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <h3>For a whole column: PROPER, UPPER or LOWER</h3>
      <ol>
        <li>Insert an empty helper column next to your column.</li>
        <li>
          Type one of these in the first data row: <code>=PROPER(A2)</code> (Maria Lopez), <code>=UPPER(A2)</code> (MARIA LOPEZ) or{" "}
          <code>=LOWER(A2)</code> (lyon kumar).
        </li>
        <li>Copy the formula down the column.</li>
        <li>
          Copy the helper column, then <strong>Paste Special</strong> → <strong>Values</strong> over the original, and delete the helper column.
        </li>
      </ol>
      <h3>For a few values: Find and Replace</h3>
      <ol>
        <li>
          Press <strong>Ctrl+H</strong>.
        </li>
        <li>
          Type the wrong spelling in <strong>Find what</strong> and the right one in <strong>Replace with</strong>.
        </li>
        <li>
          Click <strong>Options</strong> and tick <strong>Match case</strong> and <strong>Match entire cell contents</strong>, so only exact
          matches change. Then click <strong>Replace All</strong>.
        </li>
      </ol>

      <h2>Fix it in Google Sheets</h2>
      <p>
        PROPER, UPPER and LOWER work exactly the same in Google Sheets. For Find and Replace, use <strong>Edit</strong> →{" "}
        <strong>Find and replace</strong>, and tick <strong>Match case</strong> and <strong>Match entire cell contents</strong>.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open your file in the <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link> and choose <strong>Fix capitalization</strong>. It finds
        values in the same column that differ only in capital letters, and changes them to the most common spelling in that column. So if
        “Lyon” appears 12 times and “lyon” 3 times, every “lyon” becomes “Lyon”.
      </p>
      <p>
        When two spellings are equally common, MyDataFixer asks you which one to use instead of guessing. You see every change before it is
        applied, you can undo, and your file stays on your device.
      </p>
      <p>
        If a whole column is written in capitals or small letters (“RAVI KUMAR”, “berlin”), there is no better spelling to copy. For that, use{" "}
        <strong>Change case</strong>, also in the Spreadsheet Cleaner: choose the columns and Proper Case, UPPER CASE or lower case. Its Proper
        Case knows common name patterns: “o&apos;brien” becomes “O&apos;Brien”, “mcdonald” becomes “McDonald”, “anne-marie” becomes “Anne-Marie”, and
        small words such as “van”, “de” or “of” stay small in the middle of a name. Email addresses, web addresses and values with numbers are
        never changed. The Error Detector points out name and city columns written this way and opens Change case for you.
      </p>

      <h2>Watch out for special names</h2>
      <p>PROPER is quick, but it doesn&apos;t know names. It changes:</p>
      <ul>
        <li>“iPhone” to “Iphone” and “McDonald” to “Mcdonald”;</li>
        <li>“NASA” and “HDFC” to “Nasa” and “Hdfc”;</li>
        <li>“o&apos;brien” correctly, but “van der Berg” to “Van Der Berg”.</li>
      </ul>
      <p>
        Check brand names, short forms and family names by hand after using PROPER. MyDataFixer&apos;s Fix capitalization avoids this problem
        because it only chooses between spellings that already exist in your column. Its Change case tool handles O&apos;Brien, McDonald and “van
        der Berg”, and keeps short forms like “HDFC” in values such as “HDFC Bank”, but it can&apos;t know every brand name either, so check its
        preview.
      </p>

      <h2>Which style should you use?</h2>
      <ul>
        <li>
          <strong>Names and cities:</strong> each word with a capital (Asha Patil, New York).
        </li>
        <li>
          <strong>Codes:</strong> all capitals (SKU-A12, MH12).
        </li>
        <li>
          <strong>Email addresses:</strong> all lower case. Email addresses work the same in lower case, and it makes duplicates easy to spot.
        </li>
      </ul>

      <h2>How to avoid it next time</h2>
      <ul>
        <li>Use drop-down lists (Data → Data Validation → List) for cities, categories and other repeated values.</li>
        <li>Agree on a style for each column and write it in a note at the top of the sheet.</li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Arjun runs a small delivery business and keeps orders in a sheet filled in by three staff members. When he imports it into his new
        delivery app, the city list shows “Melbourne”, “melbourne” and “MELBOURNE” as three cities. He opens the sheet in the Spreadsheet Cleaner
        and chooses Fix capitalization. The preview shows that “Melbourne” is the most common spelling, used 340 times, so the 52 other spellings
        will become “Melbourne”. He applies it, downloads the file, and the app now shows one city. Next, he adds a drop-down list for the city
        column so the problem doesn&apos;t come back.
      </p>

      <h2>Quick summary</h2>
      <p>
        Different capitals split reports and imports. Use PROPER, UPPER or LOWER for whole columns, Find and Replace with Match case for a few
        values, or MyDataFixer: Fix capitalization uses the most common spelling and asks when it&apos;s a tie, and Change case writes whole
        columns in Proper Case, UPPER CASE or lower case.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Does Excel care about capital letters?",
      a: "Most Excel formulas and filters don't, but databases, other tools and exact comparisons often do, so it's best to be consistent.",
    },
    {
      q: "How do I change text to capital letters in Excel?",
      a: "Use =UPPER(A2) in a helper column, then paste the results back as values. Excel has no Change Case button like Word.",
    },
    {
      q: "Why does PROPER change iPhone to Iphone?",
      a: "PROPER capitalises the first letter of every word and makes the rest small. Fix brand names and short forms by hand afterwards.",
    },
    {
      q: "Can MyDataFixer turn RAVI KUMAR into Ravi Kumar?",
      a: "Yes, with Change case in the Spreadsheet Cleaner: choose the column and Proper Case. You see every change before it's applied, and emails and codes are never changed.",
    },
    {
      q: "Which spelling does MyDataFixer keep?",
      a: "The most common one in that column. When two are equally common, it asks you.",
    },
    {
      q: "Can I fix capitalization on my phone?",
      a: "Google Sheets in a browser supports PROPER, UPPER and LOWER, and MyDataFixer's Spreadsheet Cleaner works on phones and tablets.",
    },
    {
      q: "Should email addresses be in lower case?",
      a: "Yes, that's a good habit. Email addresses work the same in lower case, and writing them all in lower case makes duplicates easy to find. Use =LOWER(A2) for a whole column.",
    },
    {
      q: "What's the difference between PROPER and UPPER?",
      a: "PROPER gives each word a capital first letter (Asha Patil). UPPER writes every letter as a capital (ASHA PATIL). LOWER writes every letter small (asha patil).",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is cleaned in your browser, on your device.",
    },
  ],
};
