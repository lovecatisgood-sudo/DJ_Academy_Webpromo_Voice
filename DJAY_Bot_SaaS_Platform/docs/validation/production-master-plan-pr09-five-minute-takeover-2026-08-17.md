# PR-09 five-minute takeover checkpoint

Date: 2026-08-17

## Implemented authority

- `POST /tenant/conversations/:conversationId/takeover` still requires tenant assignment permission and a trusted mutation origin.
- The repository locks the tenant-owned conversation and revalidates current bot ownership in the mutation transaction.
- Eligibility uses the latest committed outbound `flowbot` or `ai` message and PostgreSQL time. The comparison is strictly newer than `now() - interval '5 minutes'`; exactly 5:00 is denied.
- Missing Bot evidence, closed conversations and unsupported states fail without changing ownership.
- Flow, Text and Voice use the same boundary. Existing human ownership replays idempotently.
- Inbox reads expose server-derived eligibility and expiry. The UI disables unavailable takeover, explains the five-minute boundary and handles a server denial even if displayed state became stale.

## Verification

- `TEST_DB_PORT=55525 pnpm test:db` passed all 119 migrations, RLS and every wired PostgreSQL integration suite.
- The shared-domain test proves equality denial, inside-window acceptance, tenant isolation, immutable message evidence, human reply gating and explicit release.
- The Voice runtime integration proves a recent committed Voice response remains eligible and can return to Voice automation.
- DB, API and tenant-web typechecks passed; database unit tests passed 172 with 75 integration cases skipped outside the database harness.
- No browser or GUI was opened.

## Gates intentionally open

- Deterministic Flow return-to-main-menu and explicit AI safe-continuation evidence after release.
- Permissioned browser accessibility/responsive acceptance and named Thai merchant acceptance.
- `OPS-012` remains `in_progress`; no requirement is accepted and all packages remain non-sellable.
