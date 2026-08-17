import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const PUBLIC_BUILDER_TEST_CAP = 50;
export const PUBLIC_BUILDER_TEST_WINDOW_MS = 30 * 24 * 60 * 60 * 1_000;
export const PUBLIC_BUILDER_TEST_COOKIE = "djay_builder_test_session";

function signature(sessionId: string, key: Buffer) {
  return createHmac("sha256", key).update(`public-builder-test:${sessionId}`).digest("base64url");
}

function validSignature(value: string, expected: string) {
  const supplied = Buffer.from(value);
  const signed = Buffer.from(expected);
  return supplied.length === signed.length && timingSafeEqual(supplied, signed);
}

export function resolvePublicBuilderTestSession(cookieValue: string | undefined, key: Buffer) {
  const [sessionId, suppliedSignature, ...extra] = cookieValue?.split(".") ?? [];
  if (
    extra.length === 0
    && sessionId
    && suppliedSignature
    && /^[0-9a-f-]{36}$/i.test(sessionId)
    && validSignature(suppliedSignature, signature(sessionId, key))
  ) {
    return { sessionId, cookieValue: `${sessionId}.${suppliedSignature}` } as const;
  }
  const nextSessionId = randomUUID();
  return { sessionId: nextSessionId, cookieValue: `${nextSessionId}.${signature(nextSessionId, key)}` } as const;
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
