import postgres from "postgres";
import { z } from "zod";

const databaseUrlSchema = z.string().url().refine(
  (value) => value.startsWith("postgres://") || value.startsWith("postgresql://"),
  "DATABASE_URL must use postgres:// or postgresql://",
);

export type DatabaseClient = postgres.Sql;
export type DatabaseTransaction = postgres.TransactionSql;

export type DatabaseClientOptions = Readonly<{
  maxConnections?: number;
  idleTimeoutSeconds?: number;
  connectTimeoutSeconds?: number;
}>;

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number) {
  const resolved = value ?? fallback;
  if (!Number.isInteger(resolved) || resolved < minimum || resolved > maximum) {
    throw new Error("invalid_database_client_option");
  }
  return resolved;
}

export function createDatabaseClient(databaseUrl: string, options: DatabaseClientOptions = {}): DatabaseClient {
  return postgres(databaseUrlSchema.parse(databaseUrl), {
    connection: { application_name: "djay-bot-saas-platform" },
    max: boundedInteger(options.maxConnections, 10, 1, 100),
    idle_timeout: boundedInteger(options.idleTimeoutSeconds, 20, 1, 300),
    connect_timeout: boundedInteger(options.connectTimeoutSeconds, 10, 1, 60),
    prepare: true,
    onnotice: () => undefined,
  });
}

export class DatabaseReadinessProbe {
  private pending: Promise<void> | null = null;

  constructor(private readonly client: DatabaseClient) {}

  async check(timeoutMs = 1_000) {
    if (!Number.isInteger(timeoutMs) || timeoutMs < 50 || timeoutMs > 10_000) {
      throw new Error("invalid_database_readiness_timeout");
    }
    const startedAt = Date.now();
    if (!this.pending) {
      const query = this.client`SELECT 1 AS ready`;
      const pending = Promise.resolve(query).then(() => undefined);
      this.pending = pending;
      void pending.finally(() => {
        if (this.pending === pending) this.pending = null;
      }).catch(() => undefined);
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.pending,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error("database_readiness_timeout")), timeoutMs);
          timer.unref?.();
        }),
      ]);
      return Object.freeze({ status: "ready" as const, latencyMs: Date.now() - startedAt });
    } catch (error) {
      return Object.freeze({
        status: "unavailable" as const,
        reason: error instanceof Error && error.message === "database_readiness_timeout"
          ? "timeout" as const : "query_failed" as const,
        latencyMs: Date.now() - startedAt,
      });
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
