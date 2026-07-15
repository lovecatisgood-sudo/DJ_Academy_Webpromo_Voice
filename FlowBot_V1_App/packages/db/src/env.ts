import { z } from "zod";

export const dbEnvSchema = z.object({
  DATABASE_URL: z.string().url(),
  DATABASE_URL_DIRECT: z.string().url().optional()
});

export type DbEnv = z.infer<typeof dbEnvSchema>;

export function readDbEnv(env: NodeJS.ProcessEnv = process.env): DbEnv {
  return dbEnvSchema.parse(env);
}
