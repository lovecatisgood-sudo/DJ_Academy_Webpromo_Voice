import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { AnonymousBuilderImportStore } from "./anonymous-builder-import-store";
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

async function fixture(now: Date) {
  const sessionId = randomUUID();
  const draft = await new AnonymousBuilderStore(authClient!).ensureDraft({
    sessionId,
    issuedAt: now,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1_000),
    now,
  });
  if (!draft) throw new Error("anonymous_builder_fixture_failed");
  return { sessionId, draft };
}

describe.runIf(enabled)("anonymous Builder website import jobs", () => {
  it("creates idempotently, completes with provenance, and preserves immutable evidence", async () => {
    const now = new Date("2026-08-17T06:00:00.000Z");
    const { sessionId, draft } = await fixture(now);
    const store = new AnonymousBuilderImportStore(authClient!);
    const idempotencyKey = randomUUID();
    const input = {
      sessionId, idempotencyKey, draftRevision: draft.revision,
      requestedUrl: "djai.academy", normalizedUrl: "https://djai.academy/", now,
    };
    const created = await store.createJob(input);
    expect(created).toMatchObject({ status: "created", job: { status: "queued", generation: 1 } });
    await expect(store.createJob(input)).resolves.toMatchObject({ status: "replayed", job: { id: created.job!.id } });
    await expect(store.createJob({ ...input, normalizedUrl: "https://example.com/" }))
      .resolves.toEqual({ status: "conflict" });

    const claimed = await store.claimJob(sessionId, created.job!.id, new Date(now.getTime() + 1_000));
    expect(claimed).toMatchObject({ status: "started", job: { generation: 1 } });
    const profile = { name: "DJAI", pageCount: 1, sources: [{ name: "Home", url: "https://djai.academy/" }] };
    const completed = await store.completeJob({
      sessionId, jobId: created.job!.id, generation: 1, profile,
      warnings: [], provenance: profile.sources, pageCount: 1,
      now: new Date(now.getTime() + 2_000),
    });
    expect(completed).toMatchObject({ status: "completed", job: { profile } });
    await expect(store.claimJob(sessionId, created.job!.id)).resolves.toMatchObject({ status: "completed" });
    await expect(store.getJob(randomUUID(), created.job!.id)).resolves.toBeNull();

    const attempts = await adminClient!<{ status: string; digest_length: number }[]>`
      SELECT status, octet_length(profile_sha256)::int AS digest_length
      FROM builder.website_import_attempts WHERE job_id = ${created.job!.id}::uuid
    `;
    expect(attempts).toEqual([{ status: "completed", digest_length: 32 }]);
    await expect(adminClient!`
      UPDATE builder.website_import_attempts SET status = 'failed' WHERE job_id = ${created.job!.id}::uuid
    `).rejects.toThrow("builder_website_import_attempts_are_immutable");
    await expect(tenantClient!`SELECT id FROM builder.website_import_jobs WHERE id = ${created.job!.id}::uuid`)
      .rejects.toThrow();
  });

  it("supports bounded retries and cancellation without allowing a late completion", async () => {
    const now = new Date("2026-08-17T07:00:00.000Z");
    const { sessionId, draft } = await fixture(now);
    const store = new AnonymousBuilderImportStore(authClient!);
    const created = await store.createJob({
      sessionId, idempotencyKey: randomUUID(), draftRevision: draft.revision,
      requestedUrl: "example.com", normalizedUrl: "https://example.com/", now,
    });
    const jobId = created.job!.id;
    await expect(store.claimJob(sessionId, jobId, new Date(now.getTime() + 1_000)))
      .resolves.toMatchObject({ status: "started", job: { generation: 1 } });
    await expect(store.failJob({ sessionId, jobId, generation: 1, reason: "website_timeout", now: new Date(now.getTime() + 2_000) }))
      .resolves.toEqual({ status: "failed" });
    await expect(store.claimJob(sessionId, jobId, new Date(now.getTime() + 3_000)))
      .resolves.toMatchObject({ status: "started", job: { generation: 2 } });
    await expect(store.cancelJob(sessionId, jobId, new Date(now.getTime() + 4_000)))
      .resolves.toEqual({ status: "cancelled" });
    await expect(store.completeJob({
      sessionId, jobId, generation: 2, profile: {}, warnings: [], provenance: [], pageCount: 0,
      now: new Date(now.getTime() + 5_000),
    })).resolves.toEqual({ status: "cancelled" });
    await expect(store.claimJob(sessionId, jobId, new Date(now.getTime() + 6_000)))
      .resolves.toMatchObject({ status: "started", job: { generation: 3 } });
    await expect(store.failJob({ sessionId, jobId, generation: 3, reason: "website_http_rejected", now: new Date(now.getTime() + 7_000) }))
      .resolves.toEqual({ status: "failed" });
    await expect(store.claimJob(sessionId, jobId, new Date(now.getTime() + 8_000)))
      .resolves.toMatchObject({ status: "retry_exhausted", job: { generation: 3 } });
  });

  it("marks results stale when the draft changes before execution", async () => {
    const now = new Date("2026-08-17T08:00:00.000Z");
    const { sessionId, draft } = await fixture(now);
    const imports = new AnonymousBuilderImportStore(authClient!);
    const created = await imports.createJob({
      sessionId, idempotencyKey: randomUUID(), draftRevision: draft.revision,
      requestedUrl: "example.com", normalizedUrl: "https://example.com/", now,
    });
    await new AnonymousBuilderStore(authClient!).updateDraft({
      sessionId, revision: draft.revision, schemaVersion: 1, productFamily: null, planKey: null,
      state: { schemaVersion: 1, locale: "th" }, now: new Date(now.getTime() + 1_000),
    });
    await expect(imports.claimJob(sessionId, created.job!.id, new Date(now.getTime() + 2_000)))
      .resolves.toEqual({ status: "stale" });
  });
});
