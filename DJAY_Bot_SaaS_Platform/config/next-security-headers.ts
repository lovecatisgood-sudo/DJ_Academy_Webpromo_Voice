type BrowserRealm = "api" | "public" | "tenant" | "platform";

export const contentSecurityPolicy = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

export const publicBuilderContentSecurityPolicy = contentSecurityPolicy.replace(
  "connect-src 'self'",
  "connect-src 'self' wss://api.x.ai",
);

export const publicBuilderPermissionsPolicy =
  "camera=(), geolocation=(), microphone=(self), payment=(), usb=()";

export function nextSecurityHeaders(realm: BrowserRealm) {
  const microphone = realm === "tenant" ? "(self)" : "()";
  const general = {
    source: "/:path*",
    headers: [
      { key: "Content-Security-Policy", value: contentSecurityPolicy },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Origin-Agent-Cluster", value: "?1" },
      { key: "Permissions-Policy", value: `camera=(), geolocation=(), microphone=${microphone}, payment=(), usb=()` },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-DNS-Prefetch-Control", value: "off" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
    ],
  };
  const oneTimeAccountRoutes: Partial<Record<BrowserRealm, readonly string[]>> = {
    public: ["/verify-email", "/invitations/accept"],
    tenant: ["/recovery/complete", "/ownership/accept", "/invitations/accept"],
  };
  const publicBuilder = realm === "public" ? [{
    source: "/build",
    headers: [
      { key: "Content-Security-Policy", value: publicBuilderContentSecurityPolicy },
      { key: "Permissions-Policy", value: publicBuilderPermissionsPolicy },
    ],
  }] : [];
  return [general, ...publicBuilder, ...(oneTimeAccountRoutes[realm] || []).map((source) => ({
    source,
    headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
  }))];
}
