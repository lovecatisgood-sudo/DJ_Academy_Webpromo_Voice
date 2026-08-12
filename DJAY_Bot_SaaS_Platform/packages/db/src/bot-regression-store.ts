import type { TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

export type RegressionProductKey = "flowbot" | "ai_chat" | "voice";
export type RegressionSuiteKey = "published_smoke" | "merchant_scenario" | "completed_voice_session";

export class TenantBotRegressionStore {
  constructor(private readonly client: DatabaseClient) {}

  async list(context: TenantContext, productKey?: RegressionProductKey) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; productKey: RegressionProductKey; subjectId: string; artifactVersionId: string;
      suiteKey: RegressionSuiteKey; locale: "th" | "en"; status: "passed" | "failed";
      checks: Record<string, boolean>; observedAt: Date;
    }[]>`
      SELECT id, product_key AS "productKey", subject_id AS "subjectId",
        artifact_version_id AS "artifactVersionId", suite_key AS "suiteKey", locale, status,
        checks_json AS checks, observed_at AS "observedAt"
      FROM tenancy.bot_regression_runs
      WHERE tenant_id = ${context.tenantId}::uuid
        AND (${productKey ?? null}::text IS NULL OR product_key = ${productKey ?? null})
      ORDER BY observed_at DESC, id DESC LIMIT 200
    `);
  }

  async record(context: TenantContext, input: Readonly<{
    productKey: RegressionProductKey; subjectId: string; artifactVersionId: string;
    suiteKey: RegressionSuiteKey; locale: "th" | "en"; checks: Readonly<Record<string, boolean>>;
    idempotencyKey: string;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ id: string | null }[]>`
        SELECT tenancy.record_bot_regression_run(
          ${input.productKey}, ${input.subjectId}::uuid, ${input.artifactVersionId}::uuid,
          ${input.suiteKey}, ${input.locale}, ${sql.json(input.checks)},
          ${context.membershipId}::uuid, ${input.idempotencyKey}::uuid
        ) AS id
      `;
      return rows[0]?.id ? { status: "recorded" as const, runId: rows[0].id } : { status: "not_recorded" as const };
    });
  }

  async recordLatestCompletedVoiceSession(context: TenantContext, deploymentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const sessions = await sql<{
        sessionId: string; playbookVersionId: string; locale: "th" | "en";
        settled: boolean; completedTurns: number;
      }[]>`
        SELECT session.id AS "sessionId", session.playbook_version_id AS "playbookVersionId",
          session.locale, session.settled_minutes IS NOT NULL AS settled,
          (SELECT count(*)::int FROM tenancy.voice_turns turn
            WHERE turn.tenant_id = session.tenant_id AND turn.session_id = session.id
              AND turn.status = 'completed') AS "completedTurns"
        FROM tenancy.voice_sessions session
        JOIN tenancy.voice_deployments deployment ON deployment.tenant_id = session.tenant_id
          AND deployment.id = session.deployment_id
        JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
        WHERE session.tenant_id = ${context.tenantId}::uuid
          AND session.deployment_id = ${deploymentId}::uuid AND session.status = 'ended'
          AND session.playbook_version_id = agent.current_published_playbook_version_id
          AND EXISTS (SELECT 1 FROM tenancy.voice_turns turn WHERE turn.tenant_id = session.tenant_id
            AND turn.session_id = session.id AND turn.status = 'completed')
        ORDER BY session.ended_at DESC, session.id DESC LIMIT 1
      `;
      const session = sessions[0];
      if (!session) return { status: "not_found" as const };
      const checks = {
        session_ended: true,
        completed_turn_available: session.completedTurns > 0,
        usage_settled_exactly_once: session.settled,
        current_playbook_version: true,
      };
      const rows = await sql<{ id: string | null }[]>`
        SELECT tenancy.record_bot_regression_run(
          'voice', ${deploymentId}::uuid, ${session.playbookVersionId}::uuid,
          'completed_voice_session', ${session.locale}, ${sql.json(checks)},
          ${context.membershipId}::uuid, ${session.sessionId}::uuid
        ) AS id
      `;
      return rows[0]?.id
        ? { status: "recorded" as const, runId: rows[0].id, sessionId: session.sessionId }
        : { status: "not_recorded" as const };
    });
  }
}
