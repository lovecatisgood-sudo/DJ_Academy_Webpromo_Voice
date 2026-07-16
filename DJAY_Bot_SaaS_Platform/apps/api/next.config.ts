import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nextSecurityHeaders } from "../../config/next-security-headers";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  serverExternalPackages: ["@node-rs/argon2", "postgres"],
  transpilePackages: ["@djay/auth", "@djay/authorization", "@djay/db", "@djay/shared", "@djay/tenancy"],
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  headers: () => Promise.resolve(nextSecurityHeaders("api")),
};
export default nextConfig;
