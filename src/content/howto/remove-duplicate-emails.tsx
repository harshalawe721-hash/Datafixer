import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const removeDuplicateEmails: HowToGuide = {
  slug: "remove-duplicate-emails",
  title: "How to remove duplicate emails from a mailing list",
  seoTitle: "How to Remove Duplicate Emails From a Mailing List",
  description:
    "Send each person one email: remove repeated addresses, even with different capitals or spaces, and keep the newest sign-up. In Excel, Sheets or your browser.",
  summary: "The same address twice means two emails to one person. Here's how to keep each address once, including the ones that only differ in capitals.",
  updated: "2026-11-28",
  tools: ["remove-duplicates"],
  related: ["remove-duplicate-rows", "find-duplicates-in-excel", "check-emails-and-phone-numbers", "remove-extra-spaces"],
  quickAnswer: (
    <p>
      Compare only the email column, and ignore capital letters and spaces, because Asha@Example.com and asha@example.com are the same inbox. In
      Excel, add a column with <code>=LOWER(TRIM(A2))</code> and use <strong>Data → Remove Duplicates</strong> on it. Or use MyDataFixer&apos;s free{" "}
      <strong>Remove Duplicates</strong>: choose the email column, tick the two ignore options, and keep the first or the last copy.
    </p>
  ),
  body: (
    <>
      <h2>Why duplicate emails matter</h2>
      <ul>
        <li>People who get the same newsletter twice unsubscribe or mark it as spam, which hurts delivery for everyone else.</li>
        <li>Many email services charge by the number of contacts, so duplicates cost money.</li>
        <li>Open and click rates are wrong when one person counts twice.</li>
      </ul>
      <p>
        Duplicates appear when lists are merged, when people sign up twice, or when the same contact comes from a form and a spreadsheet.
      </p>

      <h2>The catch: “the same” email can look different</h2>
      <ExampleTable
        caption="Four rows, two people"
        headers={["email", "name", "signed up"]}
        rows={[
          ["asha@example.com", "Asha", "2026-03-02"],
          ["ben@shop.in", "Ben", "2026-04-11"],
          ["Asha@Example.com ", "Asha Patil", "2026-09-18"],
          ["BEN@SHOP.IN", "Ben K", "2026-10-05"],
        ]}
      />
      <p>
        An exact comparison finds no duplicates here: the capital letters and the space at the end make every address look different. In practice,
        email providers treat addresses as the same regardless of capital letters, so you should compare them ignoring capitals and spaces. And
        compare only the email column: the names and dates differ, so whole rows never match.
      </p>

      <h2>Remove duplicate emails in Excel</h2>
      <ExcelNote />
      <ol>
        <li>
          Next to the emails (here in column A), add a column “email (clean)” and type <code>=LOWER(TRIM(A2))</code>. Fill it down. Every address
          is now lower case without spaces at the ends.
        </li>
        <li>
          Decide which copy to keep. <strong>Remove Duplicates keeps the first copy</strong> from the top, so to keep the newest sign-up, sort by
          the date column from newest to oldest first (<strong>Data → Sort</strong>).
        </li>
        <li>
          Select the whole table and go to <strong>Data → Remove Duplicates</strong>. Click <strong>Unselect All</strong>, tick only “email
          (clean)” and click OK.
        </li>
        <li>Excel says how many duplicates were removed. Delete the helper column, or keep it if your mailing tool should use the cleaned addresses.</li>
      </ol>
      <p>
        Work on a copy of the file: Remove Duplicates deletes the rows straight away, and once you save there is no going back. To look first, see{" "}
        <Link href="/guides/find-duplicates-in-excel">how to highlight duplicates without deleting them</Link>.
      </p>

      <h2>In Google Sheets</h2>
      <ol>
        <li>
          Add a helper column with <code>=LOWER(TRIM(A2))</code>, as in Excel, and sort if you want to keep the newest row.
        </li>
        <li>
          Select the table and go to <strong>Data → Data cleanup → Remove duplicates</strong>.
        </li>
        <li>Tick “Data has header row”, choose only the helper column under “Columns to analyze”, and click Remove duplicates.</li>
      </ol>
      <p>
        For a list of unique addresses only, <code>=UNIQUE(ARRAYFORMULA(LOWER(TRIM(A2:A))))</code> returns each address once.
      </p>

      <h2>Remove duplicate emails with MyDataFixer</h2>
      <p>
        Open <Link href="/remove-duplicates">Remove Duplicates</Link> and choose your CSV or Excel file. It works in your browser on a computer,
        tablet or phone, and the file is never uploaded.
      </p>
      <ol>
        <li>
          Under <strong>Compare</strong>, choose <strong>Only the columns I choose</strong> and tick the email column.
        </li>
        <li>
          Under <strong>Matching</strong>, tick <strong>Ignore capital letters</strong> and <strong>Ignore extra spaces</strong>. No helper column
          is needed, and the addresses themselves aren&apos;t changed.
        </li>
        <li>
          Under <strong>Which copy to keep</strong>, choose <strong>The first</strong> (the oldest, when the list is in sign-up order) or{" "}
          <strong>The last</strong> (the newest), so you don&apos;t have to sort.
        </li>
        <li>
          Under <strong>What to do with the other copies</strong>, choose <strong>Remove them</strong>, or <strong>Mark them in a new column
          (remove nothing)</strong> to review them first.
        </li>
        <li>
          Check the groups of matching rows in the preview: each group shows the row that is kept and its copies. Apply, then download the changed
          file (a CSV file as CSV, an Excel file as Excel or CSV).
        </li>
      </ol>
      <p>
        You can undo before downloading, every download is checked first, and your original file isn&apos;t changed.
      </p>

      <h2>From start to finish: an example</h2>
      <p>
        Lena merges three exports into one newsletter list of 18,000 contacts: a shop export, a webinar list and a spreadsheet from a trade fair.
        In Remove Duplicates she compares only the email column, ignoring capital letters and spaces, and keeps the last copy, because the rows
        are in date order and the newest has the most recent name. The preview shows 2,140 groups of duplicates; most differ only in capital
        letters. She removes them and imports 15,600 contacts, each once.
      </p>

      <h2>Duplicates that tools don&apos;t catch</h2>
      <ul>
        <li>
          <strong>Dots and plus signs in Gmail addresses.</strong> Gmail delivers a.sha@gmail.com and asha+news@gmail.com to asha@gmail.com. Most
          duplicate removers, including MyDataFixer, compare the addresses as written, so these stay separate. They are usually few; check them by
          hand if it matters.
        </li>
        <li>
          <strong>Typos.</strong> asha@gmial.com isn&apos;t a duplicate of asha@gmail.com; it&apos;s a wrong address.{" "}
          <Link href="/guides/check-emails-and-phone-numbers">Check the emails</Link> for typos and invalid addresses.
        </li>
        <li>
          <strong>Two addresses for one person</strong> (work and personal) are different addresses, and that&apos;s usually right.
        </li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Compare only the email column and ignore capital letters and spaces. In Excel or Google Sheets, add a LOWER(TRIM()) helper column and remove
        duplicates on it, sorting first to keep the newest row. MyDataFixer&apos;s Remove Duplicates does it without a helper column, keeps the first
        or last copy, shows every group before anything changes and runs in your browser.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Are email addresses case-sensitive?",
      a: "In practice, no: email providers deliver Asha@Example.com and asha@example.com to the same inbox. Treat them as duplicates.",
    },
    {
      q: "How do I keep the most recent sign-up?",
      a: "In Excel, sort by date from newest to oldest before Remove Duplicates, which keeps the first copy. In MyDataFixer, choose “The last” when the rows are in date order.",
    },
    {
      q: "How do I remove duplicate emails but keep the other columns?",
      a: "Compare only the email column. The whole row of each kept copy stays, with its name, date and other values.",
    },
    {
      q: "Can I see the duplicates before deleting them?",
      a: "Yes. Highlight them with conditional formatting in Excel, or choose “Mark them in a new column” in MyDataFixer to review them first.",
    },
    {
      q: "Can I do this on my phone?",
      a: "Yes. MyDataFixer's Remove Duplicates works in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my mailing list?",
      a: "No. The file is read and changed in your browser, on your device, and the original file isn't changed.",
    },
  ],
};
