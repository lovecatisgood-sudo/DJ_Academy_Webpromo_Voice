# FlowBot V1 Migration Runbook

## Preconditions

- Use a staging copy of the legacy database and a target tenant that already has
  one active owner and the intended FlowBot entitlement.
- Record source backup, source checksum, operator reference, write-freeze plan,
  rollback point, and the restricted tenant mapping.
- Drain or cancel the legacy notification outbox and active sessions before final
  cutover. Never migrate pending sends or live credentials.

## Dry run and import

Run the built migration worker with `LEGACY_FLOWBOT_DATABASE_URL`,
`DATABASE_MIGRATION_URL`, source/target tenant IDs, target owner membership ID,
and `MIGRATION_OPERATOR_REFERENCE`. The importer derives stable target IDs,
validates every graph under the target plan, quarantines unsupported versions,
rotates deployment keys, and writes count/checksum evidence.

```bash
scripts/use-node24.sh pnpm --filter @djay/workers migrate:flowbot-v1
```

Do not distribute rotated keys through logs or tickets. Hand them to the install
workflow once, then verify each exact origin with the install check.

## Acceptance

For each tenant, require source = accepted + rejected, target ID-map uniqueness,
published pointer integrity, graph checksums, a representative English and Thai
journey, one lead/handover/notification reconciliation, tenant substitution
denials, and zero restricted provider/model leakage. Resolve every quarantine or
record an explicit product decision before traffic switch.

## Cutover and rollback

Perform a final delta under a short source write freeze, verify again, then switch
only the named tenant's deployment flag/key. Keep legacy encrypted and read-only
during the acceptance window.

Rollback mode disables migrated deployments and archives migrated bots only when
the target has accepted no executions. The tool refuses rollback after a target
execution exists; at that point forward-fix or an accepted data-reversal plan is
required. Destructive source or target cleanup is never part of rollback.
