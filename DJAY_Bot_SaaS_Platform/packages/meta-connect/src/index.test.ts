import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createMetaConnectClient, parseSignedRequest, signOAuthState, verifyAppSignature,
  verifyOAuthState, verifyWebhookChallenge, type MetaConnectConfig,
} from "./index";

const config: MetaConnectConfig = {
  appId: "1234567890",
  appSecret: "app-secret-xyz",
  loginConfigId: "cfg-789",
  graphBaseUrl: "https://graph.facebook.test/v23.0",
  loginDialogBaseUrl: "https://www.facebook.test/v23.0/dialog/oauth",
  oauthRedirectUri: "https://api.djbot.test/integrations/meta/oauth/callback",
};

type StubResult = { status?: number; body?: unknown };
function stubFetch(handler: (url: URL, init: RequestInit) => StubResult): typeof fetch {
  return (async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = input instanceof URL ? input : new URL(String(input));
    const { status = 200, body = {} } = handler(url, init ?? {});
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as unknown as typeof fetch;
}
const noopFetch = stubFetch(() => ({}));

describe("meta-connect config guard", () => {
  it("rejects a non-HTTPS graph base URL", () => {
    expect(() => createMetaConnectClient({ ...config, graphBaseUrl: "http://graph.facebook.test/v23.0" }, { fetchImpl: noopFetch }))
      .toThrow("meta_connect_https_required");
  });
  it("allows localhost for local development", () => {
    expect(() => createMetaConnectClient({ ...config, graphBaseUrl: "http://localhost:8080/v23.0",
      loginDialogBaseUrl: "http://localhost:8080/dialog/oauth", oauthRedirectUri: "http://localhost:3000/cb" }, { fetchImpl: noopFetch }))
      .not.toThrow();
  });
});

describe("buildLoginUrl", () => {
  it("targets the dialog base with client_id, config_id, redirect_uri, response_type and state", () => {
    const client = createMetaConnectClient(config, { fetchImpl: noopFetch });
    const url = new URL(client.buildLoginUrl("state-token-abc"));
    expect(url.origin + url.pathname).toBe("https://www.facebook.test/v23.0/dialog/oauth");
    expect(url.searchParams.get("client_id")).toBe("1234567890");
    expect(url.searchParams.get("config_id")).toBe("cfg-789");
    expect(url.searchParams.get("redirect_uri")).toBe(config.oauthRedirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("state-token-abc");
  });
});

describe("OAuth state signing", () => {
  const payload = { tenantId: randomUUID(), botId: randomUUID(), membershipId: randomUUID(), nonce: "nonce-1", exp: 2000 };

  it("round-trips a valid, unexpired token", () => {
    const token = signOAuthState(payload, "state-secret");
    expect(verifyOAuthState(token, "state-secret", 1000)).toEqual(payload);
  });
  it("rejects an expired token", () => {
    const token = signOAuthState(payload, "state-secret");
    expect(verifyOAuthState(token, "state-secret", 2000)).toBeNull();
    expect(verifyOAuthState(token, "state-secret", 3000)).toBeNull();
  });
  it("rejects a wrong secret", () => {
    const token = signOAuthState(payload, "state-secret");
    expect(verifyOAuthState(token, "other-secret", 1000)).toBeNull();
  });
  it("rejects a tampered token", () => {
    const token = signOAuthState(payload, "state-secret");
    expect(verifyOAuthState(`${token}x`, "state-secret", 1000)).toBeNull();
    expect(verifyOAuthState("not-a-token", "state-secret", 1000)).toBeNull();
  });
});

describe("token exchange", () => {
  it("exchanges a code for a user token against the graph oauth endpoint", async () => {
    let captured: URL | null = null;
    const client = createMetaConnectClient(config, { fetchImpl: stubFetch((url) => { captured = url; return { body: { access_token: "USER_TOKEN" } }; }) });
    const token = await client.exchangeCodeForUserToken("the-code");
    expect(token).toBe("USER_TOKEN");
    expect(captured!.pathname).toBe("/v23.0/oauth/access_token");
    expect(captured!.searchParams.get("code")).toBe("the-code");
    expect(captured!.searchParams.get("client_id")).toBe("1234567890");
    expect(captured!.searchParams.get("client_secret")).toBe("app-secret-xyz");
    expect(captured!.searchParams.get("redirect_uri")).toBe(config.oauthRedirectUri);
  });
  it("exchanges a short-lived token for a long-lived token", async () => {
    let captured: URL | null = null;
    const client = createMetaConnectClient(config, { fetchImpl: stubFetch((url) => { captured = url; return { body: { access_token: "LONG_TOKEN" } }; }) });
    const token = await client.exchangeForLongLivedToken("SHORT");
    expect(token).toBe("LONG_TOKEN");
    expect(captured!.searchParams.get("grant_type")).toBe("fb_exchange_token");
    expect(captured!.searchParams.get("fb_exchange_token")).toBe("SHORT");
  });
  it("throws when the response lacks an access_token", async () => {
    const client = createMetaConnectClient(config, { fetchImpl: stubFetch(() => ({ body: {} })) });
    await expect(client.exchangeCodeForUserToken("x")).rejects.toThrow("meta_token_exchange_failed");
  });
  it("maps 401 to a reauthorization error", async () => {
    const client = createMetaConnectClient(config, { fetchImpl: stubFetch(() => ({ status: 401, body: { error: {} } })) });
    await expect(client.exchangeCodeForUserToken("x")).rejects.toThrow("meta_authorization_failed");
  });
});

describe("listPages", () => {
  it("maps granted pages and drops malformed entries", async () => {
    let captured: URL | null = null;
    const client = createMetaConnectClient(config, { fetchImpl: stubFetch((url) => { captured = url; return { body: {
      data: [{ id: "P1", name: "Shop", access_token: "PT1" }, { id: "bad-no-token" }, { name: "no id", access_token: "x" }],
    } }; }) });
    const pages = await client.listPages("USER_TOKEN");
    expect(pages).toEqual([{ id: "P1", name: "Shop", accessToken: "PT1" }]);
    expect(captured!.pathname).toBe("/v23.0/me/accounts");
    expect(captured!.searchParams.get("fields")).toBe("id,name,access_token");
    expect(captured!.searchParams.get("access_token")).toBe("USER_TOKEN");
  });
  it("returns empty when data is absent", async () => {
    const client = createMetaConnectClient(config, { fetchImpl: stubFetch(() => ({ body: {} })) });
    expect(await client.listPages("USER_TOKEN")).toEqual([]);
  });
});

describe("subscribePage / unsubscribePage", () => {
  it("POSTs to {pageId}/subscribed_apps with the messenger fields and the Page bearer token", async () => {
    let captured: URL | null = null; let method: string | undefined; let auth: string | undefined;
    const client = createMetaConnectClient(config, { fetchImpl: stubFetch((url, init) => {
      captured = url; method = init.method; auth = (init.headers as Record<string, string>)?.Authorization; return { body: { success: true } };
    }) });
    await client.subscribePage("PAGE123", "PT1");
    expect(method).toBe("POST");
    expect(captured!.pathname).toBe("/v23.0/PAGE123/subscribed_apps");
    expect(captured!.searchParams.get("subscribed_fields")).toContain("messages");
    expect(auth).toBe("Bearer PT1");
  });
  it("throws when the subscription response reports success:false", async () => {
    const client = createMetaConnectClient(config, { fetchImpl: stubFetch(() => ({ body: { success: false } })) });
    await expect(client.subscribePage("P", "T")).rejects.toThrow("meta_page_subscribe_failed");
  });
  it("DELETEs on unsubscribe", async () => {
    let method: string | undefined;
    const client = createMetaConnectClient(config, { fetchImpl: stubFetch((_url, init) => { method = init.method; return { body: { success: true } }; }) });
    await client.unsubscribePage("PAGE123", "PT1");
    expect(method).toBe("DELETE");
  });
});

describe("verifyAppSignature", () => {
  const body = new TextEncoder().encode(JSON.stringify({ object: "page", entry: [{ id: "PAGE123" }] }));
  const validSig = `sha256=${createHmac("sha256", "the-app-secret").update(body).digest("hex")}`;

  it("accepts a correct x-hub-signature-256", () => {
    expect(verifyAppSignature(body, validSig, "the-app-secret")).toBe(true);
  });
  it("rejects a wrong secret, tampered body, and malformed header", () => {
    expect(verifyAppSignature(body, validSig, "other-secret")).toBe(false);
    expect(verifyAppSignature(new TextEncoder().encode("{}"), validSig, "the-app-secret")).toBe(false);
    expect(verifyAppSignature(body, "md5=abc", "the-app-secret")).toBe(false);
    expect(verifyAppSignature(body, null, "the-app-secret")).toBe(false);
    expect(verifyAppSignature(body, "sha256=zzzz", "the-app-secret")).toBe(false);
  });
});

describe("verifyWebhookChallenge", () => {
  it("echoes the challenge when subscribe + verify token matches", () => {
    expect(verifyWebhookChallenge("subscribe", "vt-123", "challenge-xyz", "vt-123")).toBe("challenge-xyz");
  });
  it("returns null on wrong token, wrong mode, or missing parts", () => {
    expect(verifyWebhookChallenge("subscribe", "wrong", "challenge-xyz", "vt-123")).toBeNull();
    expect(verifyWebhookChallenge("unsubscribe", "vt-123", "challenge-xyz", "vt-123")).toBeNull();
    expect(verifyWebhookChallenge("subscribe", null, "challenge-xyz", "vt-123")).toBeNull();
    expect(verifyWebhookChallenge("subscribe", "vt-123", null, "vt-123")).toBeNull();
  });
});

describe("parseSignedRequest", () => {
  function makeSignedRequest(payload: object, secret: string): string {
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
    return `${signature}.${encodedPayload}`;
  }

  it("returns the payload for a correctly signed request", () => {
    const signed = makeSignedRequest({ algorithm: "HMAC-SHA256", user_id: "USER123", issued_at: 1 }, "the-app-secret");
    expect(parseSignedRequest(signed, "the-app-secret")).toMatchObject({ user_id: "USER123" });
  });
  it("rejects a wrong secret, tampered payload, malformed input, and wrong algorithm", () => {
    const signed = makeSignedRequest({ algorithm: "HMAC-SHA256", user_id: "USER123" }, "the-app-secret");
    expect(parseSignedRequest(signed, "other-secret")).toBeNull();
    expect(parseSignedRequest(`${signed}x`, "the-app-secret")).toBeNull();
    expect(parseSignedRequest("not-a-signed-request", "the-app-secret")).toBeNull();
    expect(parseSignedRequest(makeSignedRequest({ algorithm: "RSA", user_id: "U" }, "the-app-secret"), "the-app-secret")).toBeNull();
  });
});
