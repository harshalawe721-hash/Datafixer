import type { ToolId } from "@/config/tools";

/** A how-to guide (Stage 8). Rendered on the server only: unpublished guides never reach the browser. */
export interface HowToGuide {
  /** Address: /guides/{slug}. */
  slug: string;
  /** Visible heading (H1) and card title. */
  title: string;
  /** Search result title (the site name is added by the layout); keep it under ~60 characters. */
  seoTitle: string;
  /** Search result and link preview description, 70–160 characters. */
  description: string;
  /** One or two sentences for the Guides list. */
  summary: string;
  /** Last content update, YYYY-MM-DD. */
  updated: string;
  /** Tools the guide links to (the first is the main one). */
  tools: ToolId[];
  /** Slugs of related guides; only published ones are shown. */
  related: string[];
  /** Short answer shown at the top. */
  quickAnswer: React.ReactNode;
  /** The guide itself: sections with H2 headings. */
  body: React.ReactNode;
  faqs: { q: string; a: string }[];
}
