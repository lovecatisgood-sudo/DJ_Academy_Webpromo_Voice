import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AnonymousBuilderStore } from "./anonymous-builder-store";
import { createDatabaseClient } from "./client";

const authUrl = process.env.AUTH_DATABASE_URL;
const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(authUrl && tenantUrl && adminUrl);
const authClient = enabled ? createDatabaseClient(authUrl!) : null;
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await authClient?.end();
  await tenantClient?.end();
  await adminClient?.end();
});

describe.runIf(enabled)("anonymous Builder drafts", () => {
  it("persists one versioned draft per signed session with optimistic conflicts", async () => {
    const store = new AnonymousBuilderStore(authClient!);
    const now = new Date("2026-08-17T04:00:00.000Z");
    const expiresAt = new Date("2026-09-16T04:00:00.000Z");
    const sessionId = randomUUID();
    const session = { sessionId, issuedAt: now, expiresAt, now };

    const created = await store.ensureDraft(session);
    expect(created).toMatchObject({ revision: 1, schemaVersion: 1, state: { locale: "th" } });
    await expect(store.ensureDraft({ ...session, now: new Date(now.getTime() + 1_000) }))
      .resolves.toMatchObject({ id: created!.id, revision: 1 });

    const updated = await store.updateDraft({
      sessionId,
      revision: 1,
      schemaVersion: 1,
      productFamily: "text",
      planKey: "ai_chat_basic",
      state: { schemaVersion: 1, locale: "en", family: "text", businessProfile: { name: "Siamese" } },
      now: new Date(now.getTime() + 2_000),
    });
    expect(updated).toMatchObject({ status: "updated", draft: { revision: 2, productFamily: "text" } });

    await expect(store.updateDraft({
      sessionId,
      revision: 1,
      schemaVersion: 1,
      productFamily: "voice",
      planKey: "voice_basic_gen1",
      state: { schemaVersion: 1, locale: "th", family: "voice" },
      now: new Date(now.getTime() + 3_000),
    })).resolves.toMatchObject({ status: "conflict", draft: { revision: 2, productFamily: "text" } });

    const revisions = await adminClient!<{ revision: number; state: unknown }[]>`
      SELECT revision, state_json AS state
      FROM builder.draft_revisions
      WHERE draft_id = ${created!.id}::uuid
      ORDER BY revision
    `;
    expect(revisions.map((row) => row.revision)).toEqual([1, 2]);
    await expect(tenantClient!`SELECT id FROM builder.drafts WHERE id = ${created!.id}::uuid`)
      .rejects.toThrow();
  });

  it("does not accept altered session authority or an expired session", async () => {
    const store = new AnonymousBuilderStore(authClient!);
    const issuedAt = new Date("2026-08-17T04:00:00.000Z");
    const expiresAt = new Date("2026-09-16T04:00:00.000Z");
    const sessionId = randomUUID();
    await expect(store.ensureDraft({ sessionId, issuedAt, expiresAt, now: issuedAt })).resolves.toBeTruthy();

    await expect(store.ensureDraft({
      sessionId,
      issuedAt: new Date(issuedAt.getTime() + 1_000),
      expiresAt,
      now: new Date(issuedAt.getTime() + 2_000),
    })).resolves.toBeNull();
    await expect(store.updateDraft({
      sessionId,
      revision: 1,
      schemaVersion: 1,
      productFamily: null,
      planKey: null,
      state: { schemaVersion: 1, locale: "th" },
      now: expiresAt,
    })).resolves.toEqual({ status: "unavailable" });
  });
});
