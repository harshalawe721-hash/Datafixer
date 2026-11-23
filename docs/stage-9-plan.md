# Stage 9 plan: Proper case tool

**Status:** plan prepared on 23 November 2026, waiting for the owner's decisions. Nothing is built until the owner approves the plan and says "Start Stage 9".

## Why

Today MyDataFixer's “Fix capitalization” only makes spellings consistent: it changes “PUNE” to “Pune” when “Pune” is the most common spelling in the column. It does **not** turn a value like “ravi k”, “MEERA SHAH” or “DELHI” into “Ravi K”, “Meera Shah” or “Delhi” when no better spelling exists in the column. That is why the homepage example had to be adjusted on 23 November 2026. A **Change case** tool would fill that gap.

## What will be built

1. **A new cleaning tool, “Change case”**, in the Spreadsheet Cleaner (decision 1). You pick the column(s) and the style:
   - **Proper Case:** Ravi Kumar, New Delhi
   - **UPPER CASE:** RAVI KUMAR
   - **lower case:** ravi kumar
   - (Sentence case only if decision 2B: “The order was late”.)
2. **Smart Proper Case rules for names** (decision 4A), for example:

   | Before | After | Rule |
   |---|---|---|
   | ravi k | Ravi K | first letter of each word |
   | MEERA SHAH | Meera Shah | all-capital names are converted too |
   | o'brien | O'Brien | letter after an apostrophe |
   | anne-marie | Anne-Marie | letter after a hyphen |
   | mcdonald | McDonald | “Mc” names |
   | ludwig VAN beethoven | Ludwig van Beethoven | small linking words in the middle (van, von, de, da, del, la, bin, al) stay small |
   | Ravi Kumar | Ravi Kumar | already correct: not changed |

3. **Values that are never changed**, whatever the style: email addresses, web addresses, values containing digits (codes like MH12AB1234, SKU-A12), formula cells, empty cells, and the column names.
4. **Preview and undo** like every other fix: you see every cell before and after, values that were left alone are listed with the reason, and Undo works.
5. **Optional detector hint** (decision 3): the Error Detector notes name and city columns where most values are in ALL CAPITALS or all small letters, with a button that opens Change case.
6. **Content updates** (decision 5): the homepage before/after example, the Cleaner's guide, and the capitalization guide (published 2 December) are updated to mention the new tool, only after it is built and tested.

No new dependencies. The original file is never changed; everything runs in the browser.

## Known limits (stated honestly in the tool)

- Proper Case can't know every special spelling: brand names (iPhone, eBay), short forms (HDFC, NASA) and unusual family names (MacDonald vs Macdonald) may need fixing by hand. The preview shows every change, so they can be skipped or corrected. In a value that mixes capitals and small letters, short ALL-CAPITAL words such as “HDFC Bank” are kept as they are (decision 4A).
- The rules are written for names in Latin letters. Scripts without capital letters (Hindi, Tamil and others) are left unchanged.

## Steps (each tested, committed and reported)

1. **Engine:** the case conversion with the name rules and the never-change list, with unit tests (several hundred example names, emails, codes, mixed values).
2. **Cleaner tool:** “Change case” in the Spreadsheet Cleaner: choose columns and style, preview, apply, undo, download (CSV and Excel). Browser tests.
3. **Detector hint** (only if decision 3A).
4. **Content:** homepage example (with a test that the real tool produces it), tool guide and capitalization guide.
5. **Testing and report:** all earlier test suites, accessibility (keyboard, axe-core, light and dark), phone layout, completion report.

## Decisions for the owner

1. **Where the tool lives**
   - **A (recommended):** a new “Change case” tool inside the Spreadsheet Cleaner, next to “Fix capitalization”.
   - B: a separate tool page of its own (more work, a sixth tool in the menus).
2. **Styles offered**
   - **A (recommended):** Proper Case, UPPER CASE, lower case.
   - B: also Sentence case.
3. **Detector hint**
   - **A (recommended):** the Error Detector also points out name/city columns written in all capitals or all small letters (as a note, not a warning).
   - B: no detector change; the tool is only in the Cleaner.
4. **Name rules**
   - **A (recommended):** smart rules (apostrophes, hyphens, Mc, small linking words, short all-capital words kept in mixed values).
   - B: simple: first letter of every word capital, the rest small.
5. **Content**
   - **A (recommended):** after the tool is built, update the homepage example to show “ravi k → Ravi K” and similar, plus the related guides.
   - B: leave the homepage and guides as they are.
