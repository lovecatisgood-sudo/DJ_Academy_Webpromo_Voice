# Execution plan — LINE onboarding + channel-health + entitlement correctness

**Date:** 2026-07-26 · **Executor:** subagent · **Verifier:** orchestrator (per phase)
**Design authority:** `docs/superpowers/specs/2026-07-26-omnichannel-onboarding-design.md`
**Commercial authority:** `docs/product/djay-bots-v1-market-release-prd.md`

---

## Absolute prohibitions

1. **NEVER run migrations, `pnpm migrate`, or any DDL against a live database.** All three systems share one production Neon instance (`ep-soft-lake-aoefj4j6`). Write migration files; do not apply them.
2. **NEVER modify `.env`, `.env.local`, or any secret.** They contain live credentials.
3. **NEVER add a runtime dependency** without flagging it. House style is dependency-light.
4. **NEVER weaken an existing security boundary** (RLS, forced-RLS, SECURITY DEFINER, signature verification, entitlement gates).
5. **NEVER mark a phase complete with failing tests or typecheck.** Report the failure instead.

## House style (match existing code)

- Packages are **pure, DB-free, fetch-injectable**, Zod-validated at boundaries (see `packages/meta-connect/src/index.ts`).
- HTTPS enforced at construction; explicit timeouts (15s pattern).
- Tests use **mocked fetch**, no network.
- Secrets never logged, never returned to a browser.
- Every merchant-facing string added in **TH + EN**, Thai default.

## Per-phase protocol

For each phase: write tests first → implement → run `npx tsc --noEmit` (or `npx turbo run typecheck`) and `npx vitest run <package>` → report **exact command output**. Then stop and wait for verification before the next phase.

---

## Phase A — LINE server-side token minting + channel operations

**Goal:** the platform obtains LINE authority from **Channel ID + Channel Secret alone**. Merchant never opens the LINE Developers Console (`CHN-012`).

**Files:** `packages/channel-adapters/src/` (extend; keep the existing public surface working)

- **A1** `mintLineChannelToken({channelId, channelSecret}, fetchImpl)` → `POST https://api.line.me/oauth2/v3/token`, body `grant_type=client_credentials&client_id=…&client_secret=…` (form-encoded). Returns `{accessToken, expiresIn}`. 15-minute stateless token. Add a short in-process cache keyed by channelId, expiring ≥60s before token expiry. **Never persist a minted token.**
- **A2** Extend `socialCredentialSchema` LINE variant to accept `{channel:'line', channelId, channelSecret}` **in addition to** the existing `{channelAccessToken, channelSecret}` (advanced fallback). Discriminate at use-site: if `channelId` present → mint; else use the stored token. Do not break existing stored credentials.
- **A3** Add to the adapter, each taking a minted-or-stored token:
  - `getLineBotInfo()` → `GET /v2/bot/info` (returns `userId`, `basicId`, `displayName`, `pictureUrl`, `chatMode`, `markAsReadMode`)
  - `setLineWebhookEndpoint(url)` → `PUT /v2/bot/channel/webhook/endpoint`
  - `getLineWebhookEndpoint()` → `GET …` (returns `endpoint`, `active`)
  - `testLineWebhook(url?)` → `POST /v2/bot/channel/webhook/test` (returns `success`, `statusCode`, `reason`, `detail`)
- **A4** Unit tests (mocked fetch) for: successful mint; wrong secret → typed error; cache hit avoids second call; each of the four operations, success + failure; `chatMode: 'chat'` surfaced distinctly from a transport failure.

**Acceptance:** `npx vitest run packages/channel-adapters` green including new tests; `npx turbo run typecheck` green; existing 8 tests still pass.

---

## Phase B — FlowBot social health endpoint + `CHN-007` linter

**Goal:** close a shipped violation — `CHN-007` requires every channel to expose a self-test/health path; FlowBot social has none (AI Chat does).

- **B1** `GET /tenant/flowbot/social-connections/[connectionId]/health` in `apps/api/app/`, mirroring the AI Chat equivalent (`apps/api/app/tenant/ai-chat/social-connections/[connectionId]/health/`) — same auth, role gate, and response shape. For LINE it must run `getLineBotInfo` and report `chatMode` and webhook `active`.
- **B2** Persist/refresh `healthStatus`, `lastSuccessfulEventAt`, `lastError` on the connection via the existing store pattern. Reuse existing columns if present; if a migration is needed, **write it, do not apply it**.
- **B3** New boundary linter `scripts/check-channel-health-paths.mjs` asserting every product×channel with a connect route also has a health route. Wire into the `lint` script beside the existing 28 checks. It MUST fail today if B1 is removed.

**Acceptance:** typecheck green; new linter passes with B1 present and fails when B1 is absent (demonstrate both); AI Chat health behaviour unchanged.

---

## Phase C — Two-field guided LINE connect

**Goal:** merchant supplies 2 values; platform does everything else and proves it works.

- **C1** Orchestration in a new `packages/channel-onboarding/` (pure, DB-free where possible): `connectLineChannel()` running, in order — mint → `getLineBotInfo` → `chatMode` check → create connection → `setLineWebhookEndpoint` → `getLineWebhookEndpoint` (confirm `active`) → `testLineWebhook`. Returns a discriminated result naming the **exact** failed step.
- **C2** Error → message mapping exactly per design spec §5.2 table, TH + EN. Never a generic failure.
- **C3** UI in `apps/tenant-web/app/workspace/flowbot/` — two fields (Channel ID, Channel Secret), the **permanent-Provider warning** shown *before* input, a confirmation panel showing `displayName`/`basicId`/avatar before commit, and per-step progress with the failing step named. Keep "advanced: paste a long-lived token" behind a link.
- **C4** Tests: every failure branch, plus the happy path.

**Acceptance:** typecheck green; unit tests green for all branches; connection reaches `active` **only** when `testLineWebhook.success === true`.

---

## Phase D — SLO instrumentation

**Goal:** make `docs/runbooks/sre-slos.md` measurable. These metrics do not exist today.

- **D1** Emit structured metrics following the existing `commerce_metric` pattern: `conversation_first_response_ms` (labels: product, channel), `webhook_ack_ms` (channel), `channel_delivery_result` (channel, outcome, error class), `onboarding_step` (channel, step, outcome).
- **D2** `line_reply_window_hit` — boolean per outbound LINE reply, comparing send time against inbound receipt + 60s. **Commercially critical:** a miss converts a free reply into a metered push.
- **D3** Tests asserting each metric is emitted with correct labels.

**Acceptance:** typecheck + tests green; no PII, tokens, or message bodies in any metric payload.

---

## Phase E — `CHN-004` entitlement enforcement (closes revenue leak)

**Goal:** shipped code grants **unlimited** social channels once `channel.social` is set (migration 0082). Commercial model is **one included channel + paid extras**.

- **E1** Record the chosen included channel per subscription. **Write the migration; do not apply it.**
- **E2** Enforce in `packages/db/src/flowbot-social-store.ts` and the AI Chat equivalent: a *different* channel requires elapsed cooldown, an active `additional_social_channel` add-on, or operator approval. Mirror in the SECURITY-DEFINER functions (`ai_social_runtime_connection`, `begin_ai_social_turn`, `claim_ai_social_inbound`, `claim_ai_social_delivery`, `commit_ai_social_turn`).
- **E3** DB-gated integration tests: included-channel selection; second different channel rejected without add-on; accepted with add-on; cooldown enforced; operator override audited.
- **E4** Run `npx vitest run packages/db` — the migration-invariants suite must stay green.

**Acceptance:** typecheck green; unit + migration-invariant tests green; integration tests written (may be DB-gated/skipped without a database — state clearly which ran).

---

## Out of scope (external gates — do not attempt)

- Meta OAuth routes end-to-end (App Review pending)
- Stripe price seeding, legal/privacy, pilot merchant (owner + counsel)
- Applying any migration (shared production database)
- Visual canvas / React Flow (separate large effort)
- Deploying anything
