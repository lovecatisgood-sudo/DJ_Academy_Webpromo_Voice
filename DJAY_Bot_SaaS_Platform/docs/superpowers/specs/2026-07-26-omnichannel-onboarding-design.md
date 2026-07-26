# Design spec — Omnichannel merchant onboarding (FlowBot + AI Chat)

**Date:** 2026-07-26 · **Status:** Proposed (pre-implementation) · **Owner:** DJAI Academy
**Relationship to prior specs:** generalises `2026-07-24-meta-self-serve-messenger-design.md`, which remains correct for Messenger and is subsumed as the `oauth_provider` mode below.

---

## 1. Problem

A merchant must connect accounts they already own — Facebook Page, Instagram, WhatsApp number, LINE Official Account — to a DJBOT bot (FlowBot or AI Chat). Today that means **pasting raw credentials** copied out of a provider's developer console.

A verified competitor (Zwiz.AI) onboards LINE, Messenger, and Instagram with a consent screen and an account picker, with no token handling by the merchant. Manual credential paste is therefore a competitive deficit, not merely a rough edge. This spec defines how DJBOT reaches parity, and what ships before it can.

This directly serves the PRD §7 onboarding bar: *"a non-technical Thai SME connects website + LINE and publishes a working bot in under 15 minutes… prefer authorization over key-hunting."*

## 2. Forced constraints

Two external gates shape sequencing. Neither can be engineered away.

- **Meta is an open rail.** Facebook Login for Business is available to any developer. The gate is Business Verification + App Review — a queue (~3–6 weeks), not an approval of *us* as a partner. Self-serve for Messenger, Instagram, and WhatsApp is achievable by building.
- **LINE is a closed rail.** Zwiz-style attach requires a **module channel**, obtainable only via corporate application. Verified empirically on 2026-07-26: the LINE Developers Console offers only LINE Login, Messaging API, Blockchain Service, and LINE MINI App. No Module channel type is self-creatable.

Consequence: **the design must deliver working onboarding before either gate clears**, and absorb both when they do without rework.

## 3. Verified current state

| Channel | FlowBot | AI Chat | Adapter | Onboarding |
|---|---|---|---|---|
| LINE | ✅ | ✅ | ✅ | manual paste |
| Messenger | ✅ | ✅ | ✅ | manual paste |
| WhatsApp | ❌ | ✅ | ✅ | manual paste |
| Instagram | ❌ | ❌ | ❌ | — |

Instagram is **a DJBOT gap, not a Meta limitation**. Meta's Instagram Messaging rides the same app, same consent, and same webhook as Messenger; the competitor uses exactly that flow.

### 3.1 Product × channel matrix (normative)

Voice **cannot** run on LINE, Messenger, Instagram, or WhatsApp — those Messaging APIs carry text and media, not real-time voice. Stating this explicitly prevents planning a 12-cell matrix that does not exist.

| | Website | LINE | Messenger | Instagram | WhatsApp | Telephony |
|---|---|---|---|---|---|---|
| **FlowBot** | ✅ | ✅ | ✅ | planned | planned | ✗ n/a |
| **AI Chat (TextBot)** | ✅ | ✅ | ✅ | planned | ✅ | ✗ n/a |
| **Voice** | ✅ | ✗ n/a | ✗ n/a | ✗ n/a | ✗ n/a | planned |

### 3.2 Prerequisite pre-flights (the real failure source)

Credential entry is not what breaks onboarding — unmet provider prerequisites are. Each must be checked and surfaced with a named fix **before** the merchant is asked for anything.

| Channel | Prerequisite | If unmet |
|---|---|---|
| LINE | Messaging API enabled on the OA; **Provider choice is permanent** | warn before commit; link to enablement |
| LINE | Chat/auto-reply off (`chatMode = bot`) | name the exact OA Manager setting |
| Messenger | merchant is a Page **admin** (not editor) | name the role required |
| Instagram | account is **Business**, and **already linked** to the granted Page | never show an empty picker — say why it is empty |
| Instagram | "Allow access to messages" enabled in Instagram settings | illustrated step |
| WhatsApp | number not already registered on WhatsApp Business App | name the release step |

Other verified facts:

- `packages/meta-connect` exists — OAuth URL builder, HMAC-signed state, code→long-lived token exchange, Page listing, `subscribed_apps`, webhook signature verify, `signed_request` parse. 22 unit tests pass. **No route consumes it yet.**
- `tenancy.meta_oauth_sessions` exists (migration 0083): encrypted, single-use, TTL'd grant staging.
- FlowBot entitlement gate relaxed to `product_key='flowbot'` + (`channel.social` OR active `additional_social_channel`) — migration 0082. **AI Chat still hard-codes `ai_chat_premium`** at `packages/db/src/ai-social-store.ts:101` plus five SECURITY-DEFINER functions.
- **No health/test endpoint for FlowBot social.** AI Chat has one. A merchant pasting FlowBot credentials today receives no success or failure signal whatsoever.
- **No operator visibility.** `apps/platform-master` has no view of tenant connections.
- The AI social worker additionally requires `AI_TEXT_GATEWAY_ENDPOINT` + `AI_TEXT_GATEWAY_SERVICE_TOKEN` (`apps/workers/src/index.ts:115`). Unset with the flag on ⇒ the worker throws at boot, **taking FlowBot social down with it** (single process).

## 4. Core architecture — Channel Connection Framework

The unifying insight: **all four channels are the same problem** — attach a merchant-owned external account to a bot — differing only in *how authority is obtained*. Model that difference explicitly and everything downstream is shared.

### 4.1 Three acquisition modes

| Mode | Channels | Merchant experience | Available |
|---|---|---|---|
| `oauth_provider` | Messenger, Instagram, WhatsApp | Consent dialog → asset picker → done | after Meta App Review |
| `partner_attach` | LINE | Consent → OA picker → done | after LINE module approval |
| `assisted_handoff` | any | one console visit; paste token; platform does the rest | **today** |

`assisted_handoff` is **not** a stopgap to be deleted. It is the permanent fallback for agency-controlled accounts, for merchants who cannot complete a consent flow, and for any channel whose rail is unavailable or revoked.

### 4.2 Layering

```
┌─ Acquisition (mode-specific, swappable) ───────────────┐
│  meta-connect     line-connect      assisted-handoff   │
│  (OAuth+assets)   (module attach)   (validated paste)  │
└──────────────────────┬─────────────────────────────────┘
                       │ yields: verified credential + routing key
┌──────────────────────▼─────────────────────────────────┐
│  Connection store (per product, unchanged)             │
│  flow_social_connections | ai_social_connections       │
└──────────────────────┬─────────────────────────────────┘
                       │
┌──────────────────────▼─────────────────────────────────┐
│  WebhookRouter → runtime.receive() → worker → deliver  │
│  (unchanged: normalize, render, dedupe, adapters)      │
└────────────────────────────────────────────────────────┘
```

**Only the acquisition layer varies.** Flows, runtime, delivery, inbox, dedupe, usage, and billing are indifferent to which mode produced the row. This is precisely why shipping `assisted_handoff` now is not throwaway work.

### 4.3 Routing

| Mode | Webhook URL | Routing key |
|---|---|---|
| `assisted_handoff` | per-connection `/public/{product}/social/{channel}/{webhookKey}` | URL path (current behaviour) |
| `oauth_provider` | one shared `/public/meta/webhook` | Page ID / IG ID / phone-number ID from `entry[].id` |
| `partner_attach` | one shared `/public/line/webhook` | `destination` (bot userId) in the LINE payload |

Shared-app modes resolve routing key → tenant + connection from a **public, unauthenticated** endpoint, so lookups go through SECURITY-DEFINER functions mirroring the existing `flow_social_runtime_connection` pattern:

- `tenancy.flow_social_connection_by_routing_key(routing_key, channel)`
- `tenancy.ai_social_connection_by_routing_key(routing_key, channel)`

### 4.4 Packages

- **`packages/meta-connect`** — exists. Extend asset enumeration from Pages to Instagram accounts and WhatsApp phone numbers.
- **`packages/line-connect`** — new, deferred until approval. Mirrors `meta-connect`: authorization URL with PKCE, `POST /module/auth/v1/token`, `GET /v2/bot/list`, `POST /v2/bot/channel/detach`. Pure, DB-free, fetch-injectable, Zod-validated — same house style, hand-written (see §11).
- **`packages/channel-onboarding`** — new. Mode-agnostic orchestration shared by both products: session issuance/consumption, credential verification, connection creation, post-connect health verification, and the merchant-facing status vocabulary.

## 5. Merchant (admin) flows

### 5.1 Meta — Messenger, Instagram, WhatsApp (`oauth_provider`)

The seamless target: one consent, many assets.

1. Studio → **Connect channel** → merchant picks Facebook, Instagram, or WhatsApp.
2. `GET /tenant/{product}/meta/oauth/start?botId=…` — entitlement gate; returns the Facebook Login for Business URL with `config_id` and signed `state` (tenantId, botId, membershipId, nonce, exp).
3. Merchant consents on Facebook — **one dialog covering all requested asset types**.
4. `GET /integrations/meta/oauth/callback` — verify `state`; exchange code → long-lived user token; enumerate assets:
   - Pages — `GET /me/accounts`
   - Instagram Business accounts linked to those Pages
   - WhatsApp phone numbers — `GET /{waba}/phone_numbers`
5. Assets staged **encrypted** in `channel_acquisition_sessions`. Browser receives only `{assetId, assetName, assetType, pictureUrl}`. **Tokens never reach the browser.**
6. Merchant selects asset(s) → `POST /tenant/{product}/meta/connect` → re-check gate → subscribe (`subscribed_apps` for Messenger/IG; registration for WhatsApp) → store sealed credential → create connection → audit → connected.

**Merchant actions: two clicks and a picker. Zero credentials handled.**

**Instagram prerequisites must be validated, not assumed.** The IG account must be a **Business** account **already linked to the granted Facebook Page**. When enumeration returns nothing, the picker must say *"No Instagram accounts found — your Instagram must be a Business account linked to this Page"*, never an empty list. This is the single most common Instagram onboarding failure.

### 5.2 LINE — assisted handoff (**ships now**)

Reduced to **one merchant action** by `PUT /v2/bot/channel/webhook/endpoint`, which lets the platform configure the webhook itself once it holds the token.

**Two entry points, one shared wizard component:**
- `/workspace/{product}/connect/line` — authenticated, for self-serve merchants
- `/public/line-setup/{token}` — single-use, expiring, **no login**, so it can be sent to whoever actually holds console access (frequently an agency or IT contact with no workspace account)

**Credential model — server-minted tokens (decisive).** The merchant supplies **Channel ID + Channel Secret only**. Both are visible in **LINE OA Manager → Settings → Messaging API**, the interface the merchant already uses. The platform mints channel access tokens itself:

| Endpoint | Params | Lifetime | JWT / signing key? |
|---|---|---|---|
| `POST /oauth2/v3/token` (**preferred**) | `grant_type=client_credentials`, `client_id`, `client_secret` | 15 min, stateless, unlimited issuance | none |
| `POST /v2/oauth/accessToken` (fallback) | same | 30 days | none |

**The merchant therefore never opens `developers.line.biz`, never needs a Developers Console Admin role, and never issues or reissues a token.** This is also more secure: no long-lived token is stored, only the Channel Secret already required for `x-line-signature` verification. Mint per operation with a short in-process cache; never persist a minted token.

**Merchant journey (~2 minutes, two copied values, no developer console):**
1. Open the wizard (Thai, with screenshots).
2. OA Manager → **Settings → Messaging API** → copy **Channel ID** and **Channel Secret**.
3. Paste both.
4. Done.

**Platform performs the remainder as one server-side operation:**

| Step | Call | Failure → merchant-facing message |
|---|---|---|
| Mint token | `POST /oauth2/v3/token` | "Channel ID or Channel Secret is incorrect" |
| Validate + identify | `GET /v2/bot/info` | show `displayName` + `basicId` + `pictureUrl` for confirmation **before** commit |
| Auto-reply check | `chatMode` must be `bot` | "Chat is On — turn off auto-reply in OA Manager" + deep link |
| Create connection | seal `{channelId, channelSecret}` | duplicate → "This account is already connected" |
| Set webhook | `PUT /v2/bot/channel/webhook/endpoint` | "Could not set webhook" |
| Confirm enabled | `GET …/webhook/endpoint` → `active` | "Turn on *Use webhook*" |
| Prove reachability | `POST /v2/bot/channel/webhook/test` | "LINE could not reach us (HTTP `statusCode`)" |

The connection is marked `active` only when every check passes. **No silent dead ends** — today's behaviour and the defect being fixed.

**Prerequisite pre-flight, stated before anything is asked:** Messaging API must be **enabled** on the OA, and enabling it requires choosing a **Provider — a permanent, irreversible choice**. Warn before the merchant commits.

**Reply-window economics:** answer inside the free `replyToken` window (~1 minute). Missing it converts a free reply into a metered push and changes unit economics. This is a hard latency budget, not a nicety — see §10.

> **Rejected alternative — do not reintroduce.** Requiring the merchant to issue a long-lived token in the LINE Developers Console. It demands a Developers Console **channel Admin** role, a *separate permission system* from OA Manager: an OA Manager admin can see Channel ID and Secret but cannot issue tokens. Reissuing also silently invalidates any existing integration. Server-side minting avoids both problems.

### 5.3 LINE — module attach (`partner_attach`, post-approval)

Becomes identical in shape to §5.1: consent → OA picker → attached. Implementation is `line-connect` plus routing-key lookup. The §5.2 wizard remains as fallback.

**Architectural difference that must not be glossed:** the module token response returns `bot_id` and `scopes` — **not** a per-OA channel access token. Module mode therefore authenticates with the *module channel's own* credentials, using `bot_id` to select the OA. That is a different credential shape from `assisted_handoff`, so `ChannelConnection` must carry `acquisition_mode` and the adapter must branch on it. **Confirm exact module messaging auth against LINE's documentation before implementing — do not assume.**

**Commercial constraint with strategic weight:** only one module channel may attach to a given OA at a time. A merchant already attached to a competitor cannot attach DJBOT until they detach. Attachment is a competitive lock, and early entry compounds.

## 6. Operator flows

Currently a total blind spot — `platform-master` has no connection visibility.

### 6.1 Connection health dashboard
All tenants × channels: `status`, `healthStatus`, last inbound, last delivery, last error. Default filter "needs attention": `credential_reauthorization_required`, webhook inactive, `chatMode = chat`, or no inbound in N days. This is the operator's primary surface and the main lever on churn.

### 6.2 Issue assisted setup link
Select tenant + bot + channel → generate single-use link (72h TTL) → copy → send. Sessions display `pending` / `consumed` / `expired`, and are revocable.

### 6.3 Support session
Time-boxed, reason-required, fully audited "act as tenant" grant. The operator lands in the **normal** studio and uses the **existing** UI. Deliberately **not** a parallel operator-only write path into the same tables — that would double the surface enforcing entitlement and audit rules. Only the grant and its audit trail are new.

### 6.4 Re-authorization nudge
Delivery 401/403 already flips a connection to `credential_reauthorization_required`. The operator sees it in §6.1 and re-issues a setup link in one click; the merchant sees a "reconnect needed" prompt in-studio.

## 7. Data model

**Reuse over rewrite.** `flow_social_connections` and `ai_social_connections` remain separate. Unifying two live tables is a large migration whose benefit is largely cosmetic; shared behaviour lives in `packages/channel-onboarding` instead.

**New — `tenancy.channel_acquisition_sessions`** (generalises `meta_oauth_sessions`):

| Column | Purpose |
|---|---|
| `id`, `tenant_id`, `membership_id`, `bot_id`, `product_key` | scope |
| `mode` | `oauth_provider` \| `assisted_handoff` |
| `channel` | target channel |
| `nonce_hash` | single-use; consumed via `DELETE … RETURNING` with expiry check |
| `payload_ciphertext` | staged assets (OAuth only) — AES-256-GCM, nullable |
| `created_by_membership_id` | attribution for operator-issued links |
| `created_at`, `expires_at` | TTL: 10 min OAuth, 72 h assisted |

Forced RLS to `djay_runtime`, mirroring migration 0083.

**Column additions** to both connection tables:
- `acquisition_mode text not null default 'assisted_handoff'`
- `routing_key text` — nullable; unique per `(channel, routing_key)` where not null

**Gate parity:** relax AI Chat's `ai_chat_premium` hard-code to match FlowBot — `ai-social-store.ts:101` plus `ai_social_runtime_connection`, `begin_ai_social_turn`, `claim_ai_social_inbound`, `claim_ai_social_delivery`, `commit_ai_social_turn`. Mirrors migration 0082 in shape, at roughly 1.7× the SQL surface.

### 7.1 Entitlement model — `CHN-004` (owner decision 2026-07-26)

**Authoritative model: one included social channel on eligible Advanced plans, additional channels via the `additional_social_channel` add-on.** Channel changes require a cooldown or operator-approved migration, to prevent entitlement abuse (`CHN-004`, `CHN-005`).

⚠️ **This does not match shipped code.** Migration 0082 implements *"`channel.social = true` **OR** an active add-on"*, which grants **unlimited** social channels once `channel.social` is set — there is no single-choice constraint and no cooldown. Adopting `CHN-004` therefore requires:

1. A **chosen-channel** record per subscription (which one channel the included slot is spent on).
2. Enforcement that connecting a *different* channel requires either the cooldown to have elapsed, an add-on, or operator approval.
3. Migration relaxing/replacing the 0082 predicate accordingly, plus the AI Chat equivalents above.
4. Merchant UI showing which channel occupies the included slot and what a change costs.

This is **new engineering, not a documentation correction**, and is scheduled in §12 as P2.5. Until it ships, the shipped behaviour (unlimited social once entitled) is more permissive than the commercial model — an active revenue leak that must not be advertised as a feature.

## 8. Security

- **Credentials never reach the browser** in any mode. OAuth assets staged encrypted; only display metadata returned.
- **Sessions** are HMAC-signed, short-TTL, single-use; the nonce is deleted on consume → CSRF and replay protection.
- **Assisted links are capability URLs.** No login, therefore: 72h TTL, single use, scoped to one tenant+bot+channel, operator-revocable, and every issue/consume audited with the issuing membership. They grant **only** the ability to attach a connection — never to read conversations or tenant data.
- **Webhook verification** unchanged per channel: LINE `x-line-signature`; Meta `x-hub-signature-256` over the raw body; both timing-safe.
- **Raw-body hazard (Meta).** Signature verification must read `request.arrayBuffer()`. Any framework re-serialisation silently breaks the HMAC while unit tests built from hand-made buffers still pass. Must be validated against a real Meta delivery.
- Secrets never logged. All connect/revoke/support-session actions audited.

## 9. Error handling

Principle: **every failure names the specific thing the merchant must change.** Today's behaviour — paste credentials, receive nothing — is the defect.

- Not entitled → 403. Missing platform config → 503.
- Bad/expired session → 400 plus a safe error page; never leak tokens into redirects.
- Asset subscribe failure → **do not persist**; actionable message (e.g. "you must be an admin of this Page").
- Duplicate `(tenant, channel, routing_key)` → 409.
- Unknown routing key at a shared webhook → **200 + log**, to avoid provider retry storms.
- Delivery 401/403 → `credential_reauthorization_required` → operator dashboard + merchant reconnect prompt.

## 10. Testing

- **Unit** — `meta-connect` asset enumeration (IG, WhatsApp); `line-connect` PKCE + token exchange; wizard state machine; **every verification-step failure branch** in §5.2.
- **Integration (DB)** — routing-key resolution; gate parity (Basic+add-on authorized, Basic-without rejected, Premium authorized); session single-use and expiry; duplicate conflict.
- **Route** — webhook signature accept/reject; unknown routing key → 200; assisted connect happy path and each failure branch.
- **Manual (Dev Mode)** — real Page and real OA end-to-end before any merchant is onboarded.
- **Regression** — FlowBot social must keep working while AI social is disabled, covering the single-process worker coupling in §3.

## 11. Explicitly out of scope

- **OpenAPI codegen.** LINE publishes specs (`line/line-openapi`) which are authoritative *reference* and were used to verify this design. Generated clients bring their own HTTP stack, error types, and dependency surface, conflicting with the house pattern (pure, fetch-injectable, HTTPS-enforced, Zod-validated). Hand-write; treat specs as documentation.
- **LIFF, and the single-shared-OA pattern.** LIFF sends as the *end user* from inside LINE and cannot access a merchant's OA. A single shared OA would make every merchant's customers converse with DJBOT rather than the merchant's own brand. Neither addresses multi-tenant onboarding; both were evaluated and rejected.
- **Unifying the two connection tables.** Deferred — migration risk exceeds the benefit.

## 12. Phasing

External clocks start first; only P1 has no external dependency.

| Phase | Work | Gate |
|---|---|---|
| **P0 — today** | Start Meta Business Verification. Contact LINE Thailand re: module eligibility. Submit App Review permissions **including Instagram**. | none |
| **P1 — now** | LINE assisted handoff (§5.2) end-to-end; FlowBot health endpoint. **Split the shared database first.** | none |
| **P2** | Operator dashboard + support session (§6) | after P1 |
| **P2.5** | `CHN-004` single-included-channel enforcement + cooldown (§7.1) — closes the revenue leak | after P1 |
| **P3** | Meta routes — Messenger **and Instagram together** | Meta App Review |
| **P4** | WhatsApp (Embedded Signup); FlowBot WhatsApp | after P3 |
| **P5** | AI Chat gate parity; deploy `ai-gateway` | before selling textbot social |
| **P6** | `line-connect` module attach | LINE approval |

**Scheduling note with real cost:** App Review evaluates permissions **per submission**. Request `instagram_basic` and `instagram_manage_messages` in the *same* submission as `pages_messaging`, `pages_show_list`, `pages_manage_metadata`, and `business_management` — even though Instagram is built after Messenger. Six permissions cost no more review time than four; discovering the omission later costs another full cycle.

## 13. Open questions

1. **LINE module eligibility for a Thai entity** — is there a Thailand track distinct from the Japanese-only LINE Marketplace? Is module publication mandatory, or is private attachment possible? *Blocks P6 scoping.*
2. **Module messaging auth** — exactly how are messages sent for an attached OA? *Blocks P6 data model.*
3. **WhatsApp Embedded Signup** — materially different from Page grants (phone verification, WABA, templates); likely warrants its own sub-spec. *Blocks P4 sizing.*
4. **Does `PUT …/webhook/endpoint` auto-enable `active`?** Unspecified by LINE. Design reads it back; confirm in P1.
5. **Operator dashboard scope** — full health dashboard in P2, or minimum viable "list + reissue link" alongside P1?
