# FlowBot V1.1 Release Checklist

## Required Commands

Run from `FlowBot_V1_App` with Node 24:

```bash
scripts/use-node24.sh pnpm install --frozen-lockfile
scripts/use-node24.sh pnpm run migrate
scripts/use-node24.sh pnpm run verify
scripts/use-node24.sh pnpm run verify:release
scripts/use-node24.sh pnpm run verify:audit
scripts/use-node24.sh pnpm run test:e2e
```

With a local or staging server running:

```bash
scripts/use-node24.sh node --env-file-if-exists=.env.local scripts/smoke-m2.mjs
scripts/use-node24.sh node --env-file-if-exists=.env.local scripts/smoke-m3.mjs
scripts/use-node24.sh node --env-file-if-exists=.env.local scripts/smoke-m5.mjs
scripts/use-node24.sh node --env-file-if-exists=.env.local scripts/smoke-settings.mjs
scripts/use-node24.sh node --env-file-if-exists=.env.local scripts/smoke-privacy.mjs
scripts/use-node24.sh node --env-file-if-exists=.env.local scripts/smoke-rate-limit.mjs
scripts/use-node24.sh node --env-file-if-exists=.env.local scripts/smoke-sse-soak.mjs
```

For a larger staging SSE soak, keep the app's runtime rate limits enabled and model separate visitors with unique forwarded IPs:

```bash
FLOWBOT_BASE_URL=https://staging.example.com \
FLOWBOT_SSE_SOAK_CONCURRENCY=25 \
FLOWBOT_SSE_SOAK_UNIQUE_IPS=1 \
FLOWBOT_SSE_SOAK_TIMEOUT_MS=30000 \
scripts/use-node24.sh node --env-file-if-exists=.env.local scripts/smoke-sse-soak.mjs
```

## Manual Release Checks

- Confirm production env vars are separate from testing/staging.
- Confirm `AUTH_SECRET`, owner password, database URLs, and email credentials are rotated for production.
- Confirm `/api/health/live`, `/api/health/ready`, and `/api/w/<publicKey>/config` return healthy responses.
- Confirm reverse proxy supports SSE without buffering and keeps connections open beyond 30 seconds.
- Confirm Widget settings allowed origins include the deployment domain and only trusted embed domains.
- Confirm owner account can log in, create an admin account, and delete that admin account.
- Confirm customer export and erasure work on a staging test customer.
- Confirm public widget opens, sends an option, submits a lead form, and can enter handoff state on the deployment domain.
- Confirm rollback path: app release rollback, flow rollback, and widget disable/contact-only fallback.

## Not Yet Automated

- Axe accessibility scan.
- Larger staging SSE load test.
- Hostinger/VPS proxy timeout validation.
