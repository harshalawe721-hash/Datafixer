# DataFixer

**Find Spreadsheet Problems. Fix Them. Get Better Data.**

DataFixer is a free, privacy-first website for finding and fixing problems in Excel (XLSX/XLS) and CSV files. All spreadsheet processing happens in the visitor's browser: file contents are never uploaded.

## Tech stack

- Next.js 16 (App Router, static pre-rendering) · React 19 · TypeScript 5.9
- Tailwind CSS 4 (design tokens in `src/app/globals.css`, light + dark themes)
- Lucide React icons
- Spreadsheet engine (in a Web Worker): Papa Parse 5.7 (CSV), fflate 0.8 (XLSX safety inspection), official SheetJS Community Edition 0.20.3 for XLSX/XLS (vendored in `vendor/`, see `vendor/README.md`)
- Planned: Chart.js

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
| `npm test` | Unit tests (Node's built-in test runner): file validation, CSV reader, XLSX inspection, compact grid, query layer, engine core |
| `npm run test:detector` | Browser test of the Error Detector dashboard (cards, View affected data, re-check, cancel, Excel, mobile) |
| `npm run test:engine` | Browser end-to-end test of the engine through the UI (CSV, XLSX inspection, unsafe/damaged files, cancel, handoff, privacy checks) |
| `npm run test:perf` | Performance harness: generates 50/100/150 MB CSV and XLSX files and measures time, memory, responsiveness and cancellation (Linux; `HEAP_MB=512` imitates a low-memory device) |
| `npm run test:large` | Real-browser test of the 150 MB limit at 50/100/149/150/150 MB+1 byte/151 MB, using both the file picker and drag-and-drop (writes ~900 MB of temp files, then deletes them) |
| `npm run test:smoke` | Playwright end-to-end smoke test against a running server (`BASE_URL`, optional `SCREENSHOT_DIR`). Needs Playwright with Chromium available (locally or via `NODE_PATH`). |

## File size limit

Files up to **150 MB (157,286,400 bytes)** are accepted; the limit is set in `src/config/site.ts`. Processing happens on the visitor's device, so 150 MB is the most DataFixer accepts, not a guarantee that every device can process a file that size. See [`docs/large-file-processing.md`](docs/large-file-processing.md) for the processing design and the testing that is required before large-file support is claimed.

## Spreadsheet engine

All file reading happens in the browser, in a Web Worker. Nothing is uploaded. See [`docs/spreadsheet-engine.md`](docs/spreadsheet-engine.md) for the architecture, supported formats, security measures and limitations, and [`docs/stage-2-test-report.md`](docs/stage-2-test-report.md) for measured results. `/diagnostics` (not indexed) lets you test any browser or device with synthetic data.

## Project structure

```
src/
  app/                    Routes (one folder per page), sitemap.ts, robots.ts, globals.css
  engine/                 Spreadsheet engine (worker, CSV reader, XLSX inspection, grid, query)
  components/
    spreadsheet/          Workspace, preview table, progress + cancel, file summary
    diagnostics/          /diagnostics page (synthetic data only)
    layout/               Header, Footer, ToolsMenu, MobileMenu, Logo, ProsePage, ContactForm
    home/                 Homepage hero upload + CTA
    tools/                ToolPageShell (shared tool layout) and per-tool workspaces
    upload/               FileDropzone, FileHandoffProvider (in-memory page-to-page file passing)
    theme/                Theme toggle + no-flash init script
    seo/                  JSON-LD helper
    ui/                   Button, Card, Container, SectionHeading, Breadcrumbs
  config/                 site.ts (env-driven settings), tools.ts (tool registry), navigation.ts
  lib/                    file-validation.ts, metadata.ts, format.ts, cn.ts
scripts/                  smoke-test.mjs, large-file-test.mjs, engine-e2e.ts, perf-test.ts
tests/                    Unit tests (npm test)
vendor/                   Vendored packages (official SheetJS goes here; see vendor/README.md)
docs/                     Engine design, large-file design, test reports
```

Adding a tool: add an entry to `src/config/tools.ts` (navigation, footer, homepage, related links pick it up), then create `src/app/<slug>/page.tsx` using `ToolPageShell`, and add the path to `src/app/sitemap.ts` if it is not a tool.

## Build status

| Stage | Scope | Status |
| --- | --- | --- |
| 1 | Project setup, design system, header/footer, homepage, navigation, responsive layout | Done |
| 2 | Spreadsheet engine, upload + preview system | **Complete** (approved by the project owner on 11 November 2026). See `docs/stage-2-test-report.md` |
| 3 | Spreadsheet Error Detector (incl. formula errors) | **Complete** (approved by the project owner on 11 November 2026). See `docs/stage-3-test-report.md` |
| 4 | Automatic fixing and Spreadsheet Cleaner: one-tap fixes for the detected problems, cell editing, download a clean CSV/Excel file | In progress: Steps 1–2 of 8 done (see `docs/stage-4-plan.md`) |
| 5 | CSV Validator | Planned |
| 6 | Excel ↔ CSV converters | Planned |
| 7 | SEO content, accessibility, performance, testing | Planned |

Until each tool is implemented, its page shows an honest "being built" notice with no upload control.
