import { readFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { parse32ByteSecret } from "@djay/auth";
import { createDatabaseClient, PostgresPlatformAuthStore } from "@djay/db";
import { bootstrapPlatformOwner } from "@djay/platform-auth";
import { z } from "zod";

const env = z.object({
  PLATFORM_DATABASE_URL: z.string().url(),
  PLATFORM_BOOTSTRAP_EMAIL: z.email().max(320),
  PLATFORM_BOOTSTRAP_DISPLAY_NAME: z.string().trim().min(2).max(160),
  PLATFORM_BOOTSTRAP_PASSWORD_FILE: z.string().min(1),
  PLATFORM_MFA_ENCRYPTION_KEY: z.string().min(40),
  PLATFORM_RECOVERY_HASH_KEY: z.string().min(40),
}).passthrough().parse(process.env);

const passwordFile = await stat(env.PLATFORM_BOOTSTRAP_PASSWORD_FILE);
if ((passwordFile.mode & 0o077) !== 0) {
  throw new Error("Platform bootstrap password file must not be readable by group or others (chmod 600).");
}
const password = (await readFile(env.PLATFORM_BOOTSTRAP_PASSWORD_FILE, "utf8")).trimEnd();
const client = createDatabaseClient(env.PLATFORM_DATABASE_URL);
try {
  const result = await bootstrapPlatformOwner(
    new PostgresPlatformAuthStore(client),
    {
      email: env.PLATFORM_BOOTSTRAP_EMAIL,
      displayName: env.PLATFORM_BOOTSTRAP_DISPLAY_NAME,
      password,
      requestId: `offline-bootstrap-${randomUUID()}`,
    },
    {
      mfaEncryptionKey: parse32ByteSecret(env.PLATFORM_MFA_ENCRYPTION_KEY, "PLATFORM_MFA_ENCRYPTION_KEY"),
      recoveryHashKey: parse32ByteSecret(env.PLATFORM_RECOVERY_HASH_KEY, "PLATFORM_RECOVERY_HASH_KEY"),
    },
  );
  if (result.status !== "created") {
    console.info("platform_owner_bootstrap_already_completed");
    process.exitCode = 2;
  } else {
    console.info(JSON.stringify({
      status: result.status,
      otpauthUrl: result.otpauthUrl,
      recoveryCodes: result.recoveryCodes,
    }, null, 2));
  }
} finally {
  await client.end({ timeout: 5 });
}
