/**
 * Central site configuration. Values that differ per deployment come from
 * environment variables so nothing here needs editing to go live.
 */
/**
 * The site's public address, used for canonical links, the sitemap and link
 * previews (Open Graph images must be absolute URLs for WhatsApp, Facebook…).
 * NEXT_PUBLIC_SITE_URL wins when set. Otherwise, on Vercel, the address Vercel
 * provides at build time: the production domain for production deployments,
 * the branch's preview address for previews. localhost only on a developer machine.
 */
function vercelUrl(): string | undefined {
  const host =
    process.env.VERCEL_ENV === "production"
      ? process.env.VERCEL_PROJECT_PRODUCTION_URL
      : process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  return host ? `https://${host.replace(/^https?:\/\//, "")}` : undefined;
}
const rawUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || vercelUrl() || "http://localhost:3000";

export const siteConfig = {
  name: "DataFixer",
  tagline: "Find Spreadsheet Problems. Fix Them. Get Better Data.",
  description:
    "Free online tools to find and fix spreadsheet problems. Detect duplicates, missing data and formatting issues in Excel and CSV files, clean them, and download better data.",
  url: rawUrl.replace(/\/+$/, ""),
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "",
  /**
   * Maximum accepted file size: 150 MB (150 × 1024 × 1024 = 157,286,400 bytes).
   * A file of exactly this size is accepted; one byte more is rejected.
   * This is an upper bound on what we accept, not a promise that every file of
   * this size can be processed on every device (processing happens locally).
   */
  maxFileSizeBytes: 157_286_400,
  /** Files above this size get a "large file" advisory (slower, more memory). */
  largeFileWarningBytes: 50 * 1024 * 1024,
  acceptedExtensions: [".xlsx", ".xls", ".csv"] as const,
} as const;

export function absoluteUrl(path = "/"): string {
  return `${siteConfig.url}${path.startsWith("/") ? path : `/${path}`}`;
}
