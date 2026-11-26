import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const changeCaseProperCase: HowToGuide = {
  slug: "change-case-proper-case",
  title: "How to change text to Proper Case, UPPER CASE or lower case",
  seoTitle: "Change Text to Proper Case, UPPER or lower Case",
  description:
    "Turn RAVI KUMAR or ravi kumar into Ravi Kumar. How to change the case of names and text in Excel, Google Sheets, or free in your browser with MyDataFixer.",
  summary: "Names typed in capitals or small letters? Here's how to write them as Ravi Kumar, RAVI KUMAR or ravi kumar in one go.",
  updated: "2026-11-23",
  tools: ["spreadsheet-cleaner", "spreadsheet-error-detector"],
  related: ["fix-inconsistent-capitalization", "remove-extra-spaces", "remove-duplicate-rows"],
  quickAnswer: (
    <p>
      To write a whole column as <strong>Proper Case</strong> (Ravi Kumar), <strong>UPPER CASE</strong> (RAVI KUMAR) or{" "}
      <strong>lower case</strong> (ravi kumar), use the PROPER, UPPER or LOWER function in Excel or Google Sheets, or the free{" "}
      <strong>Change case</strong> tool in MyDataFixer&apos;s Spreadsheet Cleaner. Change case shows every change before it&apos;s made, knows names
      like O&apos;Brien and McDonald, and never touches email addresses or codes.
    </p>
  ),
  body: (
    <>
      <h2>The three styles</h2>
      <ExampleTable
        caption="The same name in each style"
        headers={["Style", "Example", "Good for"]}
        rows={[
          ["Proper Case", "Ravi Kumar, New York", "names of people, cities, products"],
          ["UPPER CASE", "RAVI KUMAR, NEW YORK", "codes, labels, forms that ask for capitals"],
          ["lower case", "ravi kumar, new york", "email addresses, tags, usernames"],
        ]}
      />
      <p>
        Proper Case is the one people need most. Contact lists, student lists and customer exports are often typed in capitals (“MEERA SHAH”) or
        in small letters (“meera shah”), and they look untidy in letters, labels and reports.
      </p>

      <h2>Why names end up in the wrong case</h2>
      <ul>
        <li>Caps Lock was on while someone typed.</li>
        <li>An old system or form saved everything in capitals.</li>
        <li>People typed quickly on a phone and didn&apos;t bother with capitals.</li>
        <li>Data from different sources was combined, each with its own habit.</li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="A contact list before and after Change case (Proper Case on the name and city columns)"
        headers={["Before", "After"]}
        rows={[
          ["ravi k · BERLIN", "Ravi K · Berlin"],
          ["MEERA SHAH · toronto", "Meera Shah · Toronto"],
          ["o'brien · new york", "O'Brien · New York"],
          ["anne-marie · lyon", "Anne-Marie · Lyon"],
          ["asha@example.com", "asha@example.com (never changed)"],
        ]}
      />

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <ol>
        <li>Insert an empty helper column next to the column you want to change.</li>
        <li>
          In the first data row, type <code>=PROPER(A2)</code>, <code>=UPPER(A2)</code> or <code>=LOWER(A2)</code>, using your column&apos;s letter.
        </li>
        <li>Double-click the small square at the bottom right of the cell to copy the formula down.</li>
        <li>
          Copy the helper column, then right-click the original column → <strong>Paste Special</strong> → <strong>Values</strong>.
        </li>
        <li>Delete the helper column.</li>
      </ol>
      <p>
        Excel has no “Change Case” button like Word, so the functions are the usual way. For a few cells, you can also type the right spelling
        once and use <strong>Flash Fill</strong> (Data → Flash Fill) to repeat the pattern down the column.
      </p>

      <h2>Fix it in Google Sheets</h2>
      <p>
        PROPER, UPPER and LOWER work exactly the same in Google Sheets: add a helper column with <code>=PROPER(A2)</code>, copy it down, then copy
        it and use <strong>Edit</strong> → <strong>Paste special</strong> → <strong>Values only</strong> over the original column.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>MyDataFixer works in your browser, also on phones and tablets, and your file never leaves your device.</p>
      <ol>
        <li>
          Open your Excel or CSV file in the <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link>.
        </li>
        <li>
          In the list of cleaning tools, find <strong>Change case</strong> and tap <strong>Choose columns · Preview</strong>.
        </li>
        <li>
          Choose a style: <strong>Proper Case</strong>, <strong>UPPER CASE</strong> or <strong>lower case</strong>.
        </li>
        <li>Tick the columns to change. Each column shows an example value, so you can see which is which.</li>
        <li>Check the preview: it lists every cell before and after, and the values it left alone with the reason.</li>
        <li>
          Tap <strong>Apply</strong>. If you change your mind, use <strong>Undo</strong>. Then download the file as CSV, or as Excel if you opened an
          Excel file.
        </li>
      </ol>
      <p>
        The <Link href="/spreadsheet-error-detector">Error Detector</Link> also helps: when a name or place column (such as “name”, “customer” or
        “city”) is mostly written in capitals or small letters, it shows a note, “Names written in capitals or small letters”. Its button opens
        Change case with Proper Case and those columns already chosen.
      </p>

      <h2>How MyDataFixer&apos;s Proper Case handles names</h2>
      <p>The PROPER function simply makes the first letter of every word a capital. Change case follows a few extra name rules:</p>
      <ExampleTable
        caption="Proper Case results"
        headers={["Before", "PROPER in Excel", "Change case"]}
        rows={[
          ["o'brien", "O'Brien", "O'Brien"],
          ["don't stop", "Don'T Stop", "Don't Stop"],
          ["mcdonald", "Mcdonald", "McDonald"],
          ["ludwig van beethoven", "Ludwig Van Beethoven", "Ludwig van Beethoven"],
          ["state bank of india", "State Bank Of India", "State Bank of India"],
          ["henry viii", "Henry Viii", "Henry VIII"],
          ["HDFC Bank", "Hdfc Bank", "HDFC Bank"],
        ]}
      />
      <ul>
        <li>After an apostrophe, a capital follows only when one letter comes before it, so O&apos;Brien and D&apos;Souza work, and “don&apos;t” stays “Don&apos;t”.</li>
        <li>Names starting with “Mc” get a second capital.</li>
        <li>
          Small linking words stay small in the middle of a name: van, von, der, den, de, da, del, di, du, la, bin, al, of, and, the.
        </li>
        <li>Roman numerals after the first word become capitals.</li>
        <li>
          A short word in capitals, like HDFC, is kept when the same cell also has a normally written word (“HDFC Bank”). If the whole cell is in
          capitals (“HDFC BANK”), there&apos;s no way to tell a short form from a name, so it becomes “Hdfc Bank”: check those in the preview.
        </li>
      </ul>

      <h2>What Change case never changes</h2>
      <ul>
        <li>Email addresses and web addresses.</li>
        <li>Values that contain numbers, such as codes (MH12AB1234), house numbers or IDs.</li>
        <li>Formula cells and the column names in the first row.</li>
        <li>Spaces and punctuation: only capital and small letters change.</li>
        <li>Text in scripts without capital letters, such as Hindi or Tamil.</li>
      </ul>

      <h2>Change case or Fix capitalization?</h2>
      <p>The Spreadsheet Cleaner has two tools for capitals. They solve different problems:</p>
      <ul>
        <li>
          <strong>Fix capitalization</strong> makes spellings match: if “Lyon” appears 12 times and “LYON” twice, the two become “Lyon”. It only
          uses spellings that are already in your column.
        </li>
        <li>
          <strong>Change case</strong> writes whole columns in the style you choose, even when no correct spelling exists yet, such as a list typed
          entirely in capitals.
        </li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Sunita runs a coaching class and gets a list of 300 students from an old admission form that saved everything in capitals. She wants to
        print certificates with names like “Priya Sharma”, not “PRIYA SHARMA”. She opens the list in the Error Detector, which shows the note
        “Names written in capitals or small letters” for the student name and city columns. She taps Change case: Proper Case and both columns
        are already chosen. The preview shows 600 changes, and she spots one name she wants written differently, which she corrects by tapping
        the cell after applying. She downloads the Excel file and prints the certificates.
      </p>

      <h2>How to avoid the problem next time</h2>
      <ul>
        <li>Ask people to type names the normal way, and say so on forms (“Name, for example Priya Sharma”).</li>
        <li>Turn Caps Lock off before typing lists.</li>
        <li>Clean new data as soon as it arrives, before you send letters or print labels.</li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Use PROPER, UPPER or LOWER with a helper column in Excel or Google Sheets, or Change case in MyDataFixer&apos;s Spreadsheet Cleaner, which
        previews every change, handles names like O&apos;Brien and McDonald, and never changes emails, codes or formulas.
      </p>
    </>
  ),
  faqs: [
    {
      q: "How do I change capital letters to small letters in Excel?",
      a: "Use =LOWER(A2) in a helper column, copy it down, then paste the results back as values. For Proper Case use =PROPER(A2), for capitals =UPPER(A2).",
    },
    {
      q: "Does Change case work on phones?",
      a: "Yes. The Spreadsheet Cleaner works in the browser on phones and tablets. The Excel phone app has no PROPER button, so MyDataFixer or Google Sheets in a browser is easier there.",
    },
    {
      q: "Will Change case change my email addresses?",
      a: "No. Email addresses, web addresses and values with numbers are never changed, even if their column is selected. The preview lists them as left alone.",
    },
    {
      q: "Can I undo it?",
      a: "Yes. Undo restores the previous values, and your original file is never changed. Nothing is saved until you download.",
    },
    {
      q: "What if a name should be written differently?",
      a: "Apply the change, then tap the cell in the table and type the right spelling. Brand names such as iPhone or eBay often need this.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is changed in your browser, on your device. Its contents are not sent to any server.",
    },
  ],
};
