import type { Metadata } from "next";
import { siteConfig } from "@/config/site";

/**
 * Link preview image (app/opengraph-image.tsx), listed on every page: a page's own
 * openGraph block replaces the inherited one, so the image must be given here.
 * Resolved to an absolute URL with the site address (metadataBase), as WhatsApp,
 * Facebook and others require.
 */
export const SHARE_IMAGE = {
  url: "/opengraph-image",
  width: 1200,
  height: 630,
  type: "image/png",
  alt: `${siteConfig.name} – ${siteConfig.tagline}`,
};

/** Build per-page metadata with canonical URL and Open Graph/Twitter tags. */
export function pageMetadata({
  title,
  description,
  path,
  article,
}: {
  title: string;
  description: string;
  path: string;
  /** Guides (Stage 8) are marked as articles, with their publish date (YYYY-MM-DD). */
  article?: { publishedTime: string };
}): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: siteConfig.name,
      locale: "en_US",
      images: [SHARE_IMAGE],
      ...(article
        ? { type: "article" as const, publishedTime: article.publishedTime, modifiedTime: article.publishedTime }
        : { type: "website" as const }),
    },
    twitter: { card: "summary_large_image", title, description, images: [SHARE_IMAGE] },
  };
}
