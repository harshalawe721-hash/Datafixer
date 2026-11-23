# Stage 9 plan: Proper case tool

**Status:** plan prepared on 23 November 2026. **The owner approved it the same day with decisions A for all (1A–5A) and said “Start Stage 9”.** Progress is recorded under “Progress” below.

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

## Progress

### Step 1: case conversion engine (23 November 2026), built and tested

- `src/engine/fix/change-case.ts`: Proper Case, UPPER CASE, lower case. Proper Case rules: capital after spaces, hyphens, full stops, slashes and brackets; after an apostrophe only when one letter comes before it (O'Brien, D'Souza, but Don't); Mc names (McDonald); linking words small in the middle (van, von, der, den, de, da, del, di, du, la, bin, al, of, and, the); Roman numerals II–XXXIX after the first word in capitals (Henry VIII, Louis XIV; single letters like “V” are initials).
- **Refinement of decision 4A (short all-capital words):** a 2–5-letter all-capital word is kept only when the same value also has a normally written word (“HDFC Bank” stays). Otherwise the whole value converts (“MEERA s” → “Meera S”, “HDFC BANK” → “Hdfc Bank”), because a value written entirely in capitals gives no sign of which words are short forms. Applying 4A literally would have left “MEERA s” as “MEERA S”.
- **Never changed:** email addresses, web addresses, values containing digits (codes, addresses with numbers). Values without letters (and scripts without capitals such as Hindi or Tamil) come back unchanged. Spaces are kept exactly.
- **Tests:** `tests/engine/change-case.test.ts`, 10 tests: about 50 hand-picked cases (names, places, apostrophes, hyphens, Mc, linking words, Roman numerals, short forms, emails, web addresses, codes, accented letters, Hindi and Tamil), 1,600 generated name spellings in four casings checked for all three styles, and stability checks (applying a style twice changes nothing more; only capital/small letters ever change). Unit tests 397/397; tsc and lint pass.

### Step 2: “Change case” in the Spreadsheet Cleaner (23 November 2026), built and tested

- New fix `change-case` (label “Change case”) in the Cleaner's list of tools, always offered when the sheet has text: “Choose columns · Preview”. The dialog asks for a style (Proper Case, UPPER CASE, lower case, each with an example) and the columns (every column with text, with an example value); nothing changes and there is no Apply button until both are chosen. The preview lists the cells before and after; emails, web addresses, values with numbers and formula cells are left alone and counted with the reason; Proper Case shows a note to check special spellings (iPhone, HDFC, MacDonald). Apply, Undo, Redo and download (CSV and Excel) work like every other fix. Not part of “Fix all safe problems”.
- **Tests:** unit 401/401 (4 new fix tests: choices before anything changes, Proper/UPPER on chosen columns only with skip reasons, undo, formula cells and the header row protected, an Excel workbook passing the download check). New browser test `npm run test:case`, 20/20: tool offered, dialog, no Apply before choosing, axe-core on the dialog light and dark (0 findings), preview “6 cells will change”, the table shows Ravi K / Delhi / O'Brien with emails unchanged, Undo and Redo, downloaded CSV, keyboard (arrow keys between styles, Space ticks a column, Escape closes without changes), phone width 375 px without sideways scrolling, no browser errors. All earlier suites pass: smoke 117, engine 62, detector 33, fix 126, validator 106, converter 45, a11y 71, seo 32.

### Step 3: Error Detector note (23 November 2026), built and tested

- New check (a **note**, not a warning): “Names written in capitals or small letters”. Only columns whose name suggests names of people or places are checked (name, first, last, surname, customer, client, contact, person, employee, student, city, town, village, district, state, country, place, location, region). A column is noted when at least two values and at least half of its plain text values are written entirely in capitals or entirely in small letters; emails, web addresses, values with numbers, values with fewer than two letters and scripts without capitals are not counted. Examples show the Proper Case result (“RAVI KUMAR” → “Ravi Kumar”). Its button opens “Change case” with Proper Case and the noted columns already chosen (other columns not ticked); everything can still be changed before applying.
- **Speed:** cheap tests first, the email/web-address test last, and a cache for repeated values. Worst case measured (500,000 rows, every name different, two name columns all in capitals): about 0.5 s more per million name cells; columns not named like names or places cost nothing. Cell lists are capped as in every other check.
- **Tests:** unit 403/403 (2 new: the note on name/place columns only, not on status/email/code columns; not shown below half or without column names; the check-registry count updated from 12 to 13). Browser `test:case` 27/27 (7 new: the note shown with the column and an example, opens Change case pre-filled, 6 cells, only the noted columns ticked, the note disappears after applying). All earlier suites pass: smoke 119, engine 62, detector 33, fix 126, validator 106, converter 45, a11y 71, seo 32, large 64.
