type ApiEnvironmentUrlPolicy = Readonly<{
  NODE_ENV: "development" | "test" | "production";
  PUBLIC_APP_URL: string;
  TENANT_APP_URL: string;
  PLATFORM_APP_URL: string;
  AI_SOCIAL_LINE_API_BASE_URL: string;
  AI_SOCIAL_META_GRAPH_BASE_URL: string;
  VOICE_RUNTIME_ENABLED: "true" | "false";
  VOICE_GATEWAY_URL?: string | undefined;
}>;

function exactSecureOrigin(name: string, value: string) {
  const parsed = new URL(value);
  if (parsed.protocol !== "https:" || parsed.origin !== value) {
    throw new Error(`${name} must be an exact HTTPS origin in production.`);
  }
  return parsed;
}

function secureEndpoint(name: string, value: string) {
  if (new URL(value).protocol !== "https:") {
    throw new Error(`${name} must use HTTPS in production.`);
  }
}

export function assertApiProductionUrlPolicy(env: ApiEnvironmentUrlPolicy) {
  if (env.NODE_ENV !== "production") return;

  const realms = [
    ["PUBLIC_APP_URL", exactSecureOrigin("PUBLIC_APP_URL", env.PUBLIC_APP_URL)],
    ["TENANT_APP_URL", exactSecureOrigin("TENANT_APP_URL", env.TENANT_APP_URL)],
    ["PLATFORM_APP_URL", exactSecureOrigin("PLATFORM_APP_URL", env.PLATFORM_APP_URL)],
  ] as const;
  const hostnames = new Set(realms.map(([, url]) => url.hostname));
  if (hostnames.size !== realms.length) {
    throw new Error("Public, Tenant, and Platform production realms must use distinct hostnames.");
  }

  secureEndpoint("AI_SOCIAL_LINE_API_BASE_URL", env.AI_SOCIAL_LINE_API_BASE_URL);
  secureEndpoint("AI_SOCIAL_META_GRAPH_BASE_URL", env.AI_SOCIAL_META_GRAPH_BASE_URL);
  if (env.VOICE_RUNTIME_ENABLED === "true" && env.VOICE_GATEWAY_URL
    && new URL(env.VOICE_GATEWAY_URL).protocol !== "wss:") {
    throw new Error("VOICE_GATEWAY_URL must use WSS when Voice is enabled in production.");
  }
}
