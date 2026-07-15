import { neon } from "@neondatabase/serverless";
import { readDbEnv } from "./env";

export type SqlClient = ReturnType<typeof neon>;

export function createSqlClient(databaseUrl = readDbEnv().DATABASE_URL): SqlClient {
  return neon(databaseUrl);
}
