# AI Text approved business-profile grounding evidence — 2026-08-17

## Scope

This checkpoint advances `AIT-002` and `KNO-007`; both remain `in_progress`. It does not claim the Advanced structured catalogue, live-provider quality acceptance, browser acceptance or Product Owner acceptance.

The approved Builder business type, summary, products/services, hours and contact fields already survive exact-revision draft claim into the immutable Text/Voice playbook and remain editable in authenticated Configuration. The runtime now derives bounded typed evidence records from that pinned playbook, selects only records relevant to the customer question and includes them in grounding/confidence evaluation. Builder-owned evidence is serialized as data, never instruction or authorization. Recognized English/Thai prompt-control content is excluded before provider policy construction.

The same selected facts are used by deployed AI Text and the no-side-effect Builder/merchant preview path. Provider requests cannot supply or override this authority. Existing active knowledge revision, FAQ, approved-claim, bot-instruction and conversation-history boundaries remain unchanged.

## Automated evidence

- `packages/sales-core/src/index.test.ts`: relevant business-fact selection, JSON policy encoding and prompt-control exclusion.
- `packages/ai-chat-runtime/src/index.test.ts`: a service answer is grounded from the immutable Builder `offers` field without knowledge chunks or an unrelated claim.
- `packages/db/src/anonymous-builder-store.integration.test.ts`: Text and Voice claims preserve the exact approved business profile into tenant draft authority.

Remaining for `KNO-007`: the approved Advanced catalogue authoring experience and structured item lifecycle, including item identity, bilingual fields, status/versioning, bulk import and product/service-specific retrieval. No browser or GUI was used.

## Release verification

- `TEST_DB_PORT=55540 pnpm test:db` passed all 120 migrations, PostgreSQL integration suites, RLS/cross-tenant denial and guarded legacy rollback.
- `pnpm verify` passed policy checks, lint, typecheck, tests and production builds for all 35 packages.
- `pnpm package:release` and `pnpm qa:release-artifacts` packaged and runtime-smoked all eight production artifacts.
- `pnpm run test:release-gate` passed the non-skipping production-phase contract.
- The registry remains honest at 337 requirements, zero accepted and six non-sellable packages.
