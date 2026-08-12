# Non-social production-readiness core checkpoint

> 2026-08-12 post-interruption revalidation: completed the Thai/English locale
> round-trip boundary and made the English-assumption browser QA fixtures
> deterministic without changing the Thai-first product default. A fresh
> `pnpm verify`, `TEST_DB_PORT=55474 pnpm test:db`, release packaging, all
> eight packaged-artifact runtime checks, Voice load, dependency-outage,
> resilience, reviewed-recovery, backup/restore, negative HTTP smoke,
> fail-closed sellability, dependency audit, and `git diff --check` passed.
> The Voice evaluation command correctly remained blocked without its
> restricted approved artifact. Browser-backed QA was not claimed: the
> project-managed headless Chromium process could not start inside the
> sandbox, and browser execution still requires action-specific authorization.

> 2026-08-12 continuation: the page-by-page state is tracked in
> `docs/validation/page-readiness-2026-08-12.md`. The follow-up pass added a
> responsive public navigation, focusable skip targets, missing design tokens,
> flexible Thai-safe controls, dynamic-viewport sizing, a working root/API dev
> launcher, and UI enforcement for the non-social release gate. It also moved
> browser Origin rejection ahead of tenant/service initialization so hostile
> requests remain non-revealing during unrelated provider outages. A fresh
> 102-migration PostgreSQL run, production build, negative API smoke suite, and
> all eight release-artifact runtime checks passed. Browser acceptance remains
> open because action-specific browser authorization and the managed Chromium
> binary are still absent.

| Field | Value |
| --- | --- |
| Date | 2026-08-11 |
| Scope | Website-first Flow Bot, AI Text Bot, AI Voice Bot, and shared multi-tenant SaaS operations |
| Local engineering status | Core vertical slices implemented; full plan completion audit remains active |
| Market status | Not sellable; all six packages remain `sellable: false` |
| Protected reference | `../FlowBot_V1_App/` was not modified |

## Core outcome delivered

### Merchant acquisition and onboarding

- Reworked public acquisition around exact catalogue authority and honest availability.
- Added substantive Pricing, Templates, Help, Status, legal review, verification, and recovery surfaces.
- Kept terms and privacy acceptance version-bound and fail-closed during email registration.
- Reduced onboarding to business goal, industry, and first website bot; the server owns the website-channel decision.
- Added resumable progress derived from durable configuration, publication, deployment, and current-version test evidence.
- Kept support visible during onboarding and added a tenant support board with accountable ticket history.

### Shared multi-tenant operations

- Preserved separate Public, Tenant, and Platform identity realms and database roles.
- Kept tenant context server-authoritative with forced RLS and non-revealing cross-tenant failures.
- Added tenant-scoped appointment operations: filtering, proposed options, valid-option confirmation, guarded status transitions, notes, lead progression, append-only lifecycle history, and completion summary.
- Added provider-confirmed appointment reconciliation with separate local and external states, repeatable rescheduling, idempotent create/update/cancel jobs, stale-claim recovery, bounded retry/backoff, dead-letter state, two-person reviewed recovery with optimistic generation checks, immutable hashed attempt evidence, encrypted Google Calendar or hardened HTTPS webhook profiles, operation-aware Thai status copy, notification-center outcomes, CSV fields, and a guided connection panel. External success is shown only after a verified provider response.
- Added tenant-scoped support attachments with one-time signed uploads, exact metadata checks, quarantine states, file-signature and UTF-8 validation, malware scanning, clean-only merchant/operator downloads, unsafe-object deletion, and cross-tenant denial.
- Added entitlement-derived Standard and Priority support classes with one database policy authority, internal operator response-target states, first-response capture, and no customer-facing response-time promise.
- Added append-only, deduplicated, deep-linked in-app support updates for platform replies and attachment scan outcomes, with per-membership read state and authenticated membership binding.
- Added append-only bot regression evidence that can certify only the tenant's current published Flow, AI Text, or Voice artifact; replay, stale-version, cross-tenant, and mutation attempts fail closed.
- Added role-aware Appointments navigation for owners, administrators, operators, and human agents with `leads.read` authority.
- Unified contact, lead, conversation, message, appointment, callback, and deal-value evidence into one chronological customer journey with a 300-event bounded view and full privacy-export path.
- Added an overdue-first Voice callback queue, active-member/state-validated completion and cancellation, immutable status history, and direct return to the source Inbox conversation.
- Added immutable merchant-confirmed value evidence that can only be attached to a closed-deal lead; the UI never infers revenue from bot activity and the ledger accepts no free-text PII.
- Added one tenant lifecycle notification center covering appointments, callbacks, merchant-confirmed value, support responses and attachment outcomes, billing, usage alerts, team invitations, current-version bot regression results, onboarding, Flow/AI/Voice deployment state, privacy jobs, ownership transfers, and temporary support-access state. Notifications are append-only, deduplicated by authoritative event, grouped by operational category, restricted to safe workspace deep links, and track read state per active membership. A machine-readable event-to-channel registry and matching runbook document current behavior but remain explicitly proposed pending product/legal approval.
- Added server-authoritative CSV exports for customers, leads, callbacks, and appointments. The appointment export uses the exact visible filter; files are Thai-compatible, non-cacheable, tenant-scoped by the existing repository boundary, and neutralize spreadsheet-formula injection.
- Added one server-authoritative merchant Operations Report across Flow Bot, AI Text Bot, and AI Voice Bot with 7/30/90/365-day and product filters, daily operational trends, lead outcomes, completed work, and currency-separated merchant-confirmed value. The JSON view and formula-safe CSV use the same tenant-scoped filters; value is attributed through its direct conversation or closed-deal lead and is never presented as estimated revenue.
- Split Platform Master navigation into stable role-filtered operational routes that load only their queue family, fail closed for inaccessible areas, and use extracted support panels. Added audited Tenant 360 for owner/support/finance roles with bounded subscription, entitlement, usage, deployment, support-state, privacy-job, and audit references; the database function excludes credentials, provider/model routing, message bodies, support subjects, and contact data, and denies AI Operations directly.
- Added a tenant-linked Platform incident board for owner, support, and AI operations. Incidents are categorized and severity-prioritized, product-linked, retry-safe on creation, assigned to an active incident operator, filterable by tenant/status, and connected directly to Tenant 360. Status cannot skip investigation, assignment and status changes append immutable history plus platform audit events, resolved incidents are terminal, finance is denied incident narratives, and the UI prohibits secrets, conversation content, contact data, and end-customer PII.
- Kept Inbox, Contacts, Leads, Knowledge, Usage, Security, Team, Data, Operations, and Support recoverable and permission-aware.

### Flow Bot

- Upgraded the visual canvas from read-only display to editable infinite-canvas authoring.
- Added create, select, move, duplicate, guarded delete, connect, reconnect, pan, zoom, fit, minimap, multi-select, and keyboard delete.
- Persisted finite node positions in the shared Flow snapshot while retaining deterministic Dagre fallback.
- Added revision-safe save, idle autosave, explicit dirty/saving/saved/error states, conflict recovery, and unsaved-navigation protection.
- Added bounded undo/redo and a safe simulator that uses the production engine, can start from any selected node, highlights the traversed path, and suppresses external commands and allowance use.
- Kept guided editing and Advanced JSON on the same domain graph.
- Preserved immutable publication, current-session pinning, deployment checks, and safe rollback.

### AI Text Bot

- Removed social setup calls and merchant-facing social configuration from the website-first release surface.
- Preserved deferred social back ends behind existing entitlement and confidentiality regression coverage.
- Added immutable version listing and safe rollback by publishing a new version sourced from the selected historical version.
- Preserved current entitlements, limits, knowledge pins, source linkage, audit evidence, and active-session version pinning.
- Retained guided AI Playbook editing, recoverable Advanced JSON, tests, exact-origin deployment, usage authority, and handover behavior.

### AI Voice Bot

- Added dirty-state protection, discard confirmation, save/publish ordering, and unsaved-navigation protection to Voice Studio.
- Reconfirmed fail-closed admission, disclosure-first media, recording-off default, interruption, bounded reconnect, silence warning, exact terminal settlement, emergency stop, and provider-confidential browser bundles.
- Passed the local capacity drill at 120 attempts / 40 capacity: 40 admitted, 80 safely rejected, 40 recovered, zero final active sessions, and 74 ms local p95 connection time.
- Telephone integration remains a separate external-carrier release train and is not marketed in the current merchant surface.

### Security maintenance

- Added an explicit `SOCIAL_CHANNELS_RELEASE_ENABLED=false` production gate. API social credential authority and all social workers remain fail-closed unless that separate release train is deliberately enabled with its required credentials; accidental worker enablement while the gate is off is rejected.
- Upgraded all four Next.js applications from 16.2.10 to 16.2.11.
- Added narrow workspace resolutions for patched Sharp 0.35.0, Undici 7.29.0, PostCSS 8.5.23, Nanoid 3.3.17, and UUID 11.1.1.
- Rebuilt and retested the entire workspace after dependency resolution.
- `pnpm audit` reports: `No known vulnerabilities found`.

## Non-skipping evidence

| Gate | Result |
| --- | --- |
| `TEST_DB_PORT=55474 pnpm test:db` | Passed all 102 migrations and every explicitly wired PostgreSQL integration suite, including audited Tenant 360, idempotent and reassignable tenant incidents, tenant/product-filtered aggregate Operations Reports, customer journeys/value/callbacks, privacy export, Flow preview isolation, support feedback/attachments/service classes, the expanded tenant lifecycle notification center, dependency-ordered provider-confirmed appointment create/repeat-reschedule/cancel reconciliation, independently reviewed appointment dead-letter recovery, appointment timelines, current-version Flow/AI/Voice regression evidence, scan safety, revoked-actor denial, immutability, replay safety, guarded legacy migration rollback, and cross-tenant denial. The harness allows a bounded 60-second startup, requires three consecutive healthy probes, and emits container diagnostics on failure. |
| `PLATFORM_SUPPORT_ONLY=true TEST_DB_PORT=55464 pnpm test:db` | Applied all 99 migrations on a clean database and passed focused Tenant 360, support-access, and tenant-incident tests covering idempotent open, conflicting-retry denial, tenant/status filtering, guarded lifecycle, reassignment, immutable history, audit events, and finance denial. |
| `APPOINTMENT_SYNC_ONLY=true TEST_DB_PORT=55473 pnpm test:db` | Applied all 102 migrations on a clean database and passed in-flight dependency blocking, provider-confirmed create, failed reschedule retry, successful repeated reschedule, replay denial, cancellation, operation-aware readback, notification creation, idempotent finish, and immutable generation-aware attempt evidence. |
| `pnpm verify` | Passed lint policy, strict TypeScript, unit tests, and production builds for all 35 workspace packages/apps |
| `pnpm run test:release-gate` | Passed the unified gate composition invariant; the full gate remains expected to fail until browser/staging evidence exists |
| Requirement matrix | Generated all 297 rows in `docs/validation/non-social-requirement-matrix.md`; zero requirements are formally accepted |
| `pnpm audit` | Passed with zero known vulnerabilities |
| `pnpm package:release` | Packaged all eight production artifacts from the remediated lockfile |
| `pnpm qa:release-artifacts` | Passed isolated runtime, headers, assets, proxies, fail-closed configuration, confidentiality, and deny-by-default checks |
| `pnpm qa:p8-voice-load` | Passed saturation, rejection, recovery, media-failure settlement, and shutdown drain |
| `pnpm qa:p9-dependency-outage` | Passed provider, AI, Voice media, notification, and channel-adapter outage behavior |
| `pnpm qa:p9-resilience` | Passed event replay, stale-queue recovery, and pool-exhaustion drill |
| `pnpm qa:p9-recovery` | Passed reviewed dead-letter recovery |
| `pnpm qa:p9-restore` | Passed separate-cluster backup/restore, roles, ACLs, schema, immutable ledgers, forced RLS, and tenant-isolation assertions |
| `git diff --check` | Passed |
| Requirement registry | Valid: 297 requirements, zero accepted, six packages non-sellable |
| Sellability gate | Passed fail-closed posture and reported all external prerequisite evidence as open |

The ordinary unit command intentionally skips database integrations when database environment variables are absent. It is not used as database release evidence; the explicit PostgreSQL commands above are.

## Strict assessment

The codebase now has a credible SaaS foundation: explicit authority boundaries, immutable versioning, recovery paths, support operations, safe deployment, usage controls, fail-closed release packaging, and unusually comprehensive database isolation evidence.

This checkpoint does not prove the full implementation plan complete. The active requirement audit has identified additional work, including unmocked transactional email delivery and product/legal approval of the proposed event-to-channel matrix, unmocked calendar-provider acceptance, human approval of the existing executable Thai/English bot scenario packs and Voice quality thresholds, optional further Platform component decomposition, and browser acceptance. Flow undo/redo/path simulation, closure feedback, quarantined support attachments, entitlement-derived support queues, expanded in-app lifecycle source coverage, customer/callback/value timelines, filtered operational CSV exports, cross-bot aggregate Operations Reports, provider-confirmed appointment reconciliation authority and reviewed recovery, current-version Flow/AI/Voice regression evidence, product-aware Test Center behavior, role-filtered Platform routes, audited Tenant 360, tenant-linked incident operations, and the unified non-skipping release command are now implemented.

It is also not defensible to claim “top of the field” or production sellability from local code evidence alone. The following evidence cannot be generated honestly inside this workspace:

1. Browser accessibility and responsive acceptance. `pnpm test:a11y:release` requires launching Playwright Chromium; browser/GUI access lacks action-specific authorization and the matching browser binary is not installed.
2. Unmocked staging merchant journey through email delivery, Stripe test Checkout, webhook activation, website installation, live widget conversation, Inbox outcome, and accessibility capture.
3. Counsel approval of privacy, retention, data-processing, Voice disclosure, and customer contract terms.
4. Thai tax/VAT/withholding/invoice authority and approved live Stripe mappings.
5. Production provider credentials, quotas, approved rates, spend controls, real Thai/English AI and Voice quality thresholds, microphones, and network-condition testing.
6. External penetration testing and closure of all critical/high findings.
7. Named Thai merchant usability acceptance and the required staging soak.
8. Telephone carrier, number, SIP/media, CDR, transfer, failover, pricing, and legal evidence for Voice Advanced.

Until the remaining local requirements and those external gates pass, the correct release state is the current one: core implementation checkpoint packaged and fail-closed, but incomplete and not sellable.

## Next authorized acceptance sequence

1. Authorize a dedicated headless Playwright Chromium run against local production builds; install only the project-managed Playwright browser binary.
2. Provision a staging environment with test-only email, Stripe, object storage, and restricted AI/Voice provider credentials.
3. Run the unmocked merchant journey and accessibility suite; fix every critical/high defect and gating axe violation.
4. Complete counsel, tax, provider, penetration-test, and named-merchant evidence.
5. Run the 48-hour staging soak and kill-switch drill.
6. Accept only the proven requirement subset, then use the existing authorized sellability-flip sequence.
