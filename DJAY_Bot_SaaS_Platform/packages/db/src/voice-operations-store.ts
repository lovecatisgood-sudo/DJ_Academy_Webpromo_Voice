import { randomUUID } from "node:crypto";
import type { PlatformContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withPlatformTransaction } from "./scoped-transaction";

export type VoiceRuntimeMode = "running" | "paused" | "emergency_stop";

export class VoiceReaperStore {
  constructor(private readonly client: DatabaseClient) {}

  async reap(input: Readonly<{ now: Date; staleBefore: Date; limit: number }>) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT set_config('app.service', 'voice_reaper_worker', true),
               set_config('app.request_id', ${randomUUID()}, true)
      `;
      return sql<{
        sessionId: string; terminalReason: string; customerMinutes: number; settledSeconds: number;
      }[]>`
        SELECT session_id AS "sessionId", terminal_reason AS "terminalReason",
               customer_minutes AS "customerMinutes", settled_seconds AS "settledSeconds"
        FROM tenancy.reap_voice_basic_sessions(${input.now}, ${input.staleBefore}, ${input.limit})
      `;
    }) as Promise<{
      sessionId: string; terminalReason: string; customerMinutes: number; settledSeconds: number;
    }[]>;
  }
}

export class PlatformVoiceOperationsStore {
  constructor(private readonly client: DatabaseClient) {}

  async getControl(context: PlatformContext) {
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{
      mode: VoiceRuntimeMode; reasonCode: string; version: number; changedAt: Date;
      activeSessions: number; reconnectingSessions: number; expiredGrants: number; staleConnections: number;
    }[]>`
      SELECT mode, reason_code AS "reasonCode", version::int, changed_at AS "changedAt",
             active_sessions AS "activeSessions", reconnecting_sessions AS "reconnectingSessions",
             expired_grants AS "expiredGrants", stale_connections AS "staleConnections"
      FROM platform.get_voice_runtime_control()
    `);
    if (!rows[0]) throw new Error("voice_runtime_control_unavailable");
    return rows[0];
  }

  async setControl(context: PlatformContext, input: Readonly<{ mode: VoiceRuntimeMode; reasonCode: string }>) {
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{
      mode: VoiceRuntimeMode; reasonCode: string; version: number; changedAt: Date;
    }[]>`
      SELECT mode, reason_code AS "reasonCode", version::int, changed_at AS "changedAt"
      FROM platform.set_voice_runtime_control(${input.mode}, ${input.reasonCode})
    `);
    if (!rows[0]) throw new Error("voice_runtime_control_unavailable");
    return rows[0];
  }
}
