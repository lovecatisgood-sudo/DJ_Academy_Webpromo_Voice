# Design spec — Self-serve Facebook Messenger onboarding for FlowBot

**Date:** 2026-07-24 · **Status:** Approved design (pre-implementation) · **Owner:** DJAI Academy

> **Authority note (2026-08-13):** Approval is limited to the deferred Messenger connection mechanism described here. It does not authorize social release or override `docs/design/djay-bots-approved-experience-contract.md` for acquisition, trials, website onboarding, Configuration Studio, publishing, dashboard or customer-operation behavior.

## 1. Context

Today a merchant can only connect Facebook Messenger to a FlowBot by **pasting raw credentials** (`pageAccessToken`, `appSecret`, `verifyToken`, `pageId`) from **their own** Meta app, and then manually configuring the webhook callback and subscribing their Page in the Meta App Dashboard. Nothing in code subscribes a Page to an app (`subscribed_apps` is absent), there is no OAuth flow, and the app-level Meta env vars (`META_APP_ID/SECRET/WEBHOOK_VERIFY_TOKEN/OAUTH_REDIRECT_URI`) are present but read by zero lines of code. On the FlowBot side the feature is fully disabled (`FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY` and `FLOWBOT_SOCIAL_WORKER_ENABLED` unset). The receive/verify/normalize/deliver machinery for Messenger, however, **is built and unit-tested**.

This spec replaces the bring-your-own-app manual model with **self-serve onboarding on one shared DJBOT Meta app**: the merchant clicks "Connect Facebook Page," grants access via Facebook Login for Business, and the platform subscribes the Page and routes events automatically.

## 2. Goal & scope

**In scope:** Self-serve Messenger connect for FlowBot on a single shared Meta app — Facebook Login for Business OAuth, Page subscription, a single app-level webhook that routes by Page ID into the existing FlowBot social runtime, the deauthorize + data-deletion callbacks required by App Review, the entitlement-gate relaxation so **Premium and Basic-with-add-on** tenants qualify, and the **App Review submission package** (justifications, screencast script, reviewer setup).

**Out of scope (future specs):** Instagram (not built at all today), WhatsApp Embedded Signup, and reusing this module for the AI-chat product. The design leaves a clean seam (`MetaWebhookRouter`) so these plug in later, but no code for them is written now. The catalog price change (299→1,500 THB) is a separate pricing slice (see `[[flowbot-pricing-model-2026-07]]` memory).

**Success / definition of done:** the full flow works end-to-end with the operator's own test Page in Meta **Dev Mode**, including deauthorize + data-deletion callbacks, and the App Review package is ready to submit. Go-live to real merchants then waits only on external gates (Meta App Review approval, live Privacy URL) — not code.

## 3. Forced constraints & key decisions

- **One shared app ⇒ one Messenger webhook.** Meta exposes exactly one Messenger callback URL per app and stamps every event with the **Page ID**. The current per-connection `webhookKey`-in-URL model cannot work for a shared app; inbound must arrive at one app-level URL and route by Page ID. (LINE keeps its per-connection model — each LINE OA has its own webhook.)
- **Connect gate = entitlement, not plan identity.** Authorize on resolved `channel.social=true` **OR** an active `additional_social_channel` add-on. This folds in the previously-scoped relaxation of the premium-only hard-codes.
- **Messenger standardizes on app-level verification.** Per-connection `appSecret`/`verifyToken` are dropped for Messenger (verification now uses the single app-level `META_APP_SECRET`/`META_WEBHOOK_VERIFY_TOKEN`). Safe because no live Messenger connections exist.
- **Reuse over rewrite.** OAuth/subscription is new; receive/normalize/deliver/dedupe are reused unchanged.

## 4. Architecture & components

**New package `packages/meta-connect`** — owns all Meta-app logic:
- `graph-client.ts` — thin Graph API client (env base URL, HTTPS-enforced, 15s timeout; mirrors the existing adapter `request` pattern).
- `oauth.ts` — builds the Facebook Login for Business authorization URL (with `config_id`); handles callback: `code` → long-lived user token → `GET /me/accounts` (Pages + Page tokens).
- `subscription.ts` — `POST /{page-id}/subscribed_apps` (fields: `messages, messaging_postbacks, messaging_optins, message_deliveries, message_reads`) on connect; unsubscribe on revoke.
- `verify.ts` — app-level webhook verification (verify-token check + `x-hub-signature-256` HMAC with `META_APP_SECRET`) and `signed_request` parse/verify.
- `config.ts` — activates `META_APP_ID/SECRET/WEBHOOK_VERIFY_TOKEN/OAUTH_REDIRECT_URI` + new `META_LOGIN_CONFIG_ID`.

**New API routes (`apps/api`):**
| Route | Auth | Purpose |
|---|---|---|
| `GET /tenant/flowbot/meta/oauth/start` | tenant + entitlement gate | Returns FB-Login URL with signed `state` (tenantId+botId+membershipId+nonce+exp) |
| `GET /integrations/meta/oauth/callback` | state-signed | Exchanges code, lists Pages, stages them, returns `{pageId,pageName}[]` |
| `POST /tenant/flowbot/meta/connect` | tenant + entitlement gate | Merchant picks Page → subscribe Page → store encrypted token as `messenger` connection |
| `GET/POST /public/meta/webhook` | app-level verify + HMAC | Single Messenger webhook; routes each `entry` by Page ID |
| `POST /public/meta/deauthorize` | `signed_request` | Revoke connection on app removal |
| `POST /public/meta/data-deletion` | `signed_request` | Enqueue tenant privacy-job erasure; return `{url, confirmation_code}` |
| `GET /public/meta/data-deletion/status` | code | Minimal deletion-status page (no provider/model names) |

**`MetaWebhookRouter`** (key new abstraction): maps `pageId → {tenant, connection}` via `flow_social_connection_by_page(pageId,'messenger')`, then dispatches into the existing `flowSocialRuntime.receive(...)`. This is the seam future channels/products register through; only FlowBot Messenger is wired now.

**Reused as-is:** AES-256-GCM envelope (`@djay/auth`), `normalizeMessenger`, `renderSocialReply`, worker delivery, dedupe/resume.

## 5. Data flows

### 5.1 Connect
1. FlowBot studio "Connect Facebook Page" → `GET /tenant/flowbot/meta/oauth/start?botId=…`.
2. Server checks entitlement gate → returns FB Login for Business URL (`client_id`, `config_id`, `redirect_uri`, signed `state`).
3. Grant on Facebook → redirect `GET /integrations/meta/oauth/callback?code&state`.
4. Verify `state`; exchange `code` → long-lived user token → `GET /me/accounts`. (Page tokens off a long-lived user token are effectively non-expiring — no refresh machinery.)
5. Stash granted Pages **encrypted server-side** in `meta_oauth_sessions`; return only `{pageId,pageName}[]` to UI — **Page tokens never reach the browser**.
6. `POST /tenant/flowbot/meta/connect {botId,pageId}` → re-check gate → `POST /{pageId}/subscribed_apps` → store encrypted Page token as `flow_social_connections` (`channel='messenger'`, `external_account_ref=pageId`, `meta_user_id` set) → create deployment → audit → connected.

### 5.2 Inbound (message → reply)
1. `GET /public/meta/webhook`: handshake — check `hub.verify_token == META_WEBHOOK_VERIFY_TOKEN`, echo `hub.challenge`.
2. `POST /public/meta/webhook`: verify `x-hub-signature-256` (app-level `META_APP_SECRET`) over raw body → for each `entry`, `pageId=entry.id` → look up messenger connection by Page ID → dispatch into `flowSocialRuntime.receive(...)` (reuse `normalizeMessenger`, dedupe/ordering). Worker delivers reply via stored Page token — delivery path unchanged.

## 6. Credential & verification model

Self-serve messenger connections store `{pageAccessToken, metaUserId}`. Per-connection `appSecret`/`verifyToken` are removed for Messenger (verification is app-level). `socialCredentialSchema` messenger variant updated so those fields are optional/removed; delivery reads `pageAccessToken` (unchanged). LINE credential shape untouched.

## 7. Schema / migrations

1. **New** `tenancy.meta_oauth_sessions` (id, tenant_id, membership_id, bot_id, nonce_hash, pages_ciphertext, created_at, expires_at) — short-lived, encrypted Page-grant staging; TTL-purged; scrubbed on consume.
2. `flow_social_connections` → add nullable `meta_user_id text` (maps Meta deauthorize `user_id` back to a connection). `external_account_ref` already holds the Page ID.
3. **New** SECURITY-DEFINER fn `flow_social_connection_by_page(pageId, channel)` mirroring `flow_social_runtime_connection(...)` to resolve tenant+connection+credentials from a Page ID (webhook is public).
4. **Gate relaxation**: `flowbot-social-store.ts:47` `plan.plan_key='flowbot_premium'` → `plan.product_key='flowbot'`; `:49` require `channel.social='true'` OR active `additional_social_channel` add-on; `:143` `preparedTurnSchema.planKey` literal → `z.enum(['flowbot_basic','flowbot_premium'])`. Underlying SQL functions (`prepare_flow_social_turn`, `receive_flow_social_event`, `flow_social_runtime_connection`) verified for leftover premium hard-codes at build time and relaxed consistently.

## 8. Lifecycle & compliance

- **Deauthorize** `POST /public/meta/deauthorize`: verify `signed_request` (`META_APP_SECRET`), extract `user_id`, map via `meta_user_id` → run the existing revoke path (scrub ciphertext, revoke deployment, audit). Return 200.
- **Data deletion** `POST /public/meta/data-deletion`: verify `signed_request`, enqueue erasure via existing `tenancy.privacy_jobs` for the subject's social data, respond `{url, confirmation_code}` where `url` → the status endpoint. Idempotent.
- Confidentiality invariant: no provider/model names on the status page or any surface.

## 9. App Review submission package (docs)

- Permission justifications: `pages_messaging`, `pages_show_list`, `pages_manage_metadata`, `business_management` — one plain-language merchant use case.
- Screencast script: connect → FB-Login dialog (show grant) → pick Page → connected → message the Page from another account → reply in Messenger + conversation in FlowBot inbox → point to Privacy URL.
- Reviewer test setup (test user + test Page); data-handling note referencing live Privacy URL.
- Delivered as an update to `docs/runbooks/meta-enablement-pack.md` + a dedicated submission checklist. Operator setup steps live in `docs/runbooks/meta-self-serve-setup-guide.md`.

## 10. Error handling

- `oauth/start`: not entitled → 403; missing config/keys → 503.
- `oauth/callback`: bad/expired `state` → 400 + redirect to safe tenant-web error page (no token leak); code/Graph failure → retryable user message.
- `connect`: `subscribed_apps` failure → do not persist, actionable message (e.g. "must be a Page admin"); duplicate `(tenant,pageId)` → conflict; advisory lock guards create.
- Webhook POST: bad signature → 401; unknown pageId / malformed → 200 + log (avoid Meta retry storms); work enqueued async. Delivery 401/403 → existing `credential_reauthorization_required` → UI "reconnect needed."
- Deauth / data-deletion: invalid `signed_request` → 400; idempotent.

## 11. Security

- `state`: HMAC-signed, short TTL, single-use nonce (in `meta_oauth_sessions`, deleted on consume) → CSRF/replay protection.
- Page tokens + granted-Page list encrypted at rest; never returned to browser.
- `META_APP_SECRET` verifies webhook signature and `signed_request`; timing-safe compare; never logged.
- Redirect URI strictly matches whitelisted value; callback only redirects to known tenant-web paths.
- All connect/revoke audited; sessions TTL-purged.

## 12. Test plan

- **Unit (`meta-connect`)**: OAuth URL builder, `state` sign/verify, token exchange (mocked fetch), `subscribed_apps`, webhook signature valid/invalid/timing, `signed_request` parse, pageId router lookup.
- **Integration (db)**: `flow_social_connection_by_page` resolves tenant+creds; new gate case — `flowbot_basic`+add-on authorized, premium authorized, basic-without-add-on rejected; deauth revoke by `meta_user_id`; data-deletion enqueues privacy job.
- **Route (api)**: handshake token match/mismatch, POST signature accept/reject, unknown-page skip, `oauth/start` gate, connect happy-path + subscribe-failure-no-persist.
- **Manual (Dev Mode)**: real-Page test per the setup guide Phase 6.
- Reuse existing environment-policy HTTPS-enforcement tests for the Graph/webhook endpoints.

## 13. Rollout & feature flags

Gated behind `FLOWBOT_SOCIAL_WORKER_ENABLED` + presence of `META_LOGIN_CONFIG_ID`/envelope key; unset ⇒ routes 404/503 (existing pattern). Safe to merge and deploy before Meta approval, enabling Dev-Mode validation while App Review runs.

## 14. Configuration & credentials

See `docs/runbooks/meta-self-serve-setup-guide.md` for the full operator walkthrough. Summary:
- **Already set:** `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_OAUTH_REDIRECT_URI`.
- **Must add:** `FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY` (generated), `FLOWBOT_SOCIAL_WORKER_ENABLED=true`, `META_LOGIN_CONFIG_ID` (from the FB Login for Business configuration), a public HTTPS API URL.
- **Owner-only, external:** Business Verification, App Review, live Privacy/Terms URLs.
- **No paid/third-party APIs** — Meta Graph API is free.

## 15. Dependencies & sequencing

1. Env + Meta config (owner) — Business Verification and Configuration ID can start immediately.
2. Gate relaxation + schema migrations.
3. `packages/meta-connect` + API routes + `MetaWebhookRouter`.
4. Deauthorize / data-deletion callbacks.
5. Tests.
6. App Review package docs.
7. Dev-Mode validation → App Review submission (external).

## 16. Open assumptions to confirm

- The 1,500 THB social add-on is billed **monthly recurring** (matches existing add-on structure) — owner to confirm one-time vs monthly.
- Underlying social SQL functions carry no premium hard-code beyond the three TS sites listed — verified at implementation time by reading them directly.
