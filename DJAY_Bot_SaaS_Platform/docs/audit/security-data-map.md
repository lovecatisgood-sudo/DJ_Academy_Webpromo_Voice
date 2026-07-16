# Security and Data Map

Status: P0 threat and data-boundary baseline.

## Trust zones

| Zone | Examples | Trust rule |
|---|---|---|
| Untrusted public | public site, widgets, webhook senders, signup forms | Validate all input; resolve tenant from signed deployment/binding; never trust role/plan/provider fields |
| Tenant realm | Tenant Master Admin and staff browser/API | Authenticated membership selects tenant; permissions and entitlements checked server-side |
| Platform realm | Platform Owner, AI Operations, support | Separate identity/session/audience; MFA; least privilege; sensitive actions reauthenticated/audited |
| Runtime services | API, workers, voice gateway | Restricted service identity; explicit tenant context; no public serialization of restricted metadata |
| Data services | PostgreSQL, cache, queue, object store | Tenant-scoped keys/paths; encryption; retention; access logs; fail-closed policies |
| External processors | AI/voice, email, channel, payment providers | Adapter allow-list, minimized payload, idempotency, signatures, timeout/retry, processor inventory |

## Data classes

| Class | Examples | Storage/handling |
|---|---|---|
| Public | catalog copy, public capability labels | Cacheable; integrity/version controlled |
| Tenant operational | flow graphs, deployment settings, business hours | Tenant RLS; audit changes; version immutable where published |
| Personal data | names, phones, emails, channel IDs, transcripts, recordings | Encryption in transit/at rest, retention, export/erase registry, redacted logs |
| Credentials/secrets | password verifiers, session hashes, API secrets, OAuth tokens | Hash or envelope encrypt; never log/export; rotation and revocation |
| Commercial | subscription, usage, invoices, tax details | Tenant scoped; immutable ledger events; restricted finance access |
| Restricted platform | provider/model registry, routing, costs, evaluations, incident switches | Platform-only schema/module/role; never tenant DTO; immutable audit |
| Security/audit | actor, action, target, reason, IP metadata, before/after digest | Append-only/tamper-evident controls; no transcript bodies or raw secrets |

## Required tenant context propagation

The following all carry `tenantId` or a signed identifier that resolves to one before domain access:

- HTTP command/query context;
- database transaction and every tenant repository;
- queue envelope, retry, and dead-letter item;
- outbox event and consumer idempotency key;
- cache key and distributed lock;
- object-storage prefix and signed URL grant;
- rate-limit and concurrency key;
- trace/log fields and metrics labels with cardinality controls;
- usage reservation, settlement, credit, and invoice line;
- exports, temporary files, and deletion jobs.

## Provider leak map

| Current leak | Evidence | Target control |
|---|---|---|
| Public session returns provider | root `src/app/api/session/route.ts:45-55,178-191` | Opaque DJAY voice session DTO |
| Public session returns model ID | same route `:189,311` | Capability profile only (`voice_gen1`/`voice_gen2`) |
| Widget hardcodes OpenAI URL | `public/djai-voice-widget.js:5` | DJAY gateway URL only |
| Widget implements Gemini protocol | widget `:1001-1056` | Provider adapter inside gateway |
| Widget branches on provider | widget `:1090-1093` | Provider-neutral protocol/state machine |
| Tenant settings edits provider/model | `src/app/admin/settings/page.tsx:193-272`, actions | Remove fields from tenant schemas and forms |
| Tenant shell/channels displays model | `AdminShell.tsx`, channels page | Public capability/status labels only |
| Conversation stores provider/model beside tenant data | root migration `:260-318` | Restricted routing reference and internal usage event; allow-list tenant serializer |

Automated leak tests must scan tenant/public OpenAPI schemas, rendered HTML, widget bundles, exports, emails, logs, error payloads, and invoice fixtures for known provider/model identifiers.

## Identity threats and controls

| Threat | Required control |
|---|---|
| Duplicate provisioning on retry | Signup intent/idempotency key and one atomic provisioning transaction |
| Email verification takeover | Hashed single-use expiring token, normalized email uniqueness, rate limits, generic responses |
| One-time link leakage | Put newly issued opaque values in URL fragments, send `no-referrer` on account-link routes, retain only same-tab continuation state, clean the address, and clear terminal state |
| Session fixation/theft | Rotate on login/verification/recovery/role change; store token hashes; revoke family; secure cookies |
| Last owner removal | Database-backed invariant plus serialized ownership transfer |
| Platform/tenant confused deputy | Separate cookies, token audiences, middleware, route namespaces, DB roles, and UI apps |
| Password creation by staff | No command accepts merchant password; user completes verification/recovery/invite flow |
| Cross-tenant object ID substitution | RLS plus same-tenant FK plus repository predicate; non-revealing 404; negative matrix |
| Support abuse | Time-limited approved impersonation, visible tenant banner, reason, audit, no provider-routing inheritance |

## Database role model

- `djay_migrator`: schema owner for controlled migrations only; no application login.
- `djay_runtime`: tenant API role; no `BYPASSRLS`; tenant context required; forced RLS applies.
- `djay_worker`: tenant job role; no `BYPASSRLS`; context per job; cannot query across tenants.
- `djay_platform`: restricted platform services; explicit grants to platform schemas/functions; audited cross-tenant operations.
- `djay_readonly_ops`: redacted operational views only.

Table owners are not runtime roles. RLS is enabled and forced on every tenant table. Missing/invalid `app.tenant_id` produces no tenant rows and tenant writes fail.

## External boundary controls

- all browser-facing realms enforce same-origin CSP defaults, deny framing and
  plugins, restrict device capabilities, suppress framework identity, and send
  HSTS, strict referrer, MIME-sniffing, opener-isolation, and legacy frame
  protections from the application artifact;
- every Public, Tenant, and Platform mutation validates the exact application
  origin assigned to that route realm; API, widget, webhook, internal-service,
  missing, malformed, and sibling-realm origins fail closed;
- Tenant and Platform session cookies are host-only, `HttpOnly`, production
  `Secure`, and realm-specific `SameSite`; MFA challenges are restricted to
  their verification paths and every deletion repeats the issuance attributes;
- webhook signature verification precedes tenant/domain mutation;
- external event IDs are unique per provider/binding;
- OAuth/API credentials are encrypted and never returned after write;
- outbound actions use destination allow-lists and SSRF-safe clients;
- uploads are size/type checked, malware scanned where applicable, and stored under tenant prefixes;
- provider prompts minimize PII and follow configured retention/region policy;
- payment/tax decisions remain release blockers recorded in the decision backlog.

## Audit events required in P1/P2

Registration, verification, login failure/success, recovery, session revoke, invite, role change, ownership transfer, workspace switch, support impersonation, plan/subscription transition, entitlement override, provider-routing change, export, erase, and security-policy denial.

Audit payloads use allow-listed structured metadata. They do not store passwords, tokens, message bodies, recordings, full prompts, or provider credentials.
