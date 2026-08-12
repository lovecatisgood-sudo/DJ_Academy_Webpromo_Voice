import { createHash, randomUUID } from "node:crypto";
import { sealJson } from "@djay/auth";
import type { PlatformContext, TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withPlatformTransaction, withTenantTransaction } from "./scoped-transaction";

export class TenantVoiceTelephonyStore {
  constructor(private readonly client: DatabaseClient) {}
  async calendarOverview(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ advanced: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
        WHERE snapshot.tenant_id = ${context.tenantId}::uuid AND snapshot.product_key = 'voice' AND snapshot.access_mode = 'active'
          AND subscription.status IN ('active','trialing','scheduled_change')
          AND snapshot.resolved_json->'entitlements'->>'voice.capability_profile' = 'voice_gen2') AS advanced`;
      const profiles = await sql<{ id: string; name: string; providerKind: string; status: string; createdAt: Date }[]>`
        SELECT id, name, provider_kind AS "providerKind", status, created_at AS "createdAt"
        FROM tenancy.voice_scheduling_profiles WHERE tenant_id = ${context.tenantId}::uuid
        ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, created_at DESC, id DESC`;
      return { advanced: authority[0]?.advanced === true, profiles };
    });
  }
  async overview(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ advanced: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
        WHERE snapshot.tenant_id = ${context.tenantId}::uuid AND snapshot.product_key = 'voice' AND snapshot.access_mode = 'active'
          AND subscription.status IN ('active','trialing','scheduled_change')
          AND snapshot.resolved_json->'entitlements'->>'voice.capability_profile' = 'voice_gen2') AS advanced`;
      const profiles = await sql<{ id: string; deploymentId: string; name: string; status: string; fallbackMode: string; providerKey: string; numberStatus: string | null; countryCode: string | null }[]>`
        SELECT profile.id, profile.deployment_id AS "deploymentId", profile.name, profile.status, profile.fallback_mode AS "fallbackMode",
          carrier.provider_key AS "providerKey", number.status AS "numberStatus", number.country_code AS "countryCode"
        FROM tenancy.voice_telephony_profiles profile JOIN platform.voice_carrier_profiles carrier ON carrier.id = profile.carrier_profile_id
        LEFT JOIN tenancy.voice_phone_numbers number ON number.tenant_id = profile.tenant_id AND number.telephony_profile_id = profile.id AND number.status <> 'released'
        WHERE profile.tenant_id = ${context.tenantId}::uuid ORDER BY profile.created_at DESC`;
      const recordingPolicies = await sql<{ deploymentId: string; version: number; recordingMode: string; retentionDays: number | null; createdAt: Date }[]>`
        SELECT DISTINCT ON (deployment_id) deployment_id AS "deploymentId", version, recording_mode AS "recordingMode", retention_days AS "retentionDays", created_at AS "createdAt"
        FROM tenancy.voice_recording_policies WHERE tenant_id = ${context.tenantId}::uuid ORDER BY deployment_id, version DESC`;
      const schedulingProfiles = await sql<{ id: string; name: string; providerKind: string; status: string }[]>`
        SELECT id, name, provider_kind AS "providerKind", status FROM tenancy.voice_scheduling_profiles WHERE tenant_id = ${context.tenantId}::uuid ORDER BY created_at DESC`;
      return { advanced: authority[0]?.advanced === true, carrierSelectionAvailable: profiles.length > 0, profiles, recordingPolicies, schedulingProfiles };
    });
  }

  async setRecordingPolicy(context: TenantContext, input: Readonly<{ deploymentId: string; recordingMode: "disabled" | "consent_required"; retentionDays?: number; disclosureTh?: string; disclosureEn?: string; legalApprovalReference?: string }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const versions = await sql<{ version: number }[]>`SELECT COALESCE(max(version), 0)::int + 1 AS version FROM tenancy.voice_recording_policies
        WHERE tenant_id = ${context.tenantId}::uuid AND deployment_id = ${input.deploymentId}::uuid`;
      const rows = await sql<{ version: number }[]>`INSERT INTO tenancy.voice_recording_policies
        (tenant_id, deployment_id, version, recording_mode, retention_days, disclosure_th, disclosure_en, legal_approval_reference, created_by_membership_id)
        SELECT ${context.tenantId}::uuid, deployment.id, ${versions[0]!.version}, ${input.recordingMode}, ${input.retentionDays ?? null},
          ${input.disclosureTh ?? null}, ${input.disclosureEn ?? null}, ${input.legalApprovalReference ?? null}, ${context.membershipId}::uuid
        FROM tenancy.voice_deployments deployment WHERE deployment.tenant_id = ${context.tenantId}::uuid AND deployment.id = ${input.deploymentId}::uuid
        RETURNING version`;
      return rows[0] ? { status: "created" as const, version: rows[0].version } : { status: "not_found" as const };
    });
  }

  async createSchedulingProfile(context: TenantContext, input: Readonly<{ name: string; providerKind: "google_calendar" | "webhook"; config: Record<string, unknown>; envelopeKey: Buffer }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ entitled: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
        WHERE snapshot.tenant_id = ${context.tenantId}::uuid AND snapshot.product_key = 'voice' AND snapshot.access_mode = 'active'
          AND subscription.status IN ('active','trialing','scheduled_change')
          AND snapshot.resolved_json->'entitlements'->>'voice.capability_profile' = 'voice_gen2') AS entitled`;
      if (!authority[0]?.entitled) return { status: "not_entitled" as const };
      const id = randomUUID();
      await sql`UPDATE tenancy.voice_scheduling_profiles SET status = 'disabled', updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active'`;
      await sql`INSERT INTO tenancy.voice_scheduling_profiles (id, tenant_id, name, provider_kind, config_ciphertext, created_by_membership_id)
        VALUES (${id}::uuid, ${context.tenantId}::uuid, ${input.name}, ${input.providerKind}, ${sealJson(input.config, input.envelopeKey)}, ${context.membershipId}::uuid)`;
      await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id, request_id, result, metadata)
        VALUES (${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid, 'appointment_calendar.connected',
          'voice_scheduling_profile', ${id}, ${context.requestId}, 'succeeded', ${sql.json({ providerKind: input.providerKind })})`;
      return { status: "created" as const, schedulingProfileId: id };
    });
  }

  async setSchedulingProfileStatus(context: TenantContext, profileId: string, status: "active" | "disabled") {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const current = await sql<{ status: string }[]>`SELECT status FROM tenancy.voice_scheduling_profiles
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${profileId}::uuid FOR UPDATE`;
      if (!current[0] || current[0].status === "revoked") return { status: "not_found" as const };
      if (current[0].status === status) return { status: "accepted" as const, replayed: true as const };
      if (status === "active") await sql`UPDATE tenancy.voice_scheduling_profiles SET status = 'disabled', updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active'`;
      await sql`UPDATE tenancy.voice_scheduling_profiles SET status = ${status}, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${profileId}::uuid`;
      await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id, request_id, result, metadata)
        VALUES (${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid, 'appointment_calendar.status_changed',
          'voice_scheduling_profile', ${profileId}, ${context.requestId}, 'succeeded', ${sql.json({ from: current[0].status, to: status })})`;
      return { status: "accepted" as const, replayed: false as const };
    });
  }
}

export class PlatformVoiceCarrierStore {
  constructor(private readonly client: DatabaseClient) {}
  async list(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => sql<{ id: string; providerKey: string; environment: string; status: string; supportsInbound: boolean; supportsTransfer: boolean; supportsMediaStream: boolean; createdAt: Date }[]>`
      SELECT id, provider_key AS "providerKey", environment, status, supports_inbound AS "supportsInbound", supports_transfer AS "supportsTransfer",
        supports_media_stream AS "supportsMediaStream", created_at AS "createdAt" FROM platform.voice_carrier_profiles ORDER BY created_at DESC`);
  }
  async propose(context: PlatformContext, input: Readonly<{ providerKey: string; environment: "sandbox" | "production"; secretReference: string }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const id = randomUUID();
      await sql`INSERT INTO platform.voice_carrier_profiles (id, provider_key, environment, secret_reference, proposed_by_platform_user_id)
        VALUES (${id}::uuid, ${input.providerKey}, ${input.environment}, ${input.secretReference}, ${context.platformUserId}::uuid)`;
      return { status: "proposed" as const, carrierProfileId: id };
    });
  }
  async qualify(context: PlatformContext, carrierProfileId: string, input: Readonly<{ evidence: string; inbound: boolean; transfer: boolean; mediaStream: boolean }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ id: string }[]>`UPDATE platform.voice_carrier_profiles SET status = 'qualified', supports_inbound = ${input.inbound},
        supports_transfer = ${input.transfer}, supports_media_stream = ${input.mediaStream}, reviewed_by_platform_user_id = ${context.platformUserId}::uuid,
        qualification_evidence_sha256 = ${createHash("sha256").update(input.evidence).digest()}, reviewed_at = now()
        WHERE id = ${carrierProfileId}::uuid AND status = 'proposed' AND proposed_by_platform_user_id <> ${context.platformUserId}::uuid RETURNING id`;
      return rows[0] ? { status: "qualified" as const } : { status: "not_qualifiable" as const };
    });
  }
  async provisionNumber(context: PlatformContext, input: Readonly<{ tenantId: string; deploymentId: string; carrierProfileId: string; name: string; providerNumberRef: string; displayNumber: string; countryCode: string; envelopeKey: Buffer }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const profileId = randomUUID(); const numberId = randomUUID();
      const rows = await sql<{ id: string }[]>`WITH profile AS (INSERT INTO tenancy.voice_telephony_profiles
        (id, tenant_id, deployment_id, carrier_profile_id, name, status, created_by_membership_id)
        SELECT ${profileId}::uuid, deployment.tenant_id, deployment.id, carrier.id, ${input.name}, 'active', membership.id
        FROM tenancy.voice_deployments deployment JOIN platform.voice_carrier_profiles carrier ON carrier.id = ${input.carrierProfileId}::uuid
          AND carrier.status IN ('qualified','active') AND carrier.supports_inbound AND carrier.supports_media_stream
        JOIN LATERAL (SELECT id FROM tenancy.memberships WHERE tenant_id = deployment.tenant_id AND role = 'owner' AND status = 'active' ORDER BY created_at LIMIT 1) membership ON true
        WHERE deployment.tenant_id = ${input.tenantId}::uuid AND deployment.id = ${input.deploymentId}::uuid AND deployment.capability_profile = 'voice_gen2'
        RETURNING tenant_id, id)
        INSERT INTO tenancy.voice_phone_numbers (id, tenant_id, telephony_profile_id, provider_number_ref, display_number_ciphertext, country_code, status, activated_at)
        SELECT ${numberId}::uuid, profile.tenant_id, profile.id, ${input.providerNumberRef}, ${sealJson({ value: input.displayNumber }, input.envelopeKey)}, ${input.countryCode}, 'active', now()
        FROM profile RETURNING id`;
      return rows[0] ? { status: "provisioned" as const, telephonyProfileId: profileId, numberId } : { status: "not_provisionable" as const };
    });
  }
}
