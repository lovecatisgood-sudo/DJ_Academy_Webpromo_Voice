import { resolveApplicationOrigin } from "@djay/shared/navigation";

export const publicApplicationEnvironment = Object.freeze({
  tenantAppUrl: resolveApplicationOrigin({
    name: "TENANT_APP_URL",
    configured: process.env.TENANT_APP_URL,
    fallback: "https://app.djaybot.com",
    production: process.env.NODE_ENV === "production",
  }),
});
