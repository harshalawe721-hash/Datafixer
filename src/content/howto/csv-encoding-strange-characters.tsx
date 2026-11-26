import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const csvEncodingStrangeCharacters: HowToGuide = {
  slug: "csv-encoding-strange-characters",
  title: "Strange characters in a CSV file (Ã©, â€™): how to fix encoding problems",
  seoTitle: "Strange Characters in CSV (Ã©, â€™)? How to Fix",
  description:
    "Seeing Ã©, â€™ or � in your CSV? It's an encoding problem. Learn why it happens and how to open and save CSV files as UTF-8 in Excel and Google Sheets.",
  summary: "Letters like é turn into Ã© when a CSV is opened with the wrong encoding. Here's how to open it correctly.",
  updated: "2026-11-20",
  tools: ["csv-validator"],
  related: ["csv-opens-in-one-column", "convert-excel-to-csv", "check-csv-before-import"],
  quickAnswer: (
    <p>
      Text like <strong>Ã©</strong> instead of é, or <strong>â€™</strong> instead of an apostrophe, means the file was saved in one{" "}
      <strong>encoding</strong> (usually UTF-8) and opened as another. The data is usually fine. Open the file again and tell the program it is
      UTF-8. When you save CSV files, choose UTF-8.
    </p>
  ),
  body: (
    <>
      <h2>What an encoding is</h2>
      <p>
        A computer stores every letter as numbers. An encoding is the table that says which numbers mean which letter. For plain English letters,
        almost all encodings agree. For letters like é, ü, ñ, symbols like € and £, and scripts like Hindi or Tamil, they don&apos;t. If a file is
        written with one table and read with another, those characters turn into nonsense.
      </p>
      <p>
        Today almost everything uses <strong>UTF-8</strong>, which can store every language. Older programs, especially older versions of Excel on
        Windows, often use <strong>Windows-1252</strong> instead.
      </p>

      <h2>What the strange characters mean</h2>
      <ExampleTable
        caption="Common signs of an encoding mix-up"
        headers={["You see", "It should be", "What happened"]}
        rows={[
          ["CafÃ©", "Café", "UTF-8 file opened as Windows-1252"],
          ["donâ€™t", "don't (curly apostrophe)", "UTF-8 file opened as Windows-1252"],
          ["â‚¬500", "€500", "UTF-8 file opened as Windows-1252"],
          ["M�ller", "Müller", "Windows-1252 file opened as UTF-8"],
        ]}
      />
      <p>
        The first three are the most common: the file is fine, it was just opened the wrong way. The last one, with the � sign, means the program
        couldn&apos;t read a character at all.
      </p>

      <h2>Why it happens</h2>
      <ul>
        <li>
          <strong>Double-clicking a CSV in Excel.</strong> Excel doesn&apos;t always recognise UTF-8 files, unless they start with a small invisible
          marker called a BOM.
        </li>
        <li>
          <strong>Old exports.</strong> Some older systems save Windows-1252 files, and modern tools read them as UTF-8.
        </li>
        <li>
          <strong>Copying between programs</strong> that use different encodings.
        </li>
      </ul>

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <h3>Open the file as UTF-8</h3>
      <ol>
        <li>Open a new, empty workbook.</li>
        <li>
          Go to <strong>Data</strong> → <strong>From Text/CSV</strong> and choose the file.
        </li>
        <li>
          At the top of the preview, set <strong>File Origin</strong> to <strong>65001: Unicode (UTF-8)</strong>. The preview should now show
          the right letters.
        </li>
        <li>
          Click <strong>Load</strong>.
        </li>
      </ol>
      <h3>Save the file as UTF-8</h3>
      <p>
        Use <strong>File</strong> → <strong>Save As</strong> and choose <strong>CSV UTF-8 (Comma delimited)</strong>. Excel adds the BOM marker, so
        it opens correctly next time.
      </p>

      <h2>Fix it in Google Sheets</h2>
      <p>
        Google Sheets reads CSV files as UTF-8, so UTF-8 files open correctly with <strong>File</strong> → <strong>Import</strong>. If a file
        still shows � signs, it was probably saved as Windows-1252. Open it in MyDataFixer (below), choose Windows-1252, and download a UTF-8 copy.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open the CSV in the <Link href="/csv-validator">CSV Validator</Link>. It detects the encoding by itself. If the letters in the preview
        look wrong, choose another encoding from the “Text encoding” box: UTF-8, Windows-1252 or ISO-8859-1 (and UTF-16 when the file starts with
        a BOM). The file is read again; it is never changed.
      </p>
      <p>
        When you download, the file is always saved as UTF-8. Choose <strong>with BOM</strong> if it will be opened in Excel, or{" "}
        <strong>without BOM</strong> for databases and most other programs. MyDataFixer never replaces unreadable characters silently: if the
        chosen encoding doesn&apos;t fit the file, it tells you. Your file stays on your device.
      </p>

      <h2>What is a BOM?</h2>
      <p>
        A BOM (byte order mark) is an invisible marker at the very start of a file that says “this is UTF-8”. Excel uses it to recognise UTF-8.
        Many databases and scripts, however, don&apos;t expect it and may show it as strange characters (ï»¿) at the start of the first column
        name. So: with BOM for Excel, without BOM for databases.
      </p>

      <h2>How to avoid it next time</h2>
      <ul>
        <li>Always save CSV files as UTF-8.</li>
        <li>Open CSV files with Data → From Text/CSV in Excel instead of double-clicking.</li>
        <li>Ask senders to export as UTF-8, especially for names with accents or non-English text.</li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Rahul gets a customer list from a supplier in Germany. In Excel, names show as “MÃ¼ller” and “GÃ¶tz”. He closes the file without saving.
        He opens a new workbook, uses Data → From Text/CSV, sets File Origin to 65001: Unicode (UTF-8), and the names show correctly as “Müller”
        and “Götz”. Before sending the list on to a colleague, he saves it as CSV UTF-8, so the names stay correct on the next computer too.
      </p>

      <h2>Quick summary</h2>
      <p>
        Ã© and â€™ mean a UTF-8 file was opened as Windows-1252. Re-open it as UTF-8 (File Origin 65001 in Excel), save CSV files as UTF-8, and
        use the CSV Validator to read files with other encodings and download a clean UTF-8 copy.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Fixing the characters by hand</strong> with Find and Replace. It takes long and misses some. Re-open the file correctly
          instead.
        </li>
        <li>
          <strong>Saving the broken version.</strong> If you save after the letters went wrong, the wrong letters are written into the file.
        </li>
      </ul>
    </>
  ),
  faqs: [
    {
      q: "Is my data damaged?",
      a: "Usually not. The file was only opened with the wrong encoding. Open the original again as UTF-8, without saving the broken version.",
    },
    {
      q: "Why does my file look fine in Google Sheets but not in Excel?",
      a: "Google Sheets reads UTF-8 by default. Excel may not, unless the file has a BOM. Save as CSV UTF-8 or use Data → From Text/CSV.",
    },
    {
      q: "What does ï»¿ at the start of my file mean?",
      a: "It's a BOM shown by a program that doesn't expect it. Save the file as UTF-8 without BOM for that program.",
    },
    {
      q: "Which encoding should I use?",
      a: "UTF-8. It supports every language and is expected by Google Sheets, databases and most modern programs.",
    },
    {
      q: "Why do Hindi or Tamil letters show as question marks?",
      a: "The file was saved in an encoding that can't store those letters, such as Windows-1252. Save it again as UTF-8 from the original source; question marks that are already in the file can't be turned back into letters.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is read and checked in your browser, on your device.",
    },
  ],
};
