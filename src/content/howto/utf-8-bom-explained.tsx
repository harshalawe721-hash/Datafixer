import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import type { HowToGuide } from "./types";

export const utf8BomExplained: HowToGuide = {
  slug: "utf-8-bom-explained",
  title: "UTF-8 with or without BOM: which should you choose for a CSV?",
  seoTitle: "UTF-8 With or Without BOM: Which for CSV Files?",
  description:
    "What is a BOM, and should your CSV be UTF-8 with or without it? A simple explanation, with the right choice for Excel, Google Sheets and databases.",
  summary: "A tiny invisible marker decides whether Excel shows é and € correctly. Here's when to use it and when not.",
  updated: "2026-11-24",
  tools: ["csv-validator", "excel-to-csv"],
  related: ["csv-encoding-strange-characters", "convert-excel-to-csv", "change-csv-separator"],
  quickAnswer: (
    <p>
      A <strong>BOM</strong> (byte order mark) is an invisible marker at the start of a file that says “this is UTF-8”. Choose{" "}
      <strong>UTF-8 with BOM</strong> when the CSV will be double-clicked in Excel, so letters like é and symbols like € show correctly. Choose{" "}
      <strong>UTF-8 without BOM</strong> for databases, scripts, web apps and most import tools, which often don&apos;t expect it.
    </p>
  ),
  body: (
    <>
      <h2>What UTF-8 is</h2>
      <p>
        Computers store letters as numbers, and an encoding is the table that says which numbers mean which letter. UTF-8 is today&apos;s standard:
        it can store every language, from English and Hindi to Chinese and emoji. Plain English letters look the same in almost every encoding;
        the differences show up with accented letters, symbols like € and £, and non-English scripts.
      </p>

      <h2>What the BOM is</h2>
      <p>
        A CSV file doesn&apos;t say which encoding it uses. The BOM is three invisible bytes at the very start of the file that answer that
        question: “UTF-8”. You can&apos;t see it in a spreadsheet, and most text editors hide it too.
      </p>

      <h2>Why it matters</h2>
      <ExampleTable
        caption="What different programs do"
        headers={["Program", "UTF-8 with BOM", "UTF-8 without BOM"]}
        rows={[
          ["Excel (double-click the CSV)", "shows é and € correctly", "may show Ã© and â‚¬"],
          ["Excel (Data → From Text/CSV)", "correct", "correct if you choose UTF-8"],
          ["Google Sheets", "correct", "correct"],
          ["Databases and scripts", "may show ï»¿ in the first column name", "correct"],
          ["Most web import tools", "usually fine, sometimes a problem", "correct"],
        ]}
      />
      <p>
        So the BOM helps one very common case, double-clicking a CSV in Excel, and can hurt others. The most typical symptom is a first column
        name that suddenly looks like <code>ï»¿id</code> or that a program can&apos;t find (“column id not found”), because the invisible BOM is
        read as part of the name.
      </p>

      <h2>Which should you choose?</h2>
      <ul>
        <li>
          <strong>With BOM:</strong> the file is for people who will open it in Excel by double-clicking, for example a report sent by email.
        </li>
        <li>
          <strong>Without BOM:</strong> the file is for a database, a script, a programming tool, or an online import form, unless its help page
          asks for a BOM.
        </li>
        <li>
          <strong>Not sure?</strong> Check the import tool&apos;s help page. If it says nothing, try without BOM first; if Excel users complain about
          strange characters, send them a copy with BOM.
        </li>
      </ul>

      <h2>How to check whether a file has a BOM</h2>
      <ul>
        <li>In Notepad on Windows, File → Save As shows the encoding at the bottom: “UTF-8 with BOM” or “UTF-8”.</li>
        <li>
          In MyDataFixer&apos;s <Link href="/csv-validator">CSV Validator</Link>, the file summary shows the encoding, with “with BOM” when the file
          has one.
        </li>
      </ul>

      <h2>How to save with or without BOM</h2>
      <h3>In Excel</h3>
      <p>
        <strong>File → Save As → CSV UTF-8 (Comma delimited)</strong> saves UTF-8 with BOM. Excel has no option for UTF-8 without BOM.
      </p>
      <h3>In Google Sheets</h3>
      <p>
        <strong>File → Download → Comma-separated values</strong> saves UTF-8 without BOM.
      </p>
      <h3>With MyDataFixer</h3>
      <p>
        In the <Link href="/csv-validator">CSV Validator</Link> and in <Link href="/excel-to-csv">Excel to CSV</Link>, you choose when you download:
        “UTF-8 with BOM” (recommended for Excel) or “UTF-8 without BOM (for databases)”. Files are always saved as UTF-8, and the download is read back
        and compared with the original before it&apos;s offered. You can also open a file with a BOM and download it without, or the other way
        round, without changing anything else. Everything runs in your browser.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Removing “strange characters” by hand.</strong> If you see ï»¿ at the start, the file isn&apos;t broken; save it again without BOM.
        </li>
        <li>
          <strong>Saving as plain “CSV” in Excel.</strong> The older “CSV (Comma delimited)” type doesn&apos;t use UTF-8 and can turn € or Hindi
          letters into question marks. Use “CSV UTF-8”.
        </li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Pooja&apos;s team uploads a customer CSV to a reporting database every week. After she saved it from Excel, the upload started failing with
        “column customer_id not found”, even though the column was there. In the CSV Validator, the summary showed “UTF-8 with BOM”: Excel had
        added the BOM, and the database read it as part of the first column name. She downloaded a copy as UTF-8 without BOM, and the upload
        worked again. For the weekly email to her manager, she still sends the Excel-friendly version with BOM.
      </p>

      <h2>How to avoid encoding problems next time</h2>
      <ul>
        <li>Always save CSV files as UTF-8; choose the BOM based on who opens the file.</li>
        <li>Keep two copies when needed: one with BOM for Excel users, one without for systems.</li>
        <li>Open CSV files in Excel with Data → From Text/CSV and choose UTF-8 yourself.</li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        The BOM is an invisible “this is UTF-8” marker. Use it for CSV files that people double-click in Excel; leave it out for databases,
        scripts and most import tools. MyDataFixer lets you choose either when you download.
      </p>
    </>
  ),
  faqs: [
    {
      q: "What does ï»¿ at the start of my file mean?",
      a: "It's a BOM shown by a program that doesn't expect one. Save the file as UTF-8 without BOM for that program.",
    },
    {
      q: "Does Excel need a BOM?",
      a: "Only when you double-click a CSV. With Data → From Text/CSV you can choose UTF-8 yourself, with or without BOM.",
    },
    {
      q: "Is UTF-8 with BOM a different encoding?",
      a: "No. The text is the same UTF-8; the BOM is just three extra bytes at the start that announce it.",
    },
    {
      q: "How do I remove a BOM from a CSV?",
      a: "Open the file in MyDataFixer's CSV Validator and download it as UTF-8 without BOM, or save it as plain UTF-8 in a text editor.",
    },
    {
      q: "Which should I choose for Google Sheets?",
      a: "Either works. Google Sheets reads UTF-8 files with or without a BOM correctly.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is read and saved in your browser, on your device.",
    },
  ],
};
