# DJAY Bot SaaS Platform State

Last updated: 2026-07-16

## Completed phases

- P0: baseline audit, boundaries, and accepted architecture decisions.
- P1: public self-registration, tenant provisioning, exactly one Tenant Master
  Admin, team/session/MFA/ownership controls, and separate Platform Master realm.
- P2: exactly six plans, subscriptions, immutable entitlement snapshots, quota
  accounting, signed billing webhook inbox, and pilot activation.
- P3: shared contacts, leads, conversations, inbox, knowledge revisions, typed
  action gateway, privacy export/erasure, and two-person support grants.
- P4 engineering: FlowBot Basic/Premium deterministic authoring and runtime,
  widget deployments, Premium operations, migration tooling, and release QA.
- P5-P8 local engineering: Web AI Chat, Premium social channels, Voice Basic,
  and Voice Advanced with their restricted rollout controls and validation.
- P9 local engineering: usage, reconciliation, restore, readiness, public
  status, resilience, reviewed recovery, and dependency-outage contracts.

## Production rollout state

P7 Voice Agent Basic local engineering is complete. Its foundation establishes a strict
provider-neutral opaque grant/message contract, deterministic disclosure,
interruption, reconnect, and terminal minute intent lifecycle, plus a separately
deployable gateway health/capacity and fail-closed authorization boundary.
Migrations `0029_voice_basic_authority`, `0030_voice_runtime_recovery`,
`0031_voice_sales_core`, and `0032_voice_outcomes_retention` add forced-RLS
deployment/session/turn/outcome/callback state,
Gen1-only exact-origin grant issuance, atomic maximum-minute and concurrency
reservation, bounded reconnect, database-derived exactly-once settlement,
gateway heartbeats, durable stale-session reaping, and audited pause/resume/
emergency-stop authority. Voice sessions pin immutable Sales Core agents and
playbooks, persist idempotent turns and transcript messages, execute only
currently authorized actions, and retain restricted native usage evidence.
The public and gateway-only APIs exist but remain disabled by default. Live
quality evaluation and release acceptance remain pending. Tenant Voice operations now
provide Basic-only exact-origin creation, one-time keys, safe listing,
disable/enable, irreversible revocation, audit, and a provider-neutral workspace.
The deployable Voice widget and WebSocket-owned gateway lifecycle now cover
bilingual consent/call states, strict public decoding, process capacity,
disconnect/reconnect, terminal authority calls, PCM16 16 kHz capture, restricted
Gen1 realtime media, and the shared grounded Sales Core turn path. Production
activation remains off until restricted staging quality/latency evaluation and
the remaining external P7 release gates pass.
Platform Owner and AI Operations users now have a responsive, recently
reauthenticated runtime-control panel; admission remains paused by default.
The tenant Voice Agent Studio now matches the approved ten-section information
architecture and shared DJAY brand. Admins can manage identity/languages, Sales
Core playbooks, knowledge pins, exact-origin entry, disclosures, transfer and
callback copy, entitled actions, quality evidence, immutable publish, install,
and deployment state. Analysts receive a complete read-only view. Customer
minutes, concurrency, public health, and 30-day call evidence are sourced from
tenant-scoped durable records rather than placeholder values.
Voice follow-up actions now create durable pending callback requests and return
the provider-neutral `callback_requested` terminal signal. Shared Inbox shows
call outcome, summary, duration, settled minutes, and callback due state. Tenant
Master Admins can configure plan-capped transcript retention while recording
remains disabled; the privacy worker tombstones expired message and Voice-turn
content, and contact erasure also redacts Voice structured turn data. Voice
takeover release now correctly restores the `voice` automation mode.

P6 AI Chatbot Premium social local engineering is complete on the P1-P5 authority.
The controlled delivery order is LINE, WhatsApp, then Messenger. All three
channel engineering slices cover secure connection operations, signed and
ordered inbound events, idempotent Sales Core turns, atomic actions and usage,
durable outbound delivery, resumable multipart Meta delivery, channel analytics,
and aggregate Platform Operations health. P5 AI Chatbot Basic remains Web-only
and provider-neutral.

## P4 release checkpoint

The P4 engineering gate passes. Delivered behavior includes visual plan-aware
authoring, immutable publish/rollback and execution pins, exact-origin opaque
widget sessions, durable transcript replay and handover, execution metering,
Premium timers/subflows/schedules/team routing/approved webhooks, analytics,
install checks, downgrade remediation, encrypted lead notifications, and
restartable legacy migration tooling.

Broad FlowBot self-service remains disabled until three real named pilot tenants
complete the acceptance worksheet in
`docs/validation/p4-flowbot-basic-premium.md`. Synthetic tests do not replace that
merchant sign-off, but the external rollout gate does not block P5 engineering.

## Non-negotiable boundaries

- Every merchant workspace is tenant scoped and protected by forced PostgreSQL RLS.
- A merchant Tenant Master Admin registers only through the public SaaS identity flow.
- Tenant roles cannot select, view, or alter AI providers, model identifiers, routing,
  credentials, internal cost, or fallback policy.
- Provider/model routing belongs only to restricted Platform Owner and delegated
  Platform AI Operations controls.
- Public charging remains disabled while ADR-008 commercial values are unresolved.

Public legal review and registration authority are now fail-closed. The API
loads only a bounded, absolute, explicitly approved Terms/Privacy JSON bundle;
the public realm provides branded responsive review routes; and registration
records only the exact server-current versions the user accepted. A missing or
changed bundle disables new signup without stranding verification or resend for
existing intents. Production still requires counsel/privacy approval and the
signed content artifact.
Platform release readiness consumes this live authority directly: a complete
SLO/attestation/incident/usage gate remains blocked when the approved bundle is
not mounted, and shows only the current public document versions when it is.
Production startup now also rejects copied example values across API, workers,
and Voice gateway. The shared admission rule names only the affected field and
never repeats credential material; isolated artifact QA proves the Voice bundle
exits before listening when its example authority token is supplied.
Tenant onboarding no longer trusts four browser-selected stage buttons.
Workspace Overview derives a six-step guided checklist from tenant profile,
subscription/access, published product configuration, active deployment, and
current-version completed journey evidence. Only administrators may request a
refresh; analysts and operators receive the same facts without mutation.
Platform Master now loads each role's independent operations resources as one
concurrent snapshot instead of serial requests. A generation guard discards an
obsolete refresh before it can overwrite newer evidence, and delayed production
browser QA proves at least four authorized reads overlap. A mid-session role or
identity change immediately purges the older authority snapshot before the new
role's delayed reads begin.
Public registration now ends in a dedicated confirmation state instead of
leaving a live duplicate-submit form. Successful registration and invalid or
expired verification links share a rate-limited, anti-enumerating resend flow
with explicit transport recovery.
Authentication continuation is now fail-closed across the Public and Tenant
realms. A shared resolver accepts only unambiguous same-origin paths, rejects
raw or encoded slash/backslash ambiguity, controls, credentials, and external
schemes, and falls back to Workspace after both password and MFA login. Public
and Tenant cross-realm application origins are also parsed as exact HTTPS
origins in production; malformed configuration stops the build without
disclosing its value. Production-browser acceptance proves malicious login and
MFA continuations remain on the Tenant origin while a valid ownership callback
is preserved.
New verification, recovery, team-invitation, and ownership-transfer links keep
their opaque values in URL fragments, so newly issued secrets are never sent in
HTTP request targets or referrers. Legacy query links remain accepted, then
move into same-tab session state and are removed from the address before the
user acts. Terminal success or invalidity clears that state. Existing users can
now carry a team invitation through Tenant sign-in and accept it on a dedicated
branded route instead of reopening the original email; the transactional gate
proves an unauthenticated attempt requires sign-in and the matching authenticated
identity receives only the invited tenant role.
Registration, new-user invitation, and password recovery now share the exact
12–128-character browser/server password boundary, a second accessible
confirmation field, and one correction message. A mismatch never allocates a
registration idempotency key or sends a mutation, preserves every entered field
and one-time token, and leaves the action available after correction. Tenant and
Platform current-password inputs enforce the same server maximum. Production
Chromium proves the three mismatch paths, responsive layout, live error
announcement, and zero mutation requests.
Every browser email field now enforces the API's 320-character boundary,
including registration, verification resend, recovery, Tenant and Platform
login, team invitations, contacts, and product notification recipients.
Registration and new-user invitation also share normalized 2–160-character
person-name and 2–200-character business-name contracts. Whitespace-only or
out-of-bound normalized names are announced on the exact field before any
mutation, while valid values are trimmed before transport. A workspace guard
prevents future account forms from dropping these boundaries.
Contact creation now enforces the domain's required email-or-phone invariant in
the browser instead of accepting an identity-less customer and returning a
generic API failure. Contact names and optional phone values use the same
normalized 1–200 and 7–32-character limits as the server. Field-specific errors
are announced assertively on the originating control, correctable input is
preserved, accepted values are trimmed before transport, and successful
feedback remains a polite status. Production Chromium proves all three local
failure paths send zero contact mutations and one valid submission sends one
normalized mutation.
The Voice configuration audit removed two duplicated deployment forms that had
drifted apart. One shared form now owns creation limits for first and additional
deployments. It also corrected a hidden contract conflict: the browser and
Voice API admitted 1,000-character greetings while the immutable Sales Core
playbook accepts 500, causing late validation failures. Creation, Studio update,
and immutable playbook authority now share the 1–500 boundary, plus the same
name, origin-count/length, disclosure, call-duration, and reconnect limits.
Studio validates these fields before mutation, switches to the relevant tab,
announces the correction assertively, and preserves the draft.
FlowBot and AI Chat website deployment creation now use one shared Tenant form
and the same exact-origin authority as Voice. Deployment names and origins have
identical browser/API limits; paths, queries, fragments, credentials, remote
HTTP, and overlong values are rejected instead of silently normalized. Invalid
input is announced on and focused at the originating field with zero mutation.
All three APIs revalidate the contract, and all three storage paths normalize
and reject independently; FlowBot no longer trusts API-only canonicalization.
FlowBot Premium schedule and routing setup now shares the PostgreSQL-safe key,
name, IANA timezone, and 1–100-member boundaries across browser, domain, API,
and storage. Invalid timezone or empty-team input is focused and announced
before transport, accepted text is normalized once, and routing creation is
disabled when the authoritative team read contains no active members.

## P6 LINE, WhatsApp, and Messenger runtime checkpoint

The LINE, WhatsApp, and Messenger runtime and delivery slices are implemented locally:

- Premium-only LINE connection creation and revocation.
- One-time opaque webhook keys and separately encrypted channel credentials.
- Safe tenant connection listing without credentials or webhook keys.
- Tenant-admin connection UI with one-time webhook display, provider health
  checks, encrypted credential rotation, reauthorization state, and revocation.
- Audit records for credential rotation and every requested health check.
- Untouched-body LINE signature verification before parsing or mutation.
- LINE text, postback, and opt-out normalization.
- Connection/event deduplication and per-subject timestamp ordering.
- Accepted events create one durable inbound outbox item; replayed and older
  events create no additional work.
- External subject IDs and LINE reply tokens are envelope-encrypted before
  durable receipt storage; their keyed subject digest remains the ordering key.
- Migration `0021_ai_chat_social_workers` adds forced-RLS subject links and a
  restricted worker claim/lease/retry/dead-letter contract with a fresh Premium
  entitlement check at claim time.
- Migration `0022_ai_chat_social_sessions` serializes work per subject and
  idempotently creates the connection-scoped contact, LINE conversation, pinned
  AI session, customer message, metered AI turn, and quota reservation.
- Migration `0023_ai_chat_social_commit` atomically commits the shared Sales
  Core action set, AI transcript message, native usage, settled quota, and one
  outbound reply. Commit-time authority loss fails closed and releases quota.
- Migration `0024_ai_chat_social_delivery` adds worker-only `SKIP LOCKED`
  delivery claims, bounded retry/dead-letter state, immutable attempted-quantity
  events, and provider receipt IDs without inventing channel rates.
- The worker uses the shared AI text runtime and channel-native LINE renderer,
  retries transient failures, terminates credential/action failures, applies
  opt-outs even after entitlement loss, and never counts a blocked request as
  an attempted channel unit.
- Tenant operators can see delivered, pending, failed, and attempted-unit totals.
  Production Chromium covers owner actions, viewer restrictions, secrets,
  desktop/mobile overflow, console errors, and provider-identity leakage.
- Migration `0025_contact_identity_review_candidates` records active email or
  phone matches as tenant-visible suggestions. The source and candidate contacts
  remain separate; no merge action exists in the database, API, or UI.
- Premium-only WhatsApp connection creation, credential rotation, health, and
  revocation reuse the tenant-safe social connection authority and audit path.
- The opaque WhatsApp callback supports Meta verification challenges and checks
  `X-Hub-Signature-256` against the untouched request body before parsing.
- WhatsApp text, button, interactive reply, and delivery-status payloads use the
  shared deduplication, ordering, encrypted subject, Sales Core, and outbox path.
- Migration `0026_ai_chat_social_service_window` reauthorizes every delivery and
  fails closed outside the 24-hour customer-service window without exposing
  recipient or credential material or recording an attempted channel unit.
- Migration `0027_ai_chat_social_delivery_progress` persists successful message
  part counts and provider IDs. A retry after a later-part failure resumes only
  the unsent suffix while preserving immutable per-attempt quantity evidence.
- The tenant UI provides WhatsApp setup, one-time callback display, delivery
  metrics, health, rotation, and revocation with desktop/mobile and viewer QA.
- Premium-only Messenger connection creation, credential rotation, health, and
  revocation use the same tenant-safe authority and audit boundary.
- The opaque Messenger callback verifies the Meta challenge and untouched-body
  signature, then normalizes text, postback, delivery, and read events into the
  ordered social contract.
- Messenger quick replies and multipart Page-token delivery use the shared
  24-hour service-window and resumable delivery ledger.
- Production Chromium covers Messenger setup, one-time callback, rotation,
  metrics, viewer restrictions, secret absence, console, and responsive layout.

Tenant analytics now reconcile Website, LINE, WhatsApp, and Messenger. Migration
`0028_ai_chat_social_operations` adds restricted aggregate Platform Operations
health for connection state, queue age, dead letters, service-window closures,
and attempts. The social runbook defines safe monitoring, kill, rotation,
rollback, recovery, and the external acceptance worksheet.

This does not yet include approved monetary rate treatment. LINE, WhatsApp, and Messenger still require restricted staging
credentials, alerts, rollback rehearsal, and real platform acceptance.
P6 local engineering is complete, but production social activation remains disabled.

## Latest verification

```bash
scripts/use-node24.sh pnpm run verify
scripts/test-db-integration.sh
scripts/use-node24.sh pnpm run qa:p3-ui
scripts/use-node24.sh pnpm run qa:p4-flowbot
scripts/use-node24.sh pnpm run qa:p5-ai-chat
scripts/use-node24.sh pnpm run qa:p6-line
scripts/use-node24.sh pnpm run qa:p7-voice
scripts/use-node24.sh pnpm run qa:p9-resilience
scripts/use-node24.sh pnpm run qa:p9-recovery
scripts/use-node24.sh pnpm run qa:p9-dependency-outage
scripts/use-node24.sh pnpm run package:release
scripts/use-node24.sh pnpm run qa:release-artifacts
```

The full verification, widget browser matrix, and seven-artifact packaging gate
passed on 2026-07-16. The database gate applies migrations `0000` through
`0041` and includes the complete local LINE, WhatsApp, and Messenger inbound, Sales Core
commit, outbound retry, partial-progress, service-window, quantity-ledger,
delivery-status, opt-out, and quota-release journeys. Full verification passes
across 31 packages/apps, and the API source contains 110 route handlers,
including the opaque WhatsApp and Messenger callbacks. Tenant channel analytics
and restricted aggregate Platform Operations health reconcile the social
journey. Production Chromium passes AI Chat Basic
plus the P6 LINE, WhatsApp, and Messenger tenant operations and suggest-only identity-review
surfaces. P7 production Chromium additionally passes the Voice widget and tenant
ten-tab Voice Agent Studio for admin and analyst roles on desktop and mobile,
while the database gate covers Studio conflict/publish/isolation plus
immutable Voice playbook pins, idempotent Sales Core turns/actions, transcripts,
usage, reconnect, settlement, recovery, callback outcomes, retention enforcement,
privacy erasure, and human-to-Voice release. These results do not authorize Voice
or social production activation, AI Chat self-service, or paid launch without
the remaining external acceptance gates. FlowBot, AI Chat, and Voice customer
widgets now pass one canonical brand/accessibility browser contract and ship
together in a hashed seventh static release artifact.
