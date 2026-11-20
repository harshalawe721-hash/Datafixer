# Stage 8 plan: Guides

**Status:** plan prepared on 20 November 2026; updated the same day at the owner's request (15 guides, one published per day). Waiting for the owner's decisions. Nothing is built until the owner approves the plan and says "Start Stage 8".

## Goal

Bring visitors from Google by answering the questions people actually search for ("CSV opens in one column", "Excel removes leading zeros"…). Each guide explains the problem, shows how to fix it by hand in Excel and Google Sheets, and links to the MyDataFixer tool that fixes it in the browser. The guides must be accurate, helpful without the tool, and never promise something the tools don't do.

## What will be built

1. A **Guides section**: an index page listing every guide, and one page per guide.
2. **15 guides** (owner's request, 20 November 2026), about 800–1,200 words each, **published one per day** (see "Publishing schedule"). Listed in publishing order, most-searched problems first:

   | # | Guide (working title) | Main search it answers | Tool it links to |
   |---|---|---|---|
   | 1 | Why a CSV file opens in one column, and how to fix it | csv opens in one column | CSV Validator |
   | 2 | How to find and remove duplicate rows in Excel and CSV files | remove duplicates excel / csv | Error Detector, Cleaner |
   | 3 | How to keep leading zeros when opening or converting a CSV | csv leading zeros excel | CSV to Excel |
   | 4 | How to fix dates in spreadsheets: numbers, wrong formats, mixed formats | excel dates showing as numbers | Error Detector, Cleaner |
   | 5 | How to remove extra spaces and hidden characters from cells | remove extra spaces excel | Cleaner |
   | 6 | How to convert Excel to CSV without losing data | convert excel to csv | Excel to CSV |
   | 7 | What #N/A, #VALUE!, #REF! and #DIV/0! mean, and how to find them | excel #n/a #value meaning | Error Detector |
   | 8 | How to fix numbers stored as text | numbers stored as text excel | Error Detector, Cleaner |
   | 9 | Strange characters in a CSV (Ã©, â€™): fixing encoding problems | csv weird characters utf-8 | CSV Validator |
   | 10 | How to check a CSV file before importing it (shop, CRM, database) | csv import error / validate csv | CSV Validator |
   | 11 | How to find blank and missing cells in a spreadsheet | find blank cells excel | Error Detector |
   | 12 | How to remove empty rows and columns | delete empty rows excel | Cleaner |
   | 13 | How to make capitalization consistent (Paris, paris, PARIS) | change case excel | Cleaner |
   | 14 | How to check email addresses and phone numbers in a spreadsheet | validate emails excel | Error Detector |
   | 15 | Excel's row limit (1,048,576 rows): what to do with bigger files | excel row limit | CSV to Excel, Excel to CSV |

   Every guide has: a short answer at the top, why it happens, how to fix it in Excel, in Google Sheets, and with MyDataFixer, a worked example (small table), common mistakes, and 3–5 questions and answers.
3. **Search setup for every guide:** unique title and description, canonical link, Open Graph and Twitter tags (the site's preview image), `Article` and `BreadcrumbList` structured data (and `FAQPage` for the questions), sitemap entry, "Updated" date.
4. **Links:** "Guides" in the header and footer (decision 6); on each tool page, a "Related guides" list; each guide links to its tools and to 2–3 related guides.
5. **No new dependencies.** Guides are written as React pages like the existing tool guides; example tables are plain HTML (decision 5).

## Publishing schedule (owner's request: one guide per day)

- All 15 guides are written, checked and tested **before** the schedule starts, so each day's guide is already finished.
- Each guide has a publish date. Until that date it **doesn't exist on the site**: its address answers "not found", and it isn't in the Guides list, the sitemap, the header/footer or the "Related guides" lists, and its text isn't sent to browsers.
- On its date the guide appears **automatically**. The guide pages, the list and the sitemap are rebuilt by Vercel every hour (Next.js "incremental static regeneration", built into Next.js and included in Vercel's free Hobby plan), so nobody has to post anything each day. Recommended time: **00:00 India time** (decision 2).
- Testing covers the schedule: a test clock moves through all 15 days and checks that each guide appears on its day and not before.
- **Honest note:** Google doesn't rank sites higher for posting daily. The daily schedule is harmless and makes the site look active; the quality of each guide is what matters.

## Accuracy rules

- Every statement about MyDataFixer is checked against the tools' real behaviour (e.g. CSV to Excel keeps leading zeros, numbers with more than 15 digits and ambiguous dates as text; it splits sheets past 1,048,576 rows).
- Steps for Excel and Google Sheets follow their documented behaviour. **They can't be tried in Excel or Google Sheets from the build environment**, so the report will list them as checked against documentation only, and the owner is asked to spot-check a few on a real computer or phone.
- No invented statistics, quotes or testimonials.

## Steps (each tested, committed and reported)

1. **Guides framework and schedule:** `/guides` index, guide page layout, metadata, structured data, sitemap entries, header/footer links, publish dates with hourly rebuilds, and one complete guide (guide 1) as the pattern for the owner to review.
2. **Guides 2–6.**
3. **Guides 7–11.**
4. **Guides 12–15** and the "Related guides" lists on the tool pages.
5. **Testing:** the schedule (a test clock through all 15 days), the SEO check extended to every guide (titles, descriptions, canonical, previews, structured data, sitemap, links), accessibility (axe-core, keyboard, light and dark), phone layout, all earlier test suites unchanged.
6. **Completion report** with changes, tests passed and failed, and limitations.

## Decisions for the owner

1. **Section name and address**
   - **A (recommended):** "Guides" at `/guides/...` (timeless how-to pages).
   - B: "Blog" at `/blog/...` (expects regular new posts).
2. **Publishing schedule** (15 guides, one per day, as requested)
   - **A (recommended):** automatic. Guide 1 appears on the day after the owner approves Stage 8, then one guide every day at 00:00 India time; nothing to do each day.
   - B: automatic, at a different time of day (owner names it).
   - C: all 15 published at once (no daily schedule).
3. **Topics and order:** approve the 15 topics and their order above, or replace or reorder any of them.
4. **Language**
   - **A (recommended):** English only for now.
   - B: English now, Hindi versions later.
5. **Pictures**
   - **A (recommended):** example tables built in HTML: light, readable by screen readers, work in dark mode, never go out of date.
   - B: screenshots of the tools (heavier, go out of date when the design changes).
6. **Where guides are linked**
   - **A (recommended):** header, footer, and a "Related guides" list on each tool page.
   - B: footer only.
7. **Manual methods**
   - **A (recommended):** each guide also shows how to fix the problem by hand in Excel and Google Sheets (more helpful, which Google rewards; the tool is offered as the faster way).
   - B: MyDataFixer method only.
8. **Byline and date**
   - **A (recommended):** "By the MyDataFixer team · Updated (date)".
   - B: date only.

## Limitations (known in advance)

- Guides usually take weeks to months to rank on Google; the plan can't guarantee rankings or traffic.
- Excel and Google Sheets steps are checked against documentation, not run in those apps (see Accuracy rules).
- The schedule ends after guide 15 (about two weeks). More guides can be added later in the same format and schedule.
- A guide appears within an hour after midnight India time (the hourly rebuild), not at exactly 00:00.
