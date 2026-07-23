# Phase 13 — Sellable flip (G7)

Date: 2026-07-23  
SKU: `flowbot_basic` only  

**Hard rule:** Do not set `sellable: true` until the PASS markers below are literally written after evidence exists.

## Prerequisite gate matrix

| Gate | Phase | Required for G7 | Current posture |
|------|-------|-----------------|-----------------|
| G6 Unmocked E2E | 9 | **required** | scaffolds; staging green open |
| G6b Pen-test | 9 | **required** | checklist; Crit/High open |
| G6c Privacy | 10 | **required** | eng complete; counsel open |
| G6e Commercial | 11 | **required** | decisions done; Stripe live_ready open |
| G6d Reliability | 12 | strongly preferred | scaffolds; staging apply/drill open |

Flip readiness checker:

```bash
pnpm gate:sellable-flip
# After evidence + sellable=true:
AUTHORIZE_SELLABLE_FLIP=true pnpm gate:sellable-flip
```

## Ready-to-flip package (landed without sellable=true)

| Artifact | Path |
|----------|------|
| Support playbook | `docs/runbooks/customer-support-sku1.md` |
| Kill switch | `docs/runbooks/sellable-kill-switch.md` |
| Named merchant worksheet | `docs/validation/named-merchant-worksheet-sku1.md` |
| SKU1 requirement acceptance list | `docs/compliance/sku1-requirement-acceptance-list.md` |
| Stripe mapping ops | `docs/runbooks/stripe-price-mapping.md` |

## Operator PASS markers (write only when true)

```
G6_PASS: false
G6B_PASS: false
G6C_PASS: false
G6E_PASS: false
G6D_PASS: false
KILL_SWITCH_DRILL_UTC:
STAGING_SOAK_START_UTC:
STAGING_SOAK_END_UTC:
NAMED_MERCHANT_SIGNED: false
PO_SIGN: false
CTO_SIGN: false
```

## Staging soak (≥48h) — after prerequisites Pass

| # | Step | Pass? |
|---|------|-------|
| 1 | Seed Stripe **test** mapping; optional staging `sellable=true` in staging DB only | ☐ |
| 2 | Kill-switch dry-run logged | ☐ |
| 3 | Merchant first-SKU E2E green on staging | ☐ |
| 4 | Soak ≥48h with checkout+webhook+support watch | ☐ |
| 5 | Accept SKU1 requirement subset in registry (`status: accepted`) — keep other packages false | ☐ |

## Production flip sequence

1. Confirm all PASS markers above are `true` / dated.
2. Arm kill switch owner (SRE + Commerce on bridge).
3. Set live Stripe mapping `ready` for `flowbot_basic`.
4. Set `sellable: true` in: active catalogue DB terms/versions, `requirements/market-release-v1.yaml`, `packages/catalog` if mirrored — **flowbot_basic only**.
5. Run `AUTHORIZE_SELLABLE_FLIP=true pnpm gate:sellable-flip`.
6. Smoke one real/test card checkout in prod.
7. Watch webhook + checkout alerts for 2h.

## Rollback

Immediate: `docs/runbooks/sellable-kill-switch.md` control (1) or (2). Target &lt;15 minutes to stop new checkout.

## Gate posture now

| Gate | Status |
|------|--------|
| G7 Sellable | **ready-to-flip package complete; flip BLOCKED** until prerequisite PASS markers |
