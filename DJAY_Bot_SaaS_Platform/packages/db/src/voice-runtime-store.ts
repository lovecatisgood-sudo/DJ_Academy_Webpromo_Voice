import { randomUUID } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken } from "@djay/auth";
import type { VoiceSessionGrant } from "@djay/voice-runtime";
import type { DatabaseClient } from "./client";

type IssuedVoiceGrant = Omit<VoiceSessionGrant, "sessionGrant" | "gatewayUrl" | "protocolVersion" | "reconnectPolicy" | "automatedAgentDisclosure" | "recording"> & {
  sessionGrant: string;
  reconnectWindowSeconds: number;
  automatedDisclosure: string;
};

export class VoiceRuntimeStore {
  constructor(private readonly client: DatabaseClient) {}

  async issue(input: Readonly<{ deploymentKey: string; origin: string; locale: "th" | "en"; expiresAt: Date }>): Promise<IssuedVoiceGrant> {
    const sessionGrant = `djay_voice_grant_${createOpaqueToken()}`;
    const rows = await this.client<{
      sessionId: string; capabilityProfile: "voice_gen1"; publicLabel: "First-Generation Voice Engine";
      locale: "th" | "en"; greeting: string; automatedDisclosure: string;
      maxCallSeconds: number; reconnectWindowSeconds: number; expiresAt: Date;
    }[]>`
      SELECT session_id AS "sessionId", capability_profile AS "capabilityProfile",
             public_label AS "publicLabel", locale, greeting,
             automated_disclosure AS "automatedDisclosure",
             max_call_seconds AS "maxCallSeconds",
             reconnect_window_seconds AS "reconnectWindowSeconds", expires_at AS "expiresAt"
      FROM tenancy.issue_voice_basic_grant(
        ${hashOpaqueToken(input.deploymentKey)}, ${hashOpaqueToken(sessionGrant)}, ${input.origin},
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
      sessionId: string; capabilityProfile: "voice_gen1"; locale: "th" | "en";
      maxCallSeconds: number; reconnectWindowSeconds: number; replayed: boolean;
    }[]>`
      SELECT session_id AS "sessionId", capability_profile AS "capabilityProfile", locale,
             max_call_seconds AS "maxCallSeconds",
             reconnect_window_seconds AS "reconnectWindowSeconds", replayed
      FROM tenancy.authorize_voice_basic_session(
        ${hashOpaqueToken(input.sessionGrant)}, ${input.sessionId}::uuid, ${input.origin},
        ${input.protocolVersion}, ${input.connectionId}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid
      )
    `;
    return rows[0] ?? null;
  }

  async disconnect(sessionId: string, connectionId: string) {
    const rows = await this.client<{ disconnected: boolean }[]>`
      SELECT tenancy.disconnect_voice_basic_session(${sessionId}::uuid, ${connectionId}::uuid) AS disconnected
    `;
    return rows[0]?.disconnected ?? false;
  }

  async finish(input: Readonly<{
    sessionId: string; connectionId: string; elapsedSeconds: number;
    terminalReason: "completed" | "customer_ended" | "time_limit" | "idle_timeout" | "transferred" | "callback_requested" | "unavailable" | "grant_expired";
  }>) {
    const rows = await this.client<{ status: "ended" | "failed" | "expired"; customerMinutes: number; replayed: boolean }[]>`
      SELECT status, customer_minutes AS "customerMinutes", replayed
      FROM tenancy.finish_voice_basic_session(
        ${input.sessionId}::uuid, ${input.connectionId}::uuid,
        ${input.elapsedSeconds}, ${input.terminalReason}
      )
    `;
    if (!rows[0]) throw new Error("voice_session_not_available");
    return rows[0];
  }
}
