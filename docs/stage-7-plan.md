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
