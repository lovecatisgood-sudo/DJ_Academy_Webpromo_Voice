import postgres from "postgres";
import { afterAll, describe, expect, it } from "vitest";
import { runDatabaseMigrations } from "./migration-runner";

const databaseUrl = process.env.MIGRATION_RUNNER_DATABASE_URL;
const roleUrl = process.env.MIGRATION_RUNNER_ROLE_URL;
const enabled = Boolean(databaseUrl && roleUrl);
const roleClient = enabled ? postgres(roleUrl!, { max: 1, prepare: false }) : null;

afterAll(async () => {
  await roleClient?.end();
});

describe.runIf(enabled)("database migration runner", () => {
  it("configures a runtime role login using a server-quoted DDL statement", async () => {
    const role = decodeURIComponent(new URL(roleUrl!).username);
    await runDatabaseMigrations({
      databaseUrl: databaseUrl!,
      migrations: [{ id: "9999_migration_runner_test.sql", source: "SELECT 1;" }],
      runtimeRoleUrls: { [role]: roleUrl! },
    });

    await expect(roleClient!<{ current_user: string }[]>`SELECT current_user`).resolves.toEqual([{ current_user: role }]);
  });
});
