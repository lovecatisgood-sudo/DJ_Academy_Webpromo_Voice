# P3 Validation: Shared Domain and Tenant Operations

- Result: Passed
- Date: 2026-07-16
- Database migrations: `0007_shared_domain`, `0008_privacy_support_hardening`,
  `0042_privacy_job_scope`

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
- Unscoped erasure is rejected by the shared discriminated schema and a raw SQL
  insertion is rejected by `privacy_erasure_requires_contact`. The JSON scope
  must match the same-tenant contact foreign key. Cross-tenant contact
  substitution returns `not_found`, and reuse of an idempotency key with a
  different job type or contact returns `conflict` without another job.
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

The Data Controls hardening gate proves workspace-wide export remains available
but selecting erasure replaces it with a specific-contact prompt. Missing scope
is announced on and focused to the Contact field with zero requests. The
confirmation names the selected contact; dismissing it sends zero requests;
accepting it sends exactly one scoped request and resets the form to safe export
defaults. Retention success now appears in the retention section instead of
under the unrelated privacy-request form.

## Hardening impact and non-goals

- Schema impact: migration `0042_privacy_job_scope` invalidates legacy actionable
  unscoped erasures with an audit record, then requires actionable erasure jobs
  to reference one contact whose JSON scope matches the forced-RLS foreign key.
- API impact: the tenant privacy-job endpoint consumes the shared discriminated
  request contract and returns `409 conflict` for idempotency-key scope reuse.
  Exact same-scope replay remains accepted and returns the original job.
- Event impact: no event contract or queue payload changed; the existing privacy
  worker receives only database-valid jobs.
- Security and provider confidentiality: same-tenant contact validation occurs
  inside the tenant transaction, unauthorized contact substitution is reported
  as `not_found`, and no provider, model, credential, or routing field is added.
- Non-goals: this checkpoint does not add workspace-wide erasure, change legal
  retention policy, approve privacy content, or activate a managed worker.
- Rollback: application code may be rolled back while retaining migration `0042`;
  removing its constraints would reopen the unsafe unscoped-erasure path and is
  not an accepted rollback.

## Residual program blockers

- ADR-008 commercial terms and real payment-provider operations remain unresolved,
  so paid launch stays disabled.
- Managed privacy-worker alerting, legal/privacy approval, and named-merchant
  acceptance remain production exercises; local scope and erasure tests do not
  substitute for them.
