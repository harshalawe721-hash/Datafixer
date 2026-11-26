import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const numbersStoredAsText: HowToGuide = {
  slug: "numbers-stored-as-text",
  title: "How to fix numbers stored as text",
  seoTitle: "How to Fix Numbers Stored as Text in Excel",
  description:
    "Numbers stored as text are left out of SUM and sort in the wrong order. Learn how to convert them to real numbers in Excel, Google Sheets and free online.",
  summary: "Totals don't add up because some numbers are really text. Here's how to spot and convert them.",
  updated: "2026-11-20",
  tools: ["spreadsheet-cleaner", "spreadsheet-error-detector"],
  related: ["remove-extra-spaces", "keep-leading-zeros-in-csv", "excel-formula-errors"],
  quickAnswer: (
    <p>
      A number stored as text looks like a number but behaves like a word. SUM skips it, sorting puts 100 before 20, and some formulas show
      #VALUE!. In Excel, select the cells, click the small warning icon and choose <strong>Convert to Number</strong>. Keep codes with leading
      zeros, like 00123, as text on purpose.
    </p>
  ),
  body: (
    <>
      <h2>How to recognise numbers stored as text</h2>
      <ul>
        <li>The numbers sit on the left side of the cell (real numbers sit on the right, unless someone changed the alignment).</li>
        <li>Excel shows a small green triangle in the top-left corner of the cell.</li>
        <li>The total at the bottom is smaller than it should be, or the status bar shows only a “Count” and no “Sum” when you select them.</li>
        <li>Sorting puts 1, 10, 100, 2, 20 instead of 1, 2, 10, 20, 100.</li>
      </ul>

      <h2>Why it happens</h2>
      <ul>
        <li>
          <strong>Imports and exports.</strong> Data from websites, banking apps and other systems often arrives as text.
        </li>
        <li>
          <strong>An apostrophe in front.</strong> Typing <code>&apos;45</code> forces Excel to keep it as text.
        </li>
        <li>
          <strong>Extra characters.</strong> Spaces, currency signs (€, $), or thousands separators written as text, such as “1,250”.
        </li>
        <li>
          <strong>The cell was formatted as Text</strong> before the number was typed.
        </li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="Three amounts, but only one is a real number"
        headers={["amount", "what it is"]}
        rows={[
          ["500", "a real number"],
          ["'300", "text (apostrophe in front)"],
          ["200 ", "text (a space at the end)"],
        ]}
      />
      <p>=SUM(...) of this column shows 500 instead of 1,000.</p>

      <h2>Fix it in Excel</h2>
      <ExcelNote />
      <h3>Method 1: Convert to Number (quickest)</h3>
      <ol>
        <li>Select the cells with green triangles.</li>
        <li>Click the yellow warning icon that appears next to them.</li>
        <li>
          Choose <strong>Convert to Number</strong>.
        </li>
      </ol>
      <h3>Method 2: Text to Columns (for a whole column)</h3>
      <ol>
        <li>Select the column.</li>
        <li>
          Go to <strong>Data</strong> → <strong>Text to Columns</strong> and click <strong>Finish</strong> straight away.
        </li>
      </ol>
      <p>Excel reads every value again and turns plain numbers into real numbers.</p>
      <h3>Method 3: a formula</h3>
      <p>
        In a helper column, use <code>=VALUE(A2)</code>, or <code>=VALUE(TRIM(A2))</code> if there are spaces. Then copy the results and paste them
        back as values.
      </p>

      <h2>Fix it in Google Sheets</h2>
      <ol>
        <li>Select the cells.</li>
        <li>
          Go to <strong>Format</strong> → <strong>Number</strong> → <strong>Number</strong>.
        </li>
      </ol>
      <p>
        If that doesn&apos;t change them (for example values with an apostrophe or a space), use <code>=VALUE(A2)</code> in a helper column, then
        paste back as values. Removing extra spaces first with <strong>Data → Data cleanup → Trim whitespace</strong> also helps.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <p>
        Open your file in the <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link> and choose <strong>Convert numbers stored as text</strong>.
        It looks at columns that mostly hold numbers and finds the values written as text. You see each value before and after, then apply.
      </p>
      <p>MyDataFixer is careful about values that could mean different things, and leaves them for you to check, with the reason:</p>
      <ul>
        <li>values with a decimal comma, percent signs, brackets or a minus sign at the end, such as “12,5”, “12%” or “(5)”;</li>
        <li>numbers with more than 15 digits, which a spreadsheet would round;</li>
        <li>codes with leading zeros, such as 00123, which are not counted as numbers at all.</li>
      </ul>
      <p>
        The <Link href="/spreadsheet-error-detector">Error Detector</Link> finds numbers stored as text together with other problems. Both work on
        phones and tablets, and your file stays on your device.
      </p>

      <h2>When text is the right choice</h2>
      <p>
        Not every number should be a number. Codes, phone numbers, PIN codes and IDs should stay text, because you never add them up and their
        leading zeros matter. Convert only amounts, quantities, prices and other values you calculate with.
      </p>

      <h2>How to avoid it next time</h2>
      <ul>
        <li>Clean imported data straight away: remove spaces, then convert numbers.</li>
        <li>Don&apos;t format amount columns as Text.</li>
        <li>Type numbers without currency signs or spaces; use a number format to show €, $ or commas.</li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Priya downloads a sales report from her billing app. The total at the bottom says €45,000, but she knows sales were higher. She selects the
        amount column and sees green triangles on about a third of the cells: those amounts arrived as text. She removes extra spaces first, then
        uses Convert to Number. The total jumps to €68,500, the right figure. The invoice number column also had green triangles, but she leaves it
        alone: invoice numbers like 000451 are codes, and converting them would remove the zeros.
      </p>

      <h2>Quick summary</h2>
      <p>
        Numbers stored as text break totals and sorting. Convert them with Convert to Number or Text to Columns in Excel, Format → Number in
        Google Sheets, or the Cleaner, which skips values that could be read two ways. Keep codes as text.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Converting codes.</strong> Turning 00123 into a number removes the zeros.
        </li>
        <li>
          <strong>Changing only the format.</strong> Setting the format to Number doesn&apos;t always convert text that is already there.
        </li>
      </ul>
    </>
  ),
  faqs: [
    {
      q: "Why doesn't SUM add up all my numbers?",
      a: "Some of them are stored as text, and SUM skips text. Convert them to real numbers with one of the methods above.",
    },
    {
      q: "What does the green triangle in a cell mean?",
      a: "Excel thinks something may be wrong, most often a number stored as text. Click the cell and the warning icon to see the reason.",
    },
    {
      q: "Should phone numbers be numbers or text?",
      a: "Text. You never calculate with them, and a leading zero or + sign must be kept.",
    },
    {
      q: "Why did MyDataFixer skip some values?",
      a: "They could mean different things, for example 1,250 in a column that also uses decimal commas. The preview lists each skipped value with the reason so you can decide.",
    },
    {
      q: "Can I convert numbers stored as text on my phone?",
      a: "The Excel phone app has limited options. Google Sheets in a browser has Format → Number, and MyDataFixer's Spreadsheet Cleaner works on phones and tablets.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. Your file is checked and fixed in your browser, on your device.",
    },
  ],
};
