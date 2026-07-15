# Voice/Text V2 Legacy Migration Runbook

## Scope and authority

This P7 migration imports historical Voice widget and Text widget
conversations, immutable messages, contacts, leads, and safe sales facts into
one pre-approved SaaS tenant. It does not migrate administrator accounts,
calendar configuration, appointments, active sessions, pending sends,
credentials, runtime routes, native usage, or billing evidence.

Apply migrations through `0033_voice_text_legacy_migration` first. Use a
dedicated `djay_migrator` login, a read-only legacy database credential, and a
target tenant with current active Voice and/or AI Chat authority. The importer
quarantines a channel whose target entitlement is absent; it never substitutes
another product or plan.

Legacy routing and model columns are deliberately not selected. They cannot
enter the converter, tenant tables, output, rejects, validation evidence, or
logs. Reject locators are SHA-256 prefixes rather than source IDs or customer
data.

## Snapshot and dry-run

Take and verify an encrypted source backup. Record the source owner, target
tenant, operator, change approval, retention decision, write-freeze window,
traffic rollback owner, and the tenant's point of no return.

Set these variables in a restricted shell or secret-injection job; do not save
credentials in the repository or a ticket:

```bash
export LEGACY_VOICE_TEXT_DATABASE_URL='postgresql://...'
export DATABASE_MIGRATION_URL='postgresql://djay_migrator:...'
export DJAY_TARGET_TENANT_ID='...'
export MIGRATION_OPERATOR_REFERENCE='change-operator-or-job-id'
export MIGRATION_MODE='dry_run'
scripts/use-node24.sh pnpm --filter @djay/workers migrate:voice-text-v2
```

Dry-run is the default and writes no migration or tenant state. Archive its
safe checksum/count output in the restricted change record. Require:

- source conversations equal accepted + quarantined + privacy-deleted;
- orphan leads equal accepted + quarantined;
- every source channel has the intended active target entitlement;
- all quarantine reason codes are resolved or explicitly accepted;
- no customer data appears in logs or reject locators.

## Import and restart

After approval, add `MIGRATION_APPROVAL_REFERENCE`, set
`MIGRATION_MODE=import`, and run the same command. Each conversation is an
atomic transaction. Target IDs are deterministic per tenant/source entity,
immutable messages use stable IDs and sequences, and mapping/reject rows are
idempotent. Rerunning an unchanged snapshot produces the same run ID, target
IDs, counts, and checksum without duplicate contacts, leads, conversations, or
messages.

Historical Voice conversations are closed canonical conversations. The import
does not create Voice sessions, grants, connections, reservations, usage
events, outcomes, callbacks, or cost evidence. Source identities are unverified
duplicate candidates; the migration never auto-merges people based on email or
phone. Soft-deleted conversations remain absent.

The run is `validated` only when the entity reconciliation passes with zero
current rejects. A failed run must not serve traffic. Inspect restricted
`migration.rejects` and `migration.validations`, remediate the source or target
authority, rerun dry-run, and obtain fresh approval when the source checksum
changes.

## Acceptance and observability

Before cutover, verify the recorded source checksum and validation digest,
mapping uniqueness, same-tenant foreign keys, message order/content samples,
lead status samples, duplicate-candidate behavior, tenant substitution denial,
privacy-deleted absence, and zero restricted field leakage. Confirm imported
Voice conversations have no session/usage rows and that Inbox results expose
only canonical safe history.

Monitor migration run status, accepted/rejected counts, checksum drift, RLS
denials, database errors, target conversation/message counts, privacy jobs, and
tenant support reports. Logs contain only the run ID, checksum, counts, safe
status, and reason codes.

## Final delta, cutover, and rollback

Enter the approved source write freeze, drain active Voice/Text sessions and
pending sends, run a final dry-run, compare the checksum, run the approved
import, and repeat acceptance. Switch only the named tenant's widget traffic.
Keep the encrypted legacy system available under restricted access during the
rollback window.

`MIGRATION_MODE=rollback` is a guarded traffic rollback. It succeeds only for a
validated unchanged snapshot with no target-only messages, notes, or mode
transitions. It marks imported conversations rolled back so the tenant Inbox
does not serve them, retains immutable target history and migration evidence,
and never deletes source or target records. Restore legacy traffic separately.

Once target-only activity exists, the tool refuses rollback. That tenant has
passed the declared point of no return and requires forward-fix or a separately
reviewed data-reversal plan. Database cleanup is never part of launch rollback.

## Automated rehearsal

`scripts/test-db-integration.sh` creates an isolated PostgreSQL 16 legacy
database and target, proves dry-run has zero writes, imports the same snapshot
twice, reconciles two conversations/four messages/an orphan lead, checks that
restricted source fields did not cross the tenant boundary, confirms no Voice
session was fabricated, performs guarded rollback, and verifies immutable
history remains intact.
