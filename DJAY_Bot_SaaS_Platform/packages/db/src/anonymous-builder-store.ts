import { randomUUID } from "node:crypto";
import type { DatabaseClient } from "./client";

export type AnonymousBuilderDraft = Readonly<{
  id: string;
  revision: number;
  schemaVersion: number;
  productFamily: "flow" | "text" | "voice" | null;
  planKey: string | null;
  state: unknown;
  expiresAt: Date;
  updatedAt: Date;
}>;

type DraftRow = Readonly<{
  id: string;
  revision: number;
  schema_version: number;
  product_family: AnonymousBuilderDraft["productFamily"];
  plan_key: string | null;
  state: unknown;
  expires_at: Date;
  updated_at: Date;
}>;

function draftFromRow(row: DraftRow): AnonymousBuilderDraft {
  return Object.freeze({
    id: row.id,
    revision: row.revision,
    schemaVersion: row.schema_version,
    productFamily: row.product_family,
    planKey: row.plan_key,
    state: row.state,
    expiresAt: row.expires_at,
    updatedAt: row.updated_at,
  });
}

export class AnonymousBuilderStore {
  constructor(private readonly client: DatabaseClient) {}

  async ensureDraft(input: Readonly<{
    sessionId: string;
    issuedAt: Date;
    expiresAt: Date;
    now?: Date;
  }>): Promise<AnonymousBuilderDraft | null> {
    const now = input.now ?? new Date();
    return this.client.begin(async (sql) => {
      await sql`
        INSERT INTO builder.anonymous_sessions (id, issued_at, expires_at, last_seen_at)
        VALUES (${input.sessionId}::uuid, ${input.issuedAt}, ${input.expiresAt}, ${now})
        ON CONFLICT (id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at
        WHERE builder.anonymous_sessions.status = 'active'
          AND builder.anonymous_sessions.issued_at = EXCLUDED.issued_at
          AND builder.anonymous_sessions.expires_at = EXCLUDED.expires_at
          AND builder.anonymous_sessions.expires_at > EXCLUDED.last_seen_at
      `;
      const sessions = await sql<{ id: string }[]>`
        SELECT id FROM builder.anonymous_sessions
        WHERE id = ${input.sessionId}::uuid
          AND issued_at = ${input.issuedAt}
          AND expires_at = ${input.expiresAt}
          AND status = 'active'
          AND expires_at > ${now}
        FOR UPDATE
      `;
      if (!sessions[0]) return null;

      const initialState = { schemaVersion: 1, locale: "th" };
      const created = await sql<DraftRow[]>`
        INSERT INTO builder.drafts (id, session_id, state_json, expires_at)
        VALUES (${randomUUID()}::uuid, ${input.sessionId}::uuid, ${sql.json(initialState)}, ${input.expiresAt})
        ON CONFLICT (session_id) DO NOTHING
        RETURNING id, revision, schema_version, product_family, plan_key,
          state_json AS state, expires_at, updated_at
      `;
      const rows = created[0] ? created : await sql<DraftRow[]>`
        SELECT id, revision, schema_version, product_family, plan_key,
          state_json AS state, expires_at, updated_at
        FROM builder.drafts
        WHERE session_id = ${input.sessionId}::uuid
          AND status = 'active'
          AND expires_at > ${now}
        LIMIT 1
      `;
      const row = rows[0];
      if (!row) return null;
      await sql`
        INSERT INTO builder.draft_revisions (draft_id, revision, schema_version, state_json, created_at)
        VALUES (${row.id}::uuid, ${row.revision}, ${row.schema_version}, ${sql.json(row.state as never)}, ${now})
        ON CONFLICT (draft_id, revision) DO NOTHING
      `;
      return draftFromRow(row);
    });
  }

  async updateDraft(input: Readonly<{
    sessionId: string;
    revision: number;
    schemaVersion: number;
    productFamily: AnonymousBuilderDraft["productFamily"];
    planKey: string | null;
    state: object;
    now?: Date;
  }>): Promise<Readonly<{
    status: "updated" | "conflict" | "unavailable";
    draft?: AnonymousBuilderDraft;
  }>> {
    const now = input.now ?? new Date();
    return this.client.begin(async (sql) => {
      const rows = await sql<DraftRow[]>`
        SELECT draft.id, draft.revision, draft.schema_version, draft.product_family, draft.plan_key,
          draft.state_json AS state, draft.expires_at, draft.updated_at
        FROM builder.drafts draft
        JOIN builder.anonymous_sessions session ON session.id = draft.session_id
        WHERE draft.session_id = ${input.sessionId}::uuid
          AND draft.status = 'active'
          AND session.status = 'active'
          AND session.pending_registration_id IS NULL
          AND draft.expires_at > ${now}
          AND session.expires_at > ${now}
        FOR UPDATE OF draft
      `;
      const current = rows[0];
      if (!current) return { status: "unavailable" as const };
      if (current.revision !== input.revision) {
        return { status: "conflict" as const, draft: draftFromRow(current) };
      }
      const nextRevision = current.revision + 1;
      const updated = await sql<DraftRow[]>`
        UPDATE builder.drafts
        SET revision = ${nextRevision},
            schema_version = ${input.schemaVersion},
            product_family = ${input.productFamily},
            plan_key = ${input.planKey},
            state_json = ${sql.json(input.state as never)},
            updated_at = ${now}
        WHERE id = ${current.id}::uuid AND revision = ${current.revision}
        RETURNING id, revision, schema_version, product_family, plan_key,
          state_json AS state, expires_at, updated_at
      `;
      const draft = updated[0];
      if (!draft) return { status: "conflict" as const };
      await sql`
        INSERT INTO builder.draft_revisions (draft_id, revision, schema_version, state_json, created_at)
        VALUES (${draft.id}::uuid, ${draft.revision}, ${draft.schema_version}, ${sql.json(draft.state as never)}, ${now})
      `;
      return { status: "updated" as const, draft: draftFromRow(draft) };
    });
  }

  async issueClaimContinuation(input: Readonly<{
    sessionId: string;
    tokenHash: Buffer;
    now?: Date;
    expiresAt: Date;
  }>): Promise<Readonly<{ status: "issued"; draftRevision: number } | { status: "unavailable" }>> {
    const now = input.now ?? new Date();
    return this.client.begin(async (sql) => {
      const rows = await sql<{ draft_id: string; revision: number }[]>`
        SELECT draft.id AS draft_id, draft.revision
        FROM builder.anonymous_sessions session
        JOIN builder.drafts draft ON draft.session_id = session.id
        WHERE session.id = ${input.sessionId}::uuid
          AND session.status = 'active'
          AND session.pending_registration_id IS NULL
          AND session.expires_at > ${now}
          AND draft.status = 'active'
          AND draft.expires_at > ${now}
          AND draft.product_family IS NOT NULL
          AND draft.plan_key IS NOT NULL
        FOR UPDATE OF session, draft
      `;
      const draft = rows[0];
      if (!draft || input.expiresAt.getTime() <= now.getTime()) return { status: "unavailable" as const };
      await sql`
        UPDATE builder.claim_continuations
        SET status = 'superseded', consumed_at = ${now}
        WHERE session_id = ${input.sessionId}::uuid AND status = 'issued'
      `;
      await sql`
        INSERT INTO builder.claim_continuations (
          token_hash, session_id, draft_id, draft_revision, expires_at
        ) VALUES (
          ${input.tokenHash}, ${input.sessionId}::uuid, ${draft.draft_id}::uuid,
          ${draft.revision}, ${input.expiresAt}
        )
      `;
      return { status: "issued" as const, draftRevision: draft.revision };
    });
  }

  async claimExistingAccountDraft(input: Readonly<{
    tokenHash: Buffer;
    tenantId: string;
    userId: string;
    membershipId: string;
    requestId: string;
    now?: Date;
    purchaseIntentId?: string;
  }>): Promise<Readonly<{ status: "claimed" | "replayed"; planKey: string } | { status: "unavailable" }>> {
    const now = input.now ?? new Date();
    const purchaseIntentId = input.purchaseIntentId ?? randomUUID();
    return this.client.begin(async (sql) => {
      const rows = await sql<{
        continuation_id: string; continuation_status: string; continuation_expires_at: Date;
        claimed_tenant_id: string | null; session_id: string; session_status: string;
        pending_registration_id: string | null; session_expires_at: Date;
        draft_id: string; draft_status: string; revision: number; pinned_revision: number;
        draft_expires_at: Date;
        schema_version: number; product_family: "flow" | "text" | "voice" | null;
        plan_key: string | null; state_json: unknown;
      }[]>`
        SELECT continuation.id AS continuation_id, continuation.status AS continuation_status,
          continuation.expires_at AS continuation_expires_at,
          continuation.claimed_tenant_id, session.id AS session_id, session.status AS session_status,
          session.pending_registration_id, session.expires_at AS session_expires_at,
          draft.id AS draft_id, draft.status AS draft_status, draft.revision,
          draft.expires_at AS draft_expires_at,
          continuation.draft_revision AS pinned_revision, draft.schema_version,
          draft.product_family, draft.plan_key, draft.state_json
        FROM builder.claim_continuations continuation
        JOIN builder.anonymous_sessions session ON session.id = continuation.session_id
        JOIN builder.drafts draft ON draft.id = continuation.draft_id AND draft.session_id = session.id
        WHERE continuation.token_hash = ${input.tokenHash}
        FOR UPDATE OF continuation, session, draft
      `;
      const claim = rows[0];
      if (!claim) return { status: "unavailable" as const };
      if (claim.continuation_status === "consumed"
        && claim.claimed_tenant_id === input.tenantId && claim.plan_key) {
        return { status: "replayed" as const, planKey: claim.plan_key };
      }
      if (claim.continuation_status !== "issued"
        || claim.continuation_expires_at.getTime() <= now.getTime()
        || claim.session_status !== "active" || claim.draft_status !== "active"
        || claim.pending_registration_id !== null
        || claim.session_expires_at.getTime() <= now.getTime()
        || claim.draft_expires_at.getTime() <= now.getTime()
        || claim.revision !== claim.pinned_revision || !claim.product_family || !claim.plan_key) {
        return { status: "unavailable" as const };
      }
      await sql`
        SELECT set_config('app.tenant_id', ${input.tenantId}, true),
          set_config('app.user_id', ${input.userId}, true),
          set_config('app.membership_id', ${input.membershipId}, true),
          set_config('app.request_id', ${input.requestId}, true)
      `;
      const memberships = await sql<{ role: string }[]>`
        SELECT role FROM tenancy.memberships
        WHERE id = ${input.membershipId}::uuid
          AND tenant_id = ${input.tenantId}::uuid
          AND user_id = ${input.userId}::uuid
          AND status = 'active'
          AND role IN ('tenant_master_admin', 'tenant_admin')
        FOR UPDATE
      `;
      if (!memberships[0]) return { status: "unavailable" as const };
      const planRows = await sql<{ plan_version_id: string }[]>`
        SELECT version.id AS plan_version_id
        FROM catalog.catalog_versions catalog_version
        JOIN catalog.plan_commercial_terms terms ON terms.catalog_version_id = catalog_version.id
        JOIN catalog.plan_versions version ON version.id = terms.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id
        WHERE plan.plan_key = ${claim.plan_key}
          AND plan.status = 'active' AND catalog_version.status = 'active'
          AND catalog_version.effective_from <= ${now}
          AND (catalog_version.effective_to IS NULL OR catalog_version.effective_to > ${now})
          AND version.status = 'published' AND version.effective_from <= ${now}
          AND (version.effective_to IS NULL OR version.effective_to > ${now})
        ORDER BY version.version DESC LIMIT 1
      `;
      if (!planRows[0]) return { status: "unavailable" as const };
      await sql`
        INSERT INTO tenancy.builder_draft_claims (
          tenant_id, claimed_by_user_id, claimed_by_membership_id,
          source_session_id, source_draft_id, source_revision, schema_version,
          product_family, plan_key, state_json, claimed_at
        ) VALUES (
          ${input.tenantId}::uuid, ${input.userId}::uuid, ${input.membershipId}::uuid,
          ${claim.session_id}::uuid, ${claim.draft_id}::uuid, ${claim.revision},
          ${claim.schema_version}, ${claim.product_family}, ${claim.plan_key},
          ${sql.json(claim.state_json as never)}, ${now}
        )
      `;
      await sql`
        INSERT INTO billing.purchase_intents (
          id, registration_id, tenant_id, plan_key, plan_version_id,
          status, created_at, expires_at
        ) VALUES (
          ${purchaseIntentId}::uuid, NULL, ${input.tenantId}::uuid, ${claim.plan_key},
          ${planRows[0].plan_version_id}::uuid, 'open', ${now},
          ${new Date(now.getTime() + 72 * 60 * 60 * 1000)}
        )
      `;
      await sql`UPDATE builder.drafts SET status = 'claimed', updated_at = ${now} WHERE id = ${claim.draft_id}::uuid`;
      await sql`
        UPDATE builder.anonymous_sessions
        SET status = 'claimed', pending_registration_id = NULL,
          claimed_registration_id = NULL, claimed_tenant_id = ${input.tenantId}::uuid,
          claimed_at = ${now}, last_seen_at = ${now}
        WHERE id = ${claim.session_id}::uuid
      `;
      await sql`
        UPDATE builder.claim_continuations
        SET status = 'consumed', consumed_at = ${now}, claimed_tenant_id = ${input.tenantId}::uuid
        WHERE id = ${claim.continuation_id}::uuid
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${input.tenantId}::uuid, ${input.userId}::uuid, ${input.membershipId}::uuid,
          'tenant.builder_draft_claimed', 'builder_draft', ${claim.draft_id},
          ${input.requestId}, 'succeeded',
          ${sql.json({ revision: claim.revision, productFamily: claim.product_family, planKey: claim.plan_key })}
        )
      `;
      return { status: "claimed" as const, planKey: claim.plan_key };
    });
  }
}
