import Link from "next/link";
import { ExampleTable } from "@/components/guides/ExampleTable";
import type { HowToGuide } from "./types";

export const standardisePhoneNumbers: HowToGuide = {
  slug: "standardise-phone-numbers",
  title: "How to make phone numbers use one layout in a spreadsheet",
  seoTitle: "Make Phone Numbers One Format in a Spreadsheet",
  description:
    "Phone numbers written as +44 20 7946 0958, 98765-43210 and (98765) 43210? Learn how to put them in one layout without changing a single digit.",
  summary: "The same kind of phone number written in different ways is hard to search and import. Here's how to make them consistent.",
  updated: "2026-11-24",
  tools: ["spreadsheet-cleaner", "spreadsheet-error-detector"],
  related: ["check-emails-and-phone-numbers", "keep-leading-zeros-in-csv", "remove-extra-spaces"],
  quickAnswer: (
    <p>
      When one column mixes layouts like “98765 43210”, “98765-43210” and “9876543210”, searching, sorting and importing become harder. Pick one
      layout and rewrite the others so only spaces and punctuation change, never the digits. MyDataFixer&apos;s “Make phone number layouts
      consistent” does exactly that, with a preview, and skips numbers it would have to guess about.
    </p>
  ),
  body: (
    <>
      <h2>Why one layout helps</h2>
      <ul>
        <li>Searching for “98765 43210” doesn&apos;t find “98765-43210”.</li>
        <li>Duplicate customers aren&apos;t spotted because their numbers look different.</li>
        <li>SMS, WhatsApp and CRM tools often expect one specific layout.</li>
        <li>Lists simply look tidier when every number follows the same pattern.</li>
      </ul>

      <h2>Example</h2>
      <ExampleTable
        caption="One phone column, four layouts, the same kind of number"
        headers={["As typed", "In one layout (##### #####)"]}
        rows={[
          ["98765 43210", "98765 43210"],
          ["98765-43210", "98765 43210"],
          ["9876543210", "98765 43210"],
          ["(98765) 43210", "98765 43210"],
        ]}
      />

      <h2>Before you start: check the numbers are valid</h2>
      <p>
        Changing the layout only makes sense for valid numbers. Numbers with letters, far too few digits (fewer than 7) or too many (more than 15,
        the international maximum) are mistakes to correct by hand first. MyDataFixer&apos;s{" "}
        <Link href="/spreadsheet-error-detector">Error Detector</Link> lists these as “Invalid phone numbers”, using general international rules
        rather than each country&apos;s own numbering plan.
      </p>
      <p>Also make sure the column is stored as text, so leading zeros and + signs aren&apos;t lost.</p>

      <h2>Fix it in Excel or Google Sheets</h2>
      <p>For a simple layout, remove everything except digits with a formula, then add your own spacing:</p>
      <ol>
        <li>
          Digits only: <code>=SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(A2,&quot; &quot;,&quot;&quot;),&quot;-&quot;,&quot;&quot;),&quot;(&quot;,&quot;&quot;),&quot;)&quot;,&quot;&quot;),&quot;.&quot;,&quot;&quot;)</code>
        </li>
        <li>
          For 10-digit numbers, add a space after the fifth digit: <code>=LEFT(B2,5)&amp;&quot; &quot;&amp;RIGHT(B2,5)</code>
        </li>
        <li>Copy the results and paste them back as values over the original column.</li>
      </ol>
      <p>
        Be careful with numbers that have a country code (+44…), an extension or a different number of digits: a formula built for 10 digits will
        cut or mix them up. Check those rows by hand.
      </p>

      <h2>Fix it with MyDataFixer</h2>
      <ol>
        <li>
          Open your file in the <Link href="/spreadsheet-cleaner">Spreadsheet Cleaner</Link>.
        </li>
        <li>
          Choose <strong>Make phone number layouts consistent</strong>. For each phone column, it lists the layouts already used, with an example
          and how many numbers use each one; the most common is marked.
        </li>
        <li>Choose the layout you want. The preview shows every number before and after.</li>
        <li>Apply, check the result, and download. Undo works if you change your mind.</li>
      </ol>
      <p>The tool is deliberately careful:</p>
      <ul>
        <li>Only spacing and punctuation change; the digits stay exactly the same.</li>
        <li>
          A number is only rewritten when it has exactly the digits the chosen layout needs, and a + country code on both or neither, so a country
          code is never invented or dropped. Other numbers are listed for you to check by hand.
        </li>
        <li>Numbers with an extension, formula cells and invalid numbers are left as they are.</li>
      </ul>
      <p>Everything runs in your browser; your contact list never leaves your device.</p>

      <h2>Which layout should you choose?</h2>
      <ul>
        <li>
          <strong>For people to read:</strong> a layout with a space, such as 98765 43210.
        </li>
        <li>
          <strong>For international lists:</strong> include the country code, such as +44 20 7946 0958.
        </li>
        <li>
          <strong>For an import tool:</strong> whatever its help page asks for; many want digits only, or the country code without spaces.
        </li>
      </ul>

      <h2>From start to finish: an example</h2>
      <p>
        Swati manages 1,500 members of a fitness club, entered by three receptionists over two years. Before importing them into an SMS tool, she
        opens the list in the Error Detector, which finds 12 invalid numbers (letters typed by mistake, or only 5 or 6 digits) and mixed phone
        layouts. She corrects the invalid ones from the paper forms, then uses Make phone number layouts consistent and picks “##### #####”, the
        most common layout. 1,431 numbers are rewritten; 57 with a +44 country code and a few with 9 digits are listed separately, because
        changing them would mean guessing. She checks those by hand, downloads the file and imports it.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Storing numbers as numbers.</strong> Excel then removes leading zeros and + signs, and the layout can&apos;t be restored.
        </li>
        <li>
          <strong>One formula for all numbers.</strong> A formula built for 10-digit numbers breaks numbers with country codes or extensions.
        </li>
        <li>
          <strong>Adding country codes by guesswork.</strong> Only add a country code (such as +44 or +1) when you know where each contact lives.
        </li>
      </ul>

      <h2>How to avoid it next time</h2>
      <ul>
        <li>Agree on one layout and show it as an example on forms (“98765 43210”).</li>
        <li>Store phone numbers as text, never as numbers.</li>
        <li>Keep the country code in a separate column if you have international contacts.</li>
      </ul>

      <h2>Quick summary</h2>
      <p>
        Mixed phone layouts make searching and importing harder. Correct invalid numbers first, then choose one layout. Formulas work for simple
        cases; MyDataFixer changes only spacing and punctuation, never digits, and leaves numbers it would have to guess about for you.
      </p>
    </>
  ),
  faqs: [
    {
      q: "Will MyDataFixer change my phone numbers' digits?",
      a: "No. Only spaces, dashes, brackets and similar punctuation change. The digits stay exactly the same.",
    },
    {
      q: "Can it add a country code to numbers that don't have one?",
      a: "No. Adding or removing a country code would be a guess, so those numbers are listed for you to handle by hand.",
    },
    {
      q: "Why were some numbers not changed?",
      a: "They have a different number of digits than the chosen layout, a country code where the layout has none (or the other way round), an extension, or they are invalid.",
    },
    {
      q: "Should phone numbers be stored as text?",
      a: "Yes. As numbers, leading zeros and + signs are lost, and long numbers can be changed.",
    },
    {
      q: "Which layout does WhatsApp or an SMS tool need?",
      a: "Most need the full number with the country code, often without spaces, such as +442079460958. Check the tool's help page before you import.",
    },
    {
      q: "What about numbers with extensions, like 2345 6789 ext 12?",
      a: "MyDataFixer leaves numbers with an extension exactly as they are and lists them, so you can decide how to write them.",
    },
    {
      q: "Does MyDataFixer upload my contact list?",
      a: "No. The file is processed in your browser, on your device.",
    },
  ],
};
