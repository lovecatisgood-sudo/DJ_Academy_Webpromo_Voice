import { randomUUID } from "node:crypto";
import {
  voiceIncidentResolutionSchema,
  voiceRoutingActionReasonSchema,
  voiceRuntimeReasonSchema,
} from "@djay/shared";
import type { PlatformContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withPlatformTransaction } from "./scoped-transaction";

export type VoiceRuntimeMode = "running" | "paused" | "emergency_stop";

export type VoiceIncident = Readonly<{
  id: string; capabilityProfile: "voice_gen2"; severity: "minor" | "major" | "critical";
  status: "open" | "monitoring" | "resolved"; reason: string; resolution: string | null;
  routingChangeId: string | null; creditReviewStatus: "not_required" | "required" | "approved" | "rejected";
  openedByPlatformUserId: string; openedAt: string; resolvedAt: string | null;
}>;

export type VoiceRoutingOverview = Readonly<{
  admissionEnabled: boolean;
  admissionChanges: readonly Readonly<{
    id: string; capabilityProfile: "voice_gen2"; targetEnabled: boolean;
    status: "requested" | "approved" | "rejected" | "applied"; reason: string;
    requestedByPlatformUserId: string; approvedByPlatformUserId: string | null;
    requestedAt: string; approvedAt: string | null; appliedAt: string | null;
  }>[];
  profiles: readonly Readonly<{
    capabilityProfile: "voice_gen2"; mode: "paused" | "canary" | "running" | "degraded";
    reasonCode: string; version: number; changedAt: string;
    primaryCandidateId: string | null; canaryCandidateId: string | null; canaryPercent: number;
  }>[];
  candidates: readonly Readonly<{
    id: string; capabilityProfile: "voice_gen2";
    providerKey: string; modelKey: string; regionKey: string;
    status: "proposed" | "qualified" | "rejected" | "paused";
    proposedByPlatformUserId: string; reviewedByPlatformUserId: string | null;
    proposedAt: string; reviewedAt: string | null;
  }>[];
  changes: readonly Readonly<{
    id: string; capabilityProfile: "voice_gen2"; candidateId: string;
    previousCandidateId: string | null; canaryPercent: number;
    status: "requested" | "approved" | "rejected" | "canary" | "active" | "rolled_back";
    reason: string; requestedByPlatformUserId: string; approvedByPlatformUserId: string | null;
    requestedAt: string; approvedAt: string | null; canaryStartedAt: string | null;
    activatedAt: string | null; rolledBackAt: string | null; rollbackReason: string | null;
  }>[];
  incidents: readonly VoiceIncident[];
}>;

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
    const reasonCode = voiceRuntimeReasonSchema.parse(input.reasonCode);
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{
      mode: VoiceRuntimeMode; reasonCode: string; version: number; changedAt: Date;
    }[]>`
      SELECT mode, reason_code AS "reasonCode", version::int, changed_at AS "changedAt"
      FROM platform.set_voice_runtime_control(${input.mode}, ${reasonCode})
    `);
    if (!rows[0]) throw new Error("voice_runtime_control_unavailable");
    return rows[0];
  }

  async getRoutingOverview(context: PlatformContext) {
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{
      routing: Omit<VoiceRoutingOverview, "admissionEnabled" | "admissionChanges">;
      admission: { admissionEnabled: boolean; changes: VoiceRoutingOverview["admissionChanges"] };
    }[]>`
      SELECT platform.get_voice_routing_overview() AS routing,
             platform.get_voice_admission_overview() AS admission
    `);
    if (!rows[0]) throw new Error("voice_routing_overview_unavailable");
    return {
      ...rows[0].routing,
      admissionEnabled: rows[0].admission.admissionEnabled,
      admissionChanges: rows[0].admission.changes,
    };
  }

  async getIncidents(context: PlatformContext) {
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{ result: VoiceIncident[] }[]>`
      SELECT platform.get_voice_incidents() AS result
    `);
    if (!rows[0]) throw new Error("voice_incidents_unavailable");
    return rows[0].result;
  }

  async proposeRouteCandidate(context: PlatformContext, input: Readonly<{
    capabilityProfile: "voice_gen2"; providerKey: string; modelKey: string; regionKey: string;
  }>) {
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{ id: string }[]>`
      SELECT platform.propose_voice_route_candidate(
        ${input.capabilityProfile}, ${input.providerKey}, ${input.modelKey}, ${input.regionKey}
      ) AS id
    `);
    return { status: "proposed" as const, candidateId: rows[0]!.id };
  }

  async reviewRouteCandidate(context: PlatformContext, input: Readonly<{
    candidateId: string; decision: "qualify" | "reject"; evidenceSha256: string;
  }>) {
    const evidence = Buffer.from(input.evidenceSha256, "hex");
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{ status: "qualified" | "rejected" }[]>`
      SELECT platform.review_voice_route_candidate(
        ${input.candidateId}::uuid, ${input.decision}, ${evidence}
      ) AS status
    `);
    return { status: rows[0]!.status };
  }

  async requestRoutingChange(context: PlatformContext, input: Readonly<{
    capabilityProfile: "voice_gen2"; candidateId: string; canaryPercent: number;
    reason: string; evidenceSha256: string;
  }>) {
    const evidence = Buffer.from(input.evidenceSha256, "hex");
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{ id: string }[]>`
      SELECT platform.request_voice_routing_change(
        ${input.capabilityProfile}, ${input.candidateId}::uuid, ${input.canaryPercent},
        ${input.reason}, ${evidence}
      ) AS id
    `);
    return { status: "requested" as const, changeId: rows[0]!.id };
  }

  async reviewRoutingChange(context: PlatformContext, input: Readonly<{
    changeId: string; decision: "approve" | "reject";
  }>) {
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{ status: "approved" | "rejected" }[]>`
      SELECT platform.review_voice_routing_change(${input.changeId}::uuid, ${input.decision}) AS status
    `);
    return { status: rows[0]!.status };
  }

  async applyRoutingChange(context: PlatformContext, input: Readonly<{
    changeId: string; action: "start_canary" | "promote" | "rollback"; reason: string;
  }>) {
    const reason = voiceRoutingActionReasonSchema.parse(input.reason);
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{ status: "canary" | "active" | "rolled_back" }[]>`
      SELECT platform.apply_voice_routing_change(
        ${input.changeId}::uuid, ${input.action}, ${reason}
      ) AS status
    `);
    return { status: rows[0]!.status };
  }

  async requestAdmissionChange(context: PlatformContext, input: Readonly<{
    enabled: boolean; reason: string; evidenceSha256: string;
  }>) {
    const evidence = Buffer.from(input.evidenceSha256, "hex");
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{ id: string }[]>`
      SELECT platform.request_voice_admission_change(
        ${input.enabled}, ${input.reason}, ${evidence}
      ) AS id
    `);
    return { status: "requested" as const, changeId: rows[0]!.id };
  }

  async reviewAdmissionChange(context: PlatformContext, input: Readonly<{
    changeId: string; decision: "approve" | "reject";
  }>) {
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{
      status: "approved" | "rejected";
    }[]>`
      SELECT platform.review_voice_admission_change(
        ${input.changeId}::uuid, ${input.decision}
      ) AS status
    `);
    return { status: rows[0]!.status };
  }

  async applyAdmissionChange(context: PlatformContext, input: Readonly<{ changeId: string }>) {
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{ enabled: boolean }[]>`
      SELECT platform.apply_voice_admission_change(${input.changeId}::uuid) AS enabled
    `);
    return { status: "applied" as const, enabled: rows[0]!.enabled };
  }

  async openIncident(context: PlatformContext, input: Readonly<{
    capabilityProfile: "voice_gen2"; severity: "minor" | "major" | "critical";
    reason: string; routingChangeId: string | null; creditReviewRequired: boolean;
  }>) {
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{ id: string }[]>`
      SELECT platform.open_voice_incident(
        ${input.capabilityProfile}, ${input.severity}, ${input.reason},
        ${input.routingChangeId}::uuid, ${input.creditReviewRequired}
      ) AS id
    `);
    return { status: "open" as const, incidentId: rows[0]!.id };
  }

  async reviewIncidentCredit(context: PlatformContext, input: Readonly<{
    incidentId: string; decision: "approve" | "reject";
  }>) {
    const rows = await withPlatformTransaction(this.client, context, async ({ sql }) => sql<{ status: "approved" | "rejected" }[]>`
      SELECT platform.review_voice_incident_credit(${input.incidentId}::uuid, ${input.decision}) AS status
    `);
    return { status: rows[0]!.status };
  }

  async resolveIncident(context: PlatformContext, input: Readonly<{ incidentId: string; resolution: string }>) {
    const resolution = voiceIncidentResolutionSchema.parse(input.resolution);
    await withPlatformTransaction(this.client, context, async ({ sql }) => sql`
      SELECT platform.resolve_voice_incident(${input.incidentId}::uuid, ${resolution})
    `);
    return { status: "resolved" as const };
  }
}
