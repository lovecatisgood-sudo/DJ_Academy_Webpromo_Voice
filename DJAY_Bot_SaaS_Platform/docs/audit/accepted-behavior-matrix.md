# Accepted Behavior Matrix

Status: P0 acceptance baseline, reconciled with the approved experience contract on 2026-08-13. `Accepted` means preserve through tests or an explicitly versioned change. It does not mean copy the current implementation. Page order and UX details defer to `docs/design/djay-bots-approved-experience-contract.md`.

## FlowBot

| Capability | Evidence | Decision | SaaS acceptance test |
|---|---|---|---|
| Pure deterministic transition engine | `FlowBot_V1_App/packages/core`, engine/matcher tests | Accepted | Same graph/state/input produces same effects; package imports no AI/provider/DB/HTTP module |
| Immutable published versions | migration flow-version tables; authoring publish/rollback routes | Accepted | Published version cannot mutate; new sessions pin current version; old sessions stay pinned |
| Lock-before-idempotency | runtime and processed-input uniqueness | Accepted | Concurrent duplicate `inputId` creates one transition and returns the stored result |
| Atomic form + lead | FlowBot hard rule and message transaction | Accepted | Failure creates neither partial form state nor lead; retry creates one lead |
| Durable replay + live handoff | stream/sync routes and SSE smoke | Accepted | Reconnect replays ordered decimal cursors without loss/duplicate at backlog/live boundary |
| Admin takeover/reply/release | conversation routes, dashboard and approved experience contract | Accepted with five-minute boundary | Server permits takeover only when latest bot response is less than five minutes old, atomically rechecks owner/time, pauses bot, attributes staff reply, and releases Flow to main menu or AI to a safe continuation |
| Contact matching is suggest-only | schema indexes and CRM service | Accepted | Shared phone/email proposes candidates and never silently merges |
| Notification outbox | `flowbot_notification_outbox`, jobs | Accepted | Business commit succeeds independently; worker retries with dedupe |
| Privacy export/erasure | privacy routes/service/smoke | Accepted | Export is tenant-scoped; erasure covers all PII stores and leaves audit-safe tombstone |
| Existing owner/admin login model | `packages/db/src/auth.ts` | Rejected for SaaS identity | Replaced by verified global user, membership, and separate platform realm |
| Application-only tenant predicates | broad raw SQL usage, no RLS | Rejected | Forced RLS plus scoped repositories deny cross-tenant substitution |
| Single-instance SSE fan-out | current deployment ADR | Transitional only | Durable replay remains; external fan-out required before multi-instance scale |

## Voice Agent

| Capability | Evidence | Decision | SaaS acceptance test |
|---|---|---|---|
| Bilingual English/Thai sales behavior | `src/lib/prompt.ts`, knowledge seed | Accepted after evaluation | Approved scenarios meet generation-specific quality rubric in both languages |
| Realtime interruption and audio lifecycle | `public/djai-voice-widget.js` | Behavior accepted, transport replaced | Interrupt, reconnect, silence, noise, end-call, and cleanup tests pass via DJAY gateway |
| Lead capture | voice tools, `/api/lead`, conversation save | Accepted through Action Gateway | Validated idempotent lead action is tenant-scoped and consent/audit checked |
| Post-conversation analysis | `src/lib/conversation-post-analysis.ts` | Accepted internally | Version/model internal; structured output validates and failure does not corrupt transcript |
| Provider-specific browser session | `/api/session`, public widget | Rejected | Browser sees only DJAY session/capability/error fields and no provider/model identifiers |
| Tenant provider/model controls | admin settings/channels | Rejected | Tenant DTO/schema/UI contains no restricted routing fields; platform realm only |
| Global daily session cap | `/api/session` reservation query | Rejected | Tenant/product entitlement and usage reservation settle exactly once |
| Voice Basic/Advanced generations | target plan | Accepted | Basic resolves `voice_gen1`; Advanced resolves `voice_gen2`; no silent gen2 downgrade |
| Customer-facing reply length | owner direction dated 2026-08-16 | Accepted | Voice is prompted for short spoken replies and enforces a 300 locale-aware word maximum before speech; one preserving rewrite is allowed and direct truncation is forbidden |
| Role-led configuration | approved experience contract | Accepted | Product/package precedes Support/Sales/Booking role; role changes behavior sections while Voice modality remains separate |

## AI Chatbot

| Capability | Evidence | Decision | SaaS acceptance test |
|---|---|---|---|
| Website text chat | `src/app/api/chat/*` and widget | Accepted after tenant port | Deployment key resolves tenant/binding server-side; conversation pins entitlement/behavior versions |
| Sales prompt and knowledge behavior | `src/lib/prompt.ts`, `knowledge-seed.ts` | Accepted as migration input | Structured response/action output validates; source and revision provenance retained |
| Lead and appointment actions | chat tools and booking APIs | Accepted through Action Gateway | Role, tenant, entitlement, consent, destination, idempotency, rate, and audit checks run |
| Direct provider invocation in route | current chat route | Rejected as public contract | Route uses internal provider gateway; public output is allow-listed and provider-neutral |
| AI Basic channel scope | target catalog | Accepted | Web binding allowed; LINE/WhatsApp/Messenger binding denied server-side |
| AI Premium channel scope | target catalog | Accepted | Web plus approved LINE/WhatsApp/Messenger adapters; normalized event/render tests pass |
| Customer-facing reply length | owner direction dated 2026-08-16 | Accepted | AI Text is prompted for concise replies and enforces a 300 locale-aware word maximum; one preserving rewrite is allowed and direct truncation is forbidden |
| Role-led configuration | approved experience contract | Accepted | Product/package precedes Support/Sales/Booking role; Sales retains booking as a supporting action |

## Shared admin workspace

| Capability | Evidence | Decision | SaaS acceptance test |
|---|---|---|---|
| Overview, inbox, contacts/customers, leads | both current apps | Accepted and canonicalized | One tenant-scoped workspace shows all entitled products without duplicate identity silos |
| Conversation status and CRM stages | both current apps | Accepted with canonical mapping | Migration mapping is complete and UI/API only use canonical values |
| Assignments, notes, starring, soft delete | current admin apps | Accepted | Permission checks, audit, tenant scope, and concurrency behavior pass |
| Team management | current admin apps | Accepted after membership redesign | Invite flow creates no password; last owner cannot be removed; role policy is deny-by-default |
| CSV/JSON exports | root admin routes and FlowBot privacy | Accepted | Tenant and entitlement scope enforced; formula injection/PII controls tested |
| Calendar availability and links | root app, FlowBot booking concepts | Accepted as entitled shared capability | Timezone/DST, overlap, ownership, privacy, and request/confirmation policy tests pass |
| Current `master_admin` tenant label | root admin auth | Renamed | Merchant owner is `tenant_master_admin`; `platform_*` roles remain a separate realm |

## Commercial and platform behavior

| Invariant | Decision | Test |
|---|---|---|
| Exactly six public plan keys | Accepted, immutable source constant | Compile-time tuple and catalog seed snapshot reject a seventh public key |
| One active plan per tenant/product | Accepted | Database constraint and concurrent subscription tests |
| Plan values are versioned data | Accepted | Runtime never imports hardcoded price/allowance values |
| Provider routing is platform-only | Accepted | Tenant tokens and serializers cannot access routing modules or fields |
| One active Tenant Master Admin per tenant initially | Accepted | Constraint/transaction tests cover signup, deactivation, demotion, and transfer |
| SME self-registers on public SaaS site | Accepted | Verified idempotent signup creates user, tenant, owner membership, onboarding, audit, outbox |
| Platform staff do not create merchant passwords | Accepted | No platform route/command accepts or returns tenant credentials |
| Flow/Text trials and Voice exclusion | Accepted 2026-08-13 | Flow: 30 days/5,000 website conversations/no card; Text: 30 days/500 website replies/card and owner platform/email warning at 100 remaining; Voice: no trial; no automatic charge without later approval |
| Advisory review and testing | Accepted 2026-08-13 | Not reviewed/not tested/needs attention never block publication; true technical/security/legal/entitlement/external-action invariants still do |
