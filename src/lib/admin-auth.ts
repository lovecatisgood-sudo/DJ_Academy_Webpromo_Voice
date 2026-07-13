import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getSql } from "./db";
import { optionalEnv, requireEnv } from "./env";
import type { AdminRole } from "./types";

const cookieName = "djai_admin";
const maxAgeSeconds = 60 * 60 * 12;

export type AdminSession = {
  id: string;
  username: string;
  name: string;
  role: AdminRole;
};

type CookiePayload = {
  adminUserId?: unknown;
  username?: unknown;
  name?: unknown;
  role?: unknown;
  expiresAt?: unknown;
};

type AdminUserAuthRow = {
  id: string;
  username: string;
  name: string;
  role: string;
  password_hash?: string;
};

function authSecret() {
  return optionalEnv("SESSION_PASSWORD") || requireEnv("SESSION_SIGNING_SECRET");
}

function optionalAuthSecret() {
  return optionalEnv("SESSION_PASSWORD") || optionalEnv("SESSION_SIGNING_SECRET");
}

function sign(value: string) {
  return createHmac("sha256", authSecret()).update(value).digest("base64url");
}

function signWithSecret(value: string, secret: string) {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function constantEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function parseRole(value: unknown): AdminRole | null {
  return value === "master_admin" || value === "admin" ? value : null;
}

function buildCookieValue(admin: AdminSession) {
  const expiresAt = Math.floor(Date.now() / 1000) + maxAgeSeconds;
  const payload = Buffer.from(
    JSON.stringify({
      adminUserId: admin.id,
      username: admin.username,
      name: admin.name,
      role: admin.role,
      expiresAt,
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function parseSignedCookie(value: string | undefined): CookiePayload | null {
  const secret = optionalAuthSecret();
  if (!secret || !value) return null;

  const parts = value.split(".");

  if (parts.length === 2) {
    const [encodedPayload, signature] = parts;

    if (!constantEquals(signature, signWithSecret(encodedPayload, secret))) {
      return null;
    }

    try {
      const parsed = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as CookiePayload;

      if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Math.floor(Date.now() / 1000)) {
        return null;
      }

      return parsed;
    } catch {
      return null;
    }
  }

  if (parts.length !== 3) return null;

  const [username, expiresAtRaw, signature] = parts;
  const expiresAt = Number(expiresAtRaw);

  if (!username || !Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) {
    return null;
  }

  if (!constantEquals(signature, signWithSecret(`${username}.${expiresAt}`, secret))) {
    return null;
  }

  return { username, expiresAt };
}

export function hashAdminPassword(password: string) {
  const salt = randomBytes(16).toString("base64url");
  const key = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt$${salt}$${key}`;
}

export function verifyAdminPassword(password: string, storedHash: string) {
  const [scheme, salt, key] = storedHash.split("$");

  if (scheme !== "scrypt" || !salt || !key) {
    return false;
  }

  const calculated = scryptSync(password, salt, 64).toString("base64url");
  return constantEquals(calculated, key);
}

async function adminFromPayload(payload: CookiePayload | null): Promise<AdminSession | null> {
  if (!payload) return null;

  const adminUserId = typeof payload.adminUserId === "string" ? payload.adminUserId : "";
  const username = typeof payload.username === "string" ? payload.username : "";

  if (!adminUserId && !username) return null;

  const sql = getSql();
  const rows = (adminUserId
    ? await sql`
        select id, username, name, role
        from admin_users
        where id = ${adminUserId}
          and is_active = true
          and deleted_at is null
        limit 1
      `
    : await sql`
        select id, username, name, role
        from admin_users
        where username = ${username}
          and is_active = true
          and deleted_at is null
        limit 1
      `) as AdminUserAuthRow[];

  const row = rows[0];
  const role = parseRole(row?.role);

  if (!row || !role) return null;

  return {
    id: String(row.id),
    username: String(row.username),
    name: String(row.name),
    role,
  };
}

export async function getCurrentAdmin(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  return adminFromPayload(parseSignedCookie(cookieStore.get(cookieName)?.value));
}

export async function isAdminAuthenticated() {
  return Boolean(await getCurrentAdmin());
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();

  if (!admin) {
    redirect("/admin/login");
  }

  return admin;
}

export async function requireMasterAdmin() {
  const admin = await requireAdmin();

  if (admin.role !== "master_admin") {
    redirect("/admin");
  }

  return admin;
}

export async function setAdminCookie(admin: AdminSession) {
  const cookieStore = await cookies();
  cookieStore.set(cookieName, buildCookieValue(admin), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  });
}

export async function clearAdminCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(cookieName);
}

export async function validateAdminCredentials(username: string, password: string): Promise<AdminSession | null> {
  const sql = getSql();
  const rows = (await sql`
    select id, username, name, role, password_hash
    from admin_users
    where username = ${username}
      and is_active = true
      and deleted_at is null
    limit 1
  `) as AdminUserAuthRow[];
  const row = rows[0];
  const role = parseRole(row?.role);

  if (row && role && verifyAdminPassword(password, String(row.password_hash))) {
    await sql`update admin_users set last_login_at = now(), updated_at = now() where id = ${row.id}`;
    return {
      id: String(row.id),
      username: String(row.username),
      name: String(row.name),
      role,
    };
  }

  const fallbackUsername = optionalEnv("ADMIN_USERNAME");
  const fallbackPassword = optionalEnv("ADMIN_PASSWORD");

  if (fallbackUsername && fallbackPassword && constantEquals(username, fallbackUsername) && constantEquals(password, fallbackPassword)) {
    const fallbackRows = (await sql`
      select id, username, name, role
      from admin_users
      where username = ${fallbackUsername}
        and is_active = true
        and deleted_at is null
      limit 1
    `) as AdminUserAuthRow[];
    const fallback = fallbackRows[0];
    const fallbackRole = parseRole(fallback?.role);

    if (fallback && fallbackRole) {
      await sql`update admin_users set last_login_at = now(), updated_at = now() where id = ${fallback.id}`;
      return {
        id: String(fallback.id),
        username: String(fallback.username),
        name: String(fallback.name),
        role: fallbackRole,
      };
    }
  }

  return null;
}
