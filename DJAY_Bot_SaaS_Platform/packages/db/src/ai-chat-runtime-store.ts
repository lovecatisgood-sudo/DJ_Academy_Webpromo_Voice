import { createHash, randomUUID } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken } from "@djay/auth";
import type { AiPublicResponse, AiTurnContext, AiTurnRepository } from "@djay/ai-chat-runtime";
import type { DatabaseClient } from "./client";

export class AiChatRuntimeStore implements AiTurnRepository {
  constructor(private readonly client: DatabaseClient) {}

  async config(deploymentKey: string, origin: string) {
    const deploymentKeyHash = hashOpaqueToken(deploymentKey);
    const active = await this.client<{ active: boolean }[]>`
      SELECT tenancy.ai_runtime_resource_active(${deploymentKeyHash}) AS active
    `;
    if (!active[0]?.active) return null;
    const rows = await this.client<{ agentName: string; defaultLanguage: "th" | "en"; brandingRemoved: boolean }[]>`
      SELECT agent_name AS "agentName", default_language AS "defaultLanguage", branding_removed AS "brandingRemoved"
      FROM tenancy.ai_runtime_config(${deploymentKeyHash}, ${origin})
    `;
    return rows[0] ?? null;
  }

  async reportInstall(deploymentKey: string, origin: string) {
    const rows = await this.client<{ report_ai_chat_install: number }[]>`
      SELECT tenancy.report_ai_chat_install(${hashOpaqueToken(deploymentKey)}, ${origin})
    `;
    return rows[0]?.report_ai_chat_install ?? 0;
  }

  async start(input: Readonly<{
    deploymentKey: string; origin: string; language: "th" | "en"; languageOverride?: "th" | "en";
  }>) {
    const sessionToken = `djay_ai_session_${createOpaqueToken()}`;
    const deploymentKeyHash = hashOpaqueToken(input.deploymentKey);
    const active = await this.client<{ active: boolean }[]>`
      SELECT tenancy.ai_runtime_resource_active(${deploymentKeyHash}) AS active
    `;
    if (!active[0]?.active) return null;
    const rows = await this.client<{ sessionId: string; conversationId: string; greeting: string; nextMessageSequence: number }[]>`
      SELECT session_id AS "sessionId", conversation_id AS "conversationId", greeting,
             next_message_sequence AS "nextMessageSequence"
      FROM tenancy.start_ai_session_localized(
        ${deploymentKeyHash}, ${hashOpaqueToken(sessionToken)}, ${input.origin},
        ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
        ${new Date(Date.now() + 24 * 60 * 60 * 1000)}, ${input.language}, ${input.languageOverride ?? null}
      )
    `;
    return rows[0] ? { sessionToken, ...rows[0] } : null;
  }

  async begin(input: Readonly<{ deploymentKey: string; sessionToken: string; origin: string; inputId: string; message: string }>): Promise<AiTurnContext> {
    const deploymentKeyHash = hashOpaqueToken(input.deploymentKey);
    const active = await this.client<{ active: boolean }[]>`
      SELECT tenancy.ai_runtime_resource_active(${deploymentKeyHash}) AS active
    `;
    if (!active[0]?.active) throw new Error("ai_turn_not_available");
    const rows = await this.client<{
      sessionId: string; tenantId: string; conversationId: string; playbook: unknown | null;
      language: "th" | "en"; authority: unknown | null; turnSequence: number;
      recentMessages: unknown; knowledgeChunks: unknown; replayResponse: AiPublicResponse | null;
    }[]>`
      SELECT session_id AS "sessionId", tenant_id AS "tenantId", conversation_id AS "conversationId",
             playbook_json AS playbook, language, authority_json AS authority,
             turn_sequence AS "turnSequence", recent_messages AS "recentMessages",
             knowledge_chunks AS "knowledgeChunks", replay_response_json AS "replayResponse"
      FROM tenancy.begin_ai_turn_localized(
        ${deploymentKeyHash}, ${hashOpaqueToken(input.sessionToken)},
        ${input.origin}, ${input.inputId}::uuid,
        ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${input.message},
        ${createHash("sha256").update(input.message).digest()}
      )
    `;
    if (!rows[0]) throw new Error("ai_turn_not_available");
    return rows[0];
  }

  async commit(input: Parameters<AiTurnRepository["commit"]>[0]) {
    const rows = await this.client<{ result: AiPublicResponse | { status: "handover" } }[]>`
      SELECT tenancy.commit_ai_turn(
        ${hashOpaqueToken(input.deploymentKey)}, ${hashOpaqueToken(input.sessionToken)},
        ${input.origin}, ${input.inputId}::uuid,
        ${this.client.json(input.output)}, ${this.client.json(input.publicResponse)},
        ${input.nativeUsage.inputUnits}, ${input.nativeUsage.outputUnits}, ${input.nativeUsage.cachedUnits ?? 0}
      ) AS result
    `;
    if (!rows[0]) throw new Error("ai_turn_commit_failed");
    return rows[0].result;
  }

  async fail(input: Readonly<{ deploymentKey: string; sessionToken: string; origin: string; inputId: string; errorCode: string }>) {
    await this.client`
      SELECT tenancy.fail_ai_turn_safe(
        ${hashOpaqueToken(input.deploymentKey)}, ${hashOpaqueToken(input.sessionToken)},
        ${input.origin}, ${input.inputId}::uuid, ${input.errorCode}
      )
    `;
  }

  async sync(input: Readonly<{ deploymentKey: string; sessionToken: string; origin: string; afterSequence: number }>) {
    const rows = await this.client<{ result: unknown | null }[]>`
      SELECT tenancy.sync_ai_session(
        ${hashOpaqueToken(input.deploymentKey)}, ${hashOpaqueToken(input.sessionToken)},
        ${input.origin}, ${input.afterSequence}
      ) AS result
    `;
    return rows[0]?.result ?? null;
  }
}
