# Stage 8 plan: Guides

**Status:** plan prepared on 20 November 2026; updated the same day at the owner's request (15 guides, one published per day). **The owner approved the plan on 20 November 2026 with decisions A for all (1A–8A) and said “Start Stage 8”.** Progress is recorded under “Progress” below. Nothing is built until the owner approves the plan and says "Start Stage 8".

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

## Progress

### Step 1: guides framework, schedule and guide 1 (20 November 2026), built and tested

- **Pages:** `/guides` (list) and `/guides/[slug]` (guide page: H1, byline “By the MyDataFixer team · Updated …”, short answer, the guide, “Fix it in your browser” tool links, questions and answers, related guides). Example tables are plain HTML (decision 5A).
- **Search setup:** title, description, canonical, Open Graph type `article` with publish date, Twitter card, `Article` + `BreadcrumbList` + `FAQPage` structured data on guides, `ItemList` on the list; sitemap entries for the list and each published guide.
- **Schedule:** guides are in `src/content/howto/`, in publishing order; `GUIDES_START_DATE` stays `null` (nothing published) until the owner approves Stage 8. Unpublished guides answer 404 and are left out of the list, sitemap and menus; the guide pages, the list and the sitemap are rebuilt every hour, so each guide appears within an hour after 00:00 India time on its day. Local test switches (`GUIDES_CLOCK`, `GUIDES_START`, `GUIDES_SHOW_ALL`) are ignored on Vercel.
- **Guide 1:** “Why a CSV file opens in one column, and how to fix it” (about 1,000 words): causes, example, three Excel methods, Google Sheets, MyDataFixer (CSV to Excel, CSV Validator), common mistakes, five questions.
- **Design change found in testing:** first, every page was set to rebuild hourly (so the header link could appear by itself). On the local server, reloading a page then left Next.js's background link prefetches to those pages unfinished, which made the Stage 2 engine test time out (the page itself worked). Because the behaviour on Vercel can't be verified from here, the hourly rebuild was limited to the guide pages and the sitemap, and links to guide pages don't prefetch. All other pages stay exactly as before. Consequence: the header and footer “Guides” link is added when the site is deployed, so **guide 1 should go live on the day Stage 8 is approved** (not the day after, as decision 2A said) and the following guides one per day at 00:00 India time. Owner to confirm at the end of the stage. The “Related guides” lists on tool pages (Step 4) will be loaded from an hourly-rebuilt list so they stay current.
- **Tests:** tsc and lint pass; unit tests 386/386 (4 new schedule tests, including all 15 days across a month end). With no guide published (as live today) and with guides shown: smoke 114/115, engine 62, detector 33, fix 126, validator 106, converter 45, a11y 71, seo 27/29 (the SEO check now also covers the guide list and guide pages, which are `article` pages), large 64, all passing. axe-core on the guide list and guide 1, light and dark: 0 findings. Phone width 412 px, no sideways scrolling. Schedule time-travel test (refresh shortened to 10 s for the test only): before 00:00 India time the list, the guide and the sitemap entries are absent; after it they appear without a new deploy. Reloading guide pages and other pages leaves no unfinished requests.
- **Not checked:** the Excel and Google Sheets steps were written from their documentation and couldn't be run here.

### Step 2: simpler guides, guides 2–6 (20 November 2026), built and tested

- **Owner's request:** “just add simple guide don't complicate it”; the owner couldn't test the Excel or Sheets steps (device too slow). Guides are now short and simple (about 340–440 words): short answer, why it happens, a small example, one method each for Excel, Google Sheets and MyDataFixer, three questions. Every Excel section says the steps are for Excel on a computer (the phone and tablet app lacks these menus).
- **Guide 1 shortened** to the simple style (about 410 words, Text to Columns as the single Excel method).
- **Guides 2–6 written:** remove duplicate rows; keep leading zeros; fix dates (numbers like 45292, mixed formats); remove extra spaces and hidden characters; convert Excel to CSV. Every statement about MyDataFixer was checked against the tools (button names such as “Remove duplicate rows” and “Remove extra spaces”, “Exact copy of row N”, spaces between words kept, leading zeros and 15+ digit numbers kept as text, dates never guessed, Excel to CSV options).
- **Tests:** tsc and lint; unit 386/386; with guides shown: SEO 34/34 (all 6 guides and the list), axe-core on the list and 6 guides in light and dark: 0 findings, no console errors, phone width 412 px; as live today (nothing published): smoke 114, engine 62, a11y 71, seo 27, `/guides` answers 404.
- **Not checked:** Excel and Google Sheets steps are written from their documentation and couldn't be run here.

### Change of plan (owner, 20 November 2026): longer guides and a fixed schedule

- **Length:** 1,000–1,500 words per guide, still in simple language.
- **Schedule:** 15 guides, one per day at **12:30 am India time**, starting **20 November 2026**; guide 15 on **4 December 2026** (15 days from 20 November; the owner wrote “to 5 December”, which would be a 16th day, so the end date was reported to the owner). `GUIDES_START_DATE = "2026-11-20"`; publish time 00:30 India time. This replaces decision 2A (start after approval). The owner asked for publishing to start before the stage report.
- **Guide 1 (long version, 1,022 words)** went live with this change. Tests on the build as live on 20 November (guide 1 published, guides 2–6 hidden): tsc, lint, unit 386/386 (schedule tests updated to 12:30 am and 20 November–4 December), smoke 115, engine 62, detector 33, fix 126, validator 106, converter 45, a11y 71, seo 29, large 64; axe-core on the list and guide 1, light and dark: 0 findings.
- Every guide must be finished before its publish time; guides 2–15 are written next, in publishing order.
- **Guides 2–6 expanded (20 November 2026):** each now 1,089–1,151 words (all text, questions included), in simple language: why it matters, causes, example, Excel (one or two methods), Google Sheets, MyDataFixer, how to avoid it next time, quick summary, common mistakes, five or six questions. Checked against the tools as before. SEO 34/34 and axe-core 0 findings (light and dark) with all guides shown; on the live build (20 November): unit 386/386, smoke 115, a11y 71, seo 29, guide 2 still hidden until 21 November 12:30 am.
- **Guides 7–15 written (20 November 2026):** formula errors; numbers stored as text; encoding problems; checking a CSV before import; blank cells; empty rows and columns; capitalization; emails and phone numbers; Excel's row limit. Same simple format, with a “from start to finish” example. Statements about MyDataFixer checked against the tools (e.g. error types listed by the detector, “Convert numbers stored as text” skipping ambiguous values and 15+ digits, encodings UTF-8/Windows-1252/ISO-8859-1, missing cells including spaces-only cells, “Remove empty rows/columns” protecting rows formulas refer to and not removing rows in .xls, “Fix capitalization” using the most common spelling, “Make phone number layouts consistent” changing only spacing and punctuation, CSV to Excel continuing rows on extra sheets with the column names). Long formulas now wrap on phones.
- **All 15 guides:** 1,040–1,151 words each (all text, questions included); every “related guides” link points to a real guide. With all guides shown: SEO 43/43, axe-core 0 findings on every guide (light and dark), phone width 412 px, no console errors. Schedule on real dates: 25 November 00:29 → 5 guides, 00:30 → 6; 4 December 00:30 → all 15 (list, sitemap and pages agree). Live build on 20 November (guide 1 only): unit 386/386, smoke 115, engine 62, detector 33, fix 126, validator 106, converter 45, a11y 71, seo 29, large 64.
- **Step 4 (20 November 2026):** “Guides for this tool” on the five tool pages, loaded from `/guides/feed.json` (rebuilt hourly, fetched without a stored copy so reloads don't leave a request open). Tested with guide 1 only and with all guides; all suites pass (see the completion report).
- **Steps 5–6:** final testing and the completion report: `docs/stage-8-test-report.md`. Waiting for the owner's approval.
