# Meta Messenger — Plan 2a: `@djay/meta-connect` connect-core

**Date:** 2026-07-24 · **Status:** Implemented + green inline · Part of the self-serve Messenger effort (spec `2026-07-24-meta-self-serve-messenger-design.md`).

**Scope of this increment:** the pure, DB-free protocol logic for Facebook Login for Business, in a new package `packages/meta-connect`. Fully unit-tested with a mocked `fetch`, so it is verified green in-session (unlike the DB-gated Plan 1).

## Shipped

`packages/meta-connect/src/index.ts`:
- `metaConnectConfigSchema` / `MetaConnectConfig` — app id/secret, `loginConfigId`, graph + login-dialog base URLs, redirect URI. HTTPS-enforced at client construction (localhost allowed for dev).
- `signOAuthState` / `verifyOAuthState` — HMAC-signed, single-use-friendly `state` (tenantId/botId/membershipId/nonce/exp); rejects tampered / wrong-secret / expired.
- `createMetaConnectClient(config, { fetchImpl })` with:
  - `buildLoginUrl(state)` — FB Login for Business dialog URL (client_id, config_id, redirect_uri, response_type, state).
  - `exchangeCodeForUserToken(code)` and `exchangeForLongLivedToken(short)` — graph `oauth/access_token`.
  - `listPages(userToken)` — `me/accounts?fields=id,name,access_token`, drops malformed entries.
  - `subscribePage(pageId, pageToken)` — `POST {pageId}/subscribed_apps` with the Messenger fields (**the previously-missing subscription step**); `unsubscribePage(...)` for revoke.
  - Shared `request` helper: injectable fetch, 15s timeout, 401/403→`meta_authorization_failed`, 429→`meta_rate_limited`.

## Verification (inline, no DB)
- `pnpm -C packages/meta-connect typecheck` → exit 0.
- `pnpm -C packages/meta-connect test` → **16 passed** (config HTTPS guard, login URL, state sign/verify incl. expiry/tamper/wrong-secret, code+long-lived exchange, 401 mapping, listPages mapping, subscribe/unsubscribe + failure).

## Explicitly deferred (later increments)
- Webhook `x-hub-signature-256` verify + verify-token challenge → **Plan 3** (app-level webhook).
- `signed_request` parse → **Plan 4** (deauthorize/data-deletion).
- API routes (`oauth/start`, `oauth/callback`, `connect`), `meta_oauth_sessions` migration, container wiring, tenant-web connect UI → **Plan 2b** (needs the container + a DB migration; route/integration tests are DB-gated).

## Notes
- Single `index.ts` for now (matches sibling `@djay/channel-adapters`); can split into oauth/subscription/state files if it grows.
- Depends on the Plan 1 gate relaxation (committed `1e2ef44`) for connect authorization at the route layer.
