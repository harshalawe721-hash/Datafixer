import { ImageResponse } from "next/og";
import { siteConfig } from "@/config/site";

/**
 * Link preview image (Stage 7, decision 6): shown when a page is shared on
 * WhatsApp, Facebook, LinkedIn, X and similar apps. Drawn once at build time by
 * Next.js's built-in image generator (next/og), so nothing is added to the site.
 */
export const alt = `${siteConfig.name} – ${siteConfig.tagline}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LOGO =
  "data:image/svg+xml;base64," +
  Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#1e40af"/><path d="M8 10h16M8 16h7M8 22h7M14 10v12" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/><path d="m17.5 19 2.5 2.5 5-5.5" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  ).toString("base64");

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          background: "linear-gradient(135deg, #eff4ff 0%, #ffffff 55%, #e8efff 100%)",
          color: "#0f172a",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <img src={LOGO} width={96} height={96} alt="" />
          <div style={{ display: "flex", fontSize: 64, fontWeight: 800, letterSpacing: -1 }}>
            <span>Data</span>
            <span style={{ color: "#1e40af" }}>Fixer</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 60, fontWeight: 800, lineHeight: 1.1, letterSpacing: -1.5 }}>Find and fix spreadsheet problems.</div>
          <div style={{ fontSize: 32, color: "#475569", lineHeight: 1.35 }}>
            Check, clean, repair and convert Excel and CSV files — in your browser, nothing uploaded.
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, fontSize: 26, color: "#1e40af", fontWeight: 600 }}>
          <span>Free</span>
          <span style={{ color: "#94a3b8" }}>·</span>
          <span>No sign-up</span>
          <span style={{ color: "#94a3b8" }}>·</span>
          <span>Runs on your device</span>
        </div>
      </div>
    ),
    size,
  );
}
