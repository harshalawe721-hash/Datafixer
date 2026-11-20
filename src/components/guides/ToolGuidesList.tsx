"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import type { ToolId } from "@/config/tools";

type FeedGuide = { slug: string; title: string; summary: string; tools: ToolId[] };

/**
 * "Guides for this tool" on a tool page (Stage 8). Loads the published guides from
 * /guides/feed.json (rebuilt hourly) and shows those linked to this tool; shows nothing
 * until loaded, or if there are none or the list can't be loaded.
 */
export function ToolGuidesList({ toolId }: { toolId: ToolId }) {
  const [guides, setGuides] = useState<FeedGuide[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/guides/feed.json", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<FeedGuide[]>) : []))
      .then((all) => active && setGuides(all.filter((g) => g.tools.includes(toolId))))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [toolId]);

  if (guides.length === 0) return null;
  return (
    <section aria-labelledby="tool-guides-heading" className="mx-auto mt-6 mb-12 max-w-3xl border-t border-line pt-10">
      <h2 id="tool-guides-heading" className="flex items-center gap-2 text-2xl font-bold">
        <BookOpen className="size-5 text-primary" aria-hidden="true" />
        Guides for this tool
      </h2>
      <ul className="mt-4 space-y-3">
        {guides.map((g) => (
          <li key={g.slug}>
            <Link href={`/guides/${g.slug}`} prefetch={false} className="font-medium text-primary hover:underline">
              {g.title}
            </Link>
            <p className="text-sm text-muted">{g.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
