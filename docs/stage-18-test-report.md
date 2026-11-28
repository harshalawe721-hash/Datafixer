# Stage 18 completion report: long-tail guides for the existing tools

**Date:** 28 November 2026

**Status:** ✅ **COMPLETE.** Approved by the owner on 28 November 2026.

The owner said 15 tools are enough and suggested guides on long-tail keywords for the existing tools. The plan (`docs/stage-18-plan.md`) was approved with decisions **A for all**: the proposed guides, the usual format (1,000–1,500 words), one a day after guide 36, and links between guides and tool pages.

**One change from the plan, with the owner's agreement:** before writing, a closer check found that four of the ten proposed topics would compete with existing guides. JSON to Excel and Excel to JSON overlap the JSON guides; splitting an address overlaps the split cells guide; tab-delimited text to Excel overlaps the TSV guide. The owner chose to replace two and drop two, so there are **8 guides**. The plan had said every topic was already checked against the existing guides; that check was not thorough enough, and the closer check caught it before any guide was written.

## The guides

| # | Guide | Long-tail search | Tool | Publishes (12:30 pm India time) | Words |
|---|---|---|---|---|---|
| 37 | How to extract the domain from email addresses | extract domain from email excel | Split a Column | 26 Dec 2026 | ~1,050 |
| 38 | How to combine address lines into one cell | combine address columns excel | Combine Columns | 27 Dec 2026 | ~1,020 |
| 39 | How to convert every sheet of an Excel workbook to CSV at once | convert multiple excel sheets to csv | Excel to CSV | 28 Dec 2026 | ~1,010 |
| 40 | How to remove duplicate emails from a mailing list | remove duplicate emails excel | Remove Duplicates | 29 Dec 2026 | ~1,010 |
| 41 | How to compare two lists and find missing or new items | compare two lists in excel find missing | Compare Spreadsheets | 30 Dec 2026 | ~1,070 |
| 42 | How to separate date and time into two columns | separate date and time in excel | Split a Column | 31 Dec 2026 | ~1,080 |
| 43 | How to combine columns into a unique ID or key | create unique id excel | Combine Columns | 1 Jan 2027 | ~1,010 |
| 44 | How to clean a customer list before importing it into a CRM | clean customer data before crm import | Spreadsheet Cleaner, CSV Validator | 2 Jan 2027 | ~1,090 |

Each guide has:
- a quick answer;
- an example table;
- the Excel method (with the Microsoft 365 and older-version formulas where they differ) and Google Sheets;
- the MyDataFixer way, using the tools' exact labels;
- a worked example, tips or common mistakes;
- a quick summary and six FAQs;
- links to its tool and to related guides.

**Accuracy:**
- **Tool labels:** every label and option was read from the tool's own page before writing, so the steps match the screens.
- **Tool behaviour:** each tool's behaviour was checked in the code. Where a tool can't do something, the guide says so:
  - Split a Column splits text only, so real Excel date-time cells (stored as numbers) are copied unchanged. Guide 42 says so and gives INT and MOD for those.
  - Remove Duplicates and most other tools treat Gmail's dot and plus aliases as different addresses (guide 40).
  - Downloads keep the file's own type: a CSV file comes back as CSV, an Excel file as Excel or CSV.
- **Excel and Google Sheets:** formulas and menu paths were checked against the versions that have them (for example TEXTAFTER and TEXTJOIN, and the xlCSVUTF8 format in the macro).

No tool was changed, and there are no new dependencies.

## Tests (final run)

| Check | Result |
|---|---|
| Type check, lint | ✅ pass, 0 warnings |
| Unit tests (`npm test`) | ✅ 589 / 589 (the schedule test now covers guides 37–44: order, each date, and the 12:29 / 12:30 boundary) |
| Each guide, clock set to 2 January 2027, 1 pm | ✅ 96 / 96. Each guide is 200 and in the sitemap; its tool page lists it (guide 44 on both the Cleaner and the CSV Validator); the link preview is complete; the title and description are within the limits; it links to its tool; every guide link resolves; axe-core is clean in light and dark; no horizontal scroll at 390 px; no page errors |
| SEO check, same clock | ✅ 92 / 92 |
| Publishing schedule | ✅ At 12:00 on 30 December, guide 40 is live and guide 41 isn't yet. With today's date, all 8 are 404 and not in the sitemap |
| All browser suites (today's build) | ✅ smoke 130, SEO 57, a11y 71, compare 49, split file 34, merge 27, xml 23, tsv 21, json 25, csv-json 19, duplicates 31, split column 28, combine 29, change case 27, fix 126, detector 33, validator 106, converter 45, engine 62 |

**Found during Stage 18 and fixed:**
- Four topics overlapping existing guides, as described above (replaced or dropped, with the owner's choice).
- Five descriptions were over the 160-character limit and were shortened.
- First drafts said parts could be downloaded “as CSV or Excel” for any file, and named the Excel to CSV button “All sheets (ZIP)”. Both were corrected to match the tools: CSV files download as CSV, and the button reads “All 13 sheets (ZIP)” with the number of sheets.
- Guide 41 first said repeated values are always pointed out, but Compare does that only when a column is chosen under “Match rows by”. Guide 43 first described the no-duplicates result loosely; it now quotes the exact message. Both were corrected.

## Notes

- No search volumes were checked. Ahrefs or Semrush numbers can show which guides to promote, or which topics to try next.
- The site now has 44 guides scheduled, the last on 2 January 2027.

## Approval

The owner approved Stage 18 on 28 November 2026 (“Approved”).
