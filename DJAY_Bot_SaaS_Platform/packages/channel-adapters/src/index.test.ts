import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createLineChannelClient, createLineTokenCache, createSocialDeliveryClient, flowMessagesToSocialReplyInput, getLineBotInfo, getLineWebhookEndpoint, LineChannelError, lineAutoReplyBlocksBot, mintLineChannelToken, normalizeSocialWebhook, renderSocialReply, resolveLineAccessToken, setLineWebhookEndpoint, SocialDeliveryError, socialCredentialSchema, testLineWebhook, verifySocialChallenge, verifySocialSignature } from "./index";

const lineCredentials = { channel: "line" as const, channelAccessToken: "token-token-token-token", channelSecret: "secret-secret-secret-secret" };
const whatsappCredentials = { channel: "whatsapp" as const, accessToken: "token-token-token-token", appSecret: "secret-secret-secret-secret", verifyToken: "verify-verify-verify", phoneNumberId: "phone-1", businessAccountId: "business-1" };
const messengerCredentials = { channel: "messenger" as const, pageAccessToken: "page-token-token-token", appSecret: "secret-secret-secret-secret", verifyToken: "verify-verify-verify", pageId: "page-1" };

describe("social channel adapters", () => {
  it("verifies LINE and Meta signatures over the untouched body", () => {
    const body = Buffer.from('{"events":[]}');
    const lineSignature = createHmac("sha256", lineCredentials.channelSecret).update(body).digest("base64");
    const metaSignature = `sha256=${createHmac("sha256", whatsappCredentials.appSecret).update(body).digest("hex")}`;
    expect(verifySocialSignature("line", body, lineSignature, lineCredentials)).toBe(true);
    expect(verifySocialSignature("whatsapp", body, metaSignature, whatsappCredentials)).toBe(true);
    expect(verifySocialSignature("messenger", body, metaSignature, messengerCredentials)).toBe(true);
    expect(verifySocialSignature("whatsapp", Buffer.from("changed"), metaSignature, whatsappCredentials)).toBe(false);
    expect(verifySocialChallenge("whatsapp", "subscribe", "verify-verify-verify", "123", whatsappCredentials)).toBe("123");
    expect(verifySocialChallenge("messenger", "subscribe", "verify-verify-verify", "456", messengerCredentials)).toBe("456");
  });

  it("normalizes LINE, WhatsApp, and Messenger without executing unsupported media", () => {
    expect(normalizeSocialWebhook("line", { events: [{ type: "message", webhookEventId: "line-event", timestamp: 1000, source: { userId: "U1" }, replyToken: "reply", message: { id: "line-message", type: "text", text: "Hello" } }] })).toMatchObject([{ eventType: "inbound.message", externalEventId: "line-event", externalSubject: "U1", text: "Hello" }]);
    expect(normalizeSocialWebhook("whatsapp", { entry: [{ changes: [{ value: { messages: [{ from: "66123", id: "wa-message", timestamp: "2", type: "interactive", interactive: { button_reply: { title: "Book now" } } }], statuses: [{ recipient_id: "66123", id: "sent-1", timestamp: "3", status: "delivered" }] } }] }] })).toMatchObject([
      { eventType: "inbound.message", externalEventId: "wa-message", text: "Book now" },
      { eventType: "delivery.status", deliveryStatus: "delivered" },
    ]);
    expect(normalizeSocialWebhook("messenger", { entry: [{ messaging: [{ sender: { id: "PSID1" }, timestamp: 4, postback: { payload: "Consultation" } }] }] })).toHaveLength(1);
  });

  it("renders bounded channel-native replies and safe fallbacks", () => {
    const line = renderSocialReply("line", { recipient: "U1", replyToken: "reply", text: "Hello", quickReplies: Array.from({ length: 20 }, (_, index) => `Choice ${index}`) });
    expect(line).toMatchObject({ endpoint: "reply", body: { replyToken: "reply" } });
    const whatsapp = renderSocialReply("whatsapp", { recipient: "66123", text: "Hello", quickReplies: ["One", "Two", "Three", "Four"] });
    expect("bodies" in whatsapp && whatsapp.bodies[0]).toMatchObject({ type: "interactive" });
    const messenger = renderSocialReply("messenger", { recipient: "PSID1", text: "x".repeat(2500), quickReplies: [] });
    expect("bodies" in messenger && messenger.bodies).toHaveLength(2);
  });

  it("projects deterministic Flow messages into provider-safe social replies", () => {
    const optionId = "11111111-1111-4111-8111-111111111111";
    const projected = flowMessagesToSocialReplyInput({ recipient: "U1", replyToken: "reply", messages: [
      { type: "media", content: { label: "Menu", assetRef: "https://cdn.example.test/menu.jpg" } },
      { type: "card", content: { title: "Consultation", description: "30 minutes", actions: [{ label: "Book", url: "https://example.test/book" }] } },
      { type: "options", content: { text: "Choose", options: [{ id: optionId, label: "Sales" }] } },
    ] });
    expect(projected.text).toContain("https://example.test/book");
    expect(projected.quickReplies).toEqual([{ label: "Sales", payload: `djay_option:${optionId}` }]);
    expect(renderSocialReply("line", projected)).toMatchObject({ endpoint: "reply" });
    expect(renderSocialReply("messenger", projected)).toMatchObject({ endpoint: "messages" });
  });

  it("delivers LINE replies only through the configured HTTPS gateway", async () => {
    const requests: { url: string; authorization: string | null; body: unknown }[] = [];
    const client = createSocialDeliveryClient({
      lineApiBaseUrl: "https://api.line.test/", metaGraphBaseUrl: "https://graph.meta.test/v23.0/",
      fetchImpl: async (input, init) => {
        requests.push({
          url: String(input), authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(JSON.stringify({ sentMessages: [{ id: "line-message-1" }] }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    });
    const rendered = renderSocialReply("line", {
      recipient: "U1", replyToken: "reply-token", text: "Hello", quickReplies: ["Book"],
    });
    await expect(client.deliver("line", lineCredentials, rendered)).resolves.toEqual({
      externalMessageIds: ["line-message-1"],
      deliveredCount: 1,
    });
    expect(requests).toEqual([expect.objectContaining({
      url: "https://api.line.test/v2/bot/message/reply",
      authorization: `Bearer ${lineCredentials.channelAccessToken}`,
      body: expect.objectContaining({ replyToken: "reply-token" }),
    })]);
  });

  it("delivers WhatsApp service-window replies to the configured phone number only", async () => {
    const requests: { url: string; authorization: string | null; body: unknown }[] = [];
    const client = createSocialDeliveryClient({
      lineApiBaseUrl: "https://api.line.test/", metaGraphBaseUrl: "https://graph.meta.test/v23.0/",
      fetchImpl: async (input, init) => {
        requests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify({ messages: [{ id: "wamid.outbound-1" }] }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    });
    const rendered = renderSocialReply("whatsapp", {
      recipient: "66810000000", text: "Hello", quickReplies: ["Book"],
    });
    await expect(client.deliver("whatsapp", whatsappCredentials, rendered)).resolves.toEqual({
      externalMessageIds: ["wamid.outbound-1"],
      deliveredCount: 1,
    });
    expect(requests).toEqual([expect.objectContaining({
      url: "https://graph.meta.test/v23.0/phone-1/messages",
      authorization: `Bearer ${whatsappCredentials.accessToken}`,
      body: expect.objectContaining({ messaging_product: "whatsapp", to: "66810000000" }),
    })]);
  });

  it("reports durable WhatsApp progress when a later message part fails", async () => {
    let requestCount = 0;
    const client = createSocialDeliveryClient({
      lineApiBaseUrl: "https://api.line.test/", metaGraphBaseUrl: "https://graph.meta.test/v23.0/",
      fetchImpl: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(JSON.stringify({ messages: [{ id: "wamid.part-1" }] }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: { message: "limited" } }), {
          status: 429, headers: { "Content-Type": "application/json" },
        });
      },
    });
    const rendered = renderSocialReply("whatsapp", {
      recipient: "66810000000", text: "x".repeat(5000), quickReplies: [],
    });
    await expect(client.deliver("whatsapp", whatsappCredentials, rendered)).rejects.toMatchObject({
      name: "SocialDeliveryError", message: "channel_rate_limited",
      attemptedCount: 2, deliveredCount: 1, externalMessageIds: ["wamid.part-1"],
    } satisfies Partial<SocialDeliveryError>);
  });

  it("delivers Messenger replies through the configured Page token", async () => {
    const requests: { url: string; authorization: string | null; body: unknown }[] = [];
    const client = createSocialDeliveryClient({
      lineApiBaseUrl: "https://api.line.test/", metaGraphBaseUrl: "https://graph.meta.test/v23.0/",
      fetchImpl: async (input, init) => {
        requests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify({ message_id: "mid.outbound-1" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    });
    const rendered = renderSocialReply("messenger", {
      recipient: "PSID1", text: "Hello", quickReplies: ["Book"],
    });
    await expect(client.deliver("messenger", messengerCredentials, rendered)).resolves.toEqual({
      externalMessageIds: ["mid.outbound-1"], deliveredCount: 1,
    });
    expect(requests).toEqual([expect.objectContaining({
      url: "https://graph.meta.test/v23.0/me/messages",
      authorization: `Bearer ${messengerCredentials.pageAccessToken}`,
      body: expect.objectContaining({ recipient: { id: "PSID1" }, messaging_type: "RESPONSE" }),
    })]);
  });
});

const lineApiBaseUrl = "https://api.line.test/";
const lineMintedCredentials = { channel: "line" as const, channelId: "1656226113", channelSecret: "secret-secret-secret-secret" };
const botInfoPayload = {
  userId: "Ubot1", basicId: "@djay", premiumId: "djay", displayName: "DJAI Academy",
  pictureUrl: "https://profile.line-scdn.test/bot.png", chatMode: "bot", markAsReadMode: "auto",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

type RecordedCall = { url: string; method: string; authorization: string | null; contentType: string | null; body: string | null };

function recorder(respond: (call: RecordedCall) => Response | Promise<Response>) {
  const calls: RecordedCall[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    const call: RecordedCall = {
      url: String(input), method: init?.method ?? "GET",
      authorization: headers.get("authorization"), contentType: headers.get("content-type"),
      body: init?.body === undefined || init?.body === null ? null : String(init.body),
    };
    calls.push(call);
    return respond(call);
  };
  return { calls, fetchImpl };
}

describe("LINE server-side token minting", () => {
  it("mints a stateless channel access token from Channel ID + Channel Secret alone", async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse({ access_token: "minted-token-1", expires_in: 900, token_type: "Bearer" }));
    await expect(mintLineChannelToken(
      { channelId: lineMintedCredentials.channelId, channelSecret: lineMintedCredentials.channelSecret },
      { apiBaseUrl: lineApiBaseUrl, fetchImpl, cache: createLineTokenCache() },
    )).resolves.toEqual({ accessToken: "minted-token-1", expiresIn: 900 });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: "https://api.line.test/oauth2/v3/token", method: "POST",
      contentType: "application/x-www-form-urlencoded",
    });
    expect(Object.fromEntries(new URLSearchParams(calls[0]!.body ?? ""))).toEqual({
      grant_type: "client_credentials",
      client_id: lineMintedCredentials.channelId,
      client_secret: lineMintedCredentials.channelSecret,
    });
    // No JWT / assertion signing key is involved, and no Authorization header is sent.
    expect(calls[0]!.authorization).toBeNull();
  });

  it("raises a typed credential error when the Channel Secret is wrong", async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse({ error: "invalid_client", error_description: "client authentication failed" }, 400));
    const failure = await mintLineChannelToken(
      { channelId: lineMintedCredentials.channelId, channelSecret: "wrong-secret-wrong-secret" },
      { apiBaseUrl: lineApiBaseUrl, fetchImpl, cache: createLineTokenCache() },
    ).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(LineChannelError);
    expect(failure).toMatchObject({ name: "LineChannelError", code: "line_credentials_invalid", status: 400 });
    expect(calls).toHaveLength(1);
  });

  it("rejects a malformed token response instead of returning an empty token", async () => {
    const { fetchImpl } = recorder(() => jsonResponse({ access_token: "", expires_in: 900 }));
    await expect(mintLineChannelToken(
      { channelId: lineMintedCredentials.channelId, channelSecret: lineMintedCredentials.channelSecret },
      { apiBaseUrl: lineApiBaseUrl, fetchImpl, cache: createLineTokenCache() },
    )).rejects.toMatchObject({ code: "line_response_invalid" });
  });

  it("serves a cache hit without a second mint, and re-mints inside the safety margin", async () => {
    let clock = 1_000_000; let minted = 0;
    const cache = createLineTokenCache();
    const deps = {
      apiBaseUrl: lineApiBaseUrl, cache, now: () => clock,
      fetchImpl: (async () => { minted += 1; return jsonResponse({ access_token: `minted-token-${minted}`, expires_in: 900 }); }) as typeof fetch,
    };
    const input = { channelId: lineMintedCredentials.channelId, channelSecret: lineMintedCredentials.channelSecret };
    await expect(mintLineChannelToken(input, deps)).resolves.toEqual({ accessToken: "minted-token-1", expiresIn: 900 });

    clock += 100_000;
    await expect(mintLineChannelToken(input, deps)).resolves.toEqual({ accessToken: "minted-token-1", expiresIn: 800 });
    expect(minted).toBe(1);

    // A different secret for the same Channel ID must never reuse the cached token.
    await expect(mintLineChannelToken({ ...input, channelSecret: "another-secret-another" }, deps))
      .resolves.toMatchObject({ accessToken: "minted-token-2" });
    expect(minted).toBe(2);

    // 59s before expiry: inside the >=60s safety margin, so a fresh token is minted.
    clock = 1_000_000 + 900_000 - 59_000;
    await expect(mintLineChannelToken(input, deps)).resolves.toMatchObject({ accessToken: "minted-token-3" });
    expect(minted).toBe(3);
  });

  it("refuses a non-HTTPS LINE API base URL at construction", () => {
    expect(() => createLineChannelClient({ apiBaseUrl: "http://api.line.evil.test/" }))
      .toThrowError(expect.objectContaining({ code: "line_https_required" }));
  });
});

describe("LINE credential shapes", () => {
  it("accepts Channel ID + Secret and the legacy stored token, and rejects ambiguous credentials", () => {
    expect(socialCredentialSchema.parse(lineCredentials)).toMatchObject({ channel: "line", channelAccessToken: lineCredentials.channelAccessToken });
    expect(socialCredentialSchema.parse(lineMintedCredentials)).toMatchObject({ channel: "line", channelId: lineMintedCredentials.channelId });
    expect(socialCredentialSchema.safeParse({ channel: "line", channelSecret: lineCredentials.channelSecret }).success).toBe(false);
    expect(socialCredentialSchema.safeParse({ ...lineCredentials, channelId: lineMintedCredentials.channelId }).success).toBe(false);
  });

  it("mints for Channel ID credentials and passes stored tokens straight through", async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse({ access_token: "minted-token-1", expires_in: 900 }));
    const deps = { apiBaseUrl: lineApiBaseUrl, fetchImpl, cache: createLineTokenCache() };
    await expect(resolveLineAccessToken(lineMintedCredentials, deps)).resolves.toBe("minted-token-1");
    expect(calls).toHaveLength(1);
    await expect(resolveLineAccessToken(lineCredentials, deps)).resolves.toBe(lineCredentials.channelAccessToken);
    expect(calls).toHaveLength(1);
    await expect(resolveLineAccessToken(messengerCredentials, deps)).rejects.toThrowError("credential_channel_mismatch");
  });
});

describe("LINE channel operations", () => {
  it("reads bot identity for the pre-commit confirmation panel", async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(botInfoPayload));
    const info = await getLineBotInfo("minted-token-1", { apiBaseUrl: lineApiBaseUrl, fetchImpl });
    expect(info).toEqual(botInfoPayload);
    expect(calls).toEqual([expect.objectContaining({
      url: "https://api.line.test/v2/bot/info", method: "GET", authorization: "Bearer minted-token-1",
    })]);
  });

  it("surfaces chatMode 'chat' as its own condition, distinct from a transport failure", async () => {
    const { fetchImpl } = recorder(() => jsonResponse({ ...botInfoPayload, chatMode: "chat" }));
    const info = await getLineBotInfo("minted-token-1", { apiBaseUrl: lineApiBaseUrl, fetchImpl });
    expect(info.chatMode).toBe("chat");
    expect(lineAutoReplyBlocksBot(info)).toBe(true);
    expect(lineAutoReplyBlocksBot({ ...info, chatMode: "bot" })).toBe(false);

    const offline: typeof fetch = async () => { throw new Error("ECONNRESET"); };
    await expect(getLineBotInfo("minted-token-1", { apiBaseUrl: lineApiBaseUrl, fetchImpl: offline }))
      .rejects.toMatchObject({ name: "LineChannelError", code: "line_transport_failed" });
  });

  it("maps an expired token on /v2/bot/info to an authorization failure", async () => {
    const { fetchImpl } = recorder(() => jsonResponse({ message: "Authentication failed" }, 401));
    await expect(getLineBotInfo("stale-token", { apiBaseUrl: lineApiBaseUrl, fetchImpl }))
      .rejects.toMatchObject({ code: "line_authorization_failed", status: 401 });
  });

  it("sets the webhook endpoint on the merchant's behalf", async () => {
    const { calls, fetchImpl } = recorder(() => new Response(null, { status: 200 }));
    await expect(setLineWebhookEndpoint("minted-token-1", "https://api.djay.test/public/flowbot/social/line/key-1", { apiBaseUrl: lineApiBaseUrl, fetchImpl })).resolves.toBeUndefined();
    expect(calls).toEqual([expect.objectContaining({
      url: "https://api.line.test/v2/bot/channel/webhook/endpoint", method: "PUT",
      authorization: "Bearer minted-token-1", contentType: "application/json",
      body: JSON.stringify({ endpoint: "https://api.djay.test/public/flowbot/social/line/key-1" }),
    })]);
  });

  it("rejects an invalid webhook endpoint before any network call", async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse({}));
    const deps = { apiBaseUrl: lineApiBaseUrl, fetchImpl };
    for (const endpoint of ["http://api.djay.test/hook", "not-a-url", `https://api.djay.test/${"x".repeat(500)}`]) {
      await expect(setLineWebhookEndpoint("minted-token-1", endpoint, deps))
        .rejects.toMatchObject({ code: "line_webhook_endpoint_invalid" });
    }
    expect(calls).toHaveLength(0);
  });

  it("reads the webhook endpoint back because PUT does not promise to activate it", async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse({ endpoint: "https://api.djay.test/public/flowbot/social/line/key-1", active: false }));
    await expect(getLineWebhookEndpoint("minted-token-1", { apiBaseUrl: lineApiBaseUrl, fetchImpl }))
      .resolves.toEqual({ endpoint: "https://api.djay.test/public/flowbot/social/line/key-1", active: false });
    expect(calls).toEqual([expect.objectContaining({
      url: "https://api.line.test/v2/bot/channel/webhook/endpoint", method: "GET", authorization: "Bearer minted-token-1",
    })]);
    const missing = recorder(() => jsonResponse({ message: "not found" }, 404));
    await expect(getLineWebhookEndpoint("minted-token-1", { apiBaseUrl: lineApiBaseUrl, fetchImpl: missing.fetchImpl }))
      .rejects.toMatchObject({ code: "line_request_failed", status: 404 });
  });

  it("proves reachability, and reports an unreachable webhook as data rather than an exception", async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse({ success: true, timestamp: "2026-07-26T05:38:20.031Z", statusCode: 200, reason: "OK", detail: "200" }));
    await expect(testLineWebhook("minted-token-1", "https://api.djay.test/public/flowbot/social/line/key-1", { apiBaseUrl: lineApiBaseUrl, fetchImpl }))
      .resolves.toEqual({ success: true, timestamp: "2026-07-26T05:38:20.031Z", statusCode: 200, reason: "OK", detail: "200" });
    expect(calls).toEqual([expect.objectContaining({
      url: "https://api.line.test/v2/bot/channel/webhook/test", method: "POST",
      authorization: "Bearer minted-token-1", contentType: "application/json",
      body: JSON.stringify({ endpoint: "https://api.djay.test/public/flowbot/social/line/key-1" }),
    })]);

    const unreachable = recorder(() => jsonResponse({ success: false, timestamp: "2026-07-26T05:38:20.031Z", statusCode: -1, reason: "COULD_NOT_CONNECT", detail: "" }));
    await expect(testLineWebhook("minted-token-1", undefined, { apiBaseUrl: lineApiBaseUrl, fetchImpl: unreachable.fetchImpl }))
      .resolves.toEqual({ success: false, timestamp: "2026-07-26T05:38:20.031Z", statusCode: -1, reason: "COULD_NOT_CONNECT", detail: null });
    expect(unreachable.calls[0]).toMatchObject({ body: "{}" });

    const denied = recorder(() => jsonResponse({ message: "Authentication failed" }, 403));
    await expect(testLineWebhook("minted-token-1", undefined, { apiBaseUrl: lineApiBaseUrl, fetchImpl: denied.fetchImpl }))
      .rejects.toMatchObject({ code: "line_authorization_failed", status: 403 });
  });
});

describe("LINE delivery with minted credentials", () => {
  it("mints a token per delivery when the connection stores Channel ID + Secret", async () => {
    const { calls, fetchImpl } = recorder((call) => call.url.endsWith("/oauth2/v3/token")
      ? jsonResponse({ access_token: "minted-token-1", expires_in: 900 })
      : jsonResponse({ sentMessages: [{ id: "line-message-1" }] }));
    const client = createSocialDeliveryClient({
      lineApiBaseUrl, metaGraphBaseUrl: "https://graph.meta.test/v23.0/",
      fetchImpl, lineTokenCache: createLineTokenCache(),
    });
    const rendered = renderSocialReply("line", { recipient: "U1", replyToken: "reply-token", text: "Hello", quickReplies: [] });
    await expect(client.deliver("line", lineMintedCredentials, rendered)).resolves.toEqual({
      externalMessageIds: ["line-message-1"], deliveredCount: 1,
    });
    expect(calls.map((call) => call.url)).toEqual([
      "https://api.line.test/oauth2/v3/token",
      "https://api.line.test/v2/bot/message/reply",
    ]);
    expect(calls[1]!.authorization).toBe("Bearer minted-token-1");
  });

  it("reports a bad Channel Secret as a reauthorization requirement, not a delivery failure", async () => {
    const { fetchImpl } = recorder(() => jsonResponse({ error: "invalid_client" }, 400));
    const client = createSocialDeliveryClient({
      lineApiBaseUrl, metaGraphBaseUrl: "https://graph.meta.test/v23.0/",
      fetchImpl, lineTokenCache: createLineTokenCache(),
    });
    await expect(client.health("line", lineMintedCredentials)).rejects.toThrowError("credential_reauthorization_required");
  });

  it("keeps the stored-token health check on its existing error vocabulary", async () => {
    const { calls, fetchImpl } = recorder(() => jsonResponse(botInfoPayload));
    const client = createSocialDeliveryClient({
      lineApiBaseUrl, metaGraphBaseUrl: "https://graph.meta.test/v23.0/",
      fetchImpl, lineTokenCache: createLineTokenCache(),
    });
    await expect(client.health("line", lineCredentials)).resolves.toMatchObject({ status: "healthy" });
    expect(calls).toEqual([expect.objectContaining({
      url: "https://api.line.test/v2/bot/info", authorization: `Bearer ${lineCredentials.channelAccessToken}`,
    })]);
  });
});

describe("LINE token cache resilience", () => {
  const mintInput = { channelId: "1703190687602967", channelSecret: "0123456789abcdef0123456789abcdef" };

  function slowMint(delayMs: number) {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return jsonResponse({ access_token: "minted", expires_in: 900, token_type: "Bearer" });
    }) as unknown as typeof fetch;
    return { fetchImpl, calls: () => calls };
  }

  it("coalesces concurrent mints for one channel into a single request", async () => {
    const { fetchImpl, calls } = slowMint(10);
    const client = createLineChannelClient({ apiBaseUrl: lineApiBaseUrl, fetchImpl, cache: createLineTokenCache() });

    const tokens = await Promise.all(
      Array.from({ length: 20 }, () => client.mintChannelToken(mintInput)),
    );

    expect(calls()).toBe(1);
    expect(tokens.every((token) => token.accessToken === "minted")).toBe(true);
  });

  it("does not coalesce mints for different channels", async () => {
    const { fetchImpl, calls } = slowMint(5);
    const client = createLineChannelClient({ apiBaseUrl: lineApiBaseUrl, fetchImpl, cache: createLineTokenCache() });

    await Promise.all([
      client.mintChannelToken(mintInput),
      client.mintChannelToken({ ...mintInput, channelId: "1703190687602968" }),
    ]);

    expect(calls()).toBe(2);
  });

  it("releases the in-flight slot after a failure so the next attempt retries", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls === 1
        ? new Response("{}", { status: 401 })
        : jsonResponse({ access_token: "minted", expires_in: 900, token_type: "Bearer" });
    }) as unknown as typeof fetch;
    const client = createLineChannelClient({ apiBaseUrl: lineApiBaseUrl, fetchImpl, cache: createLineTokenCache() });

    await expect(client.mintChannelToken(mintInput)).rejects.toBeInstanceOf(LineChannelError);
    await expect(client.mintChannelToken(mintInput)).resolves.toMatchObject({ accessToken: "minted" });
    expect(calls).toBe(2);
  });

  it("drops a stale entry rather than retaining it forever", async () => {
    let clock = 1_000_000;
    let minted = 0;
    const fetchImpl = (async () => {
      minted += 1;
      return jsonResponse({ access_token: `minted-${minted}`, expires_in: 900, token_type: "Bearer" });
    }) as unknown as typeof fetch;
    const cache = createLineTokenCache();
    const client = createLineChannelClient({ apiBaseUrl: lineApiBaseUrl, fetchImpl, cache, now: () => clock });

    await client.mintChannelToken(mintInput);
    clock += 900_000;
    await client.mintChannelToken(mintInput);

    expect(minted).toBe(2);
  });

  it("bounds cache growth so a long-lived worker cannot leak entries", () => {
    const cache = createLineTokenCache();
    for (let index = 0; index < 5_100; index += 1) {
      cache.set(`key-${index}`, { accessToken: "t", expiresAtMs: 10_000_000 });
    }
    expect(cache.get("key-0")).toBeUndefined();
    expect(cache.get("key-5099")).toMatchObject({ accessToken: "t" });
  });
});
