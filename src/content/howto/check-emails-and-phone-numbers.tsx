import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const checkEmailsAndPhoneNumbers: HowToGuide = {
  slug: "check-emails-and-phone-numbers",
  title: "How to check email addresses and phone numbers in a spreadsheet",
  seoTitle: "How to Check Emails and Phone Numbers in Excel",
  description:
    "Find invalid email addresses and phone numbers in a contact list before you send messages or import it. Simple checks for Excel, Google Sheets and free online.",
  summary: "Bad emails and phone numbers mean failed messages. Here's how to find them in your contact list.",
  updated: "2026-11-20",
  tools: ["spreadsheet-error-detector", "spreadsheet-cleaner"],
  related: ["remove-duplicate-rows", "remove-extra-spaces", "keep-leading-zeros-in-csv"],
  quickAnswer: (
    <p>
      A valid email address has one @, no spaces, and a domain with an ending such as .com or .in. A phone number has digits, maybe a + at the
      start and some spaces or dashes, and usually between 7 and 15 digits. Check your list with a filter or a formula, or let MyDataFixer&apos;s
      Error Detector find the problems for you.
    </p>
  ),
  body: (
    <>
      <h2>Why check contact data?</h2>
      <ul>
        <li>Emails to wrong addresses bounce, and too many bounces can get your emails marked as spam.</li>
        <li>SMS and WhatsApp messages to wrong numbers are wasted, and some services charge for them.</li>
        <li>Imports into CRMs and email tools often reject rows with invalid emails.</li>
        <li>Customers you can&apos;t reach are lost sales.</li>
      </ul>

      <h2>Common problems</h2>
      <ExampleTable
        caption="Typical mistakes in contact lists"
        headers={["Value", "Problem"]}
        rows={[
          ["asha.example.com", "missing @"],
          ["ravi @example.com", "space inside"],
          ["meera@example", "domain without an ending like .com"],
          ["a@x.com; b@y.com", "two addresses in one cell"],
          ["none", "placeholder instead of an address"],
          ["98765", "too few digits for a phone number"],
          ["98765 43210 ext", "letters in a phone number"],
        ]}
      />
      <p>
        Mixed phone layouts are a smaller problem: “+91 98765 43210”, “09876543210” and “98765-43210” may all be valid but are hard to sort,
        search and import.
      </p>

      <h2>Check emails in Excel</h2>
      <ExcelNote />
      <h3>Quick check with a filter</h3>
      <ol>
        <li>
          Select the data and go to <strong>Data</strong> → <strong>Filter</strong>.
        </li>
        <li>
          On the email column, choose <strong>Text Filters</strong> → <strong>Does Not Contain</strong> and type <code>@</code>. You see every row
          without an @.
        </li>
        <li>Repeat with “Contains” and a space to find addresses with spaces.</li>
      </ol>
      <h3>Check with a formula</h3>
      <p>
        In a helper column, this shows TRUE for addresses that have an @, a dot after it, and no space:{" "}
        <code>=AND(ISNUMBER(FIND(&quot;@&quot;,A2)),ISNUMBER(FIND(&quot;.&quot;,A2,FIND(&quot;@&quot;,A2))),NOT(ISNUMBER(FIND(&quot; &quot;,A2))))</code>.
        Filter that column for FALSE.
      </p>

      <h2>Check emails in Google Sheets</h2>
      <p>
        Google Sheets has a ready-made function: <code>=ISEMAIL(A2)</code> shows TRUE for addresses that look valid. Put it in a helper column and
        filter for FALSE. You can also use Data → Data validation → “Text is valid email” to warn about bad addresses as they are typed.
      </p>

      <h2>Check phone numbers in Excel or Google Sheets</h2>
      <p>
        Count the digits with a formula that removes spaces, dashes, brackets and plus signs:{" "}
        <code>=LEN(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(A2,&quot; &quot;,&quot;&quot;),&quot;-&quot;,&quot;&quot;),&quot;(&quot;,&quot;&quot;),&quot;)&quot;,&quot;&quot;),&quot;+&quot;,&quot;&quot;))</code>.
        Indian mobile numbers have 10 digits (12 with 91 in front). Sort by the result to bring numbers that are too short or too long to the top.
        Make sure phone columns are stored as text, so leading zeros and + signs stay.
      </p>

      <h2>Check them with MyDataFixer</h2>
      <p>
        Open your contact list (Excel or CSV) in the <Link href="/spreadsheet-error-detector">Error Detector</Link>. It checks the email and phone
        columns and lists:
      </p>
      <ul>
        <li>
          <strong>Invalid email addresses:</strong> a missing @, a space, a domain without an ending such as .com, and similar mistakes.
        </li>
        <li>
          <strong>Invalid phone numbers:</strong> letters, fewer than 7 or more than 15 digits (the international maximum), or symbols in the wrong
          place. These are general international rules, not each country&apos;s own numbering plan.
        </li>
        <li>
          <strong>Phone numbers in different layouts</strong> in the same column.
        </li>
      </ul>
      <p>
        Wrong emails and phone numbers can&apos;t be corrected automatically, because only the original source knows the right address: tap a cell
        to type the correct value. For mixed layouts, <strong>Make phone number layouts consistent</strong> (also in the{" "}
        <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link>) lets you choose one of the layouts already in the column, and rewrites the
        others. Only spaces and punctuation change; the digits stay exactly the same. Numbers that would need guessing, such as numbers without a
        country code when the layout has one, are left for you to check. Empty cells are counted under “Missing cells”. Your file stays on your
        device.
      </p>

      <h2>Tips for clean contact lists</h2>
      <ul>
        <li>One email address and one phone number per cell. Use extra columns for a second address.</li>
        <li>Leave a cell empty instead of typing “none” or “-”.</li>
        <li>Store phone numbers as text, with the country code if you have international contacts (+91…).</li>
        <li>Write email addresses in lower case.</li>
        <li>Remove extra spaces before checking.</li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Kavya plans a festival offer email to 1,200 customers. Before importing the list into her email tool, she opens it in the Error Detector.
        It finds 38 invalid email addresses (mostly missing a dot, like “name@gmailcom”, or containing a space) and 15 phone numbers with too few
        digits. She corrects the obvious typos by tapping the cells, removes the rest from the mailing list, and makes the phone layouts consistent
        in one step. The import goes through with no rejected rows, and far fewer emails bounce.
      </p>

      <h2>Quick summary</h2>
      <p>
        Invalid emails and phone numbers mean failed messages and imports. Find them with filters and formulas (ISEMAIL in Google Sheets), or let
        the Error Detector list them. Correct each one from the source, and make phone layouts consistent in one step.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Does a valid-looking email address really exist?",
      a: "Not always. These checks find addresses that can't work, such as a missing @. Whether an address really exists can only be confirmed by sending to it.",
    },
    {
      q: "Is there an ISEMAIL function in Excel?",
      a: "No, only Google Sheets has ISEMAIL. In Excel, use a filter or the formula in this guide.",
    },
    {
      q: "How many digits should a phone number have?",
      a: "It depends on the country. Internationally, a number has at most 15 digits. Indian mobile numbers have 10 digits, plus the country code 91.",
    },
    {
      q: "Can MyDataFixer correct wrong email addresses?",
      a: "No. It shows which ones are invalid, and you type the right address, because only the original source knows it.",
    },
    {
      q: "Does MyDataFixer upload my contact list?",
      a: "No. The file is checked in your browser, on your device. Contact data never leaves it.",
    },
  ],
};
