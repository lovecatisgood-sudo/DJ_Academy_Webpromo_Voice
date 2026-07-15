import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(join(process.cwd(), "migrations", "0001_initial.sql"), "utf8");

describe("initial migration invariants", () => {
  it("creates the required extensions", () => {
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS citext");
    expect(migration).toContain("CREATE EXTENSION IF NOT EXISTS btree_gist");
  });

  it("stores only session token hashes", () => {
    expect(migration).toContain("session_token_hash bytea NOT NULL");
    expect(migration).not.toContain("session_token text");
    expect(migration).not.toContain("raw_session_token");
  });

  it("preserves conversation flow-version pinning", () => {
    expect(migration).toContain("flow_version_id uuid NOT NULL");
    expect(migration).toContain("FOREIGN KEY (tenant_id, flow_version_id)");
  });

  it("requires visitor input idempotency storage", () => {
    expect(migration).toContain("CREATE TABLE flowbot_processed_inputs");
    expect(migration).toContain("input_id uuid NOT NULL");
    expect(migration).toContain("response jsonb NOT NULL");
  });

  it("uses a notification outbox", () => {
    expect(migration).toContain("CREATE TABLE flowbot_notification_outbox");
    expect(migration).toContain("dedupe_key text NOT NULL");
  });
});
