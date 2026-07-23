# PII registry (SKU1)

Status: engineering draft for G6c — living inventory of personal data stores.  
Last updated: 2026-07-23  
First SKU: `flowbot_basic`

## Scope

Personal data means identifiers and content that can relate to a natural person (merchant users, staff, end customers, channel subjects). Secrets and commercial ledgers are listed only where they coexist with personal data.

## Tenant personal data stores

| Store | Key fields | Source | Retention | Export | Erasure |
|-------|------------|--------|-----------|--------|---------|
| `tenancy.contacts` | display_name, locale, consent_status | CRM / widget | Until erased | yes | anonymize + status=`erased` |
| `tenancy.contact_identities` | normalized_value, display ciphertext | CRM | Until erased | yes (value) | overwrite / revoke |
| `tenancy.contact_attributes` | value_text | CRM | Until erased | yes | delete (trigger) |
| `tenancy.contact_tag_assignments` | contact↔tag | CRM | Until erased | yes | delete (trigger) |
| `tenancy.leads` + sales/appointment/follow-up | titles, notes, facts | products | Until erased | yes | anonymize |
| `tenancy.conversations` | contact link, channel | products | shell retained | yes | `retained_legal` shell; **legal_hold** skips transcript wipe |
| `tenancy.messages` | content_json | inbox / bots | policy days | yes | anonymize unless legal hold |
| `tenancy.conversation_notes` | body | agents | with conversation | yes | anonymize unless legal hold |
| `tenancy.action_requests` / `action_results` | input_json / result_json | action gateway | operational | yes | anonymize unless legal hold |
| `tenancy.voice_sessions` / `voice_turns` | contact, turn JSON | Voice | policy / erase trigger | yes | turns redacted on contact erase |
| `tenancy.voice_call_outcomes` | summary_text | Voice | operational | yes | summary anonymized unless legal hold |
| `tenancy.voice_callback_requests` | schedule metadata | Voice | operational | yes | contact chain anonymized |
| `tenancy.ai_social_subjects` / `flow_social_subjects` | external_subject_ciphertext, contact | social | until erase | metadata only | ciphertext replaced, opted_out |
| `tenancy.privacy_jobs` / `privacy_artifacts` | scope, encrypted export | DSAR | artifact 7 days | n/a | job lineage retained |
| `tenancy.privacy_lineage` | entity dispositions | DSAR audit | retained | n/a | immutable |
| `identity.users` / memberships | email, name (merchant staff) | registration / invite | account lifecycle | out of contact DSAR | account delete flows (separate) |
| Billing / Stripe customer refs | email via Stripe | checkout | Stripe retention | Stripe portal | Stripe + local refs per commercial runbook |

## Object / knowledge residuals

| Store | Personal data risk | SKU1 disposition |
|-------|--------------------|------------------|
| Knowledge source revisions / object refs | May embed customer text if merchant uploads PII | **Residual** — not auto-erased; counsel-approved residual list |
| Provider logs / Cloud Logging | Accidental PII in messages | Spot-check runbook; worker forbids intentional PII logs |
| Email / channel provider copies | Message bodies off-platform | Disclosed as subprocessors; deletion via provider tools |

See `docs/compliance/dsar-residual-list.md`.

## Platform / ops (non-tenant DSAR)

Platform user emails, support grants, and ops audit are platform-realm data. Customer DSAR for end-user contacts is fulfilled via tenant privacy jobs, not platform export.

## Change control

Update this registry when migrations add columns/tables that store personal data. Owner: Privacy + Eng.
