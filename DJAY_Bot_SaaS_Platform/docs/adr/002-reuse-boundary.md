# ADR-002: Existing-Product Reuse Boundary

- Status: Accepted
- Date: 2026-07-14
- Phase: P0

## Context

FlowBot and the current voice/text agent contain valuable working behavior but incompatible identity, tenant, provider, and status models. Wholesale copying would preserve unsafe assumptions and obscure provenance.

## Decision

No existing application directory becomes a target runtime dependency. Port code capability by capability according to `docs/audit/reuse-refactor-replace.md`.

Required port record for every capability:

1. source files and current tests;
2. accepted behavior and explicit non-goals;
3. target package/API/event contract;
4. tenant, permission, entitlement, privacy, and provider-confidentiality delta;
5. data migration and rollback;
6. parity, negative, and failure tests;
7. source and target version/checksum evidence.

The deterministic FlowBot engine is the first direct reuse candidate. Voice/text behavior, UI workflows, booking, and analysis are refactors behind shared domain, Action Gateway, Sales Core, and Provider Gateway contracts. Current auth, singleton settings, raw DB access, public provider protocols, global quotas, and tenant provider controls are replacements.

## Compatibility rules

- Existing public routes are not automatically permanent SaaS routes.
- Legacy DTOs are accepted only at migration/compatibility adapters and cannot expose restricted target fields.
- Legacy status values are normalized at the boundary and do not enter target enums.
- Legacy sessions, invites, and public widget capabilities are rotated rather than migrated.
- No provider/model field from current applications is added to tenant schemas for convenience.

## Consequences

- Characterization/golden tests are necessary before ports.
- Product migration remains independently rollbackable.
- Some visual components may be recreated instead of copied when their state model embeds single-tenant assumptions.
- The new workspace cannot silently drift from accepted current behavior because every reuse claim requires evidence.

