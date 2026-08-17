# AI Text lead-consent authority checkpoint — 2026-08-17

## Scope

Partial implementation of `ATS-006`: authoritative contact and consent capture behind the future visible widget lead form.

## Implemented authority

- `lead.capture` requires a customer-stated name, need, at least one validated email or telephone value, and explicit `granted` or `denied` follow-up consent.
- Optional contact details never block the conversation. Denied consent permits lead recording only and rejects appointment, callback, merchant-email, or other follow-up effects.
- Migration `0134_ai_lead_consent_authority.sql` independently validates AI lead effects, persists the exact consent state to the tenant contact, and rejects direct database bypasses atomically.
- Email and telephone identities remain normalized, tenant-scoped, and linked to the conversation contact and lead.

## Verification

- Sales Core, AI Text runtime, DB invariant and type checks passed.
- `TEST_DB_PORT=55589 pnpm test:db` passed 130 ordered migrations, all wired PostgreSQL suites, RLS, direct missing-consent bypass denial, exact granted-consent persistence, both contact identities, recovery and guarded rollback.

## Remaining boundary

`ATS-006` remains `in_progress`. The accessible website-widget lead form and permissioned browser acceptance are not implemented or accepted. Provider, penetration, named-merchant and Product Owner acceptance also remain open. Packages remain non-sellable.
