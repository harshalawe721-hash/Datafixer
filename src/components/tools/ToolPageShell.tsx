import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container } from "@/components/ui/Container";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { IconBadge } from "@/components/ui/Card";
import { JsonLd } from "@/components/seo/JsonLd";
import { getTool, relatedTools, type ToolId } from "@/config/tools";
import { absoluteUrl, siteConfig } from "@/config/site";

/**
 * Shared layout for every tool page: breadcrumb, single H1, intro, the
 * interactive workspace, optional explanatory content and related-tool links.
 */
export function ToolPageShell({
  toolId,
  intro,
  children,
  content,
}: {
  toolId: ToolId;
  intro: string;
  /** The interactive tool. */
  children: React.ReactNode;
  /** Explanatory content rendered below the tool. */
  content?: React.ReactNode;
}) {
  const tool = getTool(toolId);
  const Icon = tool.icon;
  const related = relatedTools(toolId);

  return (
    <>
      <section className="border-b border-line">
        <Container className="py-10 sm:py-14">
          <Breadcrumbs items={[{ label: tool.name, href: tool.href }]} />
          <div className="mt-6 flex items-start gap-4">
            <IconBadge className="hidden sm:inline-flex">
              <Icon className="size-5" />
            </IconBadge>
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">{tool.name}</h1>
              <p className="mt-3 max-w-2xl text-lg text-pretty text-muted">{intro}</p>
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-10 sm:py-12">{children}</Container>

      {content && <Container className="pb-4">{content}</Container>}

      <section aria-labelledby="related-heading" className="border-t border-line bg-surface">
        <Container className="py-12">
          <h2 id="related-heading" className="text-xl font-bold">
            Related tools
          </h2>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {related.map((t) => {
              const RIcon = t.icon;
              return (
                <li key={t.id}>
                  <Link
                    href={t.href}
                    className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-background p-5 transition-colors hover:border-primary/40"
                  >
                    <RIcon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                    <span>
                      <span className="flex items-center gap-1.5 font-semibold">
                        {t.name}
                        <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                      </span>
                      <span className="mt-1 block text-sm text-muted">{t.summary}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Container>
      </section>

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: `${tool.name} – ${siteConfig.name}`,
          url: absoluteUrl(tool.href),
          description: tool.summary,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Any (web browser)",
          browserRequirements: "Requires JavaScript",
          isAccessibleForFree: true,
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
        }}
      />
    </>
  );
}
