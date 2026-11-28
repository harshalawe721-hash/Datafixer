# Stage 18 plan: long-tail guides for the existing tools

**Status:** plan prepared on 28 November 2026, after the owner said 15 tools are enough and suggested guides on long-tail keywords for the existing tools. **Waiting for the owner's decisions.**

## Why

The site has 36 guides, mostly on broad problems (“remove duplicate rows”, “convert Excel to CSV”). Long-tail searches are more specific (“remove duplicate emails from a mailing list”, “json to excel”) and have less competition. Each guide answers one specific task and leads to the tool that does it. No search volumes have been checked, so the owner can add Ahrefs or Semrush numbers, or swap topics, before deciding.

Every topic below was checked against the existing guides to avoid repeating one, and against what the tool really does (for example, JSON to CSV also downloads Excel, and Remove Duplicates can keep the last copy).

## Proposed guides (decision 1)

| # | Guide (working title) | Long-tail search it targets | Tool it leads to | Publishes (12:30 pm India time) |
|---|---|---|---|---|
| 37 | How to convert JSON to Excel | json to excel, open json file in excel | JSON to CSV (Excel download) | 26 Dec 2026 |
| 38 | How to convert Excel to JSON | excel to json, xlsx to json | CSV to JSON (takes Excel files) | 27 Dec 2026 |
| 39 | How to convert every sheet of an Excel workbook to CSV at once | convert multiple excel sheets to csv | Excel to CSV (all sheets as a ZIP) | 28 Dec 2026 |
| 40 | How to remove duplicate emails from a mailing list | remove duplicate emails excel | Remove Duplicates (chosen column, keep first or last) | 29 Dec 2026 |
| 41 | How to compare two lists and find missing or new items | compare two lists in excel find missing | Compare Spreadsheets | 30 Dec 2026 |
| 42 | How to separate date and time into two columns | separate date and time in excel | Split a Column | 31 Dec 2026 |
| 43 | How to split an address into street, city and postcode | split address in excel | Split a Column | 1 Jan 2027 |
| 44 | How to combine columns into a unique ID or key | create unique id excel concatenate | Combine Columns | 2 Jan 2027 |
| 45 | How to clean a customer list before importing it into a CRM | clean customer data excel before import | Spreadsheet Cleaner, CSV Validator | 3 Jan 2027 |
| 46 | How to convert a tab-delimited text file to Excel | tab delimited text to excel | CSV to Excel (takes .txt and .tsv) | 4 Jan 2027 |

## Decisions for the owner

1. **Which guides**
   - **A (recommended):** all 10 above.
   - B: only some (name the numbers), or swap in other topics.
2. **Format**
   - **A (recommended):** the same as the existing guides: 1,000–1,500 words, a quick answer, a worked example, how to do it in Excel (and Google Sheets where it helps), the command line where relevant, the MyDataFixer way, tips, FAQs, and links to related guides and the tool. Every formula and menu path is checked.
   - B: shorter guides (600–800 words).
3. **Schedule**
   - **A (recommended):** one a day after guide 36, from 26 December 2026 to 4 January 2027, on the existing schedule (nothing to do on the day; they appear at 12:30 pm India time).
   - B: two a day.
4. **Tool pages**
   - **A (recommended):** each tool page lists its new guides automatically (as today, once a guide is published), and related guides link to each other.
   - B: no extra links.

## Steps (each tested, committed and reported)

1. **Guides 37–41**, with schedule tests.
2. **Guides 42–46**, with schedule tests.
3. **Testing and report:** each guide checked with the guide clock set to its day (200 and in the sitemap, SEO, link preview, links to its tool, axe-core light and dark, phone 390 px), and hidden before its day; all earlier suites; completion report.

No new dependencies and no changes to the tools.
