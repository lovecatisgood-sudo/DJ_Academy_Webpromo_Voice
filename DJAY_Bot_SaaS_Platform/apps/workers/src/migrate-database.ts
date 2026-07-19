import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runDatabaseMigrations } from "@djay/db";
import { z } from "zod";

const env = z.object({
  DATABASE_MIGRATION_URL: z.string().url().refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://")),
  DATABASE_MIGRATION_DIRECTORY: z.string().min(1).optional(),
  DATABASE_CONFIGURE_RUNTIME_ROLES: z.enum(["true", "false"]).default("true"),
  AUTH_DATABASE_URL: z.string().url().optional(),
  TENANT_DATABASE_URL: z.string().url().optional(),
  PLATFORM_DATABASE_URL: z.string().url().optional(),
  WORKER_DATABASE_URL: z.string().url().optional(),
  FLOWBOT_DATABASE_URL: z.string().url().optional(),
  AI_DATABASE_URL: z.string().url().optional(),
  VOICE_DATABASE_URL: z.string().url().optional(),
}).parse(process.env);

const directory = env.DATABASE_MIGRATION_DIRECTORY
  ? resolve(env.DATABASE_MIGRATION_DIRECTORY)
  : resolve(dirname(fileURLToPath(import.meta.url)), "migrations");
const migrationIds = (await readdir(directory)).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
const migrations = await Promise.all(migrationIds.map(async (id) => ({ id, source: await readFile(resolve(directory, id), "utf8") })));
const runtimeRoleUrls = env.DATABASE_CONFIGURE_RUNTIME_ROLES === "true" ? {
  djay_auth_runtime: env.AUTH_DATABASE_URL,
  djay_runtime: env.TENANT_DATABASE_URL,
  djay_platform: env.PLATFORM_DATABASE_URL,
  djay_worker: env.WORKER_DATABASE_URL,
  djay_flowbot_runtime: env.FLOWBOT_DATABASE_URL,
  djay_ai_runtime: env.AI_DATABASE_URL,
  djay_voice_runtime: env.VOICE_DATABASE_URL,
} : undefined;
if (runtimeRoleUrls && Object.values(runtimeRoleUrls).some((value) => !value)) throw new Error("database_role_url_missing");
await runDatabaseMigrations({
  databaseUrl: env.DATABASE_MIGRATION_URL,
  migrations,
  ...(runtimeRoleUrls ? { runtimeRoleUrls: runtimeRoleUrls as Record<string, string> } : {}),
});
