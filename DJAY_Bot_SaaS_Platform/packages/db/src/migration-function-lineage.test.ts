import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildFunctionLineage, describeFinding, findMissingRegrants, findStaleRedefinitions,
  parseFunctionDefinitions, type MigrationSource,
} from "./migration-function-lineage";

const directory = resolve(import.meta.dirname, "../migrations");
const sources: MigrationSource[] = readdirSync(directory)
  .filter((file) => file.endsWith(".sql")).sort()
  .map((file) => ({ file, sql: readFileSync(resolve(directory, file), "utf8") }));

describe("migration function lineage", () => {
  it("parses every migration with unambiguous dollar quoting", () => {
    expect(sources.length).toBeGreaterThan(80);
    for (const source of sources) {
      // A non-`$$` tag would make the definition terminator ambiguous and silently
      // truncate a parsed body, weakening every check below.
      for (const match of source.sql.matchAll(/AS\s+(\$[a-z_]*\$)/gi)) {
        expect(match[1], `${source.file} uses a non-standard dollar quote`).toBe("$$");
      }
    }
    const lineage = buildFunctionLineage(sources);
    expect(lineage.size).toBeGreaterThan(100);
    // 0086 recreated this function to relax the AI Chat social gate; its body was taken from
    // 0027, the latest prior definition, so the Meta 24-hour window and delivered_part_count
    // survive. The "no stale base" case below is what actually proves that.
    expect(lineage.get("tenancy.claim_ai_social_delivery")?.map((item) => item.migration)).toEqual([24, 26, 27, 86]);
  });

  it("has no function recreated from a stale base in the current tree", () => {
    const findings = findStaleRedefinitions(sources);
    expect(findings.map(describeFinding)).toEqual([]);
  });

  it("re-grants execute on every function it drops", () => {
    expect(findMissingRegrants(sources).map(describeFinding)).toEqual([]);
  });

  it("treats rename-and-wrap as preserving the prior definition", () => {
    // 0032 renames commit_voice_turn to commit_voice_turn_core and adds a thin wrapper.
    // Nothing is dropped, so this must not be reported.
    const wrapper = sources.find((source) => source.file.startsWith("0032"));
    expect(wrapper?.sql).toMatch(/ALTER FUNCTION tenancy\.commit_voice_turn\([^)]*\)\s*\n?\s*RENAME TO commit_voice_turn_core/);
    expect(findStaleRedefinitions(sources).filter((item) => item.name === "tenancy.commit_voice_turn")).toEqual([]);
  });
});

/**
 * Reconstructs the defect that was actually shipped in a draft migration 0084: the
 * `claim_ai_social_delivery` body copied from its **0024** definition, unaware that 0026
 * added Meta's 24-hour service-window guard and 0027 added `delivered_part_count`.
 *
 * Built from the real 0024 at test time rather than checked in as a fixture, so the guard
 * is exercised against the true historical SQL.
 */
function reconstructStaleMigration(): MigrationSource {
  const base = sources.find((source) => source.file.startsWith("0024"));
  if (!base) throw new Error("0024 migration missing");
  const definitions = parseFunctionDefinitions(base);
  const stale = definitions.find((item) => item.name === "tenancy.claim_ai_social_delivery");
  if (!stale) throw new Error("claim_ai_social_delivery not found in 0024");
  const recreated = stale.body
    .replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION")
    .replace("  attempt_count integer, delivery_allowed boolean\n)",
      "  attempt_count integer, delivery_allowed boolean,\n  inbound_occurred_at timestamptz\n)")
    .replace("           ), false\n         )\n  FROM claimed", "           ), false\n         ),\n         receipt.occurred_at\n  FROM claimed");
  return {
    file: "0084_social_delivery_reply_window.sql",
    sql: "DROP FUNCTION IF EXISTS tenancy.claim_ai_social_delivery(timestamptz, timestamptz);\n\n"
      + `${recreated}\n\nGRANT EXECUTE ON FUNCTION tenancy.claim_ai_social_delivery(timestamptz, timestamptz) TO djay_worker;\n`,
  };
}

describe("staleness guard against the real 0084 defect", () => {
  const withStale = [...sources, reconstructStaleMigration()];

  it("fails, naming the function and the migration it was staled from", () => {
    // Scoped to findings ABOUT the injected migration. Injecting a synthetic 0084 into a tree
    // that already contains a real 0086 definition of this function necessarily produces a
    // second, cascading finding (84 -> 86): the fixture invents an `inbound_occurred_at`
    // column that the genuine 0086 — correctly derived from 0027 — does not carry. That
    // cascade is the guard working, not a defect in 0086, so it is not asserted here.
    const findings = findStaleRedefinitions(withStale)
      .filter((item) => item.name === "tenancy.claim_ai_social_delivery" && item.toMigration === 84);
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.toMigration).toBe(84);
      // Latest prior definition is 0027, not the 0024 the body was copied from.
      expect(finding.fromMigration).toBe(27);
    }
  });

  it("names the dropped returned column that removes the delivery-progress feature", () => {
    const finding = findStaleRedefinitions(withStale)
      .find((item) => item.toMigration === 84 && item.clause === "returns_table_columns");
    expect(finding).toBeDefined();
    expect(finding?.missing).toContain("delivered_part_count");
  });

  it("names the dropped provider policy window, the highest-consequence loss", () => {
    const finding = findStaleRedefinitions(withStale)
      .find((item) => item.toMigration === 84 && item.clause === "interval_guards");
    expect(finding).toBeDefined();
    expect(finding?.missing).toContain("24 hours");
  });

  it("would still pass if the same change were derived from 0027 instead", () => {
    const latest = parseFunctionDefinitions(sources.find((source) => source.file.startsWith("0027"))!)
      .find((item) => item.name === "tenancy.claim_ai_social_delivery");
    expect(latest).toBeDefined();
    const corrected: MigrationSource = {
      file: "0084_social_delivery_reply_window.sql",
      sql: "DROP FUNCTION IF EXISTS tenancy.claim_ai_social_delivery(timestamptz, timestamptz);\n\n"
        + `${latest!.body.replace("CREATE OR REPLACE FUNCTION", "CREATE FUNCTION")}\n\n`
        + "GRANT EXECUTE ON FUNCTION tenancy.claim_ai_social_delivery(timestamptz, timestamptz) TO djay_worker;\n",
    };
    expect(findStaleRedefinitions([...sources, corrected])
      .filter((item) => item.name === "tenancy.claim_ai_social_delivery")).toEqual([]);
  });

  it("reports a missing regrant when a drop-and-recreate forgets it", () => {
    const stale = reconstructStaleMigration();
    const withoutGrant: MigrationSource = {
      file: stale.file,
      sql: stale.sql.replace(/GRANT EXECUTE[^\n]*\n/, ""),
    };
    expect(findMissingRegrants([...sources, withoutGrant])
      .some((item) => item.name === "tenancy.claim_ai_social_delivery")).toBe(true);
  });
});
