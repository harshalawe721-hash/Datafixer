# Stage 7 completion report: content, SEO, accessibility, performance, final testing

**Date:** 14 November 2026

**Status:** ⏳ **Built and tested; awaiting the owner's approval.** Stage 7 is not complete until the owner approves it.

The owner approved the plan (`docs/stage-7-plan.md`) on 14 November 2026 with decisions **1A, 2A, 3A, 4B, 5A, 6A, 7A**, and asked: no new paid services or unnecessary dependencies; keep existing functionality; no unverified browser claims; test keyboard accessibility and automated accessibility checks; link previews that work on WhatsApp, Facebook and other platforms through proper Open Graph metadata; `/diagnostics` reachable but hidden and unlinked; nothing marked complete without testing.

## Changes

| Step | Change |
|---|---|
| 1 Accuracy | Homepage: “Open your spreadsheet” (nothing is uploaded); fixes previewed and undoable; formats include .tsv/.txt for the CSV tools; formulas answer accurate; **browser answer limited to what is tested** (decision 5A). Tool summaries updated. Privacy policy: changes and hand-overs stay in the tab's memory. Contact: decision 4B at first (honest notice); on 14 November 2026 the owner gave a contact address, so the Contact page now shows **wavelightning639@gmail.com** with the existing “Write email” form (it opens the visitor's own mail app; nothing is sent through DataFixer), and About, Privacy and Terms point to it |
| 2 Content and previews | A guide on each of the five tool pages (decision 1A): how it works, an example, what it never does, limits, six questions and answers (650–860 words, FAQ structured data). A 1200×630 link preview image (decision 6A) made at build time by Next.js's built-in `next/og`, set on every page with full Open Graph and Twitter tags. The site address now falls back to Vercel's own address when `NEXT_PUBLIC_SITE_URL` isn't set (it used to fall back to localhost, which would have broken previews, canonical links and the sitemap on Vercel) |
| 3 Keyboard | The table is an ARIA grid: Tab reaches it in one stop; arrow keys, Home/End, Ctrl+Home/End, PageUp/PageDown; Enter or F2 edits; Escape returns to the cell; ↑ reaches the header. Column names can be renamed with a pencil button (decision 2A) |
| 4 Accessibility checks | axe-core (already installed with the lint tools; nothing added) on every page and tool state, light and dark mode (decision 3A). Fixed: accessible names that didn't include the visible text, a preview area that couldn't be scrolled by keyboard, a low-contrast link in dark mode |
| 5 SEO and performance | Every page checked (titles, descriptions, canonical links, Open Graph, JSON-LD, links, sitemap, robots, 404). Six descriptions rewritten to 123–160 characters (one still said “Upload”). `/diagnostics` kept, hidden and unlinked (decision 7A). Phone-sized loading measured |
| 6 Final testing | All test suites of all stages, large files, this report |

No new dependencies and no paid services were added. `next/og` is part of Next.js; axe-core was already installed (`eslint-config-next` → `eslint-plugin-jsx-a11y` → `axe-core` 4.14.0).

## Link previews (WhatsApp, Facebook, LinkedIn, X)

Every page sends: `og:title`, `og:description`, `og:url` (absolute), `og:type`, `og:site_name`, `og:locale`, `og:image` (absolute URL), `og:image:type` (image/png), `og:image:width` (1200), `og:image:height` (630), `og:image:alt`, and `twitter:card` = `summary_large_image` with `twitter:image`. The image is an 81 KB PNG (WhatsApp handles images under about 300 KB reliably). Simulated Vercel builds confirmed the absolute addresses: preview builds use the branch address, production builds the production domain, and `NEXT_PUBLIC_SITE_URL` overrides both.

**Not testable from here:** the platforms' own crawlers (WhatsApp, Facebook) can't reach this build environment, so the previews themselves must be checked on the live site, for example with Facebook's Sharing Debugger or by sending the link in WhatsApp. If Vercel's Deployment Protection is on for preview links, crawlers can't fetch them; the production address is not affected.

## Tests (final run on the final Stage 7 code)

| Suite | What it covers | Result |
|---|---|---|
| Type check (`tsc --noEmit`) | whole project | ✅ pass |
| Lint (`eslint`) | whole project | ✅ pass, 0 warnings |
| Production build (`next build`) | all pages, including the preview image | ✅ pass |
| Unit tests (`npm test`) | engine, fixes, repairs, exports, converters | ✅ **382 / 382** |
| Smoke (`test:smoke`) | every page, upload rules, navigation (Stages 1–2) | ✅ 114 / 114 |
| Engine (`test:engine`) | preview, sorting, search, sheets (Stage 2) | ✅ 62 / 62 |
| Error Detector (`test:detector`) | Stage 3 | ✅ 33 / 33 |
| Fixing and Cleaner (`test:fix`) | Stage 4 | ✅ 126 / 126 |
| CSV Validator (`test:validator`) | Stage 5 | ✅ 106 / 106 |
| Converters (`test:converter`) | Stage 6 | ✅ 45 / 45 |
| **Accessibility (`test:a11y`)** | **28 keyboard checks + axe-core on 11 pages and 16 tool states, light and dark (42 checks): 0 serious, 0 critical, 0 moderate, 0 minor findings; no console errors** | ✅ **71 / 71** |
| **SEO and performance (`test:seo`)** | **sitemap, robots, every page's tags, preview image, links, hidden `/diagnostics`, the contact address, 404, phone-sized loading** | ✅ **26 / 26** (after the contact address was added) |
| 150 MB limit (`test:large`) | Stage 2 | ✅ 64 / 64 |
| Large files, fixing (`test:export-perf`) | 50/100/150 MB: open, check, Fix all, download | ✅ all ok (150 MB: Fix all 31.5 s, download 6.7 s) |
| Large files, Validator (`test:validator-perf`) | 50/100/150 MB, exact planted counts, Python checks | ✅ all ok, 0 problems |
| Large files, converters (`test:converter-perf`) | CSV → Excel 50/100/150 MB (1–3 sheets), Excel → CSV 600,000 rows and a 3-sheet ZIP | ✅ all ok, 0 problems |
| Stage 2/3 performance harness (`test:perf`) | 18 large CSV/XLSX/XLS cases | ✅ completes; the same cases open or are refused safely as in the Stage 2 report (e.g. the 97 MB workbook refused at the 500 MB limit in 9.4 s) |

**Failed:** none in the final run.

**Found during Stage 7 and fixed (each re-tested):** untested browser claims on the homepage; “Upload” wording (homepage step and the Error Detector's description); link preview image missing on every page except the homepage; absolute links falling back to localhost on Vercel; visible text missing from accessible names (sort and Cleaner buttons); a preview area not scrollable by keyboard; a low-contrast link in dark mode; six search descriptions outside 70–160 characters.

**Test changes:** five browser-test lookups were updated to the new accessible names and roles (cells are now `gridcell`, sort buttons “Sort by column A id”, Cleaner buttons “2 found · Preview (Remove extra spaces)”, the table hint's wording, and the Stage 2/3 harness now clicks the second column's sort button instead of “the second header button”, which is now a Rename button). No check was removed or loosened.

## Remaining limitations

- **Browsers:** only Chromium-based browsers are tested (desktop, phone- and tablet-sized screens in Chromium, and the owner's Android tablet). Firefox, Safari and iPhone are not tested; the site says so.
- **Link previews** are verified through the page's metadata and the image itself, not through the platforms' crawlers (see above).
- **Contact:** the address is set in the site's settings (`src/config/site.ts`); setting `NEXT_PUBLIC_CONTACT_EMAIL` on Vercel would override it.
- **Keyboard grid:** moving past the last row of a page or the last column of the 50-column window doesn't turn the page; use the Next and column buttons below the table (reachable with Tab).
- **Performance figures** are from a local server with a slowed CPU but no network delay; real loading on a phone network will be slower, and very large files remain limited by the device's memory (Stages 2–6).
- Earlier stages' limits still apply (see the Stage 2–6 test reports): one Excel sheet at a time, values only in CSV, .xls rebuilt as .xlsx with listed losses, files up to 150 MB.

## Before launch (owner actions)

1. Make this branch the live site on Vercel (merge it into the main branch, or set it as the production branch).
2. Set `NEXT_PUBLIC_SITE_URL` to the final address (for example `https://www.your-domain.com`), especially if a custom domain is used.
3. Contact email: done (shown on the Contact page).
4. Check a link preview: paste the live address into WhatsApp, or into Facebook's Sharing Debugger.
5. Open a few downloaded files in Microsoft Excel and Google Sheets.
6. Try the site on an Android phone, and on an iPhone (Safari) if possible.

## Approval

Stage 7 will be marked complete only after the owner approves it.
