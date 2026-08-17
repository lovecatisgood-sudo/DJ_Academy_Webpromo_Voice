# PR-05 Flow deployment traffic-state evidence — 2026-08-17

## Scope

This checkpoint separates Flow publication, deployment creation, installation verification and live traffic. It is local engineering evidence only; Text/Voice parity, browser/staging acceptance and external approvals remain open.

## Implemented authority

- Migration `0116_flow_deployment_traffic_state.sql` adds explicit `inactive`/`live` traffic state. Existing deployment rows remain live for backward compatibility; every deployment created through the tenant application starts inactive.
- Flow runtime configuration and new conversation authority require both an active deployment and live traffic. Install reporting remains available while traffic is inactive so verification can precede launch.
- `POST /tenant/flowbot/deployments/:deploymentId/traffic` is permissioned, trusted-origin protected, rate-limited and tenant scoped.
- Go-live locks and revalidates the deployment and bot, current published version, Flow entitlement, resource write state, verified allowed origin and current quota capacity. Successful go-live and stop commands write tenant audit events.
- Flow Studio displays installation and traffic as separate states, confirms traffic changes, and prevents its go-live action until a verified check is visible.

## Verification

- `TEST_DB_PORT=55491 pnpm test:db` — all 112 migrations and the complete PostgreSQL integration suite passed, including new inactive-by-default, pre-verification denial, cross-tenant denial, audited go-live/stop and runtime compatibility cases.
- Database, API and tenant-web TypeScript checks passed.
- `packages/db/src/migration-invariants.test.ts` asserts that all three Flow runtime authorities require live traffic and that install reporting is not replaced.
- No browser or GUI was opened.

## Gates intentionally open

- Real-site browser installation, accessibility/responsive and staging rollback acceptance.
- Equivalent explicit traffic state for AI Text and Voice.
- Immutable version-pinned widget artifacts, duplicate-launcher detection and remaining theme/preview controls.
- Requirements `BOT-004`, `UX-017` and `WEB-002` remain `in_progress`; zero requirements are accepted and all packages remain non-sellable.
