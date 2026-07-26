import { createLineChannelClient, createLineTokenCache, LineChannelError } from "@djay/channel-adapters";
import { describe, expect, it } from "vitest";
import { evaluateLineChannelHealth, inspectLineChannelHealth, safeSocialHealthError } from "./social-health";

const botInfo = {
  userId: "Ubot1", basicId: "@djay", displayName: "DJAI Academy",
  chatMode: "bot" as const, markAsReadMode: "auto" as const,
};
const lineCredentials = { channel: "line" as const, channelId: "1656226113", channelSecret: "secret-secret-secret-secret" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function lineClient(respond: (url: string) => Response) {
  return createLineChannelClient({
    apiBaseUrl: "https://api.line.test/", cache: createLineTokenCache(),
    fetchImpl: async (input) => respond(String(input)),
  });
}

function route(url: string) {
  if (url.endsWith("/oauth2/v3/token")) return jsonResponse({ access_token: "minted-token-1", expires_in: 900 });
  return null;
}

describe("social channel health vocabulary", () => {
  it("keeps the AI Chat error vocabulary and never leaks an unmapped code", () => {
    expect(safeSocialHealthError(new Error("credential_reauthorization_required"))).toBe("credential_reauthorization_required");
    expect(safeSocialHealthError(new Error("channel_rate_limited"))).toBe("channel_rate_limited");
    expect(safeSocialHealthError(new Error("channel_delivery_failed"))).toBe("channel_delivery_failed");
    expect(safeSocialHealthError(new Error("relation \"tenancy.x\" does not exist"))).toBe("channel_health_failed");
    expect(safeSocialHealthError("not an error")).toBe("channel_health_failed");
  });

  it("translates LINE client failures through the delivery mapping, not a parallel one", () => {
    expect(safeSocialHealthError(new LineChannelError("line_credentials_invalid", 400))).toBe("credential_reauthorization_required");
    expect(safeSocialHealthError(new LineChannelError("line_authorization_failed", 401))).toBe("credential_reauthorization_required");
    expect(safeSocialHealthError(new LineChannelError("line_rate_limited", 429))).toBe("channel_rate_limited");
    expect(safeSocialHealthError(new LineChannelError("line_transport_failed"))).toBe("channel_delivery_failed");
  });
});

describe("LINE channel health evaluation", () => {
  it("is healthy only when auto-reply is off and the webhook is active", () => {
    expect(evaluateLineChannelHealth(botInfo, { endpoint: "https://api.djay.test/hook", active: true })).toEqual({
      healthy: true, chatMode: "bot", autoReplyBlocksBot: false, webhookConfigured: true,
      webhookEndpointActive: true, displayName: "DJAI Academy", basicId: "@djay",
    });
  });

  it("reports auto-reply interception as its own visible condition", () => {
    const result = evaluateLineChannelHealth({ ...botInfo, chatMode: "chat" }, { endpoint: "https://api.djay.test/hook", active: true });
    expect(result).toMatchObject({ healthy: false, chatMode: "chat", autoReplyBlocksBot: true, webhookEndpointActive: true });
  });

  it("reports an inactive and an entirely unset webhook distinctly", () => {
    expect(evaluateLineChannelHealth(botInfo, { endpoint: "https://api.djay.test/hook", active: false }))
      .toMatchObject({ healthy: false, autoReplyBlocksBot: false, webhookConfigured: true, webhookEndpointActive: false });
    expect(evaluateLineChannelHealth(botInfo, null))
      .toMatchObject({ healthy: false, webhookConfigured: false, webhookEndpointActive: false });
  });
});

describe("LINE channel health inspection", () => {
  it("mints, reads bot info, and reads the webhook endpoint back", async () => {
    const seen: string[] = [];
    const client = lineClient((url) => {
      seen.push(url);
      return route(url) ?? (url.endsWith("/v2/bot/info")
        ? jsonResponse(botInfo)
        : jsonResponse({ endpoint: "https://api.djay.test/hook", active: true }));
    });
    await expect(inspectLineChannelHealth(client, lineCredentials)).resolves.toMatchObject({
      healthy: true, chatMode: "bot", webhookEndpointActive: true,
    });
    expect(seen).toEqual([
      "https://api.line.test/oauth2/v3/token",
      "https://api.line.test/v2/bot/info",
      "https://api.line.test/v2/bot/channel/webhook/endpoint",
    ]);
  });

  it("treats a 404 from the webhook endpoint as 'never configured', not a fault", async () => {
    const client = lineClient((url) => route(url) ?? (url.endsWith("/v2/bot/info")
      ? jsonResponse(botInfo)
      : jsonResponse({ message: "not found" }, 404)));
    await expect(inspectLineChannelHealth(client, lineCredentials)).resolves.toMatchObject({
      healthy: false, webhookConfigured: false, webhookEndpointActive: false,
    });
  });

  it("propagates a real authorization failure so the route can flag reauthorization", async () => {
    const client = lineClient((url) => route(url) ?? jsonResponse({ message: "Authentication failed" }, 401));
    const failure = await inspectLineChannelHealth(client, lineCredentials).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(LineChannelError);
    expect(safeSocialHealthError(failure)).toBe("credential_reauthorization_required");
  });

  it("propagates a non-404 webhook read failure rather than reporting a clean bill of health", async () => {
    const client = lineClient((url) => route(url) ?? (url.endsWith("/v2/bot/info")
      ? jsonResponse(botInfo)
      : jsonResponse({ message: "limited" }, 429)));
    await expect(inspectLineChannelHealth(client, lineCredentials)).rejects.toMatchObject({ code: "line_rate_limited" });
  });
});
