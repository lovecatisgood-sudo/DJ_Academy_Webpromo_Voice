import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const here = dirname(fileURLToPath(import.meta.url));
const databaseUrl = process.env.DATABASE_URL_DIRECT || process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL_DIRECT or DATABASE_URL is required to run FlowBot migrations.");
}

const sql = neon(databaseUrl);
const migration = readFileSync(resolve(here, "../migrations/0001_initial.sql"), "utf8");

const existing = await sql`
  SELECT to_regclass('public.flowbot_tenants') AS table_name
`;

if (existing[0]?.table_name) {
  console.log("FlowBot migration 0001_initial.sql already applied; skipping.");
  process.exit(0);
}

const statements = migration
  .split(/;\s*(?:\n|$)/)
  .map((statement) => statement.trim())
  .filter(Boolean);

await sql`BEGIN`;
try {
  for (const statement of statements) {
    await sql.query(statement);
  }
  await sql`COMMIT`;
} catch (error) {
  await sql`ROLLBACK`;
  throw error;
}

console.log("Applied FlowBot migration 0001_initial.sql");
