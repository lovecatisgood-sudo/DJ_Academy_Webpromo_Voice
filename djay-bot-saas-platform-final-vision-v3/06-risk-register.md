# 06 · Risk Register — DJAY Bot SaaS Platform v3.0

Scales: probability/impact Low, Medium, High, Critical. Owners and dates are assigned in the project tracker.

| ID | Risk | Probability | Impact | Mitigation / release control |
|---|---|---:|---:|---|
| R-001 | Existing FlowBot V1 is rewritten unnecessarily | Medium | High | Mandatory audit and reuse/refactor matrix before implementation |
| R-002 | FlowBot accidentally invokes AI code | Low | High | package boundary, dependency test, runtime assertion, cost telemetry alarm |
| R-003 | Basic tenant obtains Premium/Advanced capability | Medium | Critical | server entitlement checks, contract tests, adversarial API tests |
| R-004 | Plan matrix drifts across pricing/UI/backend/billing | Medium | High | canonical plan document/registry, generated types, synchronization tests |
| R-005 | AI Basic accepts social-channel messages | Medium | High | binding validator and channel authorization tests |
| R-006 | Social channel approval/policy delays Premium | High | High | begin verification early; feature flags; do not promise date before approval |
| R-007 | External channel fees change | High | Medium | effective-dated rate/config registry and official-source review before launch |
| R-008 | Unsafe contact merge across channels | Medium | Critical | verified identity only; merge candidate/review/undo |
| R-009 | AI invents facts/prices/offers | Medium | High | source-scoped retrieval, structured offers, grounding tests and handover |
| R-010 | AI acts without authorization | Medium | Critical | typed Action Gateway, allow-list, destination controls, audit/idempotency |
| R-011 | Sales behavior becomes pushy or harms brand | Medium | High | playbook controls, refusal/stop policy, evaluation, human review |
| R-012 | Provider/model identity leaks to customer | Medium | High | response sanitization, UI/API schema exclusion, automated string scans |
| R-013 | Legal disclosure conflicts with commercial confidentiality | Medium | High | separate truthful privacy/subprocessor disclosure from normal product UX |
| R-014 | Gen1 internal model is preview/deprecated/unstable | High | High | provider registry, equivalent-profile qualification, canary, migration/incident plan |
| R-015 | Advanced silently falls back to Basic capability | Medium | Critical | capability-equivalence policy; block/pause/credit rather than silent downgrade |
| R-016 | Voice latency/interruption is unacceptable | Medium | High | early walking skeleton, regional measurement, turn tuning, quality gate |
| R-017 | Voice/telephony fraud causes large cost | Medium | Critical | spend/concurrency/destination caps, anomaly detection, kill switch |
| R-018 | Recording/voice consent violates law/policy | Medium | Critical | recording off by default, approved notice, retention controls and legal review |
| R-019 | Overage surprise creates complaints | Medium | High | visible allowance/rate/forecast, alerts, safety caps and invoice traceability |
| R-020 | Async usage causes quota overspend | Medium | High | synchronous reservation/settlement; aggregates never enforce exact limits |
| R-021 | Billing units do not match provider cost | Medium | High | dual usage ledger, rate simulation, margin alerts, reconciled invoices |
| R-022 | Cross-tenant data exposure | Low | Critical | RLS/service authorization, isolation fuzzing, least privilege and incident gate |
| R-023 | Provider/channel outage strands conversations | High | High | retry/circuit breaker/status, human handover, equivalent-profile policy |
| R-024 | Knowledge upload introduces malware/SSRF | Medium | High | scan, file constraints, safe parsers, URL allow/deny and network isolation |
| R-025 | Scope drifts into POS/Creative Club/general CRM | Medium | High | scope lock, architecture/package review, forbidden-domain repository scan |
| R-026 | All six plans attempted simultaneously | Medium | High | phase gates and limited WIP; public coming-soon states only |
| R-027 | Social customer identity cannot be reliably matched | High | Medium | separate identities, verified linking, merchant-assisted merge |
| R-028 | Conversation content appears in logs/support tools | Medium | High | redaction, restricted trace store and audited support access |
| R-029 | Model/provider cost rises sharply | High | High | internal routing registry, effective rates, margin alerts, plan-version changes |
| R-030 | Customer believes requested appointment is confirmed | Medium | High | explicit UI/agent wording and status model |
| R-031 | Tenant Master Admin or Tenant Admin gains provider/model visibility or routing control | Low | Critical | separate platform realm and APIs, explicit tenant-role deny, opaque client contracts, authorization tests and immutable routing audit |
| R-032 | Signup retries or payment race creates duplicate tenants/owners/subscriptions | Medium | Critical | signup intent and idempotency keys, transactional provisioning, unique constraints, signed webhook replay handling and reconciliation |
| R-033 | Tenant loses its only owner or ownership is hijacked | Low | Critical | exactly-one active Tenant Master Admin constraint, MFA reauthentication, dual-confirmed transfer, session rotation and immutable audit |

## Release blockers

The following block production launch of the affected plan:

- cross-tenant access;
- duplicate or ownerless tenant provisioning;
- entitlement bypass;
- provider/model leakage in ordinary tenant/customer surfaces;
- unreconciled or untraceable billing;
- unauthorized action execution;
- Advanced tier routing to lower capability without approved policy;
- missing recording/automated-agent disclosure where required;
- unbounded voice spend/fraud exposure;
- missing social webhook signature/idempotency controls;
- critical factual/sales safety regression.
