# P4 Validation: FlowBot Basic and Premium

- Result: Engineering gate passed
- Date: 2026-07-15
- Database migrations: `0009_flowbot_saas` through
  `0069_flowbot_social_delivery`
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
- Rich Flow snapshots now validate and execute HTTPS image/video media, product
  cards, carousels, and typed call, LINE, website, booking, and checkout actions.
  The web widget renders these through safe DOM APIs and rejects unsafe schemes.
- Current Starter/Advanced catalog snapshots enforce 1/3 bots, 150/500 topics,
  50,000/100,000 monthly Flow conversations, 1/3 seats, and 0/1 social channels.
- Advanced contact tags and typed attributes are tenant-managed and included in
  privacy export/erasure. Advanced analytics expose unanswered input evidence and
  aggregated customer-journey paths.
- Advanced Google Sheets and basic external API profiles use the existing
  encrypted, platform-approved, SSRF-resistant, idempotent integration worker.
- Signed LINE and Messenger webhooks are deduplicated and ordered. A restricted
  worker executes the pinned immutable Flow graph, settles quota, and queues a
  resumable provider delivery. No AI runtime table or model adapter is involved.

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
Premium schedule and routing forms now match the database-safe key, name,
supported-IANA-timezone, and 1–100-member contracts. Chromium proves an invalid
timezone and an empty routing team each send zero requests; corrected values
send one normalized mutation. Storage integration independently rejects both
cases and persists trimmed accepted values.
The visual editor now shares its 1–160-character title and 10,000-character
per-language copy limits with the domain schema. Chromium proves malformed
Advanced JSON retains an open repair textarea, whitespace-only titles and
invalid per-node JSON send zero draft PATCH requests, and one corrected draft
sends exactly one mutation. Per-node JSON is schema-checked before replacing
the rendered node, preventing the visible editor from silently diverging from
the saved definition.

Rich-message, customer metadata, connector, report, and social-connection UI
paths pass strict application type checks and component/unit tests. A refreshed
cross-browser production-build capture is still required with the full shared
SaaS browser/accessibility gate before market activation.

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
