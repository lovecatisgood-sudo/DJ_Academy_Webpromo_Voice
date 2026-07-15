import { createSessionToken, hashSessionToken, sessionTokenMatches } from "./token";
import { createSqlClient, type SqlClient } from "./client";
import { verifyPassword } from "./password";

export type AdminUser = {
  id: string;
  tenantId: string;
  email: string;
  name: string;
  role: "owner" | "admin";
};

type UserRow = {
  id: string;
  tenant_id: string;
  email: string;
  name: string;
  role: "owner" | "admin";
  password_hash: string;
};

type SessionRow = {
  user_id: string;
  tenant_id: string;
  token_hash: Buffer;
  email: string;
  name: string;
  role: "owner" | "admin";
};

export type LoginResult =
  | { ok: true; user: AdminUser; sessionToken: string; expiresAt: Date }
  | { ok: false; reason: "invalid_credentials" };

export async function loginAdmin(params: {
  tenantId: string;
  email: string;
  password: string;
  sql?: SqlClient;
}): Promise<LoginResult> {
  const sql = params.sql ?? createSqlClient();
  const normalizedEmail = params.email.trim().toLowerCase();
  const users = (await sql`
    SELECT id, tenant_id, email, name, role, password_hash
    FROM flowbot_users
    WHERE tenant_id = ${params.tenantId}
      AND email = ${normalizedEmail}
      AND deleted_at IS NULL
    LIMIT 1
  `) as unknown as UserRow[];
  const user = users[0];

  if (!user || !(await verifyPassword(params.password, user.password_hash))) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const sessionToken = createSessionToken();
  const tokenHash = hashSessionToken(sessionToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  await sql`
    INSERT INTO flowbot_user_sessions (tenant_id, user_id, token_hash, expires_at)
    VALUES (${params.tenantId}, ${user.id}, ${tokenHash}, ${expiresAt.toISOString()})
  `;

  return {
    ok: true,
    sessionToken,
    expiresAt,
    user: {
      id: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      name: user.name,
      role: user.role
    }
  };
}

export async function getAdminSession(params: {
  sessionToken: string;
  sql?: SqlClient;
}): Promise<AdminUser | null> {
  const sql = params.sql ?? createSqlClient();
  const tokenHash = hashSessionToken(params.sessionToken);
  const rows = (await sql`
    SELECT s.user_id, s.tenant_id, s.token_hash, u.email, u.name, u.role
    FROM flowbot_user_sessions s
    JOIN flowbot_users u ON u.tenant_id = s.tenant_id AND u.id = s.user_id
    WHERE s.token_hash = ${tokenHash}
      AND s.revoked_at IS NULL
      AND s.expires_at > now()
      AND u.deleted_at IS NULL
    LIMIT 1
  `) as unknown as SessionRow[];
  const row = rows[0];

  if (!row || !sessionTokenMatches(params.sessionToken, row.token_hash)) {
    return null;
  }

  await sql`
    UPDATE flowbot_user_sessions
    SET last_seen_at = now()
    WHERE tenant_id = ${row.tenant_id}
      AND user_id = ${row.user_id}
      AND token_hash = ${tokenHash}
  `;

  return {
    id: row.user_id,
    tenantId: row.tenant_id,
    email: row.email,
    name: row.name,
    role: row.role
  };
}

export async function revokeAdminSession(params: {
  sessionToken: string;
  sql?: SqlClient;
}): Promise<void> {
  const sql = params.sql ?? createSqlClient();
  const tokenHash = hashSessionToken(params.sessionToken);

  await sql`
    UPDATE flowbot_user_sessions
    SET revoked_at = now()
    WHERE token_hash = ${tokenHash}
      AND revoked_at IS NULL
  `;
}
