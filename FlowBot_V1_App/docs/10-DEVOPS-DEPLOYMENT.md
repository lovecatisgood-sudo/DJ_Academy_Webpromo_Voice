# 10 — FlowBot V1.1 DevOps, Deployment & Operations

## 1. Supported runtime

- Node.js 24 LTS for production and CI.
- Pin a tested Next.js 16.x version and matching React versions; do not use broad `14+` or unreviewed `latest` ranges.
- Commit `packageManager` and lockfile.
- Docker path uses an official Node 24 image.
- If the chosen Hostinger product cannot run a supported Node LTS and long-lived SSE correctly, deploy on a Hostinger VPS/container-capable plan or another compatible Node host rather than downgrading to an end-of-life runtime.

## 2. Environments

| Environment | Purpose |
|---|---|
| local | development; local Postgres or developer Neon branch |
| CI | ephemeral isolated database |
| staging | real deployment, seeded demo, E2E, proxy/SSE validation |
| production | owner business live traffic |

Production and staging have separate databases, public bot keys, object-storage prefixes, email credentials and Sentry environments.

## 3. Environment variables

Validate with zod at boot:

```text
DATABASE_URL
DATABASE_URL_DIRECT
APP_URL
AUTH_SECRET
TENANT_ID
OWNER_EMAIL / one-time setup inputs
EMAIL_PROVIDER_* / RESEND_*
ALERT_FROM_EMAIL
OBJECT_STORE_*
SENTRY_DSN
LOG_LEVEL
NODE_ENV
```

Do not commit `.env`. Commit a redacted `.env.example`.

## 4. CI/CD

```text
PR/push:
  install → format/lint → typecheck → unit → migration verification
  → integration on isolated DB → build → secret scan → dependency audit

main:
  all checks → deploy staging → seed safe demo → Playwright → smoke/SSE test

release tag:
  backup/checkpoint → additive migrations with direct URL
  → deploy production → health/config/message smoke → notify
```

Migrations are additive and backward-compatible before app switch. Use a release directory or immutable image so application rollback is immediate.

## 5. Deployment modes

Preferred:

- Next.js standalone server;
- versioned widget bundle copied to public assets or CDN/object storage;
- one Node process plus one worker process, or one supervised process that runs both with explicit health reporting;
- PM2/systemd/container restart policy;
- graceful shutdown closes new SSE admission, finishes active requests and releases DB connections.

Do not assume serverless functions are suitable for long-lived SSE without verification.

## 6. Health and readiness

- `/api/health/live`: process alive; no expensive dependencies.
- `/api/health/ready`: database query, migration version, outbox backlog threshold.
- external monitor also checks one public bot config endpoint.
- worker heartbeat alert when stale.
- alert when outbox failed backlog exceeds threshold.

## 7. Observability

- JSON structured logs with request ID.
- No message/form/note bodies or raw tokens.
- Sentry for API/dashboard/widget errors with PII disabled/redacted.
- Weekly metrics: p95 message latency, fallback rate, 429, SSE connections/reconnects, sync fallback, outbox lag/failures, job heartbeats and DB connection usage.

## 8. Rollback

| Layer | Procedure |
|---|---|
| App | deploy previous immutable image/release and restart gracefully |
| Widget | stable loader points to previous content hash |
| Flow | move current bot pointer to earlier published version; active sessions remain on their pins |
| DB | prefer forward fix; severe incident restores Neon to a new branch, validates, reapplies post-restore erasures, then switches URL |
| Config | disable widget/bot to contact-only fallback |

Run rollback rehearsal before first production launch.

## 9. Backups and privacy

- Verify Neon PITR retention for the purchased plan.
- Optional nightly encrypted `pg_dump` to private object storage with 30-day retention.
- Quarterly restore rehearsal.
- Restore procedure identifies privacy erasures made after the restore timestamp and reapplies them before reopening traffic.
- Temporary exports have short expiry and private access.

## 10. Runbooks

### Site/API down

Check liveness/readiness, process supervisor, recent deploy, host status, DB connection saturation and Neon status. Roll back if deploy-related.

### SSE failure

Check reverse-proxy buffering/timeouts, heartbeat, connection caps and memory. Disable SSE feature flag if necessary; widget falls back to POST sync.

### Outbox failure

Check provider credentials/quota, backlog and last error. Inbox is source of truth. Retry after fix; do not manually create duplicate notifications.

### Compromised admin

Revoke sessions, reset password, rotate secrets as needed, review audit log, contain widget/admin access and follow incident procedure.

### Widget breaking host page

Set bot/widget disabled to make loader no-op or contact-only, then roll back widget hash.

## 11. Cost management

Keep the V1 deployment intentionally small: one supported Node host, one Neon project, low-volume email, object storage, monitoring and error reporting. Verify current provider prices and limits at purchase time; documentation should not hardcode a permanent cost promise.
