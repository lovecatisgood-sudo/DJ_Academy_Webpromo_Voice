# P5 Validation: AI Chatbot Basic Web

- Result: Engineering gate passed
- Date: 2026-07-15
- Database migrations: `0017_ai_chat_saas` through
  `0019_ai_chat_notifications`
- Production activation: pending live routing-profile evaluation and named
  merchant acceptance

## Automated gates

```bash
scripts/use-node24.sh pnpm run verify
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run qa:p5-ai-chat
```

The workspace gate passed lint, strict type checking, unit tests, import/provider
boundary scans, and production builds across 26 packages/apps. The API production
build contains the four restricted public AI Chat routes and seven tenant
authoring/operations routes.

## Database and runtime evidence

- PostgreSQL 16 applied migrations `0000` through `0019`; forced-RLS,
  wrong-tenant, owner, and same-tenant-reference checks passed.
- The integration journey provisioned AI Basic, pinned one approved knowledge
  revision, published a playbook, and created an exact-origin Web deployment.
- A session stayed on its original immutable playbook after a replacement was
  published. A wrong origin could neither read config nor sync the session.
- One structured turn created exactly one lead, one requested appointment, two
  appointment options, one fixed-template email, one settled response credit,
  and one restricted native-usage row.
- Replaying the same idempotency key and body returned the committed response
  without another gateway call or effect. Reusing the key with another body
  failed closed.
- The service-scoped worker decrypted the recipient only at delivery and marked
  the outbox item sent. No recipient ciphertext was exposed to tenant reads.
- Human takeover during an in-flight turn suppressed the AI message, released
  the reservation, and recorded no native usage for the suppressed result.
- Public response serialization and boundary scans found no provider/model
  identifiers.

## Quality and browser evidence

- Unit fixtures cover English and Thai grounding, sales progression, unsafe
  instructions, prompt injection, unsupported claims, malformed citations, and
  provider-leak rejection.
- Chromium exercised the production tenant build at 1365x900 and 390x844. It
  verified knowledge selection, notification configuration, safe preview,
  draft save, immutable publish, responsive overflow, console errors, and
  restricted-term leakage.
- Merchant administrators edit the full Sales Core contract through guided,
  branded fields instead of mandatory raw JSON. Browser limits come from the
  same schema authority used by API, database, and runtime; an invalid IANA
  timezone receives focused assertive correction and sends zero draft PATCHes.
- Advanced JSON is still available for experts. The browser gate proves
  malformed text remains visible and repairable, cannot send a stale draft,
  and refreshes the guided fields after correction. Publishing stays disabled
  while guided, JSON, or knowledge changes are unsaved.
- Multiline claim/question fields preserve newline entry, and a dismissed agent
  switch keeps all unsaved values. Browser navigation is also guarded while the
  current draft is dirty.
- Website deployment uses the shared 2–160-character name and 2,048-character
  exact-origin form. A path-bearing URL is announced on the origin field with
  zero requests; one corrected exact origin sends one normalized request.
- Chromium loaded the compiled widget as a third-party module, started a durable
  session, rendered an NDJSON response, synced a human reply, and entered
  handover without duplicate sends.

## Production activation worksheet

Keep sensitive IDs and credentials in the restricted release system.

| Gate | Status |
|---|---|
| Approved internal routing profile configured | Pending |
| Production gateway/service secrets loaded and rotated | Pending |
| English and Thai evaluation suite passes live profile | Pending |
| Adversarial and provider-leak suite passes live profile | Pending |
| Email delivery, queue-age, failure and usage alerts verified | Pending |
| Named merchant Web journey accepted | Pending |
| Rollback and kill procedure rehearsed | Pending |

P6 engineering may continue while these remain pending. AI Chat self-service or
paid GA may not be enabled until every row is supported by restricted evidence.
