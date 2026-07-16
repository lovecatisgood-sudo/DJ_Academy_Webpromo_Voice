import { resolveApplicationOrigin } from "@djay/shared/navigation";

export const tenantApplicationEnvironment = Object.freeze({
  publicAppUrl: resolveApplicationOrigin({
    name: "NEXT_PUBLIC_PUBLIC_APP_URL",
    configured: process.env.NEXT_PUBLIC_PUBLIC_APP_URL,
    fallback: "https://djaybot.com",
    production: process.env.NODE_ENV === "production",
  }),
});
