import { describe, expect, it } from "vitest";
import { assertApiProductionUrlPolicy } from "./environment-policy";

const production = {
  NODE_ENV: "production",
  PUBLIC_APP_URL: "https://djaybot.test",
  TENANT_APP_URL: "https://app.djaybot.test",
  PLATFORM_APP_URL: "https://platform.djaybot.test",
  AI_SOCIAL_LINE_API_BASE_URL: "https://api.line.test/",
  AI_SOCIAL_META_GRAPH_BASE_URL: "https://graph.meta.test/v23.0/",
  VOICE_RUNTIME_ENABLED: "true",
  VOICE_GATEWAY_URL: "wss://voice.djaybot.test/v1/connect",
} as const;

describe("API production URL policy", () => {
  it("accepts isolated HTTPS browser realms and secure public-provider endpoints", () => {
    expect(() => assertApiProductionUrlPolicy(production)).not.toThrow();
  });

  it.each([
    ["insecure public realm", { PUBLIC_APP_URL: "http://djaybot.test" }],
    ["path-bearing Tenant realm", { TENANT_APP_URL: "https://app.djaybot.test/workspace" }],
    ["credential-bearing Platform realm", { PLATFORM_APP_URL: "https://user:secret@platform.djaybot.test" }],
    ["insecure LINE endpoint", { AI_SOCIAL_LINE_API_BASE_URL: "http://api.line.test/" }],
    ["insecure Meta endpoint", { AI_SOCIAL_META_GRAPH_BASE_URL: "http://graph.meta.test/v23.0/" }],
    ["insecure Voice gateway", { VOICE_GATEWAY_URL: "ws://voice.djaybot.test/v1/connect" }],
  ])("rejects %s", (_name, override) => {
    expect(() => assertApiProductionUrlPolicy({ ...production, ...override })).toThrow();
  });

  it("rejects browser realms whose host-only cookies would share a hostname", () => {
    expect(() => assertApiProductionUrlPolicy({
      ...production,
      TENANT_APP_URL: "https://shared.djaybot.test",
      PLATFORM_APP_URL: "https://shared.djaybot.test:8443",
    })).toThrow(/distinct hostnames/);
  });

  it("does not impose production transport rules on local development", () => {
    expect(() => assertApiProductionUrlPolicy({
      ...production,
      NODE_ENV: "development",
      PUBLIC_APP_URL: "http://localhost:3100",
      TENANT_APP_URL: "http://localhost:3101",
      PLATFORM_APP_URL: "http://localhost:3102",
      VOICE_GATEWAY_URL: "ws://localhost:8080/v1/connect",
    })).not.toThrow();
  });
});
