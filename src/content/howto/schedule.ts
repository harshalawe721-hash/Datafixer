/** Date logic of the guide schedule (Stage 8), kept free of page content so it can be unit-tested. */

const DAY = 86_400_000;
/** India Standard Time has a fixed offset (no daylight saving). */
const IST_OFFSET_MS = 5.5 * 3_600_000;

/** When the guide at this position goes live: 12:30 pm India time (owner, 20 November 2026; first set to 12:30 am the same day), `index` days after `start` (YYYY-MM-DD). null if not scheduled. */
export function publishTime(index: number, start: string | null): number | null {
  if (!start || !/^\d{4}-\d{2}-\d{2}$/.test(start)) return null;
  const t = Date.parse(`${start}T12:30:00+05:30`);
  return Number.isNaN(t) ? null : t + index * DAY;
}

export function isPublished(index: number, start: string | null, now: number): boolean {
  const t = publishTime(index, start);
  return t !== null && t <= now;
}

/** The India-time calendar date (YYYY-MM-DD) of a moment. */
export function indiaDate(t: number): string {
  return new Date(t + IST_OFFSET_MS).toISOString().slice(0, 10);
}
