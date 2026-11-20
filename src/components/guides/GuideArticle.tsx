import Link from "next/link";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { JsonLd } from "@/components/seo/JsonLd";
import { getTool } from "@/config/tools";
import { absoluteUrl, siteConfig } from "@/config/site";
import { displayDate, getPublishedGuide, type HowToGuide } from "@/content/howto";

export function formatGuideDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Prose styles shared by guide bodies (matches the site's text pages). */
const PROSE =
  "space-y-4 leading-relaxed text-foreground/90 [&_a]:font-medium [&_a]:text-primary [&_a:hover]:underline " +
  "[&_h2]:mt-10 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-foreground [&_h3]:mt-6 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-foreground " +
  "[&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-6 " +
  "[&_code]:rounded [&_code]:bg-surface-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.9em] [&_pre_code]:bg-transparent [&_pre_code]:p-0";

/** A Stage 8 guide page: heading, byline, short answer, the guide, tools, questions, related guides, structured data. */
export function GuideArticle({ guide }: { guide: HowToGuide }) {
  const path = `/guides/${guide.slug}`;
  const date = displayDate(guide);
  const related = guide.related.map((s) => getPublishedGuide(s)).filter((g): g is HowToGuide => Boolean(g));
  const tools = guide.tools.map(getTool);

  return (
    <Container className="max-w-3xl py-10 sm:py-14">
      <Breadcrumbs items={[{ label: "Guides", href: "/guides" }, { label: guide.title, href: path }]} />
      <article className="mt-6">
        <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{guide.title}</h1>
        <p className="mt-3 text-sm text-muted">
          By the {siteConfig.name} team · Updated <time dateTime={date}>{formatGuideDate(date)}</time>
        </p>

        <section aria-labelledby="short-answer" className="mt-8 rounded-2xl border border-primary/25 bg-primary/5 p-5 leading-relaxed">
          <h2 id="short-answer" className="text-base font-bold">
            The short answer
          </h2>
          <div className="mt-2 text-foreground/90">{guide.quickAnswer}</div>
        </section>

        <div className={`mt-6 ${PROSE}`}>{guide.body}</div>

        <section aria-labelledby="guide-tools" className="mt-10 rounded-2xl border border-line bg-surface p-5">
          <h2 id="guide-tools" className="text-lg font-bold">
            Fix it in your browser
          </h2>
          <p className="mt-1 text-sm text-muted">Free, no sign-up. Your file is processed on your device and never uploaded.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {tools.map((t) => {
              const Icon = t.icon;
              return (
                <li key={t.id}>
                  <Link
                    href={t.href}
                    className="group flex h-full items-start gap-3 rounded-xl border border-line bg-background p-4 transition-colors hover:border-primary/40"
                  >
                    <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <span className="flex items-center gap-1.5 font-semibold">
                        Open the {t.name}
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </span>
                      <span className="mt-1 block text-sm text-muted">{t.summary}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="guide-faq" className="mt-10">
          <h2 id="guide-faq" className="text-2xl font-bold">
            Questions and answers
          </h2>
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
            {guide.faqs.map(({ q, a }) => (
              <details key={q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                  <h3>{q}</h3>
                  <ChevronDown className="size-5 shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden="true" />
                </summary>
                <p className="mt-2 text-sm text-muted">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </article>

      {related.length > 0 && (
        <section aria-labelledby="related-guides" className="mt-12 border-t border-line pt-8">
          <h2 id="related-guides" className="text-xl font-bold">
            Related guides
          </h2>
          <ul className="mt-4 space-y-3">
            {related.map((g) => (
              <li key={g.slug}>
                <Link href={`/guides/${g.slug}`} prefetch={false} className="font-medium text-primary hover:underline">
                  {g.title}
                </Link>
                <p className="text-sm text-muted">{g.summary}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: guide.title,
          description: guide.description,
          datePublished: date,
          dateModified: date,
          inLanguage: "en",
          mainEntityOfPage: absoluteUrl(path),
          image: absoluteUrl("/opengraph-image"),
          author: { "@type": "Organization", name: `${siteConfig.name} team`, url: absoluteUrl("/about") },
          publisher: { "@type": "Organization", name: siteConfig.name, url: absoluteUrl("/"), logo: { "@type": "ImageObject", url: absoluteUrl("/icon.png") } },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: guide.faqs.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
        }}
      />
    </Container>
  );
}
