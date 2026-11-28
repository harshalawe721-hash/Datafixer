# Stage 18 plan: long-tail guides for the existing tools

**Status:** plan prepared on 28 November 2026, after the owner said 15 tools are enough and suggested guides on long-tail keywords for the existing tools. **The owner approved it with decisions A for all (1A–4A) and said to start Stage 18. Stage 18 was approved as complete on 28 November 2026.** Progress is recorded under “Progress” below.

## Why

The site has 36 guides, mostly on broad problems (“remove duplicate rows”, “convert Excel to CSV”). Long-tail searches are more specific (“remove duplicate emails from a mailing list”, “json to excel”) and have less competition. Each guide answers one specific task and leads to the tool that does it. No search volumes have been checked, so the owner can add Ahrefs or Semrush numbers, or swap topics, before deciding.

Every topic below was checked against the existing guides to avoid repeating one, and against what the tool really does (for example, JSON to CSV also downloads Excel, and Remove Duplicates can keep the last copy).

## Guides (decision 1, as changed on 28 November 2026)

When the owner said to start, a closer check found that four of the first ten topics would compete with existing guides: JSON to Excel and Excel to JSON (“How to convert JSON to CSV and open it in Excel”, “How to convert a CSV or Excel file to JSON”), splitting an address (“How to split a cell in Excel (names, addresses and codes)”) and tab-delimited text to Excel (“How to convert a TSV file to CSV (and open TSV files in Excel)”). The owner chose to replace two and drop two:

| # | Guide (working title) | Long-tail search it targets | Tool it leads to | Publishes (12:30 pm India time) |
|---|---|---|---|---|
| 37 | How to extract the domain from email addresses | extract domain from email excel | Split a Column (separator “@”) | 26 Dec 2026 |
| 38 | How to combine address lines into one cell | combine address columns excel | Combine Columns (“, ”, empty values left out) | 27 Dec 2026 |
| 39 | How to convert every sheet of an Excel workbook to CSV at once | convert multiple excel sheets to csv | Excel to CSV (all sheets as a ZIP) | 28 Dec 2026 |
| 40 | How to remove duplicate emails from a mailing list | remove duplicate emails excel | Remove Duplicates (chosen column, keep first or last) | 29 Dec 2026 |
| 41 | How to compare two lists and find missing or new items | compare two lists in excel find missing | Compare Spreadsheets | 30 Dec 2026 |
| 42 | How to separate date and time into two columns | separate date and time in excel | Split a Column | 31 Dec 2026 |
| 43 | How to combine columns into a unique ID or key | create unique id excel concatenate | Combine Columns | 1 Jan 2027 |
| 44 | How to clean a customer list before importing it into a CRM | clean customer data excel before import | Spreadsheet Cleaner, CSV Validator | 2 Jan 2027 |

## Decisions for the owner

1. **Which guides**
   - **A (recommended):** all 10 first proposed (changed to the 8 above; see “Guides”).
   - B: only some (name the numbers), or swap in other topics.
2. **Format**
   - **A (recommended):** the same as the existing guides: 1,000–1,500 words, a quick answer, a worked example, how to do it in Excel (and Google Sheets where it helps), the command line where relevant, the MyDataFixer way, tips, FAQs, and links to related guides and the tool. Every formula and menu path is checked.
   - B: shorter guides (600–800 words).
3. **Schedule**
   - **A (recommended):** one a day after guide 36, from 26 December 2026 (to 2 January 2027 with 8 guides), on the existing schedule (nothing to do on the day; they appear at 12:30 pm India time).
   - B: two a day.
4. **Tool pages**
   - **A (recommended):** each tool page lists its new guides automatically (as today, once a guide is published), and related guides link to each other.
   - B: no extra links.

## Steps (each tested, committed and reported)

1. **Guides 37–40**, with schedule tests.
2. **Guides 41–44**, with schedule tests.
3. **Testing and report:** each guide checked with the guide clock set to its day (200 and in the sitemap, SEO, link preview, links to its tool, axe-core light and dark, phone 390 px), and hidden before its day; all earlier suites; completion report.

No new dependencies and no changes to the tools.

## Progress

- **Step 1 (guides 37–40): done, 28 November 2026.**
  - The guides:
    - “How to extract the domain from email addresses” (26 December);
    - “How to combine address lines into one cell” (27 December);
    - “How to convert every sheet of an Excel workbook to CSV at once” (28 December);
    - “How to remove duplicate emails from a mailing list” (29 December).
  - Each is about 1,000–1,050 words. The tool steps use the tools' exact labels, which were read from the pages before writing (for example “At the first separator only (2 parts)”, “Skip empty values (no extra separators)”, “All … sheets (ZIP)”, “Which copy to keep”). The download wording matches what each tool offers.
  - **Checked with the guide clock at 29 December, 1 pm:** each is 200 and in the sitemap, its tool page lists it, the link preview is complete, the title and description are within the limits (three descriptions were shortened to fit), it links to its tool, every guide link resolves, axe-core is clean in light and dark, and there is no horizontal scroll at 390 px (48/48). SEO 88/88.
  - **With today's date:** all four are 404.
  - **Unit tests:** 588 (schedule test updated).
- **Step 2 (guides 41–44): done, 28 November 2026.**
  - The guides:
    - “How to compare two lists and find missing or new items” (30 December);
    - “How to separate date and time into two columns” (31 December);
    - “How to combine columns into a unique ID or key” (1 January);
    - “How to clean a customer list before importing it into a CRM” (2 January).
  - Each is about 1,010–1,090 words. Each tool's behaviour was checked in the code before writing:
    - Split a Column splits text only, so real Excel date-time cells (numbers) are copied unchanged. The date and time guide says so and gives INT and MOD for those.
    - Combine Columns uses the values as shown.
    - Remove Duplicates says “No duplicate rows found in the chosen columns” when every key is unique.
    - Compare points out repeated values only when a column is chosen under “Match rows by”.
    - The Spreadsheet Cleaner lists invalid emails and phone numbers below its cleaning tools.
  - **Checked with the guide clock at 2 January 2027, 1 pm:** all 8 Stage 18 guides pass 96/96 (two descriptions were shortened to fit). Their tool pages list them, including the CSV Validator for guide 44. SEO 92/92.
  - **Unit tests:** 589.
- **Step 3 (testing and report): done, 28 November 2026.** All 8 guides checked on their days (96/96, SEO 92/92), the publishing boundary checked, all hidden today, all suites passing. Report: `docs/stage-18-test-report.md`. Approved by the owner on 28 November 2026.
