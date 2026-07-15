import postgres from "postgres";
import { z } from "zod";

const databaseUrlSchema = z.string().url().refine(
  (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
  "DATABASE_URL must use postgres:// or postgresql://",
);

export type DatabaseClient = postgres.Sql;

export function createDatabaseClient(databaseUrl: string): DatabaseClient {
  return postgres(databaseUrlSchema.parse(databaseUrl), {
    connection: { application_name: "djay-bot-saas-platform" },
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: true,
    onnotice: () => undefined,
  });
}
