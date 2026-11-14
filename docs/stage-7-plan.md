# Stage 7 plan: content, SEO, accessibility, performance, final testing

**Status:** plan prepared on 14 November 2026. **The owner approved it on 14 November 2026 with decisions 1A, 2A, 3A, 4B, 5A, 6A, 7A** and asked for implementation, with these requirements: no new paid services or unnecessary dependencies; keep all existing functionality; no unverified browser-compatibility claims; test keyboard accessibility and automated accessibility checks; link previews must work on WhatsApp, Facebook and other platforms through proper Open Graph metadata; `/diagnostics` reachable but hidden and unlinked; nothing marked complete without testing; a completion report at the end. Progress is recorded under “Progress” below.

## Goal

Finish the website: every page says only what is built and tested, each tool page explains itself well enough to be found in search and understood without help, the site works with a keyboard and screen readers, it stays fast on phones, and the whole site passes a final test before launch. No new features beyond these, no payment system, no new dependencies.

## What the inventory found

| Area | Today | To do |
|---|---|---|
| Tool pages | All five tools work (Stages 3–6). Each page has a title, a one-line intro, the tool and related-tool links | No explanation below the tool (how it works, examples, privacy, limits) |
| Homepage | Hero, features, steps, reasons, FAQ | Some wording is ahead of the facts: the FAQ says it works in “Chrome, Edge, Firefox and Safari” on iOS too, but only Chrome-based browsers have been tested; step 1 says “Upload your spreadsheet” although nothing is uploaded |
| About, Privacy, Terms | Written in Stage 1 | Check against what the tools do now (repairs, downloads, converters, ZIP files) |
| Contact | Honest “not published yet” notice | Needs the owner's contact email (decision 4) |
| SEO basics | Unique titles and descriptions, canonical links, sitemap, robots.txt, JSON-LD | Check every page again; no Open Graph image yet (link previews show text only); `/diagnostics` is a test page (no-index) |
| Accessibility | Labels, headings, focus styles, phone layouts | **Table cells can't be reached with the keyboard** (known since Stage 4); **column-name cells can't be edited** (known since Stage 4); no automated accessibility check yet |
| Browsers | Chromium (desktop, phone and tablet sizes) and the owner's Android tablet | Firefox, Safari and iPhone not tested; only Chromium is installed in the build environment |

## Owner decisions (approved 14 November 2026: 1A, 2A, 3A, 4B, 5A, 6A, 7A)

**1. Help content on each tool page** (below the tool, for people and for search engines)
- **A (recommended):** a short guide per tool, about 400–700 words: what it checks or does, a worked example, what it never does (privacy, the original file), limits, and 4–6 questions and answers. Plain HTML, no pop-ups.
- **B:** a shorter version (about 150 words) per tool.
- **C:** no extra content.

**2. Keyboard and screen-reader access to the table**
- **A (recommended):** arrow keys move between cells, Enter opens the cell editor, Escape closes it. The table is announced as a grid with row and column numbers. Column-name cells can be edited (in the same editor, with a note that the name changes, not the data).
- **B:** keyboard access only; column names stay non-editable (use “Fix column names” or untick the setting).

**3. Automated accessibility checks**
- **A (recommended):** run the axe-core checker on every page and on each tool after a file is opened, in the browser tests, and fix every serious problem. axe-core is already installed with the existing lint tools, so nothing new is added.
- **B:** manual checks only.

**4. Contact page**
- **A:** you give me a contact email address, and it is shown on the Contact page (set as `NEXT_PUBLIC_CONTACT_EMAIL`; it can be changed later without code).
- **B:** keep the honest “not published yet” notice for now.

**5. Browser support wording** (only Chromium can be tested here)
- **A (recommended):** say what is tested — “Tested in Chrome and other Chromium browsers (Edge, Samsung Internet, Brave) on Android and desktop. Other modern browsers should work; very large files need a computer or a recent phone.” — and list Firefox/Safari as not yet tested in the test report. You can test Safari/iPhone yourself later, and the wording can be updated then.
- **B:** keep the current wording (not recommended: it claims Firefox and Safari without testing).

**6. Link preview image** (shown when a page is shared on WhatsApp, X, LinkedIn…)
- **A (recommended):** one simple image made with the site's own logo, name and tagline (an SVG turned into a 1200×630 PNG at build time by Next.js, no new dependency), used for all pages.
- **B:** no image (text-only previews).

**7. The `/diagnostics` test page**
- **A (recommended):** keep it, hidden from search engines and not linked from any page (useful for checking a phone's memory limit if a large file fails).
- **B:** remove it before launch.

## Build steps (each tested, committed and reported before the next)

| Step | Work |
|---|---|
| 1 | Accuracy pass: homepage, About, Privacy, Terms and every tool intro checked against what is built and tested; wording fixed (decision 5) |
| 2 | Help content on the five tool pages (decision 1), with the right headings and structured data; link preview image (decision 6) |
| 3 | Keyboard and screen-reader access to the table, editable column names (decision 2) |
| 4 | Accessibility checks with axe-core on every page and tool state (decision 3); colour contrast in light and dark mode; fixes |
| 5 | SEO and performance check: every page's title, description, canonical link, headings, structured data, sitemap; first-load size per page and loading speed on a phone-sized screen in Chromium; fixes |
| 6 | Final test of the whole site (all stages' tests, phone and tablet sizes, large files), launch checklist, Stage 7 test report |

## Progress

### Step 1 — Accuracy pass (done, 14 November 2026)

- Homepage: “Upload your spreadsheet” → “Open your spreadsheet” (nothing is uploaded); step 3 now says fixes are previewed and can be undone; the formats answer mentions .tsv/.txt for the CSV tools; the formulas answer says automatic fixes never change formula cells and untouched formulas are kept in Excel downloads; **the browser answer now says only what is tested** (Chrome and Chromium-based browsers on Android and desktop; others should work but are untested) — decision 5.
- Tool summaries updated to what the tools now do (Validator repairs, Excel to CSV ZIP, CSV to Excel value rules); the CSV tools list .tsv and .txt as accepted.
- Privacy policy (date 14 November 2026): changes stay only in the tab's memory until downloaded; a file passed between DataFixer pages stays in the tab and is not uploaded.
- Contact (decision 4B): the honest notice stays, without “please check back soon”. About, Privacy and Terms no longer say questions “can be sent through” the contact page while it has no address.

### Step 2 — Help content and link previews (done, 14 November 2026)

- Decision 1A: each tool page has a guide below the tool (`src/content/guides.tsx`, `src/components/tools/ToolGuide.tsx`): how it works, an example, what it never does, good to know (limits), and six questions and answers (FAQ structured data). 650–860 words per page; every statement describes tested behaviour.
- Decision 6A: a 1200×630 link preview image (`src/app/opengraph-image.tsx`, drawn at build time by Next.js's built-in `next/og`; 82 KB PNG). Every page now lists it in `og:image` (with type, width, height and alt text) and `twitter:image`, with the large-image card. **Found:** a page's own Open Graph block replaced the inherited image, so tool pages had no `og:image`; the image is now set in the shared page metadata.
- **Found:** without `NEXT_PUBLIC_SITE_URL`, absolute links (canonical, `og:url`, `og:image`, sitemap) pointed to `http://localhost:3000`, so previews couldn't work on Vercel. The site address now falls back to the address Vercel provides at build time (production domain for production, the branch address for previews). Checked with simulated Vercel preview and production builds: all absolute links become `https://…`.
- Note: if Vercel's Deployment Protection is on for previews, WhatsApp and Facebook can't fetch preview pages; the live (production) address is not affected.

### Step 3 — Keyboard and screen-reader access to the table (done, 14 November 2026)

- Decision 2A: the preview table is an ARIA grid (`role="grid"`, row and column counts, row and column positions, read-only when editing isn't offered). One cell is in the Tab order; arrow keys move between cells, Home/End to the row's first/last cell, Ctrl+Home/End to the first/last cell of the page, PageUp/PageDown ten rows, Enter or F2 opens the editor, Escape closes it and focus returns to the cell. ↑ from the first row reaches the column header, ← → move across the header buttons, ↓ goes back to the cells (header buttons are no longer one Tab stop each).
- Column names can be renamed (pages with editing: Error Detector, Cleaner, CSV Validator; with “First row contains column names” ticked): a pencil button next to each name opens the editor as “Rename column”, with a note that only the name changes. Undo and history work as for any change.
- The hint above the table now explains tap and keyboard editing.
- Two Stage 4 browser-test lookups were updated to the new semantics (the hint's new wording; cells now have the `gridcell` role instead of `cell`); the checks themselves are unchanged.
- Browser test: `npm run test:a11y`, 28 keyboard checks (reaching the grid with Tab, all navigation keys, editing and escaping, renaming a column by keyboard, which clears the Validator's “column without a name” error, and a keyboard-only Fix all / Apply / Download / Undo on the Cleaner).

### Step 4 — Automated accessibility checks (done, 14 November 2026)

- Decision 3A: axe-core (already installed with the lint tools: `eslint-config-next` → `eslint-plugin-jsx-a11y` → `axe-core` 4.14.0; nothing added) runs in `npm run test:a11y` on all 11 pages (including the 404 page) in light and dark mode, and on each tool after a file is opened: Error Detector results, affected rows, Fix all preview, change history, the cell editor, Cleaner tools and a preview with choices, Validator results, repair preview and download options, both converters' settings and summaries. Any serious or critical finding fails the test.
- **Found and fixed:** (1) visible text not part of the accessible name (serious): column sort buttons were announced “Sort by id (column A)” while showing “A id”, and the Cleaner's buttons “Remove extra spaces: 2 found” while showing “2 found · Preview” — now “Sort by column A id” and “2 found · Preview (Remove extra spaces)”, so voice-control users can say what they see; (2) the fix preview's scrollable area had no keyboard access when it held no focusable content — it is now focusable; (3) the “See every change in History” link had 3.8:1 contrast in dark mode (blue on dark green) — now underlined body text.
- Result: 0 serious, 0 critical, 0 moderate, 0 minor findings in all 42 checked states. Three earlier browser-test lookups were updated to the new accessible names (same checks).

### Step 5 — SEO and performance check (done, 14 November 2026)

- `npm run test:seo` (`scripts/seo-check.ts`): sitemap (10 pages, without `/diagnostics`) and robots.txt; on every page: status 200, one H1, `lang="en"`, a unique title of 20–75 characters, a description of 70–160 characters, an absolute canonical link, complete Open Graph tags (title, description, url, type, site name, image with width, height and alt) and the large-image Twitter card, valid JSON-LD, no images without alt text, not marked noindex. The preview image is served as a 1200×630 PNG of 81 KB. All internal links work; no page links to `/diagnostics`, which still works and is marked noindex, nofollow (decision 7A); unknown pages answer 404.
- **Found and fixed:** six descriptions were too long or too short for search results (the Validator's was 214 characters), and the Error Detector's still said “Upload an Excel or CSV file” — all rewritten to 123–160 characters and accurate.
- Loading on a phone-sized screen in Chromium with the CPU slowed 4× (local server, no network delay): first and largest paint 72–180 ms, layout shift 0.000 on the homepage, three tool pages and About; scripts 23–194 KB per page (uncompressed). No changes were needed.

### Step 6 — Final testing and report (done, 14 November 2026)

- Every test suite of every stage run on the final code, including all large-file tests and the Stage 2/3 performance harness (its sort step now targets the sort button, since header cells also hold a Rename button). No failures. Results and remaining limitations: `docs/stage-7-test-report.md`. Stage 7 waits for the owner's approval.

## Testing

- Every page: one H1, unique title and description, canonical link, valid JSON-LD, in the sitemap (except `/diagnostics`), no broken internal links.
- axe-core with no serious or critical problems on every page, in light and dark mode, and on each tool after a file is opened.
- Keyboard-only walkthrough of every tool (open file, check, fix, edit a cell, download) in the browser tests.
- First-load size and loading measurements per page (phone-sized Chromium), compared before and after.
- All earlier test suites keep passing.

## Before launch (owner actions, outside the code)

1. Make this branch the live site on Vercel (merge it, or set it as the production branch).
2. Set `NEXT_PUBLIC_SITE_URL` to the real address (canonical links, sitemap and link previews use it).
3. Contact email (decision 4).
4. Open a few downloaded files in Microsoft Excel and Google Sheets.
5. Test on an Android phone, and if possible on an iPhone (Safari).

## Rules carried over

No payment system; no fake buttons or placeholders; processing stays on the device; no new dependencies; nothing claimed that isn't built and tested; Stages 1–6 must keep working; every step tested before it is reported; limitations documented honestly; the stage is complete only after the owner approves it.
