# P1 Scope: Identity, Tenant Provisioning, and Realm Separation

- Status: Complete (2026-07-14)
- Authority: ADR-001, ADR-003, ADR-004
- Product code migrated: none

## Objective

An SME user can register and verify on the public DJAY Bot SaaS site, receive exactly one isolated tenant with one Tenant Master Admin membership, sign in, switch among authorized workspaces, and access a minimal tenant shell. Platform staff authenticate through a separate MFA-protected realm. Retries and cross-tenant/realm substitution fail safely.

## Explicit non-goals

- no sellable subscription or real payment;
- no product engine, bot builder, AI provider, voice provider, or channel adapter;
- no tenant-visible provider/model data;
- no data migration from current applications;
- no support impersonation execution beyond schema/policy foundation;
- no final marketing site beyond functional catalog/signup/auth screens;
- no broad tenant team roles beyond the constants needed for owner/invite tests.

## Vertical slices

### P1.1 Foundation and policy constants

- scaffold monorepo/app/package boundaries from ADR-001;
- environment validation and redacted examples;
- canonical error/result/request-ID contracts;
- branded `TenantContext`, `PlatformContext`, and `SystemContext`;
- deny-by-default permission evaluator and role constants;
- import-boundary lint/test rules;
- disposable PostgreSQL 16 migration/RLS test harness.

Gate: builds/tests run; tenant/public apps cannot import restricted provider or raw DB modules; missing tenant context fails closed in a proof table.

### P1.2 Identity schema and migrations

Global/auth tables:

- `users`;
- `user_credentials`;
- `email_addresses`;
- `auth_sessions` and session families;
- `verification_tokens`;
- `recovery_tokens`;
- `mfa_factors` and recovery-code digests;
- `signup_intents`;
- `legal_acceptances`.

Tenant tables:

- `tenants`;
- `memberships`;
- `membership_invitations`;
- `tenant_onboarding`;
- `ownership_transfers`;
- tenant audit log and transactional outbox.

Platform tables are physically/logically separate:

- `platform_users` or a separate platform-identity relation;
- platform roles/assignments;
- platform sessions;
- platform MFA;
- platform audit log.

Constraints include normalized-email uniqueness, token-purpose uniqueness, idempotent signup key, one membership per user/tenant, exactly one active Tenant Master Admin per tenant, single-use token state, and same-tenant references. Exact owner enforcement uses serialized service transactions plus a deferred constraint/constraint trigger where PostgreSQL implementation testing proves it reliable.

Gate: forward migration, disposable rollback/mitigation, schema invariants, grants, forced RLS, and two-tenant negative tests pass.

### P1.3 Public registration and verification

Routes/commands:

```text
POST /public/auth/register
POST /public/auth/verify-email
POST /public/auth/resend-verification
POST /public/auth/login
POST /public/auth/logout
POST /public/auth/recovery/request
POST /public/auth/recovery/complete
GET  /public/auth/session
```

Registration writes a signup intent and outbox email. Verification atomically provisions user/tenant/owner/onboarding/audit. API responses are allow-listed, generic where enumeration is possible, and do not accept tenant/role/plan authority from the browser.

Gate: concurrent and replayed register/verify requests return one user, one tenant, one owner membership, one accepted result, and deduped notifications.

### P1.4 Tenant session and workspace shell

Routes/commands:

```text
GET  /tenant/workspaces
POST /tenant/workspace/select
GET  /tenant/me
GET  /tenant/onboarding
PATCH /tenant/onboarding
GET  /tenant/security/sessions
DELETE /tenant/security/sessions/:id
```

The tenant app includes a compact authenticated shell, workspace switcher, onboarding checklist, account/security screen, and logout. Workspace selection verifies active membership server-side and rotates/saves selected context. Tenant ID in URL/form is only a selector candidate, never authority.

Gate: a multi-membership user can switch only to authorized tenants; copied resource/workspace IDs do not reveal tenant existence.

### P1.5 Invitations and ownership transfer

Routes/commands:

```text
POST /tenant/team/invitations
POST /public/invitations/accept
POST /tenant/ownership-transfers
POST /tenant/ownership-transfers/:id/accept
POST /tenant/ownership-transfers/:id/cancel
```

Invitations never contain staff-created passwords. Ownership transfer requires recent reauthentication and target acceptance, locks memberships, atomically changes ownership, rotates both actors' sessions, and audits before/after roles.

Gate: concurrent delete/demote/transfer cannot leave zero or two active owners.

### P1.6 Platform realm

Use a separate application, cookie, session storage/audience, middleware, keys, route prefix, MFA enrollment/challenge, and audit. Seed the first Platform Owner only through an offline one-time bootstrap command that stores no plaintext credential and disables itself after successful use.

Minimum routes:

```text
POST /platform/auth/login
POST /platform/auth/mfa/challenge
POST /platform/auth/logout
GET  /platform/me
GET  /platform/health-summary
```

No provider routing UI is implemented in P1; only the realm and permission boundary exist.

Gate: tenant tokens/cookies cannot call platform routes, platform cookies cannot become tenant memberships, and platform login requires MFA.

## API and security rules

- Request schemas are strict and size-limited.
- Password/token values are never logged or included in error telemetry.
- Auth endpoints have IP plus normalized-account rate limits without trusting forwarded headers outside configured proxies.
- Sensitive responses use no-store and appropriate browser security headers.
- Redirect targets are allow-listed local paths.
- Email links use configured canonical public origin and purpose-bound tokens.
- Audit records include request ID, actor, target, reason/result, and safe network metadata.
- Outbox contains templates/opaque references; workers fetch necessary data in tenant/system context.

## Test matrix

Unit:

- email normalization and password policy;
- token hash/purpose/expiry/single use;
- permission denial by default;
- session rotation and constant-time token verification;
- reauthentication freshness;
- owner invariant state machine.

PostgreSQL integration:

- migration/grant/policy introspection;
- missing-context failure;
- full CRUD cross-tenant substitution for all P1 tenant tables;
- same-tenant FK and owner constraints;
- concurrent signup, verify, invite, revoke, and transfer;
- outbox dedupe and transaction rollback.

HTTP/browser:

- signup, verification, login, recovery, workspace switch, logout;
- generic enumeration-resistant responses;
- CSRF/origin and open-redirect denial;
- tenant/platform cookie and audience confusion attempts;
- responsive accessible public auth, tenant shell, and platform MFA shell;
- no restricted provider/model strings in HTML, JS bundles, responses, emails, logs, or fixtures.

## Observability

- auth attempt/denial/success counters without raw email labels;
- signup intent/provisioning latency and failure stage;
- outbox age/failure/dedupe;
- active/revoked sessions;
- RLS/authorization denial counts with bounded labels;
- owner-invariant and migration alerts;
- platform auth/MFA and bootstrap audit.

## Migration and rollback

P1 creates only new workspace infrastructure. Migrations are additive. During development, disposable DBs roll back by dropping the isolated database. Staging/production rollback deploys the previous immutable app while retaining compatible tables; forward-fix migrations are preferred. No current production traffic or credentials switch in P1.

Feature flags separately control registration, verification email delivery, recovery, invitations, tenant shell, and platform login. Registration stays off until migration, email, rate-limit, audit, and owner-invariant checks pass in staging.

## Primary risks

| Risk | Control |
|---|---|
| Duplicate tenant/owner on retries | idempotency key, serializable provisioning, uniqueness, concurrency tests |
| User enumeration or token abuse | generic responses, hashed purpose tokens, expiry/single use, account/IP limits |
| Realm confusion | separate apps/cookies/audiences/storage/guards/tests |
| RLS owner bypass | runtime not table owner, forced RLS, grant introspection |
| Last owner race | locked transfer service plus DB invariant |
| Email delivery outage | durable outbox, resend controls, operational visibility |
| Bootstrap credential exposure | one-time offline command, secret input, MFA before activation, immutable audit |
| Premature product coupling | P1 package imports and non-goals enforced in CI |

## P1 completion gate

- fresh SME signup provisions exactly one tenant and Tenant Master Admin;
- no platform-created merchant-password path exists;
- login/recovery/session rotation/invitation/ownership tests pass;
- tenant and platform realms cannot be confused;
- cross-tenant matrix passes under forced RLS and application authorization;
- provider-leak scan passes;
- migration, backup/restore, observability, rollback, and runbooks are exercised in staging;
- P2 catalog/entitlement stories can consume stable identity and tenant contexts without changing P1 contracts.

## Completion evidence

All P1 gates passed under PostgreSQL 16 and the pinned Node 24 toolchain. The
evidence, commands, browser matrix, restore exercise, and remaining deployment
prerequisites are recorded in
`../validation/p1-identity-tenant-provisioning.md`. Operational procedures are
in `../runbooks/`.
