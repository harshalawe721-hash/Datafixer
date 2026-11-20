/**
 * Stage 8 guides and their publishing schedule (owner, 20 November 2026: one guide per day,
 * decision 2A: from the day after Stage 8 is approved, at 00:00 India time).
 *
 * A guide that isn't published yet doesn't exist on the site: its page answers 404 and it is
 * left out of the Guides list, the sitemap, the menus and every "Related guides" list. Pages
 * that show guides are rebuilt every hour (revalidate = 3600), so each guide appears within an
 * hour after its publish time without anyone posting it.
 */
import type { HowToGuide } from "./types";
import { csvOpensInOneColumn } from "./csv-opens-in-one-column";
import { indiaDate, isPublished, publishTime } from "./schedule";

export type { HowToGuide } from "./types";

/** Every guide, in publishing order: guide n is published n − 1 days after the start date. */
export const GUIDES: readonly HowToGuide[] = [csvOpensInOneColumn];

/**
 * First publishing day (YYYY-MM-DD, India time). null = not scheduled yet: no guide is
 * published. Set when the owner approves Stage 8.
 */
export const GUIDES_START_DATE: string | null = null;

/**
 * Local test switches, ignored on Vercel: GUIDES_CLOCK sets the time the schedule uses
 * (an ISO date), GUIDES_START sets the start date, GUIDES_SHOW_ALL=1 shows every guide.
 */
function testEnv(name: string): string | undefined {
  return process.env.VERCEL ? undefined : process.env[name]?.trim() || undefined;
}

export function guidesNow(): number {
  const clock = testEnv("GUIDES_CLOCK");
  return clock ? Date.parse(clock) : Date.now();
}

function startDate(): string | null {
  return testEnv("GUIDES_START") ?? GUIDES_START_DATE;
}

/** Published guides at time `now`, in publishing order. */
export function publishedGuides(now: number = guidesNow()): HowToGuide[] {
  if (testEnv("GUIDES_SHOW_ALL") === "1") return [...GUIDES];
  const start = startDate();
  return GUIDES.filter((_, i) => isPublished(i, start, now));
}

export function getPublishedGuide(slug: string, now: number = guidesNow()): HowToGuide | undefined {
  return publishedGuides(now).find((g) => g.slug === slug);
}

/** The date shown as "Updated": the later of the publish day and the last content update (YYYY-MM-DD). */
export function displayDate(guide: HowToGuide): string {
  const i = GUIDES.indexOf(guide);
  const t = publishTime(i, startDate());
  if (t === null) return guide.updated;
  const published = indiaDate(t);
  return published > guide.updated ? published : guide.updated;
}

/** Published guides that link to a tool (for the tool page's "Related guides"). */
export function guidesForTool(toolId: HowToGuide["tools"][number], now: number = guidesNow()): HowToGuide[] {
  return publishedGuides(now).filter((g) => g.tools.includes(toolId));
}
