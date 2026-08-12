# Thai Localization Handoff - 2026-07-28

## Current State

- Thai legal bundle has been vetted externally by the user's lawyer and is cleared for use per user instruction.
- Legal bundle file: `docs/compliance/djay-legal-documents.user-approved.th.json`.
- The bundle was already structurally accepted by the legal loader tests.
- Do not downgrade the bundle back to unavailable/self-doubt language unless the user asks.

## Closed Localization Issues

- Public unauthenticated surfaces were translated at source.
- Public Thai source gate was hardened and observed to fail on injected English prose, then pass after removal.
- Blank-page opacity gates were removed so JS failure degrades to readable content.
- Runtime observers with `characterData` handling are present in async client apps.
- Root admin localizer is intentionally one-shot because admin pages are server-rendered at first paint.
- Confirm dialogs were wrapped with `uiCopy()`.
- Locale cookie is unified on `djay-locale`.
- Date formatting in root admin uses explicit Thai locale via `currentIntlLocale()`.
- Customer-data corruption was addressed structurally with `data-no-localize`; broad single-token guards were removed.

## Latest Work Completed

- `platform-master` source-level Thai migration:
  - `apps/platform-master/app/page.tsx`
  - `apps/platform-master/app/PlatformNavigation.tsx`
  - `apps/platform-master/app/PlatformNavigation.test.ts`
- Added Thai formatting for platform dynamic status/role labels while leaving tenant/user data protected.
- `tenant-web/app/workspace` exact static source-copy migration:
  - 843 exact visible UI strings were moved to Thai source across workspace pages/components.
  - Additional `data-no-localize` markings were added for merchant/customer-authored values in FlowBot, AI Chat, Knowledge, Operations, Data, Team, Voice, and setup surfaces.

## Verification Passed

- `pnpm --filter tenant-web typecheck`
- `pnpm --filter platform-master typecheck`
- `pnpm --filter platform-master test`
- `pnpm run lint:thai-first-locale`
- `git diff --check -- DJAY_Bot_SaaS_Platform/apps/tenant-web/app/workspace DJAY_Bot_SaaS_Platform/apps/platform-master/app`

## Known Environment Note

- Commands pass, but pnpm warns that the active shell uses Node `v22.23.1` while the repo declares Node `>=24.0.0`.

## Remaining Decisions

- Runtime DOM localization still exists as a fallback/scaffold. The practical next step is to keep migrating source copy page by page when touching features.
- Some product/brand/technical terms intentionally remain English or mixed, such as DJAY BOT, FlowBot, Stripe, FlowAccount, Advanced Voice, LINE, WhatsApp, Messenger, MFA, and Canary.
