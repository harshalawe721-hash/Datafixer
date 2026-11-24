import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import type { HowToGuide } from "./types";

export const csvFormulaInjection: HowToGuide = {
  slug: "csv-formula-injection",
  title: "How to protect CSV files from formula injection (=, +, -, @)",
  seoTitle: "Protect CSV Files From Formula Injection (=, +, -, @)",
  description:
    "Values starting with =, +, - or @ can run as formulas when a CSV is opened in a spreadsheet. Learn what CSV injection is and how to make files safe.",
  summary: "A value that starts with = can run as a formula when someone opens your CSV. Here's how to keep shared files safe.",
  updated: "2026-11-24",
  tools: ["csv-validator", "csv-to-excel"],
  related: ["check-csv-before-import", "stop-excel-changing-data", "csv-vs-excel"],
  quickAnswer: (
    <p>
      When a CSV is opened in Excel or another spreadsheet app, a value that starts with <code>=</code>, <code>+</code>, <code>-</code> or{" "}
      <code>@</code> can be treated as a formula. Usually that just changes the value, but in files from unknown sources it can be used to
      trick people or attack their computer (“CSV injection”). Before sharing a CSV, put an apostrophe in front of such values, or share an Excel
      file where they are stored as text.
    </p>
  ),
  body: (
    <>
      <h2>What happens</h2>
      <p>
        A CSV file is plain text, so it can&apos;t say “this is text, not a formula”. When a spreadsheet app opens it, a value that begins with a
        formula character may be calculated instead of shown:
      </p>
      <ExampleTable
        caption="Values that start like formulas"
        headers={["In the CSV", "What a spreadsheet may do"]}
        rows={[
          ["=1+1", "shows 2 instead of the text =1+1"],
          ["-5% discount", "shows an error or a number"],
          ["+91 98765 43210", "may show an error or treat it as a calculation"],
          ["@SUM(A1:A9)", "runs a function"],
          ["=HYPERLINK(\"http://…\",\"Click here\")", "shows a link that may lead somewhere harmful"],
        ]}
      />

      <h2>Why it can be dangerous</h2>
      <p>
        Most of the time the result is just a wrong value or an error. But if the file contains data typed by strangers, for example a website
        form, a feedback survey or a public sign-up list, someone can enter a formula on purpose. When an employee opens the export, the formula
        may create a misleading link, show false information, or, in older or badly configured setups, try to run commands or send data
        elsewhere. Modern Excel shows security warnings for many of these, but people often click through them.
      </p>

      <h2>When you should care</h2>
      <ul>
        <li>The CSV contains anything typed by the public: names, comments, addresses, feedback.</li>
        <li>You export data from a website or app for colleagues to open in Excel.</li>
        <li>You receive CSV files from unknown or untrusted senders.</li>
      </ul>
      <p>For your own data that only you open, the risk is mostly about values being shown wrongly.</p>

      <h2>How to make a CSV safer</h2>
      <h3>1. Put an apostrophe in front</h3>
      <p>
        An apostrophe (<code>&apos;</code>) at the start tells spreadsheet apps to treat the value as text: <code>&apos;=1+1</code> is shown as
        =1+1. This is the common recommendation for files people will open in a spreadsheet. The catch: the apostrophe is now part of the value,
        so databases and scripts that read the file will see it.
      </p>
      <h3>2. Share an Excel file instead</h3>
      <p>
        In an XLSX file, a value can be stored as text, so it is never run as a formula, without any apostrophe. If people will only open the
        file, an Excel file is often the cleanest solution.
      </p>
      <h3>3. Be careful when opening CSV files from others</h3>
      <p>
        Open them with Data → From Text/CSV in Excel, or Import in Google Sheets with “Convert text to numbers, dates and formulas” unticked, so
        values are imported as written. Don&apos;t click “Enable” on security warnings for files you don&apos;t trust.
      </p>

      <h2>Do it with MyDataFixer</h2>
      <h3>Find risky values</h3>
      <p>
        Open the CSV in the <Link href="/csv-validator">CSV Validator</Link>. The check “Values that start like formulas” lists every value that
        starts with =, +, - or @, with its line. Phone numbers such as “+91 …” also start with +, so you&apos;ll see them in the list too.
      </p>
      <h3>Add apostrophes</h3>
      <p>
        The repair <strong>Add apostrophes</strong> puts an apostrophe in front of exactly those values, so spreadsheet apps show them as text and
        never run them. Nothing else in the value changes. It always shows a preview and a warning first (the apostrophe is saved as part of the
        value, and phone numbers starting with + are included), and it is never part of “Fix all”, so it only happens when you choose it.
      </p>
      <h3>Or convert to Excel</h3>
      <p>
        <Link href="/csv-to-excel">CSV to Excel</Link> keeps values that start like formulas as text in the new workbook: <code>=1+1</code> stays
        the text “=1+1” and is never run, with no apostrophe added. That is ideal when the file is for people to open.
      </p>
      <p>Both tools work in your browser; the file is never uploaded.</p>

      <h2>From start to finish: an example</h2>
      <p>
        Anjali exports 3,000 feedback responses from her company&apos;s website form to share with the support team. In the CSV Validator, “Values
        that start like formulas” lists 6 values: four phone numbers starting with +, one comment “-- not happy --”, and one entry beginning with
        =HYPERLINK. Because the team only reads the file in Excel, she converts it with CSV to Excel instead of adding apostrophes: every value is
        kept as text, the link formula is never run, and the phone numbers stay readable.
      </p>

      <h2>Quick summary</h2>
      <p>
        Values starting with =, +, - or @ can run as formulas when a CSV opens in a spreadsheet, which matters most for data typed by the public.
        Find them with the CSV Validator, add apostrophes if the file must stay a CSV for people, or share it as an Excel file where they are
        stored as text.
      </p>
    </>
  ),
  faqs: [
    {
      q: "What is CSV injection?",
      a: "Putting a formula into a field of a CSV file, so that it runs when someone opens the file in a spreadsheet app. It's also called formula injection.",
    },
    {
      q: "Why are my phone numbers listed as risky?",
      a: "Numbers like +91 98765 43210 start with +, one of the formula characters. They are usually harmless, but a spreadsheet may still treat them as a calculation.",
    },
    {
      q: "Will an apostrophe break my import?",
      a: "It can: databases and scripts see the apostrophe as part of the value. Add apostrophes only for files people open in spreadsheets.",
    },
    {
      q: "Does CSV to Excel run formulas from my CSV?",
      a: "No. Values that start like formulas are stored as text in the new workbook and are never run.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is checked and converted in your browser, on your device.",
    },
  ],
};
