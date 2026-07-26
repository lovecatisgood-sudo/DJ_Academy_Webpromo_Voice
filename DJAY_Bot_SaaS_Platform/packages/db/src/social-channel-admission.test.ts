import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isAdmitted, socialChannelAdmissions, type SocialChannelAdmission } from "./social-channel-admission";

const migration = readFileSync(
  resolve(import.meta.dirname, "../migrations/0084_included_social_channel.sql"), "utf8",
);

describe("CHN-004 admission decisions", () => {
  it("admits only the four paid-or-permitted outcomes", () => {
    expect(socialChannelAdmissions.filter(isAdmitted)).toEqual([
      "included", "add_on", "cooldown_elapsed", "operator_approved",
    ]);
  });

  it("refuses the outcomes that represent an unpaid or too-soon change", () => {
    expect(socialChannelAdmissions.filter((decision) => !isAdmitted(decision)))
      .toEqual(["not_entitled", "cooldown_active"]);
  });

  it("keeps the TypeScript vocabulary aligned with the SQL function's returns", () => {
    for (const decision of socialChannelAdmissions) {
      expect(migration, `0084 never returns '${decision}'`).toContain(`'${decision}'`);
    }
  });
});

describe("CHN-004 migration shape", () => {
  it("is entirely additive — it drops and recreates nothing", () => {
    expect(migration).not.toMatch(/DROP\s+FUNCTION/i);
    expect(migration).not.toMatch(/CREATE\s+OR\s+REPLACE\s+FUNCTION/i);
    expect(migration).not.toMatch(/ALTER\s+FUNCTION/i);
    expect(migration).not.toMatch(/DROP\s+TABLE/i);
    // The eight runtime SECURITY DEFINER gates stay untouched; write-time enforcement
    // replaces the need to mirror a predicate into every read path.
    for (const untouched of [
      "flow_social_runtime_connection", "claim_flow_social_inbound", "prepare_flow_social_turn",
      "ai_social_runtime_connection", "begin_ai_social_turn", "claim_ai_social_inbound",
      "claim_ai_social_delivery", "commit_ai_social_turn",
    ]) expect(migration).not.toContain(`FUNCTION tenancy.${untouched}(`);
  });

  it("forces RLS and scopes both new tables to the tenant", () => {
    for (const table of ["subscription_social_channels", "social_channel_change_approvals"]) {
      expect(migration).toContain(`ALTER TABLE tenancy.${table} ENABLE ROW LEVEL SECURITY`);
      expect(migration).toContain(`ALTER TABLE tenancy.${table} FORCE ROW LEVEL SECURITY`);
    }
    expect(migration).toMatch(/USING \(tenant_id = tenancy\.current_tenant_id\(\)\)/);
  });

  it("never lets a tenant issue its own operator approval", () => {
    // Read-only policy, and no INSERT/UPDATE/DELETE grant on the approvals table.
    expect(migration).toContain("FOR SELECT TO djay_runtime");
    expect(migration).toContain("GRANT SELECT ON tenancy.social_channel_change_approvals TO djay_runtime;");
    expect(migration).not.toMatch(/GRANT[^;]*INSERT[^;]*ON tenancy\.social_channel_change_approvals/);
  });

  it("enforces the invariant at write time on both connection tables", () => {
    for (const table of ["flow_social_connections", "ai_social_connections"]) {
      expect(migration).toMatch(
        new RegExp(`CREATE TRIGGER \\w+\\s+BEFORE INSERT OR UPDATE OF status, channel ON tenancy\\.${table}`),
      );
    }
    expect(migration).toContain("RAISE EXCEPTION 'social_channel_not_admitted:%'");
  });

  it("pins search_path and revokes PUBLIC on every new definer function", () => {
    const definers = [...migration.matchAll(/CREATE FUNCTION (tenancy\.[a-z_]+)/g)].map((match) => match[1]!);
    expect(definers).toHaveLength(3);
    for (const name of definers) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION ${name}`);
    }
    expect([...migration.matchAll(/SECURITY DEFINER SET search_path = pg_catalog/g)]).toHaveLength(3);
  });

  it("grandfathers existing connections instead of trapping them", () => {
    // Backfill exists, takes the earliest channel, and leaves the cooldown already
    // elapsed so no merchant is locked in by a rule added after they connected.
    expect(migration).toContain("INSERT INTO tenancy.subscription_social_channels (");
    expect(migration).toContain("ON CONFLICT (tenant_id, subscription_id, product_key) DO NOTHING");
    expect(migration).toMatch(/earliest\.created_at,\s*earliest\.created_at/);
    // The trigger must ignore updates that are not transitions into 'active'.
    expect(migration).toContain("IF TG_OP = 'UPDATE' AND (NEW.status = OLD.status OR NEW.status <> 'active') THEN");
  });

  it("restarts the cooldown whenever the included slot moves", () => {
    expect(migration).toMatch(/change_allowed_at = now\(\) \+ cooldown/);
    expect(migration).toContain("cooldown interval DEFAULT interval '30 days'");
  });

  it("consumes an operator approval when it authorises a move", () => {
    expect(migration).toMatch(/UPDATE tenancy\.social_channel_change_approvals\s*\n\s*SET consumed_at = now\(\)/);
    expect(migration).toContain("AND consumed_at IS NULL AND expires_at > now()");
  });
});

describe("CHN-004 slot accounting", () => {
  it("never lets a paid extra take over the included slot", () => {
    // An `add_on` admission means the channel is an EXTRA. Moving the included slot to it
    // would silently free the slot for yet another channel — re-opening the leak.
    for (const file of ["flowbot-social-store.ts", "ai-social-store.ts"]) {
      const store = readFileSync(resolve(import.meta.dirname, file), "utf8");
      expect(store, `${file} must not claim the included slot for an add-on channel`)
        .toMatch(/admission\.decision === "add_on"\s*\n?\s*\? "unchanged" as const/);
    }
  });
});

describe("CHN-004 refusal reaches the merchant", () => {
  it("names a refusal that the API and UI both translate", () => {
    const refused: SocialChannelAdmission[] = socialChannelAdmissions.filter((item) => !isAdmitted(item));
    expect(refused).toContain("cooldown_active");
    // The store surfaces one status; the reason detail rides alongside it.
    const store = readFileSync(resolve(import.meta.dirname, "flowbot-social-store.ts"), "utf8");
    expect(store).toContain('status: "channel_not_admitted" as const');
    expect(store).toContain("decision: admission.decision");
  });
});
