# PR-05 AI Text deployment traffic-state evidence — 2026-08-17

## Scope

This checkpoint adds AI Text parity for separate deployment creation, installation verification and live traffic. It also repairs the Flow widget install handshake discovered during parity review. Voice parity, browser/staging acceptance and external approvals remain open.

## Implemented authority

- Migration `0117_ai_text_deployment_traffic_state.sql` adds fail-closed `inactive`/`live` state, tenant-isolated install checks, restricted install reporting and live checks in AI Text runtime configuration/session authority. Historical deployments are preserved as live; newly created deployments start inactive.
- Tenant commands request an exact-origin install check and explicitly start or stop traffic. Go-live locks and revalidates active AI Text/web entitlement, the current published playbook, resource state, a verified allowed origin and current AI-response quota capacity, then emits an audit event.
- The AI Text widget reports installation before requesting live configuration. The Flow widget now follows the same order, and both install preflight handlers operate before go-live without granting runtime access.
- AI Text Studio shows install and traffic states separately and confirms go-live/stop changes.

## Verification

- `TEST_DB_PORT=55493 pnpm test:db` — all 113 migrations and the complete PostgreSQL suite passed, including inactive-by-default, pre-verification denial, exact-origin reporting, cross-tenant denial, audited go-live/stop, runtime admission and legacy migration cases.
- Database, API, tenant-web, Flow widget and AI Text widget TypeScript checks passed.
- No browser or GUI was opened.

## Gates intentionally open

- Real-site browser, CORS, accessibility/responsive and staging rollback acceptance.
- Voice install/verify/go-live parity and immutable version-pinned widget artifacts.
- Requirements `BOT-004`, `UX-017` and `WEB-002` remain `in_progress`; zero requirements are accepted and all packages remain non-sellable.
