import type { MetadataRoute } from "next";
import { tools } from "@/config/tools";
import { absoluteUrl } from "@/config/site";
import { publishedGuides } from "@/content/howto";

/** Rebuilt every hour so scheduled guides are listed on their publish day (Stage 8). */
export const revalidate = 3600;

export default function sitemap(): MetadataRoute.Sitemap {
  const guides = publishedGuides();
  const pages: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    ...tools.map((t) => ({ path: t.href, priority: 0.9 })),
    ...(guides.length ? [{ path: "/guides", priority: 0.7 }, ...guides.map((g) => ({ path: `/guides/${g.slug}`, priority: 0.7 }))] : []),
    { path: "/about", priority: 0.5 },
    { path: "/contact", priority: 0.4 },
    { path: "/privacy-policy", priority: 0.3 },
    { path: "/terms-of-service", priority: 0.3 },
  ];
  return pages.map(({ path, priority }) => ({
    url: absoluteUrl(path),
    changeFrequency: "monthly",
    priority,
  }));
}
