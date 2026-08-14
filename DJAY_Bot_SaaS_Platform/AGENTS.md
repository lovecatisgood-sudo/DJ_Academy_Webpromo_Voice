# AGENTS.md - DJAY Bot SaaS Platform

## Mission

Build the multi-tenant DJAY Bot SaaS Platform phase by phase. Preserve the existing products' accepted behavior while replacing single-tenant identity, data access, provider exposure, and commercial controls with explicit SaaS boundaries.

## Hard rules

- Never implement SaaS changes inside `../FlowBot_V1_App/`; it is a protected single-tenant reference.
- Never trust a browser-supplied tenant, role, plan, entitlement, provider, or model identifier.
- Every tenant-owned row has `tenant_id uuid not null`; every tenant relationship is same-tenant where practical.
- Tenant repositories require an authenticated `TenantContext` and run in a transaction with forced PostgreSQL RLS.
- Route handlers, components, and product packages do not import a raw database client.
- Platform and tenant identities use different cookies, audiences, route trees, guards, and database capabilities.
- Exactly one active Tenant Master Admin exists per tenant until an accepted ADR changes the invariant.
- Tenant users, including Tenant Master Admin, cannot view or configure provider/model routing.
- Provider/model identifiers never enter tenant/public DTOs, widgets, exports, logs, emails, invoices, or user-visible errors.
- Platform provider routing is available only to Platform Owner or explicitly delegated Platform AI Operations roles, with reauthentication and immutable audit.
- FlowBot is deterministic and imports no AI/provider package.
- Public plan keys are fixed to the six keys in `README.md`; pricing and limits come from immutable plan versions.
- Entitlements are enforced server-side at route, service, publish, binding, runtime, action, usage, and export boundaries.
- Durable effects use idempotency and a transactional outbox.
- Cache keys, queue jobs, object paths, events, logs, and usage records always carry tenant scope.
- Cross-tenant resource substitution returns a non-revealing not-found result and changes no data.
- No product becomes sellable until P1 and P2 isolation and entitlement gates pass.
- For target product experience, follow `docs/design/djay-bots-approved-experience-contract.md`; use `docs/design/djay-bot-text-voice-configuration-flow.html` as its visual reference and never let older HTML demos, dated onboarding plans, or current implementation override it.
- Preserve the approved sequence: Landing and Packages show all three families; family/package precedes role; Flow uses template-led deterministic onboarding; Text and Voice use separate Support/Sales/Booking onboarding; review/testing are advisory; Configuration is full-page and dashboard-accessible; publish, install, verify and Go live are separate.
- Do not invent product behavior. A product-flow change remains `Proposed` until the product owner explicitly approves the exact change and the PRD, experience contract, architecture, UX, implementation plan and executable registry are reconciled together.

## Development rules

- Use Node.js 24 LTS, pnpm 11.12.0, strict TypeScript, pinned package versions, PostgreSQL 16, Drizzle, Zod, Vitest, and Playwright unless an accepted ADR supersedes them.
- Keep the initial deployment a modular monolith plus workers and an independently deployable voice gateway.
- Changes must identify phase, requirements, non-goals, schema/API/event impact, migration, rollback, tests, security, observability, and provider-confidentiality impact.
- Add tenant-isolation and authorization-negative tests before or with each tenant-owned feature.
- Do not claim a gate passed unless its commands and evidence are recorded in `docs/validation/`.
