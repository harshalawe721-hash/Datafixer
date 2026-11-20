# Stage 8 plan: Guides

**Status:** plan prepared on 20 November 2026, waiting for the owner's decisions. Nothing is built until the owner approves the plan and says "Start Stage 8".

## Goal

Bring visitors from Google by answering the questions people actually search for ("CSV opens in one column", "Excel removes leading zeros"…). Each guide explains the problem, shows how to fix it by hand in Excel and Google Sheets, and links to the MyDataFixer tool that fixes it in the browser. The guides must be accurate, helpful without the tool, and never promise something the tools don't do.

## What will be built

1. A **Guides section**: an index page listing every guide, and one page per guide.
2. **8 guides** (decision 2), about 800–1,200 words each:

   | # | Guide (working title) | Main search it answers | Tool it links to |
   |---|---|---|---|
   | 1 | How to find and remove duplicate rows in Excel and CSV files | remove duplicates excel / csv | Error Detector, Cleaner |
   | 2 | Why a CSV file opens in one column, and how to fix it | csv opens in one column | CSV Validator |
   | 3 | How to fix dates in spreadsheets: numbers, wrong formats, mixed formats | excel dates showing as numbers / wrong date format | Error Detector, Cleaner |
   | 4 | How to remove extra spaces and hidden characters from cells | remove extra spaces excel / trim | Cleaner |
   | 5 | How to keep leading zeros when opening or converting a CSV | csv leading zeros excel | CSV to Excel |
   | 6 | How to check a CSV file before importing it (shop, CRM, database) | csv import error / validate csv | CSV Validator |
   | 7 | What #N/A, #VALUE!, #REF! and #DIV/0! mean, and how to find them | excel #n/a #value error meaning | Error Detector |
   | 8 | Excel's row limit (1,048,576 rows): what to do with bigger files | excel row limit / csv too large for excel | CSV to Excel, Excel to CSV |

   Every guide has: a short answer at the top, why it happens, how to fix it in Excel, in Google Sheets, and with MyDataFixer, a worked example (small table), common mistakes, and 3–5 questions and answers.
3. **Search setup for every guide:** unique title and description, canonical link, Open Graph and Twitter tags (the site's preview image), `Article` and `BreadcrumbList` structured data (and `FAQPage` for the questions), sitemap entry, "Updated" date.
4. **Links:** "Guides" in the header and footer (decision 6); on each tool page, a "Related guides" list; each guide links to its tools and to 2–3 related guides.
5. **No new dependencies.** Guides are written as React pages like the existing tool guides; example tables are plain HTML (decision 5).

## Accuracy rules

- Every statement about MyDataFixer is checked against the tools' real behaviour (e.g. CSV to Excel keeps leading zeros, numbers with more than 15 digits and ambiguous dates as text; it splits sheets past 1,048,576 rows).
- Steps for Excel and Google Sheets follow their documented behaviour. **They can't be tried in Excel or Google Sheets from the build environment**, so the report will list them as checked against documentation only, and the owner is asked to spot-check a few on a real computer or phone.
- No invented statistics, quotes or testimonials.

## Steps (each tested, committed and reported)

1. **Guides framework:** `/guides` index, guide page layout, metadata, structured data, sitemap entries, header/footer links, one complete guide (guide 2) as the pattern for review.
2. **Guides 1, 3, 4** (cleaning and detection).
3. **Guides 5, 6, 8** (CSV and conversion).
4. **Guide 7** and the "Related guides" lists on the tool pages.
5. **Testing:** SEO check extended to every guide (titles, descriptions, canonical, previews, structured data, sitemap, links), accessibility (axe-core, keyboard, light and dark), phone layout, all earlier test suites unchanged.
6. **Completion report** with changes, tests passed and failed, and limitations.

## Decisions for the owner

1. **Section name and address**
   - **A (recommended):** "Guides" at `/guides/...` (timeless how-to pages).
   - B: "Blog" at `/blog/...` (expects regular new posts).
2. **How many guides in the first batch**
   - **A (recommended):** all 8 above.
   - B: 6 (drop guides 7 and 8).
   - C: 4 (guides 1, 2, 3, 5).
3. **Topics:** approve the 8 topics above, or replace any of them.
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
- No regular posting schedule is part of this stage; more guides can be added later in the same format.
