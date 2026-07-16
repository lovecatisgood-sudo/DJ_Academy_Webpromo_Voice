# P4 Validation: FlowBot Basic and Premium

- Result: Engineering gate passed
- Date: 2026-07-15
- Database migrations: `0009_flowbot_saas` through
  `0016_flowbot_lead_notifications`
- Self-service rollout: not approved pending three named pilots

## Automated gates

```bash
scripts/use-node24.sh pnpm run verify
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run qa:p4-flowbot
```

The workspace gate passed lint, strict type checking, unit tests, import/provider
boundary scans, and production builds across 21 packages/apps. The API build
contains 55 dynamic application routes, including the restricted FlowBot public
runtime and tenant authoring/operations routes.

## Database and runtime evidence

- PostgreSQL 16 applied migrations `0000` through `0016`; forced-RLS and
  wrong-tenant checks passed.
- Basic rejected Premium nodes. Premium delays, schedules, subflows, team
  assignment, approved webhook success/failure continuation, and branding
  capabilities followed the pinned server authority.
- Publishing a replacement version after a visitor session began did not alter
  that session's result. Upgrading Basic to Premium preserved its bot and draft;
  downgrade preflight returned specific blockers and remediation.
- Exact origins, deployment keys, and session keys were required together.
  Replayed inputs returned the first committed response and created one lead,
  one usage settlement, and one notification request.
- Widget reload restored the durable transcript. Polling received a human reply,
  and takeover changed the visitor state to handover.
- Notification configuration returned no recipient ciphertext. Lead creation
  atomically queued one fixed-template item; the service-scoped worker decrypted
  only the recipient, sent once, retried bounded failures, and dead-lettered
  disabled/invalid profiles.
- Runtime and browser artifact probes found no AI actor messages and no restricted
  provider/model terms in the FlowBot surfaces.

## Browser evidence

Chromium exercised FlowBot Basic and Premium at 1365x900 and 390x844 using the
production tenant build. It verified plan-specific palettes, visual template
editing, save/publish, analytics, encrypted-notification profile display,
responsive overflow, console errors, and provider-leak terms. The built widget
also passed start, sync, reload replay, polling, and human-handover behavior.
The deployment journey now shares the exact website-origin form contract with AI
Chat: a path-bearing URL receives focused, assertive local feedback and sends
zero requests, while one corrected exact origin sends one normalized request.
The FlowBot store independently rejects a path-bearing origin before insertion.

## Pilot acceptance worksheet

Repeat this table with real tenant IDs stored in the restricted release system;
do not put merchant identities or secrets in this repository.

| Check | Pilot 1 | Pilot 2 | Pilot 3 |
|---|---|---|---|
| Tenant/RLS substitution suite | Pending | Pending | Pending |
| Migrated graph/version reconciliation | Pending | Pending | Pending |
| Rotated key installed and verified | Pending | Pending | Pending |
| Basic/Premium entitled journey accepted | Pending | Pending | Pending |
| Lead, notification, handover and usage reconciled | Pending | Pending | Pending |
| Merchant sign-off and rollback point recorded | Pending | Pending | Pending |

The rollout owner must keep self-service disabled until all 18 cells pass and
the evidence digests are attached to the restricted release record.
