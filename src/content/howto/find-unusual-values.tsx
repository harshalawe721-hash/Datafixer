import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import { ExcelNote } from "@/components/guides/ExcelNote";
import type { HowToGuide } from "./types";

export const findUnusualValues: HowToGuide = {
  slug: "find-unusual-values",
  title: "How to find unusual values (outliers) in a spreadsheet",
  seoTitle: "How to Find Unusual Values (Outliers) in Excel",
  description:
    "An extra zero or a wrong sign can ruin a total. Learn how to find unusual numbers in a spreadsheet with sorting, conditional formatting or MyDataFixer.",
  summary: "One amount with an extra zero can make a whole report wrong. Here's how to spot numbers that don't fit.",
  updated: "2026-11-24",
  tools: ["spreadsheet-error-detector"],
  related: ["numbers-stored-as-text", "excel-formula-errors", "find-blank-cells"],
  quickAnswer: (
    <p>
      An unusual value (an outlier) is a number far outside the usual range of its column, like 50,000 in a column of amounts between 100 and
      900. It may be correct, but it&apos;s often a typing mistake: an extra zero, a wrong sign or the wrong unit. Find them by sorting the column,
      with conditional formatting, or with MyDataFixer&apos;s Error Detector, then check each one against the source.
    </p>
  ),
  body: (
    <>
      <h2>Why unusual values matter</h2>
      <p>
        Totals and averages are very sensitive to a single wrong number. One sale typed as 25,000 instead of 2,500 raises the month&apos;s total by
        22,500 and makes the average look much better than it was. In a stock list, a quantity of -40 instead of 40 can trigger a wrong reorder.
      </p>

      <h2>Common causes</h2>
      <ul>
        <li>An extra or missing zero (2,500 typed as 25,000 or 250).</li>
        <li>A wrong sign (-40 instead of 40).</li>
        <li>The wrong unit: grams instead of kilograms, paise instead of rupees, monthly instead of yearly.</li>
        <li>A value in the wrong column, such as a phone number in the amount column.</li>
        <li>A genuine but rare value: a very large order really can happen.</li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="Daily sales: one value stands out"
        headers={["date", "sales"]}
        rows={[
          ["01/03/2026", "2,480"],
          ["02/03/2026", "2,610"],
          ["03/03/2026", "26,050"],
          ["04/03/2026", "2,390"],
          ["05/03/2026", "2,720"],
        ]}
      />
      <p>Every day is between 2,390 and 2,720 except 3 March. That&apos;s probably 2,605 with an extra zero, but only the till receipt can say.</p>

      <h2>Find them in Excel</h2>
      <ExcelNote />
      <h3>Sort the column</h3>
      <p>
        The quickest check: sort the column from smallest to largest and look at both ends. Undo the sort afterwards (or sort a copy) if the row
        order matters.
      </p>
      <h3>Highlight them with conditional formatting</h3>
      <ol>
        <li>Select the column of numbers.</li>
        <li>
          Go to <strong>Home</strong> → <strong>Conditional Formatting</strong> → <strong>Top/Bottom Rules</strong> → <strong>Top 10 Items</strong>{" "}
          (change 10 to a smaller number) or <strong>Above Average</strong>.
        </li>
        <li>Look at the highlighted values and check whether they make sense.</li>
      </ol>
      <h3>Use a quick formula</h3>
      <p>
        <code>=MAX(B2:B500)</code>, <code>=MIN(B2:B500)</code> and <code>=MEDIAN(B2:B500)</code> show at a glance whether the largest or smallest value
        is far away from the typical one.
      </p>

      <h2>Find them in Google Sheets</h2>
      <p>
        Sorting, MIN, MAX and MEDIAN work the same. For highlighting, use <strong>Format</strong> → <strong>Conditional formatting</strong> with a
        rule such as “Greater than” a value you choose.
      </p>

      <h2>Find them with MyDataFixer</h2>
      <p>
        Open the file in the <Link href="/spreadsheet-error-detector">Error Detector</Link>. The check “Unusual values (please check)” looks at every
        number column and lists values far outside the usual range of their column. It uses a cautious statistical rule (far-out fences based on
        the middle half of the values), so only clear cases are shown. To avoid false alarms, it doesn&apos;t check:
      </p>
      <ul>
        <li>columns with fewer than 20 numbers;</li>
        <li>ID columns and years;</li>
        <li>columns where most values are the same.</li>
      </ul>
      <p>
        “View affected data” filters the table to exactly those rows, so you can compare them with your source. MyDataFixer never changes unusual
        values by itself, because a value far from the rest can be perfectly correct. If one is a mistake, tap the cell to correct it, then
        download the file. Your file stays on your device.
      </p>

      <h2>What to do with each unusual value</h2>
      <ul>
        <li>
          <strong>Check the source:</strong> the receipt, invoice, form or original system.
        </li>
        <li>
          <strong>Correct it</strong> if it&apos;s a typing mistake.
        </li>
        <li>
          <strong>Leave it</strong> if it&apos;s genuine, and perhaps add a note so the next person doesn&apos;t “fix” it.
        </li>
        <li>
          <strong>Don&apos;t delete rows</strong> just because they look unusual: that hides real events and makes totals wrong in a different way.
        </li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Vivek prepares the monthly sales report for his three shops. The total looks about 20,000 higher than expected. He opens the sales sheet
        in the Error Detector, which lists one unusual value: 26,050 on 3 March, while the other days are around 2,500. The till report confirms
        2,605. He corrects the cell, downloads the file, and the total now matches the till.
      </p>

      <h2>Unusual values that are fine</h2>
      <p>
        Not every value far from the rest is a mistake. A festival week can bring sales five times higher than usual, and one corporate order can
        dwarf a month of small ones. Seasonal businesses, bulk orders and one-off payments all create real outliers. That&apos;s why every
        unusual value needs a quick look at the source rather than an automatic correction.
      </p>

      <h2>How to avoid them next time</h2>
      <ul>
        <li>Use data validation (Data → Data Validation) to allow only a sensible range, for example 0 to 10,000.</li>
        <li>Agree on units and write them in the column name, such as “weight (kg)”.</li>
        <li>Compare totals with an independent source, like the till or bank statement, every month.</li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Unusual values are often typing mistakes but can be genuine. Spot them by sorting, with conditional formatting, or with the Error
        Detector&apos;s cautious check, then check each one at the source before changing it.
      </p>
    </>
  ),
  faqs: [
    {
      q: "What is an outlier?",
      a: "A value far outside the usual range of its column. It can be a mistake or a genuine but rare value.",
    },
    {
      q: "Does MyDataFixer delete or change unusual values?",
      a: "No. It only shows them. You decide whether each one is a mistake and correct it by tapping the cell.",
    },
    {
      q: "Why didn't MyDataFixer check my ID column?",
      a: "IDs, years, columns with fewer than 20 numbers and columns where most values are the same are skipped, because unusual values there are usually not mistakes.",
    },
    {
      q: "How can I stop wrong numbers being typed?",
      a: "Use Data Validation in Excel or Google Sheets to allow only a sensible range of values in the column.",
    },
    {
      q: "Can negative numbers be unusual values?",
      a: "Yes. A negative quantity or price in a column of positive values is often a wrong sign, and it shows up as far outside the usual range.",
    },
    {
      q: "Does MyDataFixer upload my file?",
      a: "No. The file is checked in your browser, on your device.",
    },
  ],
};
