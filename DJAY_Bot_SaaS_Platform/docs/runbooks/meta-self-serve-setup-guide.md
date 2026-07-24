# Meta self-serve Messenger — operator setup guide

**For:** DJAI Academy operator · **Goal:** stand up ONE shared DJBOT Meta app so FlowBot merchants connect their Facebook Page with clicks (Facebook Login for Business), and Messenger events reach the bot and get replies.

**How to read this:** items marked **[NOW]** can be done today in parallel with the code build. Items marked **[AFTER CODE]** need the new API endpoints deployed to a public HTTPS URL first (Meta has to reach them to validate). Meta relabels menus often — treat the exact wording in the dashboard as authoritative and adjust.

**What you ultimately hand back to me:** the `META_LOGIN_CONFIG_ID` (Phase 2), confirmation the callbacks validated (Phase 4), and a public HTTPS API URL (Phase 3).

---

## Phase 0 — Prerequisites **[NOW]**

- [ ] A **Meta Business Portfolio** (Business Manager) for DJAI Academy — business.facebook.com.
- [ ] A **Business-type Meta App** linked to that portfolio — developers.facebook.com → My Apps. (You already have `META_APP_ID`/`META_APP_SECRET`, so an app exists — just confirm it is *Business* type and linked to the portfolio.)
- [ ] Business registration / DBD documents ready (for verification), and a working **Privacy Policy URL** and **Terms URL** on the DJBOT site (ties to your legal go-live).

## Phase 1 — Business Verification (longest clock — start first) **[NOW]**

1. Business Settings → **Security Center** → **Start Verification**.
2. Provide legal business name, address, phone, website; upload registration document.
3. Complete the phone/email challenge.
- [ ] **Done when:** portfolio shows **Verified**. (Days to weeks — submit early; App Review can't complete without it.)

## Phase 2 — Add app products **[NOW]**

Add two products to the app:

- [ ] **Facebook Login for Business** → create a **Configuration**:
  - Login variation: **General** / business messaging.
  - Assets the merchant will grant: **Pages**.
  - Permissions in the configuration: `pages_messaging`, `pages_show_list`, `pages_manage_metadata`, `business_management`.
  - **Save the Configuration ID it produces → this is `META_LOGIN_CONFIG_ID`. Send it to me.**
- [ ] **Messenger** product (adds the Messenger webhook + settings section used in Phase 4).

## Phase 3 — Public API URL **[NOW to provision / AFTER CODE to point at]**

- [ ] Provide a **public HTTPS URL** for the API — staging/prod Cloud Run URL, or an ngrok/cloudflared tunnel for testing. Call it `<API>`. The new endpoints will live at:
  - Webhook: `<API>/public/meta/webhook`
  - OAuth redirect: value of `META_OAUTH_REDIRECT_URI` (already in `.env` — confirm its host matches `<API>`)
  - Deauthorize: `<API>/public/meta/deauthorize`
  - Data deletion: `<API>/public/meta/data-deletion`

## Phase 4 — Wire URLs & callbacks in the app **[AFTER CODE]**

Do these once the endpoints are deployed (Meta pings them to validate):

- [ ] **Valid OAuth Redirect URIs** (Facebook Login → Settings): add `META_OAUTH_REDIRECT_URI`.
- [ ] **Messenger → Webhooks**: Callback URL = `<API>/public/meta/webhook`; Verify Token = your `META_WEBHOOK_VERIFY_TOKEN` (the 64-hex value already in `.env` — paste it **exactly**). Subscribe fields: `messages`, `messaging_postbacks`, `messaging_optins`, `message_deliveries`, `message_reads`.
- [ ] **App Settings → Advanced / Data Deletion**: Deauthorize Callback = `<API>/public/meta/deauthorize`; Data Deletion Request URL = `<API>/public/meta/data-deletion`.
- [ ] **App Settings → Basic**: App icon (1024×1024), Privacy Policy URL, Terms of Service URL, Category = messaging.

> ⚠️ Common "stuck" trap: the Verify Token you paste here must match `META_WEBHOOK_VERIFY_TOKEN` character-for-character. And validation fails with *"URL couldn't be validated"* if the endpoint isn't deployed yet — that's why this phase is **[AFTER CODE]**.

## Phase 5 — Environment values **[NOW]**

Set these in the platform `.env` (I generate the key; you flip the flag; config_id from Phase 2):

- [ ] `FLOWBOT_SOCIAL_CREDENTIAL_ENVELOPE_KEY=` → **use the value I generated in chat** (do not commit it to git).
- [ ] `FLOWBOT_SOCIAL_WORKER_ENABLED=true`
- [ ] `META_LOGIN_CONFIG_ID=` → from Phase 2.
- [ ] Confirm existing: `META_APP_ID`, `META_APP_SECRET`, `META_WEBHOOK_VERIFY_TOKEN`, `META_OAUTH_REDIRECT_URI`.

## Phase 6 — Dev-Mode testing (before App Review) **[AFTER CODE]**

In **Development mode** an app can message people who have a role on it — so you can fully test without approval:

- [ ] Add yourself/a colleague as **App Tester**; use a **test Facebook Page** you admin.
- [ ] Run the connect flow → grant → pick Page → send the Page a message from another account → confirm the bot replies and the conversation appears in the FlowBot inbox.

## Phase 7 — App Review submission **[AFTER CODE + legal live]**

- [ ] Submit the four permissions with use-case text + **screencasts** of the real connect→grant→reply flow (I produce the script + justifications as part of the build).
- [ ] Provide a test user/Page for Meta to reproduce.
- [ ] **Done when:** permissions **Approved** → switch app to **Live** → real merchants can connect. (3–6 wk external review.)

---

## Quick "what only you can do" summary
1. **[NOW]** Business Verification (Phase 1) — longest clock.
2. **[NOW]** Create the Facebook Login for Business **Configuration** → send me `META_LOGIN_CONFIG_ID`.
3. **[NOW]** Flip `FLOWBOT_SOCIAL_WORKER_ENABLED=true` + paste the envelope key.
4. **[NOW]** Give me a public HTTPS API URL.
5. **[AFTER CODE]** Paste the webhook/redirect/callback URLs + verify token (Phase 4).
6. **[AFTER CODE]** Test in Dev Mode, then submit App Review.

Everything else — the OAuth flow, Page subscription, webhook routing, deauthorize/data-deletion handlers, and the App Review screencast script — is code I build.
