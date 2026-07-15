import type {
  BootstrapPlatformOwnerCommand,
  CompletePlatformMfaCommand,
  CreatePlatformChallengeCommand,
  PlatformAuthStore,
} from "@djay/platform-auth";
import type { PlatformRole } from "@djay/authorization";
import type { DatabaseClient } from "./client";

export class PostgresPlatformAuthStore implements PlatformAuthStore {
  constructor(private readonly client: DatabaseClient) {}

  async bootstrap(command: BootstrapPlatformOwnerCommand) {
    return this.client.begin(async (sql) => {
      const state = await sql<{ completed_at: Date | null; user_count: number }[]>`
        SELECT bootstrap.completed_at,
               (SELECT count(*)::int FROM platform.users) AS user_count
        FROM platform.bootstrap_state bootstrap
        WHERE singleton = true
        FOR UPDATE
      `;
      if (!state[0] || state[0].completed_at || state[0].user_count > 0) return "already_completed" as const;
      await sql`
        INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status)
        VALUES (
          ${command.userId}::uuid, ${command.emailNormalized}, ${command.displayName},
          ${command.passwordHash}, 'pending_mfa'
        )
      `;
      await sql`
        INSERT INTO platform.role_assignments (id, platform_user_id, role)
        VALUES (${command.roleAssignmentId}::uuid, ${command.userId}::uuid, 'platform_owner')
      `;
      await sql`
        INSERT INTO platform.mfa_factors (
          id, platform_user_id, factor_type, label, secret_ciphertext
        ) VALUES (
          ${command.factorId}::uuid, ${command.userId}::uuid, 'totp',
          'Primary authenticator', ${Buffer.from(command.secretEnvelope, "utf8")}
        )
      `;
      for (const codeHash of command.recoveryCodeHashes) {
        await sql`
          INSERT INTO platform.mfa_recovery_codes (platform_user_id, code_hash)
          VALUES (${command.userId}::uuid, ${codeHash})
        `;
      }
      await sql`
        UPDATE platform.bootstrap_state
        SET completed_at = now(), completed_by_user_id = ${command.userId}::uuid
        WHERE singleton = true
      `;
      await sql`
        INSERT INTO platform.audit_logs (
          actor_platform_user_id, action, target_type, target_id,
          request_id, result, metadata
        ) VALUES (
          ${command.userId}::uuid, 'platform.owner_bootstrapped', 'platform_user',
          ${command.userId}, ${command.requestId}, 'succeeded',
          ${sql.json({ role: "platform_owner", mfa: "totp_pending_verification" })}
        )
      `;
      return "created" as const;
    });
  }

  async findPasswordIdentity(emailNormalized: string) {
    const rows = await this.client<{
      user_id: string;
      email_normalized: string;
      display_name: string;
      password_hash: string;
      status: "pending_mfa" | "active";
      role: PlatformRole;
    }[]>`
      SELECT app_user.id AS user_id, app_user.email_normalized, app_user.display_name,
             app_user.password_hash, app_user.status, assignment.role
      FROM platform.users app_user
      JOIN platform.role_assignments assignment ON assignment.platform_user_id = app_user.id
        AND assignment.revoked_at IS NULL
      WHERE app_user.email_normalized = ${emailNormalized}
        AND app_user.status IN ('pending_mfa', 'active')
      ORDER BY CASE assignment.role
        WHEN 'platform_owner' THEN 0 WHEN 'platform_ai_operations' THEN 1
        WHEN 'platform_support' THEN 2 ELSE 3 END
      LIMIT 1
    `;
    const row = rows[0];
    return row ? {
      userId: row.user_id,
      emailNormalized: row.email_normalized,
      displayName: row.display_name,
      passwordHash: row.password_hash,
      status: row.status,
      role: row.role,
    } : null;
  }

  async createLoginChallenge(command: CreatePlatformChallengeCommand) {
    await this.client.begin(async (sql) => {
      await sql`
        UPDATE platform.login_challenges SET consumed_at = ${command.now}
        WHERE platform_user_id = ${command.userId}::uuid AND consumed_at IS NULL
      `;
      await sql`
        INSERT INTO platform.login_challenges (
          id, platform_user_id, token_hash, password_verified_at, expires_at
        ) VALUES (
          ${command.challengeId}::uuid, ${command.userId}::uuid, ${command.tokenHash},
          ${command.now}, ${command.expiresAt}
        )
      `;
      await sql`
        INSERT INTO platform.audit_logs (
          actor_platform_user_id, action, target_type, target_id, request_id, result
        ) VALUES (
          ${command.userId}::uuid, 'platform.password_verified', 'login_challenge',
          ${command.challengeId}, ${command.requestId}, 'succeeded'
        )
      `;
    });
  }

  async resolveLoginChallenge(tokenHash: Buffer, now: Date) {
    const rows = await this.client<{
      challenge_id: string;
      user_id: string;
      display_name: string;
      role: PlatformRole;
      status: "pending_mfa" | "active";
      secret_ciphertext: Buffer;
      expires_at: Date;
    }[]>`
      SELECT challenge.id AS challenge_id, app_user.id AS user_id,
             app_user.display_name, assignment.role, app_user.status,
             factor.secret_ciphertext, challenge.expires_at
      FROM platform.login_challenges challenge
      JOIN platform.users app_user ON app_user.id = challenge.platform_user_id
      JOIN platform.role_assignments assignment ON assignment.platform_user_id = app_user.id
        AND assignment.revoked_at IS NULL
      JOIN platform.mfa_factors factor ON factor.platform_user_id = app_user.id
        AND factor.factor_type = 'totp' AND factor.disabled_at IS NULL
      WHERE challenge.token_hash = ${tokenHash}
        AND challenge.consumed_at IS NULL
        AND challenge.expires_at > ${now}
        AND app_user.status IN ('pending_mfa', 'active')
      ORDER BY CASE assignment.role WHEN 'platform_owner' THEN 0 ELSE 1 END
      LIMIT 1
    `;
    const row = rows[0];
    return row ? {
      challengeId: row.challenge_id,
      userId: row.user_id,
      displayName: row.display_name,
      role: row.role,
      status: row.status,
      secretEnvelope: row.secret_ciphertext.toString("utf8"),
      expiresAt: row.expires_at,
    } : null;
  }

  async completeMfa(command: CompletePlatformMfaCommand) {
    return this.client.begin(async (sql) => {
      const challenges = await sql<{ id: string; platform_user_id: string }[]>`
        SELECT id, platform_user_id FROM platform.login_challenges
        WHERE token_hash = ${command.challengeTokenHash}
          AND consumed_at IS NULL AND expires_at > ${command.now}
        FOR UPDATE
      `;
      const challenge = challenges[0];
      if (!challenge) return false;
      await sql`
        UPDATE platform.login_challenges SET consumed_at = ${command.now}
        WHERE id = ${challenge.id}::uuid
      `;
      await sql`
        UPDATE platform.users SET status = 'active', updated_at = ${command.now}
        WHERE id = ${challenge.platform_user_id}::uuid AND status = 'pending_mfa'
      `;
      await sql`
        UPDATE platform.mfa_factors SET verified_at = COALESCE(verified_at, ${command.now})
        WHERE platform_user_id = ${challenge.platform_user_id}::uuid
          AND factor_type = 'totp' AND disabled_at IS NULL
      `;
      await sql`
        INSERT INTO platform.sessions (
          id, platform_user_id, token_hash, family_id, mfa_verified_at,
          reauthenticated_at, idle_expires_at, absolute_expires_at
        ) VALUES (
          ${command.sessionId}::uuid, ${challenge.platform_user_id}::uuid,
          ${command.sessionTokenHash}, ${command.familyId}::uuid, ${command.now},
          ${command.now}, ${command.idleExpiresAt}, ${command.absoluteExpiresAt}
        )
      `;
      await sql`
        INSERT INTO platform.audit_logs (
          actor_platform_user_id, action, target_type, target_id, request_id, result
        ) VALUES (
          ${challenge.platform_user_id}::uuid, 'platform.mfa_authenticated',
          'platform_session', ${command.sessionId}, ${command.requestId}, 'succeeded'
        )
      `;
      return true;
    });
  }

  async resolveSession(tokenHash: Buffer, now: Date) {
    const rows = await this.client<{
      session_id: string;
      user_id: string;
      display_name: string;
      role: PlatformRole;
      mfa_verified_at: Date;
      reauthenticated_at: Date;
      idle_expires_at: Date;
      absolute_expires_at: Date;
    }[]>`
      SELECT session.id AS session_id, app_user.id AS user_id, app_user.display_name,
             assignment.role, session.mfa_verified_at, session.reauthenticated_at,
             session.idle_expires_at, session.absolute_expires_at
      FROM platform.sessions session
      JOIN platform.users app_user ON app_user.id = session.platform_user_id
      JOIN platform.role_assignments assignment ON assignment.platform_user_id = app_user.id
        AND assignment.revoked_at IS NULL
      WHERE session.token_hash = ${tokenHash}
        AND session.revoked_at IS NULL
        AND session.idle_expires_at > ${now}
        AND session.absolute_expires_at > ${now}
        AND app_user.status = 'active'
      ORDER BY CASE assignment.role WHEN 'platform_owner' THEN 0 ELSE 1 END
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    await this.client`
      UPDATE platform.sessions SET last_seen_at = ${now}
      WHERE id = ${row.session_id}::uuid AND revoked_at IS NULL
    `;
    return {
      sessionId: row.session_id,
      userId: row.user_id,
      displayName: row.display_name,
      role: row.role,
      mfaVerifiedAt: row.mfa_verified_at,
      reauthenticatedAt: row.reauthenticated_at,
      idleExpiresAt: row.idle_expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
    };
  }

  async revokeSession(tokenHash: Buffer, now: Date) {
    await this.client`
      UPDATE platform.sessions SET revoked_at = ${now}, revoke_reason = 'logout'
      WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
    `;
  }

  async healthSummary() {
    const rows = await this.client<{
      platform_users: number; active_sessions: number;
      social_channels: {
        channel: "line" | "whatsapp" | "messenger";
        activeConnections: number; reauthorizationRequired: number;
        queuedInbound: number; oldestInboundQueueSeconds: number; deadLetterInbound: number;
        queuedDeliveries: number; oldestDeliveryQueueSeconds: number; deadLetterDeliveries: number;
        serviceWindowClosed24h: number; attemptedQuantity24h: number; failedAttempts24h: number;
      }[];
    }[]>`
      SELECT
        (SELECT count(*)::int FROM platform.users WHERE status = 'active') AS platform_users,
        (SELECT count(*)::int FROM platform.sessions
          WHERE revoked_at IS NULL AND idle_expires_at > now() AND absolute_expires_at > now()) AS active_sessions,
        platform.ai_social_health_summary() AS social_channels
    `;
    return {
      platformUsers: rows[0]?.platform_users ?? 0,
      activeSessions: rows[0]?.active_sessions ?? 0,
      socialChannels: rows[0]?.social_channels ?? [],
    };
  }
}
