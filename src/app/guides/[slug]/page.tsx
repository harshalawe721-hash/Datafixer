import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GuideArticle } from "@/components/guides/GuideArticle";
import { displayDate, getPublishedGuide, publishedGuides } from "@/content/howto";
import { pageMetadata } from "@/lib/metadata";

/** Rebuilt every hour, so a scheduled guide appears within an hour of its publish time. */
export const revalidate = 3600;

export function generateStaticParams() {
  return publishedGuides().map((g) => ({ slug: g.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = getPublishedGuide((await params).slug);
  if (!guide) return {};
  return pageMetadata({
    title: guide.seoTitle,
    description: guide.description,
    path: `/guides/${guide.slug}`,
    article: { publishedTime: displayDate(guide) },
  });
}

export default async function Page({ params }: Props) {
  const guide = getPublishedGuide((await params).slug);
  if (!guide) notFound();
  return <GuideArticle guide={guide} />;
}
