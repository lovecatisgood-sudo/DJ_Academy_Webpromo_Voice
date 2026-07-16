import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nextSecurityHeaders } from "../../config/next-security-headers";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@djay/authorization", "@djay/shared"],
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  headers: () => Promise.resolve(nextSecurityHeaders("tenant")),
  async rewrites() {
    const api = process.env.API_APP_URL || "http://127.0.0.1:3103";
    return [
      { source: "/public/:path*", destination: `${api}/public/:path*` },
      { source: "/tenant/:path*", destination: `${api}/tenant/:path*` },
    ];
  },
};

export default nextConfig;
