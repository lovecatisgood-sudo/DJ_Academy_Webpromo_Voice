import { spawn } from "node:child_process";

const localOrigins = {
  PUBLIC_APP_URL: "http://localhost:3100",
  TENANT_APP_URL: "http://localhost:3101",
  PLATFORM_APP_URL: "http://localhost:3102",
  API_APP_URL: "http://localhost:3103",
};
for (const [name, value] of Object.entries(localOrigins)) process.env[name] ||= value;
const commerceProfile = ["STRIPE_SECRET_KEY", "BILLING_CHECKOUT_ENVELOPE_KEY", "STRIPE_WEBHOOK_SECRET", "BILLING_WEBHOOK_ENVELOPE_KEY"];
if (process.env.BILLING_DATABASE_URL && commerceProfile.some((name) => !process.env[name])) {
  delete process.env.BILLING_DATABASE_URL;
  console.warn("Commerce configuration is incomplete; the API development server will start with billing disabled.");
}

const child = spawn("pnpm", ["exec", "next", "dev", "--port", "3103"], {
  env: process.env,
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));

child.once("error", (error) => {
  console.error(`Unable to start the API development server: ${error.message}`);
  process.exitCode = 1;
});

child.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});
