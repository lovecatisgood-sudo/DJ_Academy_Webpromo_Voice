import { createLineChannelClient, createLineTokenCache } from "@djay/channel-adapters";
import { describe, expect, it } from "vitest";
import {
  connectLineChannel, lineConnectFailureMessage, lineConnectReasons, lineConnectStepLabel,
  lineConnectSteps, lineProviderWarning, resolveOnboardingLocale,
  type LineConnectDependencies, type LineConnectionCreateResult,
} from "./index";

const input = { channelId: "1656226113", channelSecret: "secret-secret-secret-secret" };
const botInfo = {
  userId: "Ubot1", basicId: "@djay", displayName: "DJAI Academy",
  pictureUrl: "https://profile.line-scdn.test/bot.png", chatMode: "bot", markAsReadMode: "auto",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type Overrides = Readonly<{
  token?: () => Response;
  info?: () => Response;
  setWebhook?: () => Response;
  getWebhook?: () => Response;
  test?: () => Response;
  create?: () => LineConnectionCreateResult;
}>;

function harness(overrides: Overrides = {}) {
  const calls: string[] = [];
  const discarded: string[] = [];
  const client = createLineChannelClient({
    apiBaseUrl: "https://api.line.test/", cache: createLineTokenCache(),
    fetchImpl: async (target, init) => {
      const url = String(target);
      const method = init?.method ?? "GET";
      if (url.endsWith("/oauth2/v3/token")) {
        calls.push("mint");
        return overrides.token?.() ?? jsonResponse({ access_token: "minted-token-1", expires_in: 900 });
      }
      if (url.endsWith("/v2/bot/info")) {
        calls.push("info");
        return overrides.info?.() ?? jsonResponse(botInfo);
      }
      if (url.endsWith("/v2/bot/channel/webhook/test")) {
        calls.push("test");
        return overrides.test?.() ?? jsonResponse({ success: true, statusCode: 200, reason: "OK", detail: "200" });
      }
      if (method === "PUT") {
        calls.push("setWebhook");
        return overrides.setWebhook?.() ?? jsonResponse({});
      }
      calls.push("getWebhook");
      return overrides.getWebhook?.() ?? jsonResponse({ endpoint: "https://api.djay.test/hook", active: true });
    },
  });
  const deps: LineConnectDependencies = {
    client,
    webhookUrl: (key) => `https://api.djay.test/public/flowbot/social/line/${key}`,
    createConnection: async () => {
      calls.push("create");
      return overrides.create?.() ?? { status: "created", connectionId: "connection-1", webhookKey: "djay_flow_social_key1" };
    },
    discardConnection: async (connectionId) => { discarded.push(connectionId); },
  };
  return { calls, discarded, deps };
}

describe("guided LINE connect — happy path", () => {
  it("runs every step in order and only reports connected when the probe returns 2xx", async () => {
    const { calls, discarded, deps } = harness();
    await expect(connectLineChannel(input, deps)).resolves.toEqual({
      status: "connected",
      connectionId: "connection-1",
      webhookKey: "djay_flow_social_key1",
      webhookUrl: "https://api.djay.test/public/flowbot/social/line/djay_flow_social_key1",
      bot: {
        userId: "Ubot1", basicId: "@djay", displayName: "DJAI Academy",
        pictureUrl: "https://profile.line-scdn.test/bot.png", chatMode: "bot",
      },
    });
    expect(calls).toEqual(["mint", "info", "create", "setWebhook", "getWebhook", "test"]);
    expect(discarded).toEqual([]);
  });

  it("sets the webhook to the URL built from the key the store minted", async () => {
    let sent: string | null = null;
    const { deps } = harness({ setWebhook: () => jsonResponse({}) });
    const wrapped: LineConnectDependencies = {
      ...deps,
      client: {
        ...deps.client,
        setWebhookEndpoint: async (token, endpoint) => { sent = endpoint; return deps.client.setWebhookEndpoint(token, endpoint); },
      },
    };
    await expect(connectLineChannel(input, wrapped)).resolves.toMatchObject({ status: "connected" });
    expect(sent).toBe("https://api.djay.test/public/flowbot/social/line/djay_flow_social_key1");
  });
});

describe("guided LINE connect — every failure branch names its step", () => {
  it("fails at mint on a wrong Channel Secret, before creating anything", async () => {
    const { calls, discarded, deps } = harness({ token: () => jsonResponse({ error: "invalid_client" }, 400) });
    await expect(connectLineChannel(input, deps)).resolves.toEqual({
      status: "failed", step: "mint", reason: "invalid_credentials", statusCode: null, rolledBack: false, bot: null,
    });
    expect(calls).toEqual(["mint"]);
    expect(discarded).toEqual([]);
  });

  it("distinguishes a rate limit and an unreachable LINE from bad credentials", async () => {
    const limited = harness({ token: () => jsonResponse({ message: "limited" }, 429) });
    await expect(connectLineChannel(input, limited.deps)).resolves.toMatchObject({ step: "mint", reason: "line_rate_limited" });

    const offline = harness();
    const deps: LineConnectDependencies = {
      ...offline.deps,
      client: { ...offline.deps.client, mintChannelToken: async () => { throw new TypeError("fetch failed"); } },
    };
    await expect(connectLineChannel(input, deps)).resolves.toMatchObject({ step: "mint", reason: "invalid_credentials" });
  });

  it("fails at bot_info when the Official Account cannot be read", async () => {
    const { calls, deps } = harness({ info: () => jsonResponse({ message: "boom" }, 500) });
    await expect(connectLineChannel(input, deps)).resolves.toMatchObject({
      step: "bot_info", reason: "bot_info_unavailable", rolledBack: false,
    });
    expect(calls).toEqual(["mint", "info"]);
  });

  it("refuses to create a connection while auto-reply would intercept messages", async () => {
    const { calls, discarded, deps } = harness({ info: () => jsonResponse({ ...botInfo, chatMode: "chat" }) });
    const result = await connectLineChannel(input, deps);
    expect(result).toMatchObject({ status: "failed", step: "auto_reply", reason: "auto_reply_enabled", rolledBack: false });
    // The identity is still returned so the merchant knows which account to fix.
    expect(result.bot).toMatchObject({ basicId: "@djay", chatMode: "chat" });
    expect(calls).toEqual(["mint", "info"]);
    expect(discarded).toEqual([]);
  });

  it("maps every store rejection to its own named reason", async () => {
    for (const [status, reason] of [
      ["conflict", "already_connected"], ["not_entitled", "not_entitled"],
      ["limit_reached", "limit_reached"], ["not_found", "bot_unavailable"],
    ] as const) {
      const { calls, discarded, deps } = harness({ create: () => ({ status }) });
      await expect(connectLineChannel(input, deps)).resolves.toMatchObject({
        step: "create_connection", reason, rolledBack: false,
      });
      expect(calls).toEqual(["mint", "info", "create"]);
      expect(discarded).toEqual([]);
    }
  });

  it("discards the connection when the webhook cannot be set", async () => {
    const { calls, discarded, deps } = harness({ setWebhook: () => jsonResponse({ message: "nope" }, 400) });
    await expect(connectLineChannel(input, deps)).resolves.toMatchObject({
      step: "set_webhook", reason: "webhook_set_failed", rolledBack: true,
    });
    expect(calls).toEqual(["mint", "info", "create", "setWebhook"]);
    expect(discarded).toEqual(["connection-1"]);
  });

  it("discards the connection when Use webhook is off", async () => {
    const { calls, discarded, deps } = harness({
      getWebhook: () => jsonResponse({ endpoint: "https://api.djay.test/hook", active: false }),
    });
    await expect(connectLineChannel(input, deps)).resolves.toMatchObject({
      step: "confirm_webhook", reason: "webhook_inactive", rolledBack: true,
    });
    expect(calls).toEqual(["mint", "info", "create", "setWebhook", "getWebhook"]);
    expect(discarded).toEqual(["connection-1"]);
  });

  it("discards the connection when LINE cannot reach us, and reports the HTTP status", async () => {
    const { discarded, deps } = harness({
      test: () => jsonResponse({ success: false, statusCode: -1, reason: "COULD_NOT_CONNECT" }),
    });
    const result = await connectLineChannel(input, deps);
    expect(result).toMatchObject({ step: "test_webhook", reason: "webhook_unreachable", statusCode: -1, rolledBack: true });
    expect(discarded).toEqual(["connection-1"]);
  });

  it("treats a reachable-but-failing endpoint as unreachable rather than connected", async () => {
    const { discarded, deps } = harness({
      test: () => jsonResponse({ success: true, statusCode: 404, reason: "Not Found" }),
    });
    await expect(connectLineChannel(input, deps)).resolves.toMatchObject({
      status: "failed", step: "test_webhook", reason: "webhook_unreachable", statusCode: 404, rolledBack: true,
    });
    expect(discarded).toEqual(["connection-1"]);
  });
});

describe("merchant-facing messages", () => {
  it("defaults to Thai and offers English, with no reason or step left untranslated", () => {
    expect(resolveOnboardingLocale(null)).toBe("th");
    expect(resolveOnboardingLocale("th")).toBe("th");
    expect(resolveOnboardingLocale("en")).toBe("en");
    for (const locale of ["th", "en"] as const) {
      expect(lineProviderWarning[locale].length).toBeGreaterThan(20);
      for (const step of lineConnectSteps) expect(lineConnectStepLabel(step, locale).length).toBeGreaterThan(2);
      for (const reason of lineConnectReasons) {
        const message = lineConnectFailureMessage({ reason, statusCode: 404 }, locale);
        expect(message.length).toBeGreaterThan(10);
        expect(message).not.toContain("{statusCode}");
      }
    }
  });

  it("interpolates the HTTP status LINE reported, and never leaves a placeholder", () => {
    const failure = {
      status: "failed" as const, step: "test_webhook" as const, reason: "webhook_unreachable" as const,
      statusCode: 502, rolledBack: true, bot: null,
    };
    expect(lineConnectFailureMessage(failure, "en")).toContain("HTTP 502");
    expect(lineConnectFailureMessage(failure, "th")).toContain("HTTP 502");
    expect(lineConnectFailureMessage({ ...failure, statusCode: null }, "en")).toContain("HTTP ?");
  });

  it("keeps Thai and English message sets exactly parallel", () => {
    for (const reason of lineConnectReasons) {
      const th = lineConnectFailureMessage({ reason, statusCode: 1 }, "th");
      const en = lineConnectFailureMessage({ reason, statusCode: 1 }, "en");
      expect(th).not.toBe(en);
    }
  });
});
