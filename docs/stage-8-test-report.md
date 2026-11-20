# Stage 8 completion report: Guides

**Date:** 20 November 2026

**Status:** ✅ **COMPLETE.** Approved by the owner on 20 November 2026. Publishing runs until guide 15 on 4 December 2026.

**Publish time changed (owner, 20 November 2026, after approval):** guides now go live at **12:30 pm** India time instead of 12:30 am. Guide 1 was already live; the change was deployed after 12:30 pm on 20 November so guide 1 and the “Guides” menu link stayed online. Guide 2 appears on 21 November at 12:30 pm, guide 15 on 4 December at 12:30 pm. Checked: unit tests (12:29 pm hidden, 12:30 pm live), and builds at 21 Nov 00:30 (1 guide), 12:29 (1), 12:30 (2), 4 Dec 12:29 (14), 12:30 (15), with the list, sitemap and tool-page feed agreeing; full regression on the live build after 12:30 pm.

The owner approved the plan (`docs/stage-8-plan.md`) on 20 November 2026 with decisions **A for all**, then changed it the same day: 15 guides, simple language, **1,000–1,500 words each**, published **one per day at 12:30 am India time from 20 November 2026** (guide 15 on 4 December 2026).

## Changes

| Part | Change |
|---|---|
| Guides list | `/guides`: every published guide with a short summary; `ItemList` structured data. Answers 404 until the first guide is published. |
| Guide pages | `/guides/{slug}`: heading, “By the MyDataFixer team · Updated (date)”, short answer, the guide, “Fix it in your browser” tool links, questions and answers, related guides. `Article`, `BreadcrumbList` and `FAQPage` structured data; Open Graph type `article` with the publish date; link preview image as on every page. |
| 15 guides | CSV in one column; duplicate rows; leading zeros; dates; extra spaces; Excel to CSV; formula errors; numbers stored as text; encoding problems; checking a CSV before import; blank cells; empty rows and columns; capitalization; emails and phone numbers; Excel's row limit. 1,040–1,151 words each, simple language, steps for Excel (on a computer), Google Sheets and MyDataFixer, a worked example, tips, common mistakes, 5–7 questions. Example tables are plain HTML (decision 5A). |
| Schedule | `src/content/howto/`: guides in publishing order, start date 2026-11-20, publish time 00:30 India time. An unpublished guide answers 404 and is left out of the list, the sitemap, the menus and every related-guides list. The guide pages, the list, the sitemap and the tool pages' guide lists are rebuilt every hour, so each guide appears within an hour after 12:30 am without anyone posting it. |
| Menus | “Guides” in the header, the phone menu and the footer (added at deploy, since a guide is published). |
| Tool pages | “Guides for this tool” on each of the five tool pages, loaded from `/guides/feed.json` (rebuilt hourly), so new guides appear there on their day while the tool pages stay fully static. |
| Sitemap | The list and each published guide are added on their publish day. |

No new dependencies and no paid services.

## Tests (final run)

| Suite | Result |
|---|---|
| Type check, lint | ✅ pass, 0 warnings |
| Unit tests (`npm test`) | ✅ 386 / 386 (4 schedule tests: 12:30 am India time, not a minute earlier; 15 guides from 20 November to 4 December 2026, across the month end) |
| Live build on 20 November (guide 1 published) | ✅ smoke 116, engine 62, detector 33, fix 126, validator 106, converter 45, a11y 71, seo 29, large 64; the CSV Validator page lists guide 1 |
| Build with every guide shown | ✅ smoke 122, engine 62, detector 33, fix 126, validator 106, converter 45, a11y 71, large 64, seo 43 (the list and all 15 guides: titles, descriptions, canonical links, previews, structured data, sitemap, links) |
| Accessibility of the guides | ✅ axe-core on the list and all 15 guides, light and dark: 0 findings; no console errors |
| Phone layout | ✅ every guide 412 px wide on a phone-sized screen (one long formula was overflowing; fixed) |
| Schedule on real dates | ✅ 25 Nov 00:29 → 5 guides; 00:30 → 6; 4 Dec 00:30 → 15; list, sitemap and pages agree |
| Publishing without a deploy | ✅ with the refresh shortened to 10 s for the test only: a list, guide page and sitemap built before the publish time showed the guide after it |
| Reloading pages | ✅ no unfinished requests on guide pages, tool pages and other pages |

**Failed:** none in the final run.

**Found during Stage 8 and fixed (each re-tested):**
- Making every page refresh hourly left Next.js's background link prefetches unfinished on reload (local server), which made the Stage 2 engine test time out. The hourly refresh was limited to the guide pages, the sitemap and the guide feed, and links to guides don't prefetch.
- The tool pages' guide list showed the same symptom when the browser re-checked its stored copy of the feed on reload; the feed is now fetched without a stored copy.
- Guide descriptions and word counts outside the limits, a guide-list description that named unpublished topics, and a phone-width overflow from a long formula.

## Remaining limitations

- **Excel and Google Sheets steps** were written from their documentation and couldn't be run here (the owner's device was too slow to test them). The Excel app on phones and tablets lacks these menus; every guide says so.
- A guide appears **within an hour after 12:30 am** India time (the hourly refresh), not at exactly 12:30.
- The “Guides” menu link is added when the site is deployed (it has been since 20 November).
- The behaviour of the hourly refresh is verified on a local production server; on Vercel it is confirmed by checking the live site on the following days.
- Guides usually take weeks to months to rank on Google; no ranking or traffic is promised.

## Approval

The owner approved Stage 8 on 20 November 2026 (“Stage 8 approved”).
