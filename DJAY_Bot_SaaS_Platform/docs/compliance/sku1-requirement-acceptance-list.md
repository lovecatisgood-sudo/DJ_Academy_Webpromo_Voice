# SKU1 requirement acceptance list (`flowbot_basic`)

Phase 13 step 5: accept a **subset** of requirements for SKU1 — not all 297.
Keep `packages[].sellable: false` until G7 flip moment.

## Proposed acceptance set (operators mark Accepted)

### Experience / checkout

| ID | Title (short) | Target status | Accepted? |
|----|---------------|---------------|-----------|
| EXP-004 | Paid-first / no provision from verify alone | accepted | ☐ |
| EXP-005 | Checkout intent preserved | accepted | ☐ |
| EXP-007 | Return URL does not provision | accepted | ☐ |
| EXP-008 | Checkout return states | accepted | ☐ |
| EXP-009 | Resume / replace expired checkout | staging_verified → accepted | ☐ |

### Onboarding

| ID | Title (short) | Target status | Accepted? |
|----|---------------|---------------|-----------|
| ONB-001 | Server evidence for launch | accepted | ☐ |
| ONB-002–ONB-011 | Setup path subset for FlowBot Basic | accepted as group | ☐ |
| ONB-012 | Meter exemption for setup/test | accepted or deferred note | ☐ |

### Commerce / billing (SKU1 scope)

| ID | Title (short) | Target status | Accepted? |
|----|---------------|---------------|-----------|
| COM-001 | Catalogue authority | accepted | ☐ |
| BILL-01 subset | Checkout + portal + webhook apply | accepted | ☐ |

### Explicitly out of SKU1 acceptance

- Voice Advanced / telephony (`TEL-DEC-001`)
- AI Chat Premium social
- Full FIN-DEC-001 FlowAccount
- Full STRIPE-DEC-001 six-SKU mappings
- Overage packs (`OVR-DEC-001`) unless separately accepted

## Process

1. For each ID, gather staging evidence link under `docs/validation/`.
2. Set `status: accepted` and `accepted_by` in `requirements/market-release-v1.yaml`.
3. Re-run `pnpm lint:market-release-requirements`.
4. Do **not** set package `sellable: true` in the same PR as bulk acceptance unless Phase 13 PASS markers are complete.
