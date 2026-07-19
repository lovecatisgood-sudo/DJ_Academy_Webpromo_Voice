# CTRL-01 - Market-release requirement control

| Field | Value |
| --- | --- |
| Status | Implemented and locally verified |
| Date | 2026-07-18 |
| Owner | Program control |
| Product sellability impact | All six packages remain non-sellable |
| Evidence | `docs/validation/market-release-requirements.md` |

## Scope

Create the executable control that keeps the V1 PRD, detailed implementation plan, implementation/test evidence and package sellability consistent throughout development.

This work package does not implement or accept any commercial product requirement. The 291 product records therefore remain `planned` and no package is sellable.

## Delivered

- JSON-compatible YAML registry containing exactly the 291 normative PRD requirements.
- Closed JSON Schema for registry structure and allowed package/status values.
- Deterministic synchronization tool that adds new PRD records and preserves existing implementation status/evidence.
- Semantic validator for exact PRD membership, titles, packages, work-package ownership, tracking fields, status evidence and sellability.
- Monotonic reviewed status-transition policy.
- Package-to-requirement mapping and fail-closed sellability denial.
- Focused fixtures for missing, duplicate, unknown, unowned, incomplete, unaccepted and invalid-transition cases.
- Root lint/test integration and enforcement in release packaging and release-artifact QA.

## Files

- `requirements/market-release-v1.yaml`
- `requirements/market-release-v1.schema.json`
- `scripts/market-release-requirements-lib.mjs`
- `scripts/generate-market-release-requirements.mjs`
- `scripts/check-market-release-requirements.mjs`
- `scripts/check-market-release-requirements.test.mjs`
- `package.json`
- `docs/validation/market-release-requirements.md`

## Security and commercial behavior

- All packages start and remain `sellable=false`.
- A package cannot be sellable while any shared or package-specific requirement is not `accepted`.
- Acceptance requires both evidence and an identified reviewer.
- `not_applicable` also requires product-owner approval and cannot be used silently.
- Unknown fields, owners, packages, statuses and PRD IDs fail validation.
- Accepted state cannot regress within one registry/PRD version; a material requirement change requires versioned product change control.

## Migration and rollback

No database or runtime migration is involved. Rollback is removal of the new root/release command hooks and registry files, but that would remove a market-release safety control and is not an acceptable production rollback. A defect should be corrected forward with test fixtures preserving fail-closed behavior.

## Verification

- Registry semantic/schema validation.
- Eleven Node test cases for positive and negative policy behavior.
- Full monorepo `pnpm run verify` across 32 packages/apps.
- Production release packaging for eight artifacts.
- Release-artifact runtime smoke QA for API, three web applications, widget CDN, AI gateway, Voice gateway and workers.

## Exit result

CTRL-01 local implementation is complete. Staging/provider/product requirements are intentionally not accepted, and all six packages remain non-sellable. The next dependency work is CTRL-02 decision closure and COM-01 immutable catalogue implementation.
