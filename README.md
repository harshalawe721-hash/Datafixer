# DataFixer

**Find Spreadsheet Problems. Fix Them. Get Better Data.**

DataFixer is a free, privacy-first website for finding and fixing problems in Excel (XLSX/XLS) and CSV files. All spreadsheet processing happens in the visitor's browser: file contents are never uploaded.

## Tech stack

- Next.js 16 (App Router, static pre-rendering) · React 19 · TypeScript 5.9
- Tailwind CSS 4 (design tokens in `src/app/globals.css`, light + dark themes)
- Lucide React icons
- Planned for the tool stages: SheetJS (xlsx), Papa Parse, Chart.js, Web Workers

## Getting started

```bash
npm install
cp .env.example .env.local   # optional, see below
npm run dev                  # http://localhost:3000
```

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public base URL. Used for canonical URLs, sitemap, robots and Open Graph. Defaults to `http://localhost:3000`. **Set this before deploying.** |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Address for the Contact page. If unset, the page says no contact address is published yet and shows no form. |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run test:smoke` | Playwright end-to-end smoke test against a running server (`BASE_URL`, optional `SCREENSHOT_DIR`). Needs Playwright with Chromium available (locally or via `NODE_PATH`). |

## Project structure

```
src/
  app/                    Routes (one folder per page), sitemap.ts, robots.ts, globals.css
  components/
    layout/               Header, Footer, ToolsMenu, MobileMenu, Logo, ProsePage, ContactForm
    home/                 Homepage hero upload + CTA
    tools/                ToolPageShell (shared tool layout) and per-tool workspaces
    upload/               FileDropzone, FileHandoffProvider (in-memory page-to-page file passing)
    theme/                Theme toggle + no-flash init script
    seo/                  JSON-LD helper
    ui/                   Button, Card, Container, SectionHeading, Breadcrumbs
  config/                 site.ts (env-driven settings), tools.ts (tool registry), navigation.ts
  lib/                    file-validation.ts, metadata.ts, format.ts, cn.ts
scripts/smoke-test.mjs    E2E smoke test
```

Adding a tool: add an entry to `src/config/tools.ts` (navigation, footer, homepage, related links pick it up), then create `src/app/<slug>/page.tsx` using `ToolPageShell`, and add the path to `src/app/sitemap.ts` if it is not a tool.

## Build status

| Stage | Scope | Status |
| --- | --- | --- |
| 1 | Project setup, design system, header/footer, homepage, navigation, responsive layout | Done |
| 2 | Reusable upload + spreadsheet preview system | Next |
| 3 | Spreadsheet Error Detector | Planned |
| 4 | Spreadsheet Cleaner | Planned |
| 5 | CSV Validator | Planned |
| 6 | Excel ↔ CSV converters | Planned |
| 7 | SEO content, accessibility, performance, testing | Planned |

Until each tool is implemented, its page shows an honest "being built" notice with no upload control.
