# SRE SLOs & probes — SKU1

Last updated: 2026-07-23  
Gate: G6d

## Probes (Cloud Run)

| Service | Startup | Liveness |
|---------|---------|----------|
| api, public-site, tenant-web, platform-master | `/api/health/live` | `/api/health/ready` |
| ai-gateway, voice-gateway, widget-cdn, workers | `/health/live` | `/health/ready` |

Terraform: `infra/terraform/gcp-platform/main.tf` (Phase 12).  
**Staging evidence:** after `terraform apply` with `deploy_services=true`, curl each service ready path and attach HTTP 200 bodies to `docs/validation/phase12-reliability-g6d.md`.

## Worker readiness

`GET /health/ready` requires:

1. Database probe OK
2. When `BILLING_WEBHOOK_WORKER_ENABLED=true`, webhook backlog (`received` + stale `processing`) ≤ `WORKER_WEBHOOK_BACKLOG_READY_LIMIT` (default 200)

Backlog SQL: `billing.webhook_backlog_stats` (migration `0081`).

## Metrics (structured logs)

Emit `console.info("commerce_metric", { metric, ... })`:

| metric | Meaning |
|--------|---------|
| `checkout_attempt` | Checkout start |
| `checkout_result` | outcome + httpStatus |
| `webhook_result` | applied / failed |
| `api_error` | route 5xx |

GCP log-based metrics + alerts: `infra/terraform/gcp-platform/monitoring-commerce.tf`.  
Named owner: Terraform `var.alarm_email`.

## Checkout success %

In Logs Explorer / Monitoring:

```
success ≈ count(checkout_result outcome=ready)
/ count(checkout_result)
```

over a rolling 1h window. Target for staging soak: document observed rate in phase12 validation.

## Root Voice rate limits

Durable distributed RL is **not** required for G6d. Signed ops constraint: single-instance only — see repo root `DEPLOYMENT.md` § “Ops constraint: rate limits”. SaaS Voice uses platform emergency_stop separately.

## Kill switch

See `docs/runbooks/sellable-kill-switch.md`. Rehearse once in staging before G7.
