import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * @djay/meta-connect — protocol logic for connecting a merchant's Facebook Page
 * to the single shared DJBOT Meta app via Facebook Login for Business.
 *
 * Pure/deterministic and fetch-injectable, so it is fully unit-testable without
 * network or database. Webhook-signature verification (Plan 3) and signed_request
 * parsing (Plan 4) are intentionally NOT here yet — this increment is the OAuth
 * connect + Page-subscription flow only.
 */

export const metaConnectConfigSchema = z.object({
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  loginConfigId: z.string().min(1),
  graphBaseUrl: z.string().min(1), // e.g. https://graph.facebook.com/v23.0
  loginDialogBaseUrl: z.string().min(1), // e.g. https://www.facebook.com/v23.0/dialog/oauth
  oauthRedirectUri: z.string().min(1),
  timeoutMs: z.number().int().positive().optional(),
}).strict();
export type MetaConnectConfig = z.infer<typeof metaConnectConfigSchema>;

export const oauthStatePayloadSchema = z.object({
  tenantId: z.uuid(),
  botId: z.uuid(),
  membershipId: z.uuid(),
  nonce: z.string().min(1),
  exp: z.number().int().positive(),
}).strict();
export type OAuthStatePayload = z.infer<typeof oauthStatePayloadSchema>;

/** Sign a CSRF/replay-resistant OAuth `state` token: base64url(payload).base64url(hmac). */
export function signOAuthState(payload: OAuthStatePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(oauthStatePayloadSchema.parse(payload))).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

/** Verify a `state` token. Returns the payload, or null if malformed / tampered / expired (exp <= now, epoch seconds). */
export function verifyOAuthState(token: string, secret: string, now: number): OAuthStatePayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (body === undefined || signature === undefined) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const result = oauthStatePayloadSchema.safeParse(parsed);
  if (!result.success || result.data.exp <= now) return null;
  return result.data;
}

export type ConnectablePage = Readonly<{ id: string; name: string; accessToken: string }>;

export function createMetaConnectClient(configValue: MetaConnectConfig, deps?: { fetchImpl?: typeof fetch }) {
  const config = metaConnectConfigSchema.parse(configValue);
  const graphBase = new URL(config.graphBaseUrl.endsWith("/") ? config.graphBaseUrl : `${config.graphBaseUrl}/`);
  const dialogBase = new URL(config.loginDialogBaseUrl);
  const redirect = new URL(config.oauthRedirectUri);
  for (const url of [graphBase, dialogBase, redirect]) {
    if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("meta_connect_https_required");
  }
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const timeout = config.timeoutMs ?? 15_000;

  async function request(url: URL, init: RequestInit): Promise<Record<string, unknown>> {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeout) });
    if (!response.ok) {
      throw new Error(response.status === 401 || response.status === 403
        ? "meta_authorization_failed"
        : response.status === 429 ? "meta_rate_limited" : "meta_request_failed");
    }
    return response.status === 204 ? {} : ((await response.json()) as Record<string, unknown>);
  }

  return {
    /** Build the Facebook Login for Business dialog URL the merchant is redirected to. */
    buildLoginUrl(state: string): string {
      const url = new URL(dialogBase);
      url.searchParams.set("client_id", config.appId);
      url.searchParams.set("config_id", config.loginConfigId);
      url.searchParams.set("redirect_uri", config.oauthRedirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("state", state);
      return url.toString();
    },

    /** Exchange the OAuth `code` for a (short-lived) user access token. */
    async exchangeCodeForUserToken(code: string): Promise<string> {
      const url = new URL("oauth/access_token", graphBase);
      url.searchParams.set("client_id", config.appId);
      url.searchParams.set("client_secret", config.appSecret);
      url.searchParams.set("redirect_uri", config.oauthRedirectUri);
      url.searchParams.set("code", code);
      const result = await request(url, { method: "GET" });
      if (typeof result.access_token !== "string") throw new Error("meta_token_exchange_failed");
      return result.access_token;
    },

    /** Exchange a short-lived user token for a long-lived one (~60 days; derived Page tokens then do not expire). */
    async exchangeForLongLivedToken(shortLivedToken: string): Promise<string> {
      const url = new URL("oauth/access_token", graphBase);
      url.searchParams.set("grant_type", "fb_exchange_token");
      url.searchParams.set("client_id", config.appId);
      url.searchParams.set("client_secret", config.appSecret);
      url.searchParams.set("fb_exchange_token", shortLivedToken);
      const result = await request(url, { method: "GET" });
      if (typeof result.access_token !== "string") throw new Error("meta_token_exchange_failed");
      return result.access_token;
    },

    /** List the Pages the merchant granted, each with its Page access token. */
    async listPages(userAccessToken: string): Promise<readonly ConnectablePage[]> {
      const url = new URL("me/accounts", graphBase);
      url.searchParams.set("fields", "id,name,access_token");
      url.searchParams.set("access_token", userAccessToken);
      const result = await request(url, { method: "GET" });
      const data = Array.isArray(result.data) ? result.data : [];
      return data.flatMap((item) => {
        const record = item as Record<string, unknown>;
        return typeof record.id === "string" && typeof record.name === "string" && typeof record.access_token === "string"
          ? [{ id: record.id, name: record.name, accessToken: record.access_token }]
          : [];
      });
    },

    /** Subscribe the Page to this app's Messenger webhook fields (the step that was missing entirely). */
    async subscribePage(pageId: string, pageAccessToken: string): Promise<void> {
      const url = new URL(`${encodeURIComponent(pageId)}/subscribed_apps`, graphBase);
      url.searchParams.set("subscribed_fields", "messages,messaging_postbacks,messaging_optins,message_deliveries,message_reads");
      const result = await request(url, { method: "POST", headers: { Authorization: `Bearer ${pageAccessToken}` } });
      if (result.success === false) throw new Error("meta_page_subscribe_failed");
    },

    /** Unsubscribe the Page from this app (used on revoke/deauthorize). */
    async unsubscribePage(pageId: string, pageAccessToken: string): Promise<void> {
      const url = new URL(`${encodeURIComponent(pageId)}/subscribed_apps`, graphBase);
      await request(url, { method: "DELETE", headers: { Authorization: `Bearer ${pageAccessToken}` } });
    },
  };
}

// ---- App-level webhook verification (Plan 3) ----

/**
 * Verify Meta's `x-hub-signature-256` header against the untouched raw body,
 * keyed by the single app-level App Secret. Timing-safe; false on any mismatch.
 */
export function verifyAppSignature(rawBody: Uint8Array, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  let received: Buffer;
  try {
    received = Buffer.from(signatureHeader.slice(7), "hex");
  } catch {
    return false;
  }
  return expected.length === received.length && timingSafeEqual(expected, received);
}

/**
 * Verify the app-level webhook GET handshake. Returns the challenge to echo when
 * mode is `subscribe` and the presented verify token matches (timing-safe), else null.
 */
export function verifyWebhookChallenge(
  mode: string | null,
  verifyToken: string | null,
  challenge: string | null,
  expectedVerifyToken: string,
): string | null {
  if (mode !== "subscribe" || !verifyToken || !challenge) return null;
  const presented = Buffer.from(verifyToken);
  const expected = Buffer.from(expectedVerifyToken);
  return presented.length === expected.length && timingSafeEqual(presented, expected) ? challenge : null;
}

// ---- signed_request (Plan 4: deauthorize / data-deletion) ----

/**
 * Parse and verify a Meta `signed_request` (`<base64url sig>.<base64url payload>`),
 * HMAC-SHA256 over the encoded payload keyed by the App Secret. Returns the decoded
 * payload (e.g. `{ user_id, algorithm, issued_at }`) or null if malformed / tampered
 * / wrong algorithm.
 */
export function parseSignedRequest(signedRequest: string, appSecret: string): Record<string, unknown> | null {
  const parts = signedRequest.split(".");
  if (parts.length !== 2) return null;
  const [encodedSignature, encodedPayload] = parts;
  if (encodedSignature === undefined || encodedPayload === undefined) return null;
  let received: Buffer;
  try {
    received = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", appSecret).update(encodedPayload).digest();
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null) return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.algorithm === "string" && record.algorithm.toUpperCase() !== "HMAC-SHA256") return null;
  return record;
}
