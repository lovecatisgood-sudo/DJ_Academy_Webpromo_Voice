# ADR-004: Identity, Registration, Sessions, MFA, and Ownership

- Status: Accepted
- Date: 2026-07-14
- Phase: P0

## Context

The SME subscriber must create its Tenant Master Admin on the public SaaS site. Current applications bind users directly to one tenant or use global single-merchant admins, and neither supports verified self-service tenant provisioning or separate platform identity.

## Decision

Use global users and tenant memberships. Credentials belong to users; roles belong to memberships. Platform identities/roles are stored and authenticated separately from tenant memberships.

### Registration

The user submits normalized email, name, password, business name, locale/timezone, legal acceptance, and an idempotency token. The system creates a signup intent and sends a hashed, single-use, expiring verification token. Generic responses prevent account enumeration.

After verification, one serializable/idempotent provisioning transaction creates or claims:

- the verified user and credential;
- one tenant and onboarding state;
- exactly one active `tenant_master_admin` membership;
- default tenant settings and six-plan-aware catalog context without an active paid product unless selected;
- immutable legal-acceptance and audit records;
- transactional outbox events.

Retries return the same result and cannot create a second tenant or owner for the intent.

### Passwords and recovery

- Passwords use Argon2id with reviewed memory/time/parallelism and per-password salt.
- Breached/common password screening and minimum length are enforced without arbitrary composition rules.
- Verification, recovery, invite, and email-change tokens are random, hashed at rest, single-use, purpose-bound, rate-limited, and expiring.
- Platform staff can resend a link but cannot set, view, or receive a merchant password.

### Sessions

- Tenant and platform sessions use different cookie names, token audiences, signing/encryption keys, middleware, and storage tables.
- Session tokens are random and stored only as hashes in revocable server-side records.
- Cookies are `HttpOnly`, `Secure`, scoped narrowly, and `SameSite=Lax` unless a reviewed integration needs another policy.
- Session and CSRF protections are rotated on login, verification, recovery, email/password change, privilege change, ownership transfer, and suspected compromise.
- Absolute and idle expiry are enforced; active sessions are viewable/revocable.
- State-changing browser requests require origin/CSRF validation.

### MFA and reauthentication

- Platform roles require MFA before production access; phishing-resistant WebAuthn is preferred, TOTP recovery is permitted with audited recovery codes.
- Tenant Master Admin MFA is supported in P1 and becomes enforceable by tenant policy; high-risk owner actions require MFA when enrolled plus recent password/WebAuthn reauthentication.
- Provider routing, platform impersonation approval, ownership transfer, credential changes, exports, and destructive privacy actions require recent reauthentication.

### Roles and ownership

Initial tenant roles are deny-by-default permission sets, including `tenant_master_admin`, `tenant_admin`, and least-privilege operational roles defined in P1. Platform roles are not membership roles.

Exactly one active Tenant Master Admin exists per tenant initially. The last owner cannot be removed, disabled, or demoted. Ownership transfer locks the tenant memberships, verifies both actors and target acceptance, atomically swaps roles, rotates both session families, and writes immutable audit/outbox events.

A user may own multiple tenants through separate memberships and selects workspace after login. Workspace selection changes server session context; a browser tenant ID alone never authorizes access.

### Platform support

Support access is a short-lived, approved impersonation grant with reason, expiry, tenant-visible banner, restricted permissions, and immutable audit. It does not grant provider routing or password access.

## Validation

- registration and verification retries are idempotent;
- email/account enumeration responses are indistinguishable;
- tenant and platform cookies/tokens cannot cross route realms;
- role downgrade/recovery/ownership events revoke or rotate affected sessions;
- no route or command lets staff create tenant credentials;
- concurrent owner deletion/transfer preserves exactly one owner;
- cross-tenant workspace substitution is denied;
- auth rate limits and audit events are verified.

