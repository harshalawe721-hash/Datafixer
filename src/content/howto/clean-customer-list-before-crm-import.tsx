import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import type { HowToGuide } from "./types";

export const cleanCustomerListBeforeCrmImport: HowToGuide = {
  slug: "clean-customer-list-before-crm-import",
  title: "How to clean a customer list before importing it into a CRM",
  seoTitle: "How to Clean a Customer List Before a CRM Import",
  description:
    "A checklist for clean CRM imports: duplicates, spaces, capitals, emails, phone numbers, dates and column names. Fix each in Excel or free in your browser.",
  summary: "Importing a messy list creates duplicates and broken records that are hard to undo. Here's what to fix first, in the right order.",
  updated: "2026-11-28",
  tools: ["spreadsheet-cleaner", "csv-validator"],
  related: ["check-csv-before-import", "remove-duplicate-emails", "standardise-phone-numbers", "fix-column-names"],
  quickAnswer: (
    <p>
      Before you import, remove extra spaces and empty rows, make names&apos; capital letters consistent, check that every email and phone number is
      valid, remove duplicate contacts by email, make dates and column names match what the CRM expects, and save as CSV UTF-8. MyDataFixer&apos;s
      free <strong>Spreadsheet Cleaner</strong> and <strong>CSV Validator</strong> do most of this in your browser, with a preview of every change.
    </p>
  ),
  body: (
    <>
      <h2>Why clean before importing?</h2>
      <p>
        A CRM (customer relationship management system) treats every row as a contact. A messy list becomes messy records: the same person twice,
        names in capitals, emails that bounce, phone numbers nobody can dial. Fixing them one by one inside the CRM takes far longer than cleaning
        the file first, and a failed import halfway through can leave half the list imported.
      </p>
      <ExampleTable
        caption="A typical export before cleaning"
        headers={["Name", "E-mail", "Phone", "Signed up"]}
        rows={[
          ["ASHA PATIL ", "asha@acme.com", "098200 12345", "13/11/2026"],
          ["asha patil", "Asha@Acme.com", "+91 98200 12345", "2026-11-14"],
          ["Ben Kumar", "ben@shop", "", "Nov 15, 2026"],
          ["", "", "", ""],
        ]}
      />
      <p>
        Four rows, but one person twice (with different capitals and phone layouts), an invalid email, three date formats and an empty row.
      </p>

      <h2>The checklist, in order</h2>
      <p>The order matters: clean spaces and capitals before looking for duplicates, or “asha@acme.com” and “Asha@Acme.com ” look different.</p>
      <ol>
        <li>
          <strong>Keep the original.</strong> Work on a copy, so you can always go back.
        </li>
        <li>
          <strong>Remove empty rows and columns.</strong> Some CRMs count them as contacts without a name, or stop at the first empty row.
        </li>
        <li>
          <strong>Remove extra spaces</strong> at the start and end of values and doubled spaces inside them. In Excel, <code>=TRIM(A2)</code>.
        </li>
        <li>
          <strong>Make capital letters consistent.</strong> “ASHA PATIL” and “asha patil” become “Asha Patil”. In Excel, <code>=PROPER(A2)</code>,
          but check names such as McDonald and O&apos;Brien afterwards.
        </li>
        <li>
          <strong>Check the emails.</strong> Look for addresses without an @, without a domain ending (ben@shop), or with typos (gmial.com). An
          import with many invalid addresses can harm your sending reputation later.
        </li>
        <li>
          <strong>Standardise phone numbers</strong> in one layout, ideally international with the country code (+91 98200 12345), because most CRMs
          and dialers expect it.
        </li>
        <li>
          <strong>Remove duplicate contacts</strong>, usually by email, ignoring capital letters and spaces. Decide whether to keep the oldest or the
          newest copy.
        </li>
        <li>
          <strong>Make dates consistent</strong>, preferably year-month-day (2026-11-13), which no CRM can misread as a different day.
        </li>
        <li>
          <strong>Match the column names</strong> to the CRM&apos;s fields (for example “E-mail” to “Email”, “Phone” to “Phone Number”). Most CRMs
          let you map columns during import, but clear names make the mapping quicker and safer.
        </li>
        <li>
          <strong>Fill in required fields.</strong> If the CRM requires an email or a last name, find the rows where it&apos;s empty and complete or
          remove them.
        </li>
        <li>
          <strong>Save as CSV UTF-8</strong> and check the file&apos;s structure: same number of columns in every row, no broken quotes.
        </li>
      </ol>

      <h2>Clean the list in Excel</h2>
      <p>
        Excel can do each step with helper columns: TRIM and PROPER for text, a filter on blanks for empty cells, <strong>Data → Remove
        Duplicates</strong> on a <code>=LOWER(TRIM(B2))</code> email column, and <strong>File → Save As → CSV UTF-8 (Comma delimited)</strong> at the
        end. Copy each helper column and use <strong>Paste Special → Values</strong> before deleting the original. It works, but with ten steps and
        helper columns it&apos;s easy to lose track; keep notes of what you changed.
      </p>

      <h2>Clean the list with MyDataFixer</h2>
      <p>
        These tools work in your browser on a computer, tablet or phone, and the file is never uploaded. Every change is previewed, can be undone,
        and the original file is never changed: you download a cleaned copy.
      </p>
      <ol>
        <li>
          Open the list in the <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link>. It lists what each cleaning tool would fix in your file:{" "}
          <strong>Remove extra spaces</strong>, <strong>Remove empty rows</strong>, <strong>Remove empty columns</strong>,{" "}
          <strong>Fix capitalization</strong>, <strong>Make phone number layouts consistent</strong>, <strong>Make date formats consistent</strong>{" "}
          and more. <strong>Fix all safe problems</strong> applies the ones that need no decision; the others ask you to choose, for example the date
          format.
        </li>
        <li>
          The same check lists <strong>Invalid email addresses</strong> and <strong>Invalid phone numbers</strong>, with the rows they&apos;re in, so
          you can correct them.
        </li>
        <li>
          Remove duplicate contacts in <Link href="/remove-duplicates">Remove Duplicates</Link>: compare only the email column, ignore capital letters
          and extra spaces, and keep the first or the last copy. See{" "}
          <Link href="/guides/remove-duplicate-emails">how to remove duplicate emails</Link> for details.
        </li>
        <li>
          Before importing, open the final CSV file in the <Link href="/csv-validator">CSV Validator</Link>. It checks the structure, such as rows with
          too many or too few columns, broken quotes, hidden characters and problem column names, and can repair the safe ones.
        </li>
      </ol>

      <h2>From start to finish: an example</h2>
      <p>
        Nadia&apos;s company is moving 9,000 contacts from spreadsheets into a new CRM. In the Spreadsheet Cleaner she removes extra spaces and 140
        empty rows, makes the name capitals consistent and the phone numbers international. The check lists 63 invalid email addresses, which she
        corrects or deletes. Remove Duplicates finds 820 contacts listed twice by email; she keeps the newest copy. The CSV Validator confirms the file
        is clean, and the import goes through without errors, with 8,040 contacts.
      </p>

      <h2>After the import</h2>
      <ul>
        <li>Check a few records in the CRM: names, phone numbers and dates look right?</li>
        <li>Compare the number of imported contacts with the number of rows in your file.</li>
        <li>Keep the cleaned file: it&apos;s your record of what was imported.</li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Clean a customer list before a CRM import: remove empty rows and extra spaces, fix capitals, check emails and phone numbers, remove duplicates by
        email, make dates and column names consistent, and save as CSV UTF-8. MyDataFixer&apos;s Spreadsheet Cleaner, Remove Duplicates and CSV
        Validator do it in your browser with a preview of every change, and your original file is never changed.
      </p>
    </>
  ),
  faqs: [
    {
      q: "What should I clean before importing contacts into a CRM?",
      a: "Empty rows, extra spaces, inconsistent capitals, invalid emails and phone numbers, duplicate contacts, inconsistent dates and column names, and the CSV structure.",
    },
    {
      q: "In what order should I clean the data?",
      a: "Spaces and capitals first, then validity checks, then duplicates, because values that differ only in spaces or capitals don't look like duplicates until they're cleaned.",
    },
    {
      q: "Which file format should I import?",
      a: "Usually CSV UTF-8. It keeps accents and other alphabets; check your CRM's import page for its exact requirements.",
    },
    {
      q: "How do I find duplicate contacts?",
      a: "Compare the email column only, ignoring capital letters and spaces. MyDataFixer's Remove Duplicates does this and lets you keep the first or the last copy.",
    },
    {
      q: "Can I clean the list on my phone?",
      a: "Yes. MyDataFixer's tools work in a phone or tablet browser.",
    },
    {
      q: "Does MyDataFixer upload my customer data?",
      a: "No. Your file is read and cleaned in your browser, on your device. Nothing is sent to MyDataFixer's servers or to anyone else.",
    },
  ],
};
