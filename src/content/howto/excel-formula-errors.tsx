import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const excelFormulaErrors: HowToGuide = {
  slug: "excel-formula-errors",
  title: "What #N/A, #VALUE!, #REF! and #DIV/0! mean, and how to fix them",
  seoTitle: "Excel Errors #N/A, #VALUE!, #REF!, #DIV/0! Explained",
  description:
    "What do #N/A, #VALUE!, #REF!, #DIV/0! and #NAME? mean in Excel? A simple guide to each error, what causes it and how to find and fix it.",
  summary: "Cells showing #N/A or #DIV/0! instead of a number? Here's what each error means and how to fix it.",
  updated: "2026-11-20",
  tools: ["spreadsheet-error-detector"],
  related: ["numbers-stored-as-text", "remove-extra-spaces", "find-blank-cells"],
  quickAnswer: (
    <p>
      An error like <strong>#N/A</strong> or <strong>#DIV/0!</strong> means a formula couldn&apos;t calculate a result. The error name tells you
      why: #N/A means a lookup found nothing, #DIV/0! means division by zero, #VALUE! means the wrong kind of value, #REF! means a deleted cell,
      and #NAME? means a misspelled function. Fix the cause, and the error disappears by itself.
    </p>
  ),
  body: (
    <>
      <h2>Why errors matter</h2>
      <p>
        One error can spread. If a cell shows #N/A, every total, average or chart that uses that cell also fails or shows a wrong result. In a
        big sheet, a single error hidden in row 4,000 can make the total at the top show an error too. That is why it&apos;s worth finding them
        all, not just the ones you can see.
      </p>

      <h2>What each error means</h2>
      <ExampleTable
        caption="The most common spreadsheet errors"
        headers={["Error", "What it means", "Usual fix"]}
        rows={[
          ["#N/A", "A lookup didn't find a match", "Check the value exists and is spelled the same"],
          ["#DIV/0!", "Division by zero or by an empty cell", "Check the number you divide by"],
          ["#VALUE!", "The wrong type of value, such as text in a sum", "Make sure the cells hold numbers"],
          ["#REF!", "The formula points to cells that were deleted", "Rebuild the reference or undo the deletion"],
          ["#NAME?", "A misspelled function or unknown name", "Check the spelling of the function"],
          ["#NUM!", "An impossible number, like the square root of -1", "Check the inputs"],
          ["#NULL!", "A space instead of a colon or comma in a range", "Write A1:B2, or A1,B2"],
          ["#SPILL!", "The result needs more room than is free", "Clear the cells below or beside it"],
        ]}
      />

      <h2>The common errors in more detail</h2>
      <h3>#N/A: nothing found</h3>
      <p>
        You see #N/A with VLOOKUP, XLOOKUP, MATCH and similar functions when the value you look for isn&apos;t in the list. Very often it
        <em> is</em> there, but written slightly differently: an extra space (“Lyon ” instead of “Lyon”), a number stored as text (“123” instead of
        123), or a different spelling. Clean both sides and try again.
      </p>
      <h3>#DIV/0!: dividing by zero</h3>
      <p>
        A formula such as =A2/B2 shows #DIV/0! when B2 is 0 or empty. This often happens in rows where data hasn&apos;t been entered yet. You can
        hide it with <code>=IFERROR(A2/B2,&quot;&quot;)</code>, which shows an empty cell instead, but first check whether the empty value is a
        mistake.
      </p>
      <h3>#VALUE!: wrong kind of value</h3>
      <p>
        Adding text to a number, like =A2+B2 where B2 contains “ten” or “500 rs”, gives #VALUE!. Numbers stored as text and stray spaces are common
        causes.
      </p>
      <h3>#REF!: missing cells</h3>
      <p>
        If you delete a row or column that a formula used, the formula loses its target and shows #REF!. Undo the deletion if you can, or write
        the reference again.
      </p>
      <h3>#NAME?: unknown name</h3>
      <p>
        A typo such as =SUMM(A2:A10) instead of =SUM(A2:A10), or a function that your version of Excel doesn&apos;t have, gives #NAME?.
      </p>

      <h2>Example</h2>
      <ExampleTable
        caption="A small price list with errors"
        headers={["product", "price", "quantity", "price per item"]}
        rows={[
          ["Pens", "100", "10", "10"],
          ["Paper", "250", "0", "#DIV/0!"],
          ["Ink", "ten", "2", "#VALUE!"],
        ]}
      />
      <p>The total of the last column also shows an error, because two of its cells do.</p>

      <h2>Find errors in Excel</h2>
      <ExcelNote />
      <ol>
        <li>Select the whole sheet (click the corner above row 1) or one column.</li>
        <li>
          Go to <strong>Home</strong> → <strong>Find &amp; Select</strong> → <strong>Go To Special</strong>.
        </li>
        <li>
          Choose <strong>Formulas</strong>, untick everything except <strong>Errors</strong>, and click <strong>OK</strong>. Every error cell is
          selected.
        </li>
      </ol>
      <p>
        You can also use <strong>Formulas</strong> → <strong>Error Checking</strong>, which moves from one error to the next and explains each one.
        Click any error cell and the small warning icon next to it offers help too.
      </p>

      <h2>Find errors in Google Sheets</h2>
      <p>
        Errors show with a small red triangle in the corner of the cell. Point at the cell (or tap it) to see an explanation. To list them, use a
        filter on the column and look for values starting with #. IFERROR works in Google Sheets just like in Excel.
      </p>

      <h2>Find errors with MyDataFixer</h2>
      <p>
        Open your Excel or CSV file in the <Link href="/spreadsheet-error-detector">Error Detector</Link>. It checks every cell and lists all formula
        errors with their type (#N/A, #DIV/0!, #VALUE!, #REF!, #NAME?, #NUM!, #NULL!, #SPILL! and more), what each one means and how to fix it.
        “View affected data” shows exactly which rows contain errors.
      </p>
      <p>
        MyDataFixer never changes formulas by itself, because the right fix depends on what the formula should do. You fix the cause, and the
        error is gone. In a CSV file the formulas are no longer there, only the error text, so the source sheet needs fixing. Your file stays on
        your device.
      </p>

      <h2>How to avoid formula errors next time</h2>
      <ul>
        <li>Clean data before you build formulas on it: remove extra spaces and convert numbers stored as text.</li>
        <li>Don&apos;t delete rows or columns that other sheets use; clear their contents instead.</li>
        <li>Use IFERROR only where an error is expected, such as rows waiting for data.</li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Each error name tells you the cause. Find all errors with Go To Special in Excel, look for red triangles in Google Sheets, or list them
        all at once with the Error Detector. Then fix the cause, not just the symptom.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Hiding every error with IFERROR.</strong> The sheet looks clean, but totals are still wrong because data is missing.
        </li>
        <li>
          <strong>Typing over the error.</strong> Replacing the formula with a number removes the error but also the calculation.
        </li>
      </ul>
    </>
  ),
  faqs: [
    {
      q: "Why does VLOOKUP give #N/A when the value is in the list?",
      a: "Usually the two values differ slightly: an extra space, a number stored as text, or a different spelling. Clean both and try again.",
    },
    {
      q: "How do I hide #DIV/0! errors?",
      a: "Use =IFERROR(your formula,\"\") to show an empty cell instead. Check first that the empty or zero value isn't a mistake.",
    },
    {
      q: "Can I find all errors at once?",
      a: "In Excel, use Home → Find & Select → Go To Special → Formulas → Errors. MyDataFixer's Error Detector lists every error in the sheet.",
    },
    {
      q: "Why does my CSV file contain #N/A as text?",
      a: "The CSV was saved from a sheet that showed errors. A CSV keeps only results, so fix the formulas in the original sheet and save again.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is checked in your browser, on your device.",
    },
  ],
};
