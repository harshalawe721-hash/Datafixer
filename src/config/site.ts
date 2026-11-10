/**
 * Central site configuration. Values that differ per deployment come from
 * environment variables so nothing here needs editing to go live.
 */
const rawUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "http://localhost:3000";

export const siteConfig = {
  name: "DataFixer",
  tagline: "Find Spreadsheet Problems. Fix Them. Get Better Data.",
  description:
    "Free online tools to find and fix spreadsheet problems. Detect duplicates, missing data and formatting issues in Excel and CSV files, clean them, and download better data.",
  url: rawUrl.replace(/\/+$/, ""),
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "",
  /** Maximum accepted upload size. Files are processed in the browser, so this protects the device. */
  maxFileSizeBytes: 50 * 1024 * 1024,
  acceptedExtensions: [".xlsx", ".xls", ".csv"] as const,
} as const;

export function absoluteUrl(path = "/"): string {
  return `${siteConfig.url}${path.startsWith("/") ? path : `/${path}`}`;
}
