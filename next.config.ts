import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
];

/**
 * Content-Security-Policy (production only; the dev server needs eval and
 * websockets). The key privacy guarantee is `connect-src 'self'`: even if a bug
 * or injected script tried, the browser would refuse to send data to any other
 * host. Workers may only load from this site. 'unsafe-inline' is needed for
 * Next.js's inline bootstrap scripts and the theme script on static pages.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

if (process.env.NODE_ENV === "production") {
  securityHeaders.push({ key: "Content-Security-Policy", value: contentSecurityPolicy });
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Diagnostics page is for testing only: keep it out of search engines.
      { source: "/diagnostics", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
