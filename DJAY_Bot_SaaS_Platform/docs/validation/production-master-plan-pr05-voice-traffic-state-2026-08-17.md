# PR-05 Voice deployment traffic-state evidence — 2026-08-17

## Scope

This checkpoint adds separate publication, web installation verification and live-traffic authority for Voice deployments. Real-site browser/staging acceptance, telephony provider acceptance and external approvals remain open.

## Implemented authority

- Migration `0118_voice_deployment_traffic_state.sql` adds fail-closed `inactive`/`live` state, tenant-isolated install checks, restricted widget reporting and live-state enforcement in runtime configuration, resource admission and the database session-grant function. Historical deployments are preserved as live; new deployments start inactive.
- Tenant commands request an exact-origin install check and explicitly start or stop new calls. Go-live locks and revalidates the matching Voice entitlement/capability, current published playbook, resource state, verified allowed origin and current minute capacity, then records an audit event.
- The Voice widget reports installation before requesting live configuration. Voice Studio displays resource, install and traffic states separately and confirms go-live or stop operations.
- Stopping traffic rejects new session grants without terminating sessions already issued. Disabling or revoking the resource also stops traffic, and re-enabling it cannot silently resume calls; a fresh explicit go-live command is required.

## Verification

- `TEST_DB_PORT=55499 pnpm test:db` — all 114 migrations and the complete PostgreSQL suite passed, including inactive-by-default, exact-origin verification, cross-tenant denial, audited go-live/stop, disable/re-enable safety, runtime and direct database grant denial while inactive, Advanced admission fail-closed behavior, RLS and guarded legacy rollback.
- Database, API, tenant-web and Voice widget TypeScript checks passed; Voice widget and database unit suites passed.
- No browser or GUI was opened.

## Gates intentionally open

- Real-site CORS, accessibility/responsive, microphone and staging rollback acceptance.
- Live telephony/provider qualification. Immutable live-version pinning is covered by the later `production-master-plan-pr05-immutable-live-artifacts-2026-08-17.md` checkpoint.
- Requirements `BOT-004`, `UX-017` and `WEB-002` remain `in_progress`; zero requirements are accepted and all packages remain non-sellable.
