import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const project = process.env.GCP_PROJECT_ID || "master-deck-476811-a8";
const prefix = process.env.GCP_SECRET_PREFIX || "djbot-api";

function parseDotenv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = line.indexOf("=");
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[line.slice(0, index).trim()] = value;
  }
  return env;
}

function run(args, input) {
  const result = spawnSync("gcloud", args, {
    input,
    encoding: "utf8",
    stdio: input === undefined ? ["ignore", "pipe", "pipe"] : ["pipe", "pipe", "pipe"],
  });
  if (result.status !== 0) {
    const detail = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n");
    throw new Error(`gcloud ${args.join(" ")} failed\n${detail}`);
  }
  return result.stdout.trim();
}

function secretName(envName) {
  return `${prefix}-${envName.toLowerCase().replaceAll("_", "-")}`;
}

function generatedSecret() {
  return randomBytes(32).toString("base64");
}

const env = parseDotenv(".env");
const sharedDatabaseUrl = env.PLATFORM_DATABASE_URL || env.TENANT_DATABASE_URL || env.AUTH_DATABASE_URL;
const values = {
  AUTH_DATABASE_URL: env.AUTH_DATABASE_URL,
  TENANT_DATABASE_URL: env.TENANT_DATABASE_URL,
  PLATFORM_DATABASE_URL: env.PLATFORM_DATABASE_URL,
  BILLING_DATABASE_URL: env.BILLING_DATABASE_URL,
  FLOWBOT_DATABASE_URL: env.FLOWBOT_DATABASE_URL || sharedDatabaseUrl,
  AI_DATABASE_URL: env.AI_DATABASE_URL || sharedDatabaseUrl,
  AI_TEXT_GATEWAY_SERVICE_TOKEN: env.AI_TEXT_GATEWAY_SERVICE_TOKEN || generatedSecret(),
  AUTH_REQUEST_HASH_KEY: env.AUTH_REQUEST_HASH_KEY || generatedSecret(),
  AUTH_EMAIL_ENVELOPE_KEY: env.AUTH_EMAIL_ENVELOPE_KEY || generatedSecret(),
  AUTH_RATE_LIMIT_KEY: env.AUTH_RATE_LIMIT_KEY || generatedSecret(),
  AUTH_MFA_ENCRYPTION_KEY: env.AUTH_MFA_ENCRYPTION_KEY || generatedSecret(),
  AUTH_MFA_RECOVERY_HASH_KEY: env.AUTH_MFA_RECOVERY_HASH_KEY || generatedSecret(),
  PLATFORM_MFA_ENCRYPTION_KEY: env.PLATFORM_MFA_ENCRYPTION_KEY,
  PLATFORM_RECOVERY_HASH_KEY: env.PLATFORM_RECOVERY_HASH_KEY,
  PRIVACY_EXPORT_KEY: env.PRIVACY_EXPORT_KEY || generatedSecret(),
  FLOWBOT_INTEGRATION_ENVELOPE_KEY: env.FLOWBOT_INTEGRATION_ENVELOPE_KEY || generatedSecret(),
  FLOWBOT_NOTIFICATION_ENVELOPE_KEY: env.FLOWBOT_NOTIFICATION_ENVELOPE_KEY || generatedSecret(),
  FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY: env.FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY || generatedSecret(),
  FLOWBOT_SOCIAL_SUBJECT_HASH_KEY: env.FLOWBOT_SOCIAL_SUBJECT_HASH_KEY || generatedSecret(),
  AI_NOTIFICATION_ENVELOPE_KEY: env.AI_NOTIFICATION_ENVELOPE_KEY || generatedSecret(),
  AI_INTEGRATION_ENVELOPE_KEY: env.AI_INTEGRATION_ENVELOPE_KEY || generatedSecret(),
  USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY: env.USAGE_ALERT_NOTIFICATION_ENVELOPE_KEY || generatedSecret(),
  BILLING_NOTIFICATION_ENVELOPE_KEY: env.BILLING_NOTIFICATION_ENVELOPE_KEY || generatedSecret(),
  BILLING_WEBHOOK_SECRET: env.BILLING_WEBHOOK_SECRET || generatedSecret(),
  BILLING_WEBHOOK_ENVELOPE_KEY: env.BILLING_WEBHOOK_ENVELOPE_KEY || generatedSecret(),
  BILLING_CHECKOUT_ENVELOPE_KEY: env.BILLING_CHECKOUT_ENVELOPE_KEY || generatedSecret(),
  AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY: env.AI_SOCIAL_CREDENTIAL_ENVELOPE_KEY,
  AI_SOCIAL_SUBJECT_HASH_KEY: env.AI_SOCIAL_SUBJECT_HASH_KEY,
  VOICE_TELEPHONY_ENVELOPE_KEY: env.VOICE_TELEPHONY_ENVELOPE_KEY || generatedSecret(),
  OPERATIONS_INGEST_TOKEN: env.OPERATIONS_INGEST_TOKEN || generatedSecret(),
};

if (env.STRIPE_SECRET_KEY) values.STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY;
if (env.STRIPE_WEBHOOK_SECRET) values.STRIPE_WEBHOOK_SECRET = env.STRIPE_WEBHOOK_SECRET;

const missing = Object.entries(values).filter(([, value]) => !value).map(([name]) => name);
if (missing.length) {
  console.error(`Missing required source values: ${missing.join(", ")}`);
  process.exit(1);
}

for (const [envName, value] of Object.entries(values)) {
  const name = secretName(envName);
  const exists = spawnSync("gcloud", ["secrets", "describe", name, "--project", project], { stdio: "ignore" }).status === 0;
  if (!exists) {
    run(["secrets", "create", name, "--replication-policy=automatic", "--project", project]);
  }
  run(["secrets", "versions", "add", name, "--data-file=-", "--project", project], value);
  console.log(`${envName} -> ${name}`);
}
