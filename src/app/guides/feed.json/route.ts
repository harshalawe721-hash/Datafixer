import { publishedGuides } from "@/content/howto";

/**
 * Published guides as a small JSON list (Stage 8), for the "Guides for this tool" list on the
 * tool pages. Rebuilt every hour like the guide pages, so a guide appears there on its publish day
 * while the tool pages themselves stay fully static.
 */
export const revalidate = 3600;

export function GET() {
  return Response.json(
    publishedGuides().map(({ slug, title, summary, tools }) => ({ slug, title, summary, tools })),
  );
}
