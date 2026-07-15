# 11 · Canonical Domain Model & Event Catalog — DJAY Bot SaaS Platform v3.0

## 1. Modeling principles

- one canonical domain supports all six plans;
- all tenant records are scoped and auditable;
- published behavior/commercial configuration is immutable/versioned;
- external/provider events are idempotent;
- customer-billable and provider-native usage are separate;
- contacts use separate identities and safe merge workflow;
- no POS, inventory, cashier, class, child/parent or attendance entities.

## 2. Identity and tenancy

### `users`

`id, email, name, status, auth_provider_ref, created_at`

### `signup_intents`

`id, normalized_email, selected_plan_key, business_name, status, idempotency_key, legal_acceptance_json, expires_at, created_at`

### `email_verification_tokens` / `password_reset_tokens`

Store token hashes, purpose, expiry, use timestamp and revocation state. Raw tokens are never persisted.

### `tenants`

`id, name, slug, timezone, locale, status, created_at`

### `tenant_memberships`

`id, tenant_id, user_id, role_key, status, invited_by, created_at`

Unique active membership per tenant/user. Initial role keys are `tenant_master_admin`, `tenant_admin`, `sales_agent` and `analyst_viewer`. The initial release enforces exactly one active Tenant Master Admin per tenant.

### `tenant_invitations` / `tenant_ownership_transfers`

Expiring, hashed, single-use tenant capabilities with initiating actor, target, requested role, status, confirmation and immutable audit references.

### `support_access_sessions`

`id, tenant_id, platform_user_id, reason, approved_by, starts_at, expires_at, ended_at`

## 3. Product catalog and subscriptions

### `products`

Keys:

- `flowbot`
- `ai_chat`
- `voice_agent`

### `plans`

Fixed public keys:

- `flowbot_basic`
- `flowbot_premium`
- `ai_chat_basic`
- `ai_chat_premium`
- `voice_basic_gen1`
- `voice_advanced_gen2`

Fields: `id, product_key, plan_key, public_name, tier_rank, status`.

### `plan_versions`

`id, plan_id, effective_from, effective_to, currency, recurring_price, entitlements_json, allowance_json, overage_rate_json, public_copy_json, created_by`

Immutable after effective/published.

### `tenant_product_subscriptions`

`id, tenant_id, product_key, plan_version_id, status, period_start, period_end, provider_subscription_ref, cancel_at`

Invariant: one active subscription per tenant/product.

### `tenant_entitlement_overrides`

`id, tenant_id, product_key, entitlement_key, value_json, reason, approved_by, effective_from, expires_at`

Overrides do not create public plans.

### `entitlement_snapshots`

`id, tenant_id, product_key, plan_version_id, resolved_json, rate_version_id, created_at`

Attached to conversations/calls/usage.

## 4. Capability and provider registry — internal restricted

### `capability_profiles`

`id, key, generation, capability_requirements_json, status`

Keys include:

- `voice_gen1`
- `voice_gen2`

### `provider_model_profiles`

`id, capability_profile_id, provider_key, model_id, region, config_json, equivalence_status, priority, effective_from, effective_to, status`

Current default mapping is operational configuration, not customer plan data. Read/write access belongs to internal Platform Master Dashboard commands only; no tenant-scoped repository or DTO exposes this entity.

### `provider_routing_change_events`

`id, actor_platform_user_id, provider_model_profile_id, change_type, before_json_restricted, after_json_restricted, evidence_ref, effective_at, rollback_of_id, created_at`

Append-only internal audit. Tenant users, including Tenant Master Admin and Tenant Admin, cannot query it.

### `provider_credentials`

Encrypted/referenced secrets by environment/region/provider. Never returned to tenant clients.

## 5. Agents and versions

### `agent_definitions`

`id, tenant_id, product_type[flowbot|ai_chat|voice_agent], name, status, created_by`

### `agent_versions`

`id, agent_id, version, schema_version, config_json, knowledge_bundle_version_id, offer_catalog_version_id, evaluation_version_id, published_at`

Immutable when published.

### `deployments`

`id, tenant_id, agent_id, agent_version_id, channel_connection_id, status, public_key, created_at`

Deployment validator enforces plan/channel/product.

## 6. FlowBot

### `flow_definitions` / `flow_versions`

`flow_versions` contains canonical graph JSON, schema version, feature keys, source draft and publish audit.

### `flow_executions`

`id, tenant_id, deployment_id, conversation_id, flow_version_id, entitlement_snapshot_id, state_json, current_node_id, status, next_sequence, started_at, ended_at`

### `flow_execution_events`

Ordered input/transition/command/result events.

### `flow_timers`

`id, execution_id, due_at, status, idempotency_key, payload_json`

## 7. Channels

### `channel_connections`

`id, tenant_id, kind[web|line|whatsapp|messenger|voice_web|telephony], status, credentials_ref, external_account_ref, health_json`

### `channel_bindings`

`id, tenant_id, deployment_id, channel_connection_id, config_json, status`

AI Basic validator permits only `web`. AI Premium permits `web|line|whatsapp|messenger`.

### `external_event_receipts`

`id, channel_connection_id, external_event_id, received_at, payload_hash, status`

Unique for replay/deduplication.

## 8. Contacts, identities and consent

### `contacts`

`id, tenant_id, display_name, status, owner_id, created_at, updated_at`

### `contact_identities`

`id, tenant_id, contact_id, type[email|phone|widget|line|whatsapp|messenger], normalized_value, external_ref, verification_status, first_seen_at, last_seen_at`

### `contact_merge_candidates` / `contact_merge_events`

Suggestion, review, reason, evidence, actor and undo/provenance.

### `consent_records`

`id, tenant_id, contact_id, scope, status, notice_version, source, recorded_at, revoked_at`

## 9. Leads and sales facts

### `leads`

`id, tenant_id, contact_id, source_product, source_channel, source_conversation_id, status, owner_id, next_action_at, outcome, created_at`

### `sales_facts`

`id, tenant_id, lead_id, conversation_id, type, value_json, evidence_ref, source[customer|flow|ai|human|integration], confidence, status[candidate|confirmed|rejected|superseded]`

### `objection_events`

`id, lead_id, conversation_id, objection_type, text, response_summary, resolution_status, created_at`

### `cta_events`

`id, lead_id, conversation_id, cta_type, response[accepted|declined|considering|no_response], created_at`

### `appointment_requests`

`id, tenant_id, lead_id, conversation_id, status[new|contacted|awaiting_confirmation|confirmed_external|declined|expired|cancelled], timezone, notes`

### `appointment_time_options`

`id, appointment_request_id, start_at, end_at, preference_order, source, verification_status`

### `follow_up_tasks`

`id, tenant_id, lead_id, assignee_id, type, status, due_at, completed_at`

## 10. Conversations and messages

### `conversations`

`id, tenant_id, contact_id, lead_id, channel_kind, deployment_id, automation_mode[flowbot|ai_text|voice|human], pinned_agent_version_id, entitlement_snapshot_id, status, assigned_to, started_at, closed_at`

### `messages`

`id, tenant_id, conversation_id, sequence, actor_type[customer|flowbot|ai|human|system], direction, content_json, external_message_id, reply_to_id, created_at`

### `message_deliveries`

`id, message_id, channel_connection_id, status, external_ref, attempt, failure_code, updated_at`

### `conversation_transitions`

Mode change, reason, actor, from/to and structured context snapshot.

### `handover_events`

Request/accept/release/decline/timeout with assignment and summary.

## 11. Knowledge and sales configuration

### `knowledge_sources` / `knowledge_source_revisions`

Tenant source metadata, immutable revisions, checksum, status and provenance.

### `knowledge_chunks`

Tenant/source/revision scoped text/vector reference.

### `knowledge_bundles` / `knowledge_bundle_versions`

Explicit source revisions attached to agent version.

### `offer_catalogs` / `offer_catalog_versions`

Structured product/service, price, eligibility, claims, exclusions, promotions and CTA rules.

## 12. Action Gateway

### `action_requests`

`id, tenant_id, conversation_id, agent_version_id, type, input_json, idempotency_key, status, requested_at`

### `action_attempts`

`id, action_request_id, executor_key, attempt, started_at, finished_at, result_code, safe_error`

### `action_results`

`id, action_request_id, success, result_json, created_at`

### `notification_profiles`

Approved merchant recipients/templates/channels. Raw arbitrary recipient output from AI is prohibited.

## 13. Voice

### `voice_sessions`

`id, tenant_id, conversation_id, agent_version_id, public_plan_key, capability_profile_id, entitlement_snapshot_id, channel_connection_id, direction, status, started_at, connected_at, ended_at, duration_ms, billable_seconds`

Tenant-facing API omits `capability_profile_id`; it exposes generation label from plan copy.

### `voice_session_events`

Connect, turn, interruption, silence, action, transfer, provider-neutral failure and disconnect.

### `voice_transcript_segments`

`id, voice_session_id, sequence, speaker, text, start_ms, end_ms, confidence, retention_class`

### `voice_recordings`

Encrypted object reference, consent/notice, retention and access audit.

## 14. Usage and billing

### `quota_accounts`

By tenant/product/plan/version/period/customer unit.

### `quota_reservations`

`id, quota_account_id, operation_id, reserved_quantity, status, expires_at, settled_quantity`

### `usage_events`

`id, tenant_id, product_key, plan_version_id, entitlement_snapshot_id, operation_id, customer_unit, customer_quantity, provider_key_restricted, model_id_restricted, provider_usage_json_restricted, provider_cost, rate_version_id, billable_amount, status, occurred_at`

Provider fields are internal-only.

### `usage_aggregates`

Period/product/plan/unit totals for dashboard/reconciliation.

### `rate_card_versions`

Customer unit price/overage, rounding, external fee treatment and effective dates.

### `invoices`, `invoice_lines`, `payments`, `credits`

Invoice lines contain public plan/unit labels and references to reconciled usage/rate versions—not provider/model names.

### `external_fee_events`

Social/telephony/provider pass-through cost with rate treatment.

## 15. Audit and operations

### `audit_events`

Tenant/platform actor, action, target, redacted diff, reason, correlation and time.

### `outbox_events` / `dead_letter_items`

Durable effect publication and recoverable failures.

### `evaluation_runs` / `evaluation_results`

Playbook/agent/capability/provider-profile test evidence with restricted provider visibility.

## 16. Core event catalog

### Subscription/entitlement

- `subscription.activated|changed|cancelled`
- `entitlement.snapshot_created`
- `entitlement.denied`
- `quota.reserved|settled|released|exceeded`

### Agent/deployment

- `agent.version_published`
- `deployment.activated|paused`
- `channel.connected|degraded|revoked`

### Identity/tenancy

- `identity.signup_started|email_verified|user_registered`
- `tenant.provisioned|master_admin_assigned|ownership_transferred`
- `tenant.membership_invited|accepted|changed|revoked`

### Conversation

- `conversation.started|mode_changed|assigned|closed`
- `message.received|planned|sent|delivered|failed`
- `handover.requested|accepted|released`

### Flow

- `flow.execution_started|transitioned|command_requested|command_result|completed|failed`
- `flow.timer_scheduled|fired|cancelled`

### Sales

- `lead.created|updated|assigned|outcome_recorded`
- `sales_fact.captured|confirmed|rejected`
- `objection.recorded|resolved`
- `cta.offered|responded`
- `appointment_request.created|updated`
- `follow_up_task.created|completed`

### Voice

- `voice.session_requested|connected|interrupted|transferred|ended|failed`
- `voice.usage_settled`
- `voice.capability_degraded` (internal incident visibility; tenant wording provider-neutral)

### Actions/billing/security

- `action.requested|succeeded|failed`
- `usage.recorded|reconciled`
- `invoice.generated|paid|failed|credited`
- `support_access.started|ended`
- `privacy.export_requested|deletion_requested|completed`
- `security.provider_leak_detected`

## 17. Invariants

1. One active plan per tenant/product.
2. Exactly six public plan keys.
3. AI Basic cannot bind social channels.
4. Voice Basic/Advanced map to Gen1/Gen2 capability profiles respectively.
5. Tenant-facing schemas omit provider/model/cost fields, and tenant roles cannot invoke provider registry or routing commands.
6. FlowBot runtime never emits AI provider usage.
7. Active behavior is pinned to immutable version.
8. Weak contact similarity never auto-merges.
9. Actions require validated idempotent requests.
10. Invoice lines trace to reconciled usage/rates.
11. Appointment request is not confirmed appointment.
12. No excluded POS/Creative Club operational entities.
13. Provider/model routing is configurable only through authorized Platform Master Dashboard commands with immutable audit and rollback.
14. Every active tenant has exactly one active Tenant Master Admin in the initial release.
15. Tenant Master Admin credentials originate from verified public SaaS registration or invitation acceptance, never from platform-created passwords.
