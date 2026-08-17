# PR-05 immutable live-artifact evidence — 2026-08-17

## Scope

This checkpoint prevents later authoring publication or rollback from silently changing live Flow, AI Text or Voice customer traffic.

## Implemented authority

- Migrations `0119`, `0120` and `0121` add tenant/resource-bound foreign keys from each deployment to its exact live Flow version or Text/Voice playbook. A web deployment cannot be live without a valid immutable pin.
- Go-live atomically captures the current published artifact after entitlement, resource, origin and quota revalidation. Repeating go-live is unchanged only when both traffic and the exact pin already match.
- Flow resolution and configuration use `live_version_id`; AI configuration and session creation use `live_playbook_version_id`; Voice session grants use `live_playbook_version_id` before any session or usage authority is created.
- Historical live deployments are backfilled to the published artifact that was current during migration. New deployments remain inactive and unpinned.

## Verification

- `TEST_DB_PORT=55502 pnpm test:db` — all 117 migrations and the complete PostgreSQL suite passed, including version-pin foreign keys, Flow resolution after a newer publication, AI and Voice live-pin persistence, runtime admission, RLS, recovery and guarded legacy rollback.
- Database and tenant-web TypeScript checks, 135 migration invariants and all database unit tests passed.
- No browser or GUI was opened.

## Gates intentionally open

- Real-site installation/CORS, accessibility/responsive and staging rollback acceptance.
- Live Voice/telephony and other provider qualification.
- Requirements `BOT-004`, `UX-017` and `WEB-002` remain `in_progress`; zero requirements are accepted and all packages remain non-sellable.
