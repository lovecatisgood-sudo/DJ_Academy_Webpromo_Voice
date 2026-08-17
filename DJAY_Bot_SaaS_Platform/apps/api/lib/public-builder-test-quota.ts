import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const PUBLIC_BUILDER_TEST_CAP = 50;
export const PUBLIC_BUILDER_TEST_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
export const PUBLIC_BUILDER_TEST_COOKIE = "djay_builder_test_session";
export const PUBLIC_BUILDER_TEST_RATE_LIMIT_SCOPE = "public_builder_ai_test_cap";
const allowedClockSkewMs = 5 * 60 * 1_000;

function signature(sessionId: string, issuedAtMs: number, key: Buffer) {
  return createHmac("sha256", key)
    .update(`public-builder-test:${sessionId}:${issuedAtMs}`)
    .digest("base64url");
}

function validSignature(value: string, expected: string) {
  const supplied = Buffer.from(value);
  const signed = Buffer.from(expected);
  return supplied.length === signed.length && timingSafeEqual(supplied, signed);
}

export function resolvePublicBuilderTestSession(
  cookieValue: string | undefined,
  key: Buffer,
  now = new Date(),
) {
  const existing = parsePublicBuilderTestSession(cookieValue, key, now);
  if (existing) return existing;
  const nextSessionId = randomUUID();
  const nextIssuedAtMs = now.getTime();
  return {
    sessionId: nextSessionId,
    issuedAt: now,
    expiresAt: new Date(nextIssuedAtMs + PUBLIC_BUILDER_TEST_WINDOW_MS),
    cookieValue: `${nextSessionId}.${nextIssuedAtMs}.${signature(nextSessionId, nextIssuedAtMs, key)}`,
  } as const;
}

export function parsePublicBuilderTestSession(
  cookieValue: string | undefined,
  key: Buffer,
  now = new Date(),
) {
  const [sessionId, issuedAtText, suppliedSignature, ...extra] = cookieValue?.split(".") ?? [];
  const issuedAtMs = Number(issuedAtText);
  const ageMs = now.getTime() - issuedAtMs;
  if (
    extra.length === 0
    && sessionId
    && issuedAtText
    && suppliedSignature
    && /^[0-9a-f-]{36}$/i.test(sessionId)
    && Number.isSafeInteger(issuedAtMs)
    && ageMs >= -allowedClockSkewMs
    && ageMs < PUBLIC_BUILDER_TEST_WINDOW_MS
    && validSignature(suppliedSignature, signature(sessionId, issuedAtMs, key))
  ) {
    return {
      sessionId,
      issuedAt: new Date(issuedAtMs),
      expiresAt: new Date(issuedAtMs + PUBLIC_BUILDER_TEST_WINDOW_MS),
      cookieValue: `${sessionId}.${issuedAtText}.${suppliedSignature}`,
    } as const;
  }
  return null;
}

export function publicBuilderTestCookie(value: string, production: boolean) {
  return [
    `${PUBLIC_BUILDER_TEST_COOKIE}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(PUBLIC_BUILDER_TEST_WINDOW_MS / 1_000)}`,
    production ? "Secure" : "",
  ].filter(Boolean).join("; ");
}
