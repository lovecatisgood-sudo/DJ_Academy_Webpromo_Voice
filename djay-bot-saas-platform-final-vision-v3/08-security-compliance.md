# 08 · Security, Privacy & Compliance — DJAY Bot SaaS Platform v3.0

*Control plan, not legal advice. Production notices, recording, marketing, cross-border processing and contracts require qualified legal review.*

## 1. Security objectives

- isolate tenants and workspaces;
- prevent Basic/Premium/Advanced entitlement bypass;
- protect customer, conversation and voice data;
- prevent unauthorized AI actions;
- protect channel/provider/payment credentials;
- control voice fraud and spend;
- keep internal provider/model routing confidential in ordinary customer UX;
- preserve accurate legal disclosure;
- provide auditable usage and billing.

## 2. Data classification

| Class | Examples | Default control |
|---|---|---|
| Public | marketing plan names/features | public |
| Tenant confidential | flows, playbooks, knowledge, analytics | tenant/role authorization |
| Personal data | names, phones, emails, social IDs, transcripts | minimization, retention, access/export/delete |
| Highly restricted | recordings, secrets, provider/channel tokens, payment refs | encryption, narrow roles, audit |
| Internal commercial | provider/model mapping, raw cost, margin, routing | platform-internal only |
| Security | audit events, fraud signals, incident data | security/operations only |

## 3. Tenancy and authorization

- membership-based users/workspaces;
- explicit tenant context per request/job/event;
- row-level security plus service authorization;
- object storage paths and search/vector indexes tenant-scoped;
- channel deployment key resolves one tenant/deployment;
- server-side entitlement checks for every feature and channel;
- platform roles separated from tenant roles;
- the Platform Master Dashboard uses a separate platform authorization realm from every tenant dashboard;
- Tenant Master Admin and Tenant Admin roles have an explicit deny for provider/model registry, routing and credential permissions;
- support access approved, time-limited, visible and audited.

Subscriber identity controls:

- Tenant Master Admin self-registers and verifies through the public DJAY Bot SaaS site;
- provisioning is idempotent and creates exactly one active Tenant Master Admin per tenant;
- platform staff cannot create or know merchant passwords;
- the last Tenant Master Admin cannot be removed without an accepted ownership transfer;
- ownership transfer, billing changes and destructive privacy actions require reauthentication and MFA;
- invitations contain expiring single-use capabilities, never passwords or platform-role grants.

## 4. Plan entitlement security

Never trust plan/tier/channel/capability values supplied by a tenant client.

Server resolves:

- active subscription and plan version;
- channel entitlement;
- node/feature entitlement;
- capability profile;
- quota/rate version;
- deployment ownership.

Attempts to request `ai_chat_premium` social access or `voice_gen2` using Basic credentials must fail before provider/channel work begins and create a safe security event.

## 5. Identity, consent and communications

- separate normalized contact identities;
- verify before automatic linking;
- store consent/notice version, timestamp, source and scope;
- respect opt-out/do-not-contact;
- automated AI/voice disclosure where required;
- marketing/outbound use requires a documented lawful basis and channel/telephony compliance;
- appointment request is not consent for unrelated marketing.

## 6. Chat/social channel security

- encrypt LINE/WhatsApp/Messenger credentials;
- validate webhook signatures and timestamps;
- deduplicate/replay-protect external events;
- least-privilege app scopes;
- credential expiry/revocation monitoring;
- outbound recipient/channel ownership validation;
- sanitize media/attachments and URLs;
- honor channel session/template policies;
- never include internal provider metadata in outbound payloads.

## 7. AI and Action Gateway security

Model output is untrusted.

Controls:

- versioned system/business/playbook separation;
- source-scoped retrieval;
- prompt injection/adversarial testing;
- typed action schemas;
- fixed server action allow-list;
- tenant/deployment/role/entitlement validation;
- recipient/destination allow-lists;
- consent, rate and spend checks;
- idempotency and audit;
- deterministic result wording;
- no arbitrary code, SQL, HTTP request or email recipient.

Knowledge/tool content cannot change system policy or grant entitlements.

## 8. Voice security

- short-lived session authorization;
- tenant/agent/plan/capability binding;
- destination and geographic restrictions;
- concurrency and tenant/platform spend caps;
- anomaly/fraud detection;
- emergency stop for provider, tenant, agent and destination;
- secure transfer rules;
- recording disabled by default;
- approved recording/automated-agent notice and retention;
- transcript-only mode where appropriate/available;
- encrypted recording storage with signed short-lived access;
- no provider/model name in spoken customer disclosure.

## 9. Provider confidentiality and truthful transparency

### Ordinary product surfaces

Use only public capability names:

- AI Chatbot Basic/Premium;
- First-Generation Voice Engine;
- Second-Generation Voice Engine.

Sanitize:

- SDK exceptions;
- provider response fields;
- headers/error codes;
- model metadata;
- analytics dimensions;
- invoice/usage descriptions;
- widget/source maps and public logs.

### Internal surfaces

Provider/model routing is visible and configurable only in the internal Platform Master Dashboard by Platform Owner or explicitly authorized Platform AI Operations roles. Tenant Master Admin, Tenant Admin and all other tenant roles are denied regardless of tenant ownership.

Master Dashboard routing changes require strong authentication/reauthentication, least-privilege permission, validated capability compatibility, immutable before/after audit, effective dating and rollback. Platform Finance may view approved cost/margin reports without receiving model-routing mutation permission.

### Legal surfaces

Privacy notices, data-processing agreements and subprocessor disclosures must truthfully identify processors/providers when legally or contractually required. Commercial model concealment must never create a false legal statement.

## 10. Secrets and infrastructure

- managed secret storage and rotation;
- no production secrets in repository/logs/client bundles;
- separate environments/accounts;
- private database/cache/object access where practical;
- encryption in transit and at rest;
- dependency/container scanning and signed build provenance;
- least-privilege service identities;
- patch and vulnerability management;
- database backups and restore tests.

## 11. Upload, retrieval and content controls

- file type/size/count limits by entitlement;
- antivirus/malware scan;
- safe parsing/sandboxing;
- URL fetch SSRF, redirect, DNS and private-network protection;
- tenant/agent/revision filters in retrieval;
- source provenance;
- confidential source deletion includes chunks/embeddings/caches;
- no cross-tenant retrieval under any fallback path.

## 12. Retention and deletion

Retention categories are separately configurable for:

- messages/conversations;
- leads/appointment requests;
- voice transcripts;
- voice recordings;
- knowledge/uploads;
- usage/invoices;
- audit/security events;
- provider traces/evaluation data.

Deletion/export maps all derived data, embeddings, summaries, files and backups according to approved policy. Financial/security records may be retained or anonymized where legally required.

## 13. Logging and audit

General logs exclude message bodies, prompts, retrieved documents, contact details and secrets by default.

Audit:

- subscription/entitlement/rate changes;
- publish/rollback;
- channel/provider credentials and routing changes;
- support access;
- actions and recipient/destination;
- recording/retention changes;
- merges/deletions/exports;
- invoices/credits;
- provider-equivalence/fallback decisions.

Audit diffs redact secrets and sensitive payloads.

## 14. Incident response

Incident classes:

- isolation/data exposure;
- entitlement/billing bypass;
- provider/channel credential compromise;
- unauthorized action;
- voice fraud/spend spike;
- provider/model leakage;
- Advanced capability degradation;
- recording/privacy issue;
- availability/data loss.

Runbooks include contain, kill switch, preserve evidence, assess tenants/data, notify according to legal/contractual requirements, restore and postmortem.

## 15. Compliance gates

Before production features:

- Thai PDPA/privacy notice and DPA review;
- cross-border transfer/provider mapping;
- LINE/Meta platform policy review;
- WhatsApp template/marketing consent and fee treatment;
- telephony number, caller identity, recording and outbound rules;
- invoice/tax/payment requirements;
- data retention and deletion schedule.
