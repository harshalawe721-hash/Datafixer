import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { publishedGuides } from "@/content/howto";
import { absoluteUrl } from "@/config/site";
import { pageMetadata } from "@/lib/metadata";

export const revalidate = 3600;

export const metadata: Metadata = pageMetadata({
  title: "Spreadsheet Guides – Fix Common Excel and CSV Problems",
  description:
    "Step-by-step guides to common Excel and CSV problems, with clear fixes for Excel, Google Sheets and the free MyDataFixer tools in your browser.",
  path: "/guides",
});

export default function Page() {
  const guides = publishedGuides();
  // Before the first guide is published, the page doesn't exist (and nothing links to it).
  if (guides.length === 0) notFound();
  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <Breadcrumbs items={[{ label: "Guides", href: "/guides" }]} />
      <h1 className="mt-6 text-3xl font-extrabold tracking-tight sm:text-4xl">Spreadsheet guides</h1>
      <p className="mt-4 text-lg text-pretty text-muted">
        Clear answers to the spreadsheet problems people run into most, with steps for Excel, Google Sheets and the free MyDataFixer tools.
      </p>
      <ul className="mt-10 space-y-4">
        {guides.map((g) => (
          <li key={g.slug}>
            <Link
              href={`/guides/${g.slug}`}
              prefetch={false}
              className="group block rounded-2xl border border-line bg-surface p-5 transition-colors hover:border-primary/40"
            >
              <h2 className="flex items-start gap-2 text-lg font-semibold">
                {g.title}
                <ArrowRight className="mt-1.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </h2>
              <p className="mt-1 text-sm text-muted">{g.summary}</p>
            </Link>
          </li>
        ))}
      </ul>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: guides.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(`/guides/${g.slug}`), name: g.title })),
        }}
      />
    </Container>
  );
}
