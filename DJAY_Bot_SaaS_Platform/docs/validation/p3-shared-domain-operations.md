# P3 Validation: Shared Domain and Tenant Operations

- Result: Passed
- Date: 2026-07-15
- Database migrations: `0007_shared_domain`, `0008_privacy_support_hardening`

## Automated gates

```bash
scripts/use-node24.sh pnpm run verify
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run qa:p3-ui
scripts/use-node24.sh pnpm audit --audit-level low
```

The full workspace gate passed lint, strict type checking, unit tests, boundary
scans, and production builds across 17 packages/apps. The API build contains 43
routes and the tenant build contains five P3 operational workspaces.
The dependency audit reported no known vulnerabilities.

## PostgreSQL evidence

- Tenant A and B can hold the same customer identity without collision and cannot
  read one another's contacts, leads, conversations, messages, knowledge, jobs,
  or export artifacts.
- A possible duplicate inside one tenant returns `review_required`.
- Concurrent message writers receive unique ordered sequences; external replay
  returns the original message.
- Conversation creation fails without a matching active entitlement snapshot.
- Typed actions are idempotent and cross-tenant snapshot substitution is denied.
- Appointment actions create `requested`, never falsely confirmed, records.
- Privacy exports include contacts, identities, leads, facts, appointments,
  follow-ups, conversations, messages, notes, transitions, handovers, and actions.
- Export artifacts are encrypted and tenant B cannot decrypt or retrieve them.
- Erasure redacts identity/message/derived data and creates immutable per-entity
  lineage while an unscoped worker sees zero tenant privacy rows.
- A support requester cannot self-approve. A separate Platform Owner can activate
  and revoke the grant; the tenant sees only active, unexpired access; every
  transition is present in the platform audit log.

## Browser evidence

Chromium checked Inbox, Contacts, Leads, Knowledge, and Data Controls at 1365px
and 390px, plus Platform Master at both widths. All 12 views passed horizontal
overflow, page/console error, and restricted provider/model text checks. Visual
inspection confirmed the support banner, ordered message workspace, forms,
privacy download state, and mobile navigation.

The 2026-07-16 contact-entry audit moved the domain's required email-or-phone
invariant and normalized name/phone boundaries into a shared browser/server
contract. Production Chromium proves an identity-less contact, a short phone,
and a whitespace-only name each produce a field-specific alert, preserve the
form, leave the command enabled, and send zero mutations. One accepted form
sends exactly one request with trimmed name and phone values and announces
success through a polite status region. A workspace lint gate prevents the
domain schema or Contact UI from dropping the shared contract.

## Residual program blockers

- P4-P6 product engines are not yet migrated into this SaaS workspace.
- Provider/model routing controls remain intentionally absent until the restricted
  Platform Master implementation phase.
- ADR-008 commercial terms and real payment-provider operations remain unresolved,
  so paid launch stays disabled.
