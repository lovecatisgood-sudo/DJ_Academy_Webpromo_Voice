import { createHash, randomUUID } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken } from "@djay/auth";
import type { AiPublicResponse, AiTurnContext } from "@djay/ai-chat-runtime";
import type { SalesCoreOutput } from "@djay/sales-core";
import type { VoiceSessionGrant } from "@djay/voice-runtime";
import type { DatabaseClient } from "./client";

type IssuedVoiceGrant = Omit<VoiceSessionGrant, "sessionGrant" | "gatewayUrl" | "protocolVersion" | "reconnectPolicy" | "automatedAgentDisclosure" | "recording"> & {
  sessionGrant: string;
  reconnectWindowSeconds: number;
  automatedDisclosure: string;
};

export type RestrictedVoiceRoute = Readonly<{
  providerKey: string;
  modelKey: string;
  regionKey: string;
}>;

export class VoiceRuntimeStore {
  constructor(private readonly client: DatabaseClient) {}

  async reportInstall(deploymentKey: string, origin: string) {
    const rows = await this.client<{ verified: number }[]>`
      SELECT tenancy.report_voice_install(${hashOpaqueToken(deploymentKey)}, ${origin}) AS verified
    `;
    return rows[0]?.verified ?? 0;
  }

  async config(input: Readonly<{ deploymentKey: string; origin: string }>) {
    const rows = await this.client<{ brandingRemoved: boolean }[]>`
      SELECT branding_removed AS "brandingRemoved"
      FROM tenancy.voice_runtime_config(${hashOpaqueToken(input.deploymentKey)}, ${input.origin})
    `;
    return rows[0] ?? null;
  }

  async issue(input: Readonly<{ deploymentKey: string; origin: string; locale: "th" | "en"; expiresAt: Date }>): Promise<IssuedVoiceGrant> {
    const sessionGrant = `djay_voice_grant_${createOpaqueToken()}`;
    const deploymentKeyHash = hashOpaqueToken(input.deploymentKey);
    const active = await this.client<{ active: boolean }[]>`
      SELECT tenancy.voice_runtime_resource_active(${deploymentKeyHash}) AS active
    `;
    if (!active[0]?.active) throw new Error("voice_deployment_not_available");
    const rows = await this.client<{
      sessionId: string; capabilityProfile: "voice_gen1" | "voice_gen2";
      publicLabel: "First-Generation Voice Engine" | "Second-Generation Voice Engine";
      locale: "th" | "en"; greeting: string; automatedDisclosure: string;
      maxCallSeconds: number; reconnectWindowSeconds: number; expiresAt: Date;
    }[]>`
      SELECT session_id AS "sessionId", capability_profile AS "capabilityProfile",
             public_label AS "publicLabel", locale, greeting,
             automated_disclosure AS "automatedDisclosure",
             max_call_seconds AS "maxCallSeconds",
             reconnect_window_seconds AS "reconnectWindowSeconds", expires_at AS "expiresAt"
      FROM tenancy.issue_voice_session_grant(
        ${deploymentKeyHash}, ${hashOpaqueToken(sessionGrant)}, ${input.origin},
        ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
        ${input.expiresAt}, ${input.locale}
      )
    `;
    if (!rows[0]) throw new Error("voice_deployment_not_available");
    return { ...rows[0], expiresAt: rows[0].expiresAt.toISOString(), sessionGrant };
  }

  async authorize(input: Readonly<{
    sessionGrant: string; sessionId: string; origin: string;
    protocolVersion: "djay.voice.v1"; connectionId: string;
  }>) {
    const rows = await this.client<{
      sessionId: string; capabilityProfile: "voice_gen1" | "voice_gen2"; locale: "th" | "en";
      maxCallSeconds: number; reconnectWindowSeconds: number; replayed: boolean;
      routeProviderKey: string | null; routeModelKey: string | null; routeRegionKey: string | null;
    }[]>`
      SELECT session_id AS "sessionId", capability_profile AS "capabilityProfile", locale,
             max_call_seconds AS "maxCallSeconds",
             reconnect_window_seconds AS "reconnectWindowSeconds", replayed,
             route_provider_key AS "routeProviderKey", route_model_key AS "routeModelKey",
             route_region_key AS "routeRegionKey"
      FROM tenancy.authorize_voice_session(
        ${hashOpaqueToken(input.sessionGrant)}, ${input.sessionId}::uuid, ${input.origin},
        ${input.protocolVersion}, ${input.connectionId}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid
      )
    `;
    const authorized = rows[0];
    if (!authorized) return null;
    const {
      routeProviderKey, routeModelKey, routeRegionKey,
      reconnectWindowSeconds, ...session
    } = authorized;
    if (session.capabilityProfile === "voice_gen1") {
      if (routeProviderKey || routeModelKey || routeRegionKey) throw new Error("voice_route_contract_invalid");
      return { ...session, resumeWindowSeconds: reconnectWindowSeconds, route: null };
    }
    if (!routeProviderKey || !routeModelKey || !routeRegionKey) throw new Error("voice_route_contract_invalid");
    return {
      ...session,
      resumeWindowSeconds: reconnectWindowSeconds,
      route: { providerKey: routeProviderKey, modelKey: routeModelKey, regionKey: routeRegionKey },
    };
  }

  async disconnect(sessionId: string, connectionId: string) {
    const rows = await this.client<{ disconnected: boolean }[]>`
      SELECT tenancy.disconnect_voice_session(${sessionId}::uuid, ${connectionId}::uuid) AS disconnected
    `;
    return rows[0]?.disconnected ?? false;
  }

  async heartbeat(sessionId: string, connectionId: string) {
    const rows = await this.client<{
      alive: boolean; runtimeMode: "running" | "paused" | "emergency_stop";
    }[]>`
      SELECT alive, runtime_mode AS "runtimeMode"
      FROM tenancy.heartbeat_voice_session(${sessionId}::uuid, ${connectionId}::uuid)
    `;
    return rows[0] ?? { alive: false as const, runtimeMode: "emergency_stop" as const };
  }

  async mediaContext(sessionId: string, connectionId: string) {
    const rows = await this.client<{ greeting: string; automatedDisclosure: string; agentName: string }[]>`
      SELECT greeting, automated_disclosure AS "automatedDisclosure", agent_name AS "agentName"
      FROM tenancy.get_voice_media_context(${sessionId}::uuid, ${connectionId}::uuid)
    `;
    return rows[0] ?? null;
  }

  async beginTurn(input: Readonly<{
    sessionId: string; connectionId: string; inputId: string; message: string;
  }>): Promise<AiTurnContext> {
    const rows = await this.client<{
      sessionId: string; tenantId: string; conversationId: string; playbook: unknown | null;
      language: "th" | "en"; authority: unknown | null; turnSequence: number;
      recentMessages: unknown; knowledgeChunks: unknown; replayResponse: AiPublicResponse | null;
    }[]>`
      SELECT session_id AS "sessionId", tenant_id AS "tenantId", conversation_id AS "conversationId",
             playbook_json AS playbook, language, authority_json AS authority,
             turn_sequence AS "turnSequence", recent_messages AS "recentMessages",
             knowledge_chunks AS "knowledgeChunks", replay_response_json AS "replayResponse"
      FROM tenancy.begin_voice_turn(
        ${input.sessionId}::uuid, ${input.connectionId}::uuid, ${input.inputId}::uuid,
        ${randomUUID()}::uuid, ${input.message}, ${createHash("sha256").update(input.message).digest()}
      )
    `;
    if (!rows[0]) throw new Error("voice_turn_not_available");
    return rows[0];
  }

  async commitTurn(input: Readonly<{
    sessionId: string; connectionId: string; inputId: string; output: SalesCoreOutput;
    publicResponse: AiPublicResponse; nativeUsage: { inputUnits: number; outputUnits: number; cachedUnits?: number };
  }>) {
    const rows = await this.client<{ result: AiPublicResponse & {
      actionStatuses: { actionId: string; status: "succeeded" }[];
      terminalReason: "transferred" | "callback_requested" | null;
    } }[]>`
      SELECT tenancy.commit_voice_turn(
        ${input.sessionId}::uuid, ${input.connectionId}::uuid, ${input.inputId}::uuid,
        ${this.client.json(input.output)}, ${this.client.json(input.publicResponse)},
        ${input.nativeUsage.inputUnits}, ${input.nativeUsage.outputUnits}, ${input.nativeUsage.cachedUnits ?? 0}
      ) AS result
    `;
    if (!rows[0]) throw new Error("voice_turn_commit_failed");
    return rows[0].result;
  }

  async failTurn(input: Readonly<{
    sessionId: string; connectionId: string; inputId: string; errorCode: string;
  }>) {
    await this.client`
      SELECT tenancy.fail_voice_turn(
        ${input.sessionId}::uuid, ${input.connectionId}::uuid, ${input.inputId}::uuid, ${input.errorCode}
      )
    `;
  }

  async finish(input: Readonly<{
    sessionId: string; connectionId: string; elapsedSeconds: number;
    terminalReason: "completed" | "customer_ended" | "time_limit" | "idle_timeout" | "transferred" | "callback_requested" | "unavailable" | "grant_expired";
  }>) {
    const rows = await this.client<{ status: "ended" | "failed" | "expired"; customerMinutes: number; replayed: boolean }[]>`
      SELECT status, customer_minutes AS "customerMinutes", replayed
      FROM tenancy.finish_voice_session(
        ${input.sessionId}::uuid, ${input.connectionId}::uuid,
        ${input.elapsedSeconds}, ${input.terminalReason}
      )
    `;
    if (!rows[0]) throw new Error("voice_session_not_available");
    return rows[0];
  }
}
