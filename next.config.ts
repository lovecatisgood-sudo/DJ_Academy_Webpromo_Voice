import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), payment=()" },
];

/**
 * The booking pages carry a context token in the query string. Even though that token is now
 * opaque and no longer contains PII, it is still a capability: anyone holding it can prefill
 * and claim one booking. `no-referrer` stops it leaking to any third-party asset or outbound
 * link, which `strict-origin-when-cross-origin` would not do for same-origin navigations.
 */
const bookingHeaders = [
  ...securityHeaders.filter((header) => header.key !== "Referrer-Policy"),
  { key: "Referrer-Policy", value: "no-referrer" },
  // Booking URLs are single-use and personal; caches and proxies must not retain them.
  { key: "Cache-Control", value: "no-store, no-cache, must-revalidate, private" },
];

const hstsHeader = {
  key: "Strict-Transport-Security",
  value: "max-age=63072000; includeSubDomains; preload",
};

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    const isProduction = process.env.NODE_ENV === "production";
    const withHsts = (headers: typeof securityHeaders) =>
      isProduction ? [...headers, hstsHeader] : headers;

    // The two sources are deliberately non-overlapping. Next.js applies EVERY matching
    // entry, so a plain `/:path*` catch-all alongside `/book/:path*` would emit two
    // conflicting Referrer-Policy headers on booking pages and leave which one wins to
    // header-merging order. The negative lookahead excludes /book from the general rule.
    return [
      { source: "/book/:path*", headers: withHsts(bookingHeaders) },
      { source: "/:path((?!book/).*)", headers: withHsts(securityHeaders) },
    ];
  },
};

export default nextConfig;
