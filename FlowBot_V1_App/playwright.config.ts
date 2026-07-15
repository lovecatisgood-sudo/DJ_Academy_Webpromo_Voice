import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.FLOWBOT_BASE_URL ?? "http://127.0.0.1:3026",
    channel: "chrome",
    trace: "retain-on-failure",
    screenshot: "only-on-failure"
  },
  webServer: {
    command: "cd apps/dashboard && ../../scripts/use-node24.sh pnpm dev --hostname 127.0.0.1 --port 3026",
    url: "http://127.0.0.1:3026",
    reuseExistingServer: true,
    timeout: 30_000
  },
  projects: [
    {
      name: "desktop",
      use: { viewport: { width: 1440, height: 960 } }
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"], viewport: { width: 393, height: 852 } }
    }
  ]
});
