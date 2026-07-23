# Phase 12 — Reliability / SRE (G6d)

Date: 2026-07-23

## Delivered (engineering)

| Step | Artifact | Status |
|------|----------|--------|
| Cloud Run ready probes | `infra/terraform/gcp-platform/main.tf` startup=live, liveness=ready | code; **staging apply open** |
| Worker DB + backlog | migration `0081`, `/health/ready` backlog pressure | code |
| Metrics | `commerce_metric` logs + `monitoring-commerce.tf` | code; **metrics visible after deploy** |
| Named-owner alerts | `var.alarm_email` → webhook failures + checkout 5xx | code; set email in staging tfvars |
| Root Voice RL decision | single-instance constraint in root `DEPLOYMENT.md` | **met** (option B) |
| Kill-switch runbook | `docs/runbooks/sellable-kill-switch.md` | published; **staging dry-run row open** |
| SLO runbook | `docs/runbooks/sre-slos.md` | published |

## Staging operator checklist (still open)

1. `terraform apply` gcp-platform with probe change + monitoring
2. Curl ready endpoints for api / workers / gateways → attach results here
3. Confirm log-based metrics appear after a test checkout/webhook
4. Complete kill-switch dry-run table in sellable-kill-switch runbook

## Gate posture

| Gate | Status |
|------|--------|
| G6d Reliability | **scaffolds complete; staging apply + kill-switch drill evidence open** |
