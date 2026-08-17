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
}
