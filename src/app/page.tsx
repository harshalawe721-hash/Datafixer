import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Copy,
  CircleDashed,
  Type,
  Ban,
  Sigma,
  FileWarning,
  Upload,
  ScanSearch,
  ListChecks,
  Download,
  BadgeCheck,
  MousePointerClick,
  MonitorSmartphone,
  UserX,
  Eye,
  ChevronDown,
} from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Card, IconBadge } from "@/components/ui/Card";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { HeroActions, HeroDropzone } from "@/components/home/HeroUpload";
import { JsonLd } from "@/components/seo/JsonLd";
import { tools } from "@/config/tools";
import { siteConfig, absoluteUrl } from "@/config/site";
import { pageMetadata } from "@/lib/metadata";

export const metadata: Metadata = {
  ...pageMetadata({
    title: `${siteConfig.name} – Find and Fix Spreadsheet Problems in Seconds`,
    description:
      "Free online tools to clean Excel and CSV files. Detect duplicate rows, missing data, bad dates and formatting problems, fix them, and download a corrected spreadsheet.",
    path: "/",
  }),
  // The homepage uses the full title rather than the "%s | DataFixer" template.
  title: { absolute: `${siteConfig.name} – Find and Fix Spreadsheet Problems in Seconds` },
};

const fixable = [
  {
    icon: Copy,
    title: "Duplicate Rows",
    text: "Find rows that appear more than once and keep a single copy, so totals and counts stay accurate.",
  },
  {
    icon: CircleDashed,
    title: "Missing Data",
    text: "Spot blank cells, empty rows and unused columns that break formulas, imports and reports.",
  },
  {
    icon: Type,
    title: "Formatting Problems",
    text: "Fix extra spaces, inconsistent capitalization and dates written in several different formats.",
  },
  {
    icon: Ban,
    title: "Invalid Values",
    text: "Catch malformed email addresses, odd phone numbers, numbers stored as text and unusual outliers.",
  },
  {
    icon: Sigma,
    title: "Formula Errors",
    text: "See cells showing errors such as #N/A, #DIV/0! or #REF! so you can trace them back to the source.",
  },
  {
    icon: FileWarning,
    title: "CSV Import Problems",
    text: "Detect wrong delimiters, broken quoting, uneven rows and duplicate headers before an import fails.",
  },
];

const steps = [
  { icon: Upload, title: "Open your spreadsheet", text: "Choose an XLSX, XLS or CSV file. Your browser opens it on your device; nothing is uploaded." },
  { icon: ScanSearch, title: "Detect problems", text: "DataFixer scans every row and column for common data issues." },
  { icon: ListChecks, title: "Review suggested fixes", text: "See exactly which cells are affected, preview every fix before it is applied, and undo any change." },
  { icon: Download, title: "Download your corrected file", text: "Get a clean copy. Your original file is never modified." },
];

const reasons = [
  { icon: BadgeCheck, title: "Free tools", text: "Every tool is free to use, with no trial period or usage credits." },
  { icon: MousePointerClick, title: "Simple interface", text: "Plain-language results designed for people who are not data experts." },
  {
    icon: MonitorSmartphone,
    title: "Browser-based processing",
    text: "Files are read and processed on your own device instead of being uploaded to a server.",
  },
  { icon: UserX, title: "No mandatory registration", text: "No account, email address or sign-up needed to use any tool." },
  { icon: Eye, title: "Preview before applying", text: "Every change is shown before it is applied, and nothing is changed silently." },
];

const faqs = [
  {
    q: "Is DataFixer really free?",
    a: "Yes. All tools on DataFixer are free to use and do not require an account. There are no paid plans or hidden limits on the number of files you can check.",
  },
  {
    q: "Are my files uploaded to a server?",
    a: "No. DataFixer reads and processes your spreadsheet inside your web browser using JavaScript running on your device. The file contents are not sent to our servers or to any third-party service.",
  },
  {
    q: "Which file formats are supported?",
    a: "You can open Excel workbooks (.xlsx and the older .xls format) and CSV files; the CSV Validator and the CSV to Excel converter also accept .tsv and .txt files. Files up to 150 MB are accepted. Because processing happens on your device, very large files can be slow, and on phones or older computers they may need more memory than the browser allows.",
  },
  {
    q: "Will DataFixer change my original file?",
    a: "Never. Your original file stays exactly as it is on your device. DataFixer works on a copy in memory and only creates a new file when you choose to download the result.",
  },
  {
    q: "Can it fix formulas?",
    a: "DataFixer points out cells that show formula errors such as #N/A or #DIV/0!, but it does not rewrite formulas for you. Automatic fixes never change formula cells, and formulas are never executed as code. When you download an Excel file, the formulas you didn't edit are kept.",
  },
  {
    q: "Does it work on phones and tablets?",
    a: "DataFixer is tested in Chrome and other Chromium-based browsers (such as Edge, Samsung Internet and Brave) on Android phones and tablets and on desktop computers. Other modern browsers should work, but they have not been tested yet. Very large files need a computer or a recent phone with enough memory, and are easier to review on a bigger screen.",
  },
];

export default function HomePage() {
  const featured = tools.filter((t) => t.featured);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden border-b border-line">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_70%_-10%,color-mix(in_srgb,var(--primary)_14%,transparent),transparent)]"
        />
        <Container className="grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-2 lg:gap-16 lg:py-24">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
              <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
              Free · No sign-up · Runs in your browser
            </p>
            <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-balance sm:text-5xl lg:text-6xl">
              Find and Fix Spreadsheet Problems in <span className="text-primary">Seconds.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">
              Clean your Excel and CSV files, detect hidden data issues, and get organized spreadsheets without
              complicated software.
            </p>
            <HeroActions />
          </div>
          <div id="upload" className="animate-fade-up rounded-3xl border border-line bg-surface/60 p-3 shadow-elevated sm:p-4">
            <HeroDropzone />
          </div>
        </Container>
      </section>

      {/* What can you fix */}
      <section aria-labelledby="fix-heading" className="py-20 sm:py-24">
        <Container>
          <SectionHeading
            id="fix-heading"
            eyebrow="Common problems"
            title="What can you fix?"
            description="DataFixer looks for the issues that most often cause wrong totals, failed imports and messy reports."
          />
          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {fixable.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <Card className="h-full">
                  <IconBadge>
                    <Icon className="size-5" />
                  </IconBadge>
                  <h3 className="mt-4 text-lg font-semibold">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
                </Card>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* Popular tools */}
      <section id="tools" aria-labelledby="tools-heading" className="border-y border-line bg-surface py-20 sm:py-24">
        <Container>
          <SectionHeading
            id="tools-heading"
            eyebrow="Free tools"
            title="Popular tools"
            description="Pick the tool that matches your problem. Each one works on its own, with no account."
          />
          <ul className="mt-12 grid gap-5 sm:grid-cols-2">
            {featured.map((tool) => {
              const Icon = tool.icon;
              return (
                <li key={tool.id}>
                  <Link
                    href={tool.href}
                    className="group flex h-full gap-4 rounded-2xl border border-line bg-background p-6 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-card"
                  >
                    <IconBadge>
                      <Icon className="size-5" />
                    </IconBadge>
                    <span className="flex-1">
                      <span className="flex items-center gap-2 text-lg font-semibold">
                        {tool.name}
                        <ArrowRight
                          className="size-4 text-primary transition-transform group-hover:translate-x-1"
                          aria-hidden="true"
                        />
                      </span>
                      <span className="mt-1.5 block text-sm leading-relaxed text-muted">{tool.summary}</span>
                      <span className="mt-3 block text-xs font-medium text-muted">
                        Accepts {tool.accepts.map((e) => e.slice(1).toUpperCase()).join(", ")}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-8 text-center text-sm text-muted">
            Also available:{" "}
            {tools
              .filter((t) => !t.featured)
              .map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <Link href={t.href} className="font-medium text-primary hover:underline">
                    {t.name}
                  </Link>
                </span>
              ))}
          </p>
        </Container>
      </section>

      {/* How it works */}
      <section id="how-it-works" aria-labelledby="how-heading" className="py-20 sm:py-24">
        <Container>
          <SectionHeading
            id="how-heading"
            eyebrow="How it works"
            title="Four steps to cleaner data"
            description="No installation and no learning curve. If you can open a spreadsheet, you can use DataFixer."
          />
          <ol className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="relative">
                <Card className="h-full">
                  <div className="flex items-center justify-between">
                    <IconBadge>
                      <Icon className="size-5" />
                    </IconBadge>
                    <span className="text-4xl font-extrabold text-line-strong" aria-hidden="true">
                      {i + 1}
                    </span>
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">
                    <span className="sr-only">Step {i + 1}: </span>
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{text}</p>
                </Card>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* Why DataFixer */}
      <section aria-labelledby="why-heading" className="border-y border-line bg-surface py-20 sm:py-24">
        <Container className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <SectionHeading
            id="why-heading"
            align="left"
            eyebrow="Why DataFixer?"
            title="Built for real people with real spreadsheets"
            description="Students, office teams, freelancers, accountants and business owners use spreadsheets every day. DataFixer makes fixing them quick and safe."
          />
          <ul className="grid gap-4 sm:grid-cols-2">
            {reasons.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4 rounded-2xl border border-line bg-background p-5">
                <IconBadge tone="success">
                  <Icon className="size-5" />
                </IconBadge>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Container>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-heading" className="py-20 sm:py-24">
        <Container className="max-w-3xl">
          <SectionHeading id="faq-heading" eyebrow="FAQ" title="Frequently asked questions" />
          <div className="mt-10 divide-y divide-line rounded-2xl border border-line bg-surface">
            {faqs.map(({ q, a }) => (
              <details key={q} className="group px-6 py-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  <h3>{q}</h3>
                  <ChevronDown
                    className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180"
                    aria-hidden="true"
                  />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted">{a}</p>
              </details>
            ))}
          </div>
        </Container>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: siteConfig.name,
          url: absoluteUrl("/"),
          description: siteConfig.description,
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs.map(({ q, a }) => ({
            "@type": "Question",
            name: q,
            acceptedAnswer: { "@type": "Answer", text: a },
          })),
        }}
      />
    </>
  );
}
