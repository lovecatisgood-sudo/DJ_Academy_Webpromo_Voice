# PR-09 five-minute takeover checkpoint

Date: 2026-08-17

## Implemented authority

- `POST /tenant/conversations/:conversationId/takeover` still requires tenant assignment permission and a trusted mutation origin.
- The repository locks the tenant-owned conversation and revalidates current bot ownership in the mutation transaction.
- Eligibility uses the latest committed outbound `flowbot` or `ai` message and PostgreSQL time. The comparison is strictly newer than `now() - interval '5 minutes'`; exactly 5:00 is denied.
- Missing Bot evidence, closed conversations and unsupported states fail without changing ownership.
- Flow, Text and Voice use the same boundary. Existing human ownership replays idempotently.
- Inbox reads expose server-derived eligibility and expiry. The UI disables unavailable takeover, explains the five-minute boundary and handles a server denial even if displayed state became stale.
- Flow release runs the production engine against the execution's pinned immutable snapshot with `return_to_flow`, clears the old branch/subflow stack and persists fresh root-menu messages in the same tenant transaction. A root that is not interactive-active or immediately emits a command fails closed.
- Text release resumes only the tenant-owned, unexpired handover session through migration `0124_staff_release_boundaries.sql`. The next committed AI turn excludes the merchant's human-authored reply from model history. Voice retains its existing server-authoritative conversation-mode continuation.

## Verification

- `TEST_DB_PORT=55530 pnpm test:db` passed all 120 migrations, RLS and every wired PostgreSQL integration suite.
- The shared-domain test proves equality denial, inside-window acceptance, tenant isolation, immutable message evidence, human reply gating and explicit release.
- The Voice runtime integration proves a recent committed Voice response remains eligible and can return to Voice automation.
- The Flow runtime integration proves takeover, a distinct human reply, deterministic restart at the pinned root menu, cleared branch variables and resumed transcript sync.
- The AI runtime integration proves suppressed output during takeover, tenant-scoped session resumption, exclusion of the human reply from AI history and a successfully committed post-release response.
- DB and API typechecks passed; database unit tests passed 173 with 75 integration cases skipped outside the database harness.
- No browser or GUI was opened.

## Gates intentionally open

- Permissioned browser accessibility/responsive acceptance and named Thai merchant acceptance.
- `OPS-012` is `implemented` but remains unaccepted. No requirement is accepted and all packages remain non-sellable.
