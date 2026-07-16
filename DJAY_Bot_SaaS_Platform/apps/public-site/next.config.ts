import type { NextConfig } from "next";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { nextSecurityHeaders } from "../../config/next-security-headers";
import "./lib/application-environment";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  transpilePackages: ["@djay/shared"],
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  headers: () => Promise.resolve(nextSecurityHeaders("public")),
};

export default nextConfig;
