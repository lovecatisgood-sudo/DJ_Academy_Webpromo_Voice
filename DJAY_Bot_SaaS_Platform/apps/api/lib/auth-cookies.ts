import type { NextResponse } from "next/server";

export const authCookieNames = {
  tenantSession: "djay_tenant_session",
  tenantChallenge: "djay_tenant_mfa_challenge",
  platformSession: "djay_platform_session",
  platformChallenge: "djay_platform_challenge",
} as const;

const tenantChallengePath = "/public/auth/mfa/challenge";
const platformChallengePath = "/platform/auth/mfa/challenge";

function remainingSeconds(expiresAt: Date, now = Date.now()) {
  return Math.max(1, Math.floor((expiresAt.getTime() - now) / 1000));
}

function options(production: boolean, sameSite: "lax" | "strict", path: string) {
  return { httpOnly: true, secure: production, sameSite, path } as const;
}

function clear(
  response: NextResponse,
  name: string,
  production: boolean,
  sameSite: "lax" | "strict",
  path: string,
) {
  response.cookies.set(name, "", {
    ...options(production, sameSite, path),
    expires: new Date(0),
    maxAge: 0,
  });
}

export function setTenantSessionCookie(response: NextResponse, token: string, expiresAt: Date, production: boolean) {
  response.cookies.set(authCookieNames.tenantSession, token, {
    ...options(production, "lax", "/"),
    maxAge: remainingSeconds(expiresAt),
  });
}

export function clearTenantSessionCookie(response: NextResponse, production: boolean) {
  clear(response, authCookieNames.tenantSession, production, "lax", "/");
}

export function setTenantChallengeCookie(response: NextResponse, token: string, expiresAt: Date, production: boolean) {
  response.cookies.set(authCookieNames.tenantChallenge, token, {
    ...options(production, "lax", tenantChallengePath),
    maxAge: remainingSeconds(expiresAt),
  });
}

export function clearTenantChallengeCookie(response: NextResponse, production: boolean) {
  clear(response, authCookieNames.tenantChallenge, production, "lax", tenantChallengePath);
}

export function setPlatformSessionCookie(response: NextResponse, token: string, expiresAt: Date, production: boolean) {
  response.cookies.set(authCookieNames.platformSession, token, {
    ...options(production, "strict", "/"),
    maxAge: remainingSeconds(expiresAt),
  });
}

export function clearPlatformSessionCookie(response: NextResponse, production: boolean) {
  clear(response, authCookieNames.platformSession, production, "strict", "/");
}

export function setPlatformChallengeCookie(response: NextResponse, token: string, expiresAt: Date, production: boolean) {
  response.cookies.set(authCookieNames.platformChallenge, token, {
    ...options(production, "strict", platformChallengePath),
    maxAge: remainingSeconds(expiresAt),
  });
}

export function clearPlatformChallengeCookie(response: NextResponse, production: boolean) {
  clear(response, authCookieNames.platformChallenge, production, "strict", platformChallengePath);
}
