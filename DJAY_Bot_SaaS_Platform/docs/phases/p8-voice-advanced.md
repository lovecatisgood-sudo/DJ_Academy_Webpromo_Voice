# P8: Voice Agent Advanced

## Status

In progress. Platform-only Gen2 qualification, two-person routing and admission
changes, reviewed canary, explicit promotion/rollback, incident pause,
independent credit review, tenant deployment, restricted session authority, and
exact gateway route assignment and entitlement-aware Advanced analytics are
implemented locally, including saturation, recovery, injected media failure,
and shutdown-drain coverage. Equivalent-profile live media qualification,
live-provider capacity/margin validation, and named-merchant acceptance remain
pending. Gen2 therefore
remains unavailable and paused by default in production.

## Requirements

- Present only the public `Second-Generation Voice Engine` label to tenants and
  resolve it internally to `voice_gen2`.
- Permit provider/model route identity only in restricted Platform Owner and AI
  Operations workflows.
- Require an independent reviewer for candidate qualification and routing-change
  approval, each bound to SHA-256 evaluation evidence.
- Require an approved canary before promotion and reject stale promotion or
  rollback attempts.
- Never silently fall back from Gen2 to Gen1. Unavailable Gen2 must reject,
  use a separately approved equivalent Gen2 route, or return a neutral
  availability response.
- Pause major/critical incidents immediately and preserve an independently
  reviewed credit recommendation without creating P9 monetary policy.

## Foundation delivered

1. Migration `0034_voice_advanced_routing` adds Platform-private route
   candidates, routing changes, active-route state, profile controls, incidents,
   and restricted session-route assignment storage.
2. Gen2 is seeded `paused` with `qualification_required`; no route is active.
3. Candidate proposer/reviewer and change requester/approver must be different
   active Platform users.
4. Qualification and routing requests require 32-byte evidence digests; raw
   evaluation artifacts and credentials do not enter the database or UI.
5. Canary application is serialized, promotion requires the current reviewed
   canary, and rollback must still own the current route version.
6. Major and critical incidents move the profile to paused. Resolution does not
   silently resume routing.
7. Platform Finance can review an incident credit recommendation without access
   to route provider/model identity.
8. Restricted APIs require platform permissions, trusted origin, and recent
   reauthentication for mutations.
9. Platform Master exposes role-aware qualification, canary, rollback, incident,
   and credit-review controls with explicit no-fallback guidance.
10. Every successful mutation appends an immutable Platform audit event without
    copying restricted provider/model identity or freeform operational text into
    the shared audit stream.
11. Migration `0035_voice_advanced_deployments` binds every deployment to the
    server-resolved entitlement generation and adds a same-tenant composite
    deployment/session generation foreign key.
12. Tenant Studio supports the public Second-Generation label, prepare-only
    Advanced deployments, and a neutral route-unavailable state without exposing
    capability, route, provider, or model identifiers.
13. A separate Gen2 admission flag defaults false. Route promotion alone cannot
    enable tenant calls, and Advanced issuance remains provider-neutrally
    unavailable until the restricted runtime/media gate is delivered.
14. Downgrading an Advanced tenant cannot reinterpret its existing deployment as
    Basic: editing/enabling loses authority and the database rejects any Gen1
    session bound to that Gen2 deployment.
15. Migration `0036_voice_advanced_runtime` resolves only the latest active Voice
    entitlement, issues Gen2 grants only when global and profile admission are
    running, and assigns the reviewed primary route after quota/concurrency
    reservation.
16. Restricted provider/model/region identity is returned only to the
    service-authenticated gateway. It is never serialized in the public grant,
    browser WebSocket messages, tenant DTOs, or shared audit stream.
17. The gateway opens Gen2 media only when the immutable session assignment
    exactly matches a separately configured restricted adapter. A missing or
    mismatched route fails closed and never selects the Gen1 adapter.
18. A separate admission request requires an evidence digest and independent
    reviewer. Admission automatically disables whenever the Gen2 profile leaves
    `running`; draining sessions retain their assigned Gen2 route, while a
    paused profile ends them through provider-neutral heartbeat authority.
19. Migration `0037_voice_analytics_indexes` adds bounded tenant/deployment/time
    query paths for sessions, turns, connections, outcomes, callbacks, and
    appointment conversions without copying operational facts into a second
    analytics store.
20. Voice analytics are current-entitlement aware: Basic receives core call and
    conversion counts, while Advanced additionally receives outcome, language,
    terminal-reason, safe turn-failure, reconnect, percentile latency, and daily
    trend breakdowns. Downgrade immediately removes Advanced breakdowns without
    deleting historical records.
21. Tenant analysts can view and export the same privacy-safe aggregates. CSV
    cells are neutralized against spreadsheet formula execution, and no route,
    provider, model, raw transcript, prompt, credential, native-unit, price,
    cost, or margin field enters the tenant response.
22. The P8 Voice evaluator requires English and Thai evidence for disclosure,
    Sales Core turns, interruption, silence, background noise, reconnect,
    timeout cleanup, and upstream outage. It applies only externally approved,
    SHA-256-bound quality and latency thresholds and emits a provider-neutral
    aggregate report without accepting raw audio, transcripts, or route fields.
23. Incident resolution uses one trimmed 12–2,000-character contract in the
    Platform form, API, repository, and existing PostgreSQL function. The
    inline form keeps rejected or transport-failed evidence available for
    correction, announces errors and success separately, and sends no request
    for whitespace-only evidence.
24. Button-driven runtime and routing actions no longer bypass their visible
    reason constraints. The Platform form, both restricted APIs, repository,
    and existing database functions share trimmed 3–200 runtime and 12–500
    routing-action boundaries, with focused local correction and no invalid
    mutation.

## Schema, API, and event contract

- Platform tables: `voice_route_candidates`, `voice_routing_changes`,
  `voice_active_routes`, `voice_profile_controls`, `voice_admission_changes`,
  and `voice_incidents`.
- Operations table: `voice_session_routes`; it has tenant/session composite
  ownership but no tenant, platform, public, or runtime table grant.
- APIs: `GET/POST /platform/voice/routing` and
  `GET /platform/voice/incidents`, plus tenant
  `GET /tenant/voice/analytics` with bounded period/deployment filters and CSV
  export.
- Tenant APIs retain their existing deployment/Studio routes; generation is
  resolved server-side and only the approved public label/availability is added
  to their DTOs.
- Audit actions: `voice.route_candidate.*`, `voice.routing_change.*`,
  `voice.admission.*`, and `voice.incident.*`.
- Provider/model/region identifiers are never returned by public or tenant APIs.

## Security, observability, and confidentiality

- All tables are function-only; direct DML grants are absent.
- The database verifies the active role assignment instead of trusting only the
  application permission check.
- Platform Support cannot read routing or incidents. Platform Finance receives
  incident fields only and cannot read routing identity.
- Control version, timestamps, actor IDs, evidence digests, state transitions,
  incident severity, and audit events provide operational evidence without
  storing credentials, prompts, raw audio, transcript content, prices, or cost.
- Tenants cannot choose a generation in request payloads. Generation comes from
  the latest active immutable entitlement snapshot and is pinned on deployment.
- Session assignment is immutable per tenant/session. Disabling new admission
  does not reroute an active call, and profile pause never falls back to Gen1.

## Tests and migration

- Static migration invariants prove Gen2-only checks, paused default, private
  tables/functions, independent review, evidence digests, and canary/rollback
  guards.
- PostgreSQL 16 integration proves denied direct access, denied self-review,
  qualification, approval, blocked direct promotion, canary, promotion, incident
  pause, denied Support resolution, separate finance review, normalized
  resolution, normalized runtime/action reasons, rollback, and immutable
  auditing.
- Deployment integration proves server-resolved Advanced creation, exact-origin
  isolation, public-label-only DTOs, default unavailable admission, entitlement
  mismatch denial, and database-enforced no-Gen1 fallback after downgrade.
- Runtime integration proves provider-neutral issuance, exact restricted route
  assignment, one assignment per session, drain-safe reconnect, incident stop,
  quota settlement, and no new issuance after admission is disabled.
- Gateway tests prove exact adapter matching, rejected mismatches with no Gen1
  fallback, and absence of route identity from browser messages.
- Node 24 typechecking covers the database store, API routes, and Platform Master.
- Platform desktop/mobile browser acceptance covers role-safe rendering,
  responsive layout, tenant/provider confidentiality, canceled and invalid
  resolution with zero mutations, one normalized accepted command, and a
  retryable preserved draft after a controlled transport failure. It also
  proves whitespace-only runtime/routing reasons stay focused with zero
  mutations and corrected reasons are normalized once.
- Analytics integration proves Advanced/core packaging, cross-tenant and
  cross-deployment isolation, bounded daily series, safe operational latency,
  reconnect, outcome, lead, and appointment reconciliation, and immediate
  downgrade removal of Advanced breakdowns.
- Evaluation contract tests prove complete bilingual scenario coverage, exact
  disclosure and Sales Core speech, no duplicate actions, neutral outage,
  cleanup/reconnect invariants, externally supplied thresholds, and rejection
  of raw or routing-specific artifact fields.

## Non-goals for this foundation

- Authorizing production traffic before live acceptance evidence is approved.
- Choosing a provider/model, alternative Gen2 route, commercial rate, credit
  amount, quality threshold, or margin policy without approved evidence.
- Gen1 routing changes or any Gen2-to-Gen1 fallback.

## Next slice

Execute the evaluation harness against an equivalent profile and the exact live
candidate, add live-provider capacity and approved margin gates, then complete
named-merchant acceptance. Keep admission disabled until those evidence digests
are reviewed.

## Rollback

Keep Gen2 paused, stop all Advanced admission, and use the reviewed rollback
action for any canary/active change. Application rollback must remain compatible
with migrations `0034` through `0037`; candidate, approval, admission, incident,
deployment, session-route, credit-review, and audit evidence is retained.
Existing deployments and sessions remain generation-pinned. Do not delete or
rewrite route history.
