import { createHash } from "node:crypto";
import postgres from "postgres";

export type DatabaseMigration = Readonly<{ id: string; source: string }>;

export async function runDatabaseMigrations(input: Readonly<{
  databaseUrl: string;
  migrations: readonly DatabaseMigration[];
  runtimeRoleUrls?: Readonly<Record<string, string>>;
}>) {
  if (input.migrations.length === 0) throw new Error("database_migrations_missing");
  const client = postgres(input.databaseUrl, { max: 1, prepare: false, connect_timeout: 15 });
  try {
    await client`SELECT pg_advisory_lock(hashtext('djay_database_migrations'))`;
    await client.unsafe(`
      CREATE SCHEMA IF NOT EXISTS djay_deploy;
      REVOKE ALL ON SCHEMA djay_deploy FROM PUBLIC;
      CREATE TABLE IF NOT EXISTS djay_deploy.schema_migrations (
        migration_id text PRIMARY KEY,
        sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
        applied_at timestamptz NOT NULL DEFAULT now()
      );
      REVOKE ALL ON djay_deploy.schema_migrations FROM PUBLIC;
    `);
    for (const migration of input.migrations) {
      const sha256 = createHash("sha256").update(migration.source).digest("hex");
      const existing = await client<{ sha256: string }[]>`SELECT sha256 FROM djay_deploy.schema_migrations WHERE migration_id = ${migration.id}`;
      if (existing[0]) {
        if (existing[0].sha256 !== sha256) throw new Error(`database_migration_checksum_mismatch:${migration.id}`);
        continue;
      }
      await client.begin(async (sql) => {
        await sql.unsafe(migration.source);
        await sql`INSERT INTO djay_deploy.schema_migrations (migration_id, sha256) VALUES (${migration.id}, ${sha256})`;
      });
      console.info("database_migration_applied", { migrationId: migration.id, sha256 });
    }
    if (input.runtimeRoleUrls) {
      for (const [role, databaseUrl] of Object.entries(input.runtimeRoleUrls)) {
        const parsed = new URL(databaseUrl);
        if (decodeURIComponent(parsed.username) !== role || !parsed.password) throw new Error(`database_role_url_invalid:${role}`);
        await client`ALTER ROLE ${client(role)} LOGIN PASSWORD ${decodeURIComponent(parsed.password)}`;
      }
      console.info("database_runtime_roles_configured", { count: Object.keys(input.runtimeRoleUrls).length });
    }
    console.info("database_migrations_complete", { count: input.migrations.length });
  } finally {
    await client`SELECT pg_advisory_unlock(hashtext('djay_database_migrations'))`.catch(() => undefined);
    await client.end();
  }
}
