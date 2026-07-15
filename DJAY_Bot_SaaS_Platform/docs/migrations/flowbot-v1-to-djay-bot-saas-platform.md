# Existing Applications to DJAY Bot SaaS Platform Migration

Status: P0 accepted migration strategy. Detailed executable migrations are phase deliverables.

## Principles

- Build the target schema beside legacy systems; do not mutate either source into a partially tenant-aware hybrid.
- Use deterministic IDs or durable legacy-ID mapping tables so imports are restartable.
- Every import is tenant-bound before any tenant-owned row is written.
- Run snapshot import, validation, incremental delta, short write freeze, final delta, and traffic switch.
- Keep legacy read-only during an explicit rollback window.
- Never migrate provider/model visibility into tenant-facing data.
- Migrate password verifiers only when scheme and policy are compatible; otherwise require a secure account-claim/recovery flow.

## Migration control tables

Target migration tooling will maintain:

- `migration_runs`: source, version, tenant, status, timestamps, counts, checksum, operator;
- `legacy_id_map`: source system/table/id to target type/id, tenant, run;
- `migration_rejects`: redacted record locator, reason code, remediation state;
- `migration_checkpoints`: source cursor/high-water mark;
- `migration_validations`: query name, expected/actual, pass/fail, evidence digest.

These tables are internal and inaccessible to tenant roles.

## FlowBot mapping

| Legacy | Target | Rule |
|---|---|---|
| `flowbot_tenants` | `tenants` | Pre-create/claim tenant; preserve stable mapping, name, lifecycle metadata |
| `flowbot_users` | `users` + `memberships` | Normalize email; resolve collisions; owner maps to Tenant Master Admin only after invariant check |
| user sessions/invites | none by default | Revoke; require fresh SaaS session; active invites reissued through new flow |
| bots | product deployments | Product `flowbot`; copy public key through signed deployment-key rotation |
| flow versions/nodes/options/keywords | flow drafts/versions/graphs | Preserve version numbers and immutable published snapshots; validate graph checksum |
| conversations/messages/processed inputs | canonical conversations/messages/idempotency | Preserve pinned version, ordering, source IDs, and safe timestamps |
| customers | contacts/contact points | Suggest duplicate candidates; never auto-merge by phone/email |
| leads | leads | Map CRM status through canonical map below |
| notes/events | notes/domain events | Preserve actor where mapped; redact unsupported payload fields |
| contact channels | deployment contact actions | Validate destination and entitlement |
| notification outbox | not migrated as pending work | Drain or cancel source outbox before cutover; do not duplicate sends |
| audit logs | immutable legacy audit archive | Preserve source provenance; do not rewrite historical actor meaning |
| availability/blocks/bookings | shared calendar/appointments | Apply appointment policy and timezone validation |

## Voice/text mapping

| Legacy | Target | Rule |
|---|---|---|
| `admin_users` | users + memberships | Master admin becomes candidate Tenant Master Admin; no platform role inheritance |
| singleton `settings` | tenant settings + deployments + behavior revisions | Split by ownership; provider/model fields route to restricted platform migration review, never tenant settings |
| conversations/messages | canonical conversation/message | Set tenant, channel, mode; preserve transcript/analysis under retention policy |
| leads | canonical leads/contact points | Normalize statuses and contact fields; preserve source mode/channel |
| calendar profiles/rules/overrides | calendars/availability | Tenant/user scope, timezone and overlap validation |
| booking links/meeting types | appointment configurations | Tenant scope, destination owner, active status, entitlement |
| appointments | appointment requests/confirmed appointments | Preserve status only where destination policy allows; otherwise import as request requiring review |

Legacy provider/model columns are not copied to tenant-domain tables. Where legally/operationally necessary for historical cost reconciliation, they become restricted internal usage/routing references with platform-only grants and redacted serializers.

## Canonical status mapping

Target lead stages:

```text
new
pending_follow_up
appointment_made
not_closed_follow
closed_deal
disqualified
```

| Source | Target |
|---|---|
| FlowBot `new` | `new` |
| FlowBot `pending_follow_up` | `pending_follow_up` |
| FlowBot `appointment_made` | `appointment_made` |
| FlowBot `not_closed_follow` | `not_closed_follow` |
| FlowBot `closed_deal` | `closed_deal` |
| Voice `pending_follow_up` | `pending_follow_up` |
| Voice `appointment_set` | `appointment_made` |
| Voice `follow_up_later` | `not_closed_follow` |
| Voice `deal_closed` | `closed_deal` |
| Voice `no_deal` | `disqualified` |

Source values remain in migration provenance, not active product enums.

## Identity cutover

1. Import normalized user candidates without active sessions.
2. Detect same-email accounts across source systems and tenants.
3. Link only after verified proof; do not merge on email alone when ownership is ambiguous.
4. Create one membership per source tenant and assert exactly one active owner.
5. Send account-claim links through the new public SaaS auth system.
6. Rotate all deployment/session/invite credentials.
7. Require fresh login; legacy cookies and session tokens never cross the boundary.

## Data validation

For every tenant and source table record:

- source count, accepted count, rejected count, and target count reconcile;
- ID-map uniqueness and tenant match pass;
- sampled content hashes match after documented normalization;
- all target tenant rows pass RLS and same-tenant FK checks;
- active deployment/version pointers resolve;
- message ordering and conversation version pins resolve;
- contact duplicates are reported, not silently merged;
- no restricted provider/model values appear in tenant/public serializers;
- privacy-erased source records remain erased;
- pending source outbox and active sessions equal zero at cutover.

## Cutover and rollback

1. Deploy target dark with imports disabled from serving traffic.
2. Run snapshot migration and fix rejects.
3. Run tenant-by-tenant acceptance in staging.
4. Start incremental deltas and measure lag.
5. Announce and enter a short source write freeze.
6. Drain outboxes and active voice/chat sessions.
7. Run final delta and validation suite.
8. Switch deployment/widget keys to target endpoints behind flags.
9. Monitor isolation denials, auth failures, event lag, errors, usage reconciliation, and provider-leak scans.
10. Roll back traffic to legacy read/write only if no target-only writes have been accepted; otherwise use dual-written reversal tooling or keep target and forward-fix.

The exact point of no return is declared per tenant before cutover. Database destructive cleanup is not part of launch. Legacy remains encrypted, access-restricted, and read-only until retention and acceptance authorize deletion.

## Phase ownership

- P1: identity claim and membership migration tooling.
- P2: tenant schema/RLS, plan/subscription seed, isolation validation.
- P3: canonical contacts/conversations/leads migration.
- P4: FlowBot graph/runtime migration and parity.
- P5-P6: AI text behavior, knowledge, and channel migration.
- P7-P8: voice behavior, media deployment, and historical usage migration.
- P9: subscription/payment/invoice reconciliation and final production cutover tooling.

