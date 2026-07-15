# 08 — FlowBot V1.1 Security & Privacy

This document is an engineering checklist, not legal advice. Thailand PDPA notices, lawful bases, retention and incident obligations should be reviewed for the actual business use before launch.

## 1. Principles

Least privilege · deny by default · validate every boundary · explicit tenant scoping · no PII/secrets in logs · short-lived capabilities · idempotent mutations · auditable admin actions · privacy erasure beyond soft delete.

## 2. Threat model

| Threat | Main controls |
|---|---|
| Public API spam | IP/session rate limits, message limits, origin allowlist, optional Turnstile after abuse |
| XSS from visitor/admin text | render as text, structured content schemas, CSP, no unsafe HTML |
| Admin session theft | server-side hashed sessions, secure httpOnly cookies, idle/absolute expiry, rotation, revocation |
| CSRF | SameSite cookie plus CSRF token on mutations |
| Broken tenant authorization | tenantDb, composite FKs, cross-tenant 404 tests, future RLS |
| Visitor session theft | random capability, hash at rest, expiry, never in URL/log, short-lived SSE token |
| Replay/double submit | required inputId and processed response store |
| SSE resource exhaustion | short-lived token, per-session/global caps, heartbeat, idle close, polling fallback |
| Missing SSE message | DB sequence replay before live fan-out |
| SQL/header injection | Drizzle parameters, zod, strict header handling, body limits |
| Malicious image | admin-only upload, MIME and magic bytes, size cap, re-encode, separate origin |
| Secret leakage | environment secrets, gitleaks, log redaction, no committed production credentials |
| Provider failure | notification outbox and retry; provider call outside request transaction |
| Snapshot tampering | immutable published versions, snapshot zod validation, safe failure |
| Cross-version graph corruption | composite DB foreign keys plus publish validation |
| Privacy deletion failure | centralized erasure service and integration tests across all PII stores |

## 3. Admin authentication and authorization

- Auth.js or equivalent with server-side database sessions.
- Password hashes use Argon2id with current reviewed parameters; parameters remain configurable.
- Production owner is seeded from secure environment input or one-time setup, never hardcoded.
- Roles: Owner and Admin.
- Owner-only: user management, tenant privacy settings, erasure, critical bot disable.
- Cannot remove or demote the final owner.
- Login: generic errors, IP throttling, progressive delay/lockout, audit events.
- Session token stored only as hash; logout/revocation is immediate.
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax`, narrow path/domain.

## 4. Visitor session and SSE security

- Generate at least 256 random bits for session token.
- Store SHA-256 hash; raw token remains only in the visitor browser.
- Raw token accepted in POST body or private header only.
- Never place session token in query string, referrer, analytics, Sentry context or log.
- SSE uses a signed purpose-limited token with roughly five-minute TTL.
- Stream token contains no PII and is redacted from access logs where the host logs query strings.
- Stream authorization binds bot, conversation and purpose.
- Reconnect uses durable message sequence; no trust in client-provided message body/state.

## 5. Application and browser controls

- HTTPS and HSTS in production.
- Dashboard CSP begins with `default-src 'self'`; explicitly allow required font/image/provider origins.
- Visitor content is output-escaped and represented by typed content objects.
- No `dangerouslySetInnerHTML` with user/admin content.
- CORS allowlist uses exact normalized origins; no wildcard with credentials.
- Validate external CTA URLs against allowed schemes (`https`, permitted `tel`, `mailto`, channel links).
- Request body limits: public JSON 100 KB; text 1000 characters; upload 2 MB initially.
- Image re-encoding strips metadata.
- Public errors never include SQL, stack, tenant ID, token hash or provider payload.

## 6. Logging and observability

Log request ID, route template, status, latency, actor/resource IDs where appropriate and safe operational metadata.

Redact or omit:

- cookies and authorization;
- session and stream tokens;
- passwords/invites;
- message and note bodies;
- form payloads;
- phone, email, LINE/WhatsApp IDs;
- notification payloads;
- raw unmatched queries.

Sentry breadcrumbs must follow the same rules.

## 7. Tenant isolation and future RLS

- Every query path uses `tenantDb()`.
- Tenant context is transaction-local with `set_config(..., true)`; do not use persistent session variables on pooled connections.
- Explicit tenant predicates remain even when RLS is enabled.
- CI seeds two tenants and tests every admin resource route for foreign-ID 404.
- Composite FKs prevent cross-tenant relational links.

## 8. PDPA operational requirements

### Notice and collection

Lead and booking forms display TH/EN notice/consent wording and the business privacy-policy link. Store only needed fields.

### Retention

Default 12 months. Nightly job removes expired transcript content, raw unmatched text and related notification payloads according to tenant settings. Leads/customers may have separate justified retention, documented in settings/policy.

### Access/export

Customer export includes profile, linked conversations/messages, leads, notes where appropriate and bookings. Export access is owner-authorized and audited.

### Erasure

`Erase personal data` is stronger than soft delete. The service must:

1. verify authority and show impact;
2. find customer-linked conversations, leads and bookings;
3. redact/delete customer identifiers and notes;
4. redact/delete message/form content and conversation notes containing that customer's PII;
5. remove raw PII from event payloads and notification outbox;
6. remove generated export files;
7. retain only non-identifying aggregates where appropriate;
8. write an audit record without erased values.

Encrypted backups may retain data until normal backup expiry, but erased data must not return to active service. A restore runbook must reapply documented erasure actions/tombstones made after the restore point.

### Breach response

Maintain an incident log and escalation procedure. Thailand PDPC/GPPC materials describe notifying the authority within 72 hours where the statutory breach-notification requirement applies. Confirm the actual obligation and data-subject notification need with qualified counsel for the incident.

## 9. Secure development and supply chain

- strict TypeScript and zod;
- lint restriction for raw DB and unsafe HTML;
- gitleaks;
- dependency review and lockfile;
- `pnpm audit` with triage, not blind auto-fix;
- branch protection and reviewed migrations;
- secret rotation procedure;
- SECURITY.md before external customers;
- no production demo credentials.

## 10. Incident response

Detect → assess → contain → eradicate → recover → notify as required → document.

Containment options:

- revoke admin sessions;
- rotate auth/provider secrets;
- disable bot/widget via config;
- revoke/rotate public bot key if abused;
- stop notification worker;
- block malicious origins/IPs;
- restore to a clean Neon branch and reapply erasures after the restore point.
