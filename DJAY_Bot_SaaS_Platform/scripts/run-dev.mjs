import { spawn } from "node:child_process";

const corePackages = ["@djay/public-site", "@djay/tenant-web", "@djay/platform-master", "@djay/api"];
const localOrigins = {
  PUBLIC_APP_URL: "http://localhost:3100",
  TENANT_APP_URL: "http://localhost:3101",
  PLATFORM_APP_URL: "http://localhost:3102",
  API_APP_URL: "http://localhost:3103",
  NEXT_PUBLIC_PUBLIC_APP_URL: "http://localhost:3100",
  NEXT_PUBLIC_API_APP_URL: "http://localhost:3103",
};
for (const [name, value] of Object.entries(localOrigins)) process.env[name] ||= value;
const fullStack = process.argv.includes("--full");
const commerceProfile = ["STRIPE_SECRET_KEY", "BILLING_CHECKOUT_ENVELOPE_KEY", "STRIPE_WEBHOOK_SECRET", "BILLING_WEBHOOK_ENVELOPE_KEY"];
if (!fullStack && process.env.BILLING_DATABASE_URL && commerceProfile.some((name) => !process.env[name])) {
  delete process.env.BILLING_DATABASE_URL;
  console.warn("Commerce configuration is incomplete; the core development workspace will start with billing disabled. Use `pnpm dev:full` with the complete profile to exercise billing.");
}
const turboArguments = ["exec", "turbo", "run", "dev"];
if (!fullStack) {
  for (const packageName of corePackages) turboArguments.push(`--filter=${packageName}`);
  console.info("Starting the web and API development workspace. Use `pnpm dev:full` for configured provider gateways and workers.");
}

const child = spawn("pnpm", turboArguments, {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => child.kill(signal));
}

child.once("error", (error) => {
  console.error(`Unable to start the development workspace: ${error.message}`);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
