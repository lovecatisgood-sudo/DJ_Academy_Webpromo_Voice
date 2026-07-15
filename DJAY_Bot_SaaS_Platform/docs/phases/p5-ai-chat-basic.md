# P5 Scope: AI Chatbot Basic Web

- Status: Engineering complete (2026-07-15)
- Rollout status: controlled activation only; live routing-profile evaluation and
  merchant acceptance remain production gates
- Authority: implementation plan P5, Sales Conversation Core specification, and
  ADR 009

## Delivered

- Provider-neutral Sales Conversation Core with the approved S0-S9 state model,
  immutable playbooks, deterministic knowledge chunks, strict citations,
  structured facts, and an allow-listed action schema.
- Restricted AI text runtime behind an internal routing gateway. Public and
  tenant contracts contain no provider names, model identifiers, or credentials.
- Web-only deployments with opaque deployment/session keys, exact-origin checks,
  immutable playbook and entitlement pins, idempotent turns, durable replay, and
  post-commit NDJSON delivery.
- Server-authorized lead capture, sales facts, pending merchant-confirmation
  appointment requests with multiple time options, fixed-template merchant
  email, and immediate human takeover.
- Message-credit reservation, settlement, release, replay protection, and
  restricted native-usage telemetry for operations reconciliation.
- Tenant authoring for agents, knowledge pins, playbooks, safe non-customer
  preview, immutable publishing, deployment snippets, encrypted notification
  profiles, and core analytics.
- Responsive Shadow DOM web widget with persisted sessions, reconnect sync,
  streamed rendering, quick replies, accessible states, and human handover.
- English and Thai factuality, sales-quality, safety, and adversarial evaluation
  fixtures plus provider-leak boundary scans.

## Security invariants

- AI tenant tables use forced RLS and same-tenant references; the public runtime
  and notification worker receive function execution only.
- AI Basic can create and execute Web deployments only. Social entitlements are
  false and every public turn is bound to a Web deployment.
- Retrieval uses only knowledge revisions pinned to the immutable playbook.
  Unsupported claims and malformed structured output fail closed.
- Appointment actions always create a request in `requested` state; an AI reply
  cannot claim that the merchant confirmed an appointment.
- Effects are committed once with the turn. Replay does not repeat a lead,
  appointment, email, usage settlement, or routing call.
- Takeover wins over an in-flight AI commit: the AI response is suppressed and
  its reserved message credit is released.

## Completion and rollout gate

The source, database, browser, widget, evaluation-fixture, and production-build
gates pass. This authorizes P6 engineering. Production activation still requires
an approved internal text-routing profile and secrets, the bilingual/adversarial
suite run against that live profile, delivery monitoring, and named merchant
acceptance. Those are environment and operational gates; they are deliberately
not represented as completed repository evidence.
