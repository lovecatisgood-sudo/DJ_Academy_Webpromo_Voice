# Meta enablement pack (start in Phase 0 — 3–6 week external lead time)

**Owner:** DJAI Academy (operator) · **Date:** 2026-07-24 · **Blocks:** SKU3 / AI Chat Premium (Messenger + Instagram + WhatsApp).

**Why now, when the code lands later:** Meta Business Verification and App Review take **3–6 weeks** of external review that cannot be compressed. Per the implementation plan (0.7), start the paperwork during Phase 0 so approval is in hand by the time the OAuth connect flows are built in Phase 3. **No product code depends on this pack** — it is account/paperwork work you do in Meta's dashboards.

> This is an operator checklist, not legal advice. Meta's console labels and requirements change; treat the exact wording in the Meta dashboard as authoritative and adjust.

---

## 0. Prerequisites (gather before you start)

- A **Meta Business Portfolio** (Business Manager) for DJAI Academy — create at business.facebook.com if not already.
- Legal business documents for verification: business registration / DBD company documents, business address, official email/phone, business website (**DJBOT public site with a working Privacy URL — depends on Phase 0.2 legal go-live**).
- The **data-deletion callback** and **deauthorize callback** endpoints (URLs). These do not exist in the API yet — see §5; you can register placeholder-ready URLs now and wire the handlers in Phase 3, but the App settings fields must eventually point at live endpoints.

---

## 1. Business Verification (longest clock — do first)

1. Business Settings → **Security Center** → **Start Verification**.
2. Provide legal business name, address, phone, website; upload the requested registration document.
3. Confirm the business via the phone/email challenge Meta sends.
4. **Acceptance:** Business Portfolio shows **Verified**. (This can take days to weeks; submit early.)

---

## 2. Create / complete the App

Meta Developers → **My Apps** → create (or complete) a **Business**-type app linked to the verified Business Portfolio.

Complete these App settings (several are currently empty in your Meta app):

- **App icon** (1024×1024) and **display name** = DJBOT (or DJAI Academy).
- **Privacy Policy URL** → the live DJBOT Privacy Notice (Phase 0.2). Required for review.
- **Terms of Service URL** → live DJBOT Terms.
- **Category** and **Business use** = messaging / customer communication.
- **Data Deletion** → callback URL (see §5) or a data-deletion instructions URL as an interim.
- **App Domains** and valid OAuth redirect URIs (the tenant-web connect callback — placeholder now, finalized in Phase 3).

---

## 3. Products to add (request these on the app)

| Channel | Product / login flow | Permissions to request in App Review |
|---------|----------------------|--------------------------------------|
| **Messenger** | Facebook Login for Business | `pages_messaging`, `pages_manage_metadata`, `pages_show_list`, `business_management` |
| **Instagram** | Business Login for Instagram | `instagram_basic`, `instagram_manage_messages`, `pages_show_list` |
| **WhatsApp** | WhatsApp + **Embedded Signup v4**; enroll as **Tech Provider** | `whatsapp_business_management`, `whatsapp_business_messaging`, `business_management` |

Enroll as a **WhatsApp Tech Provider** (Business Settings → WhatsApp Accounts / Tech Provider program) so merchants onboard their own WABA through your Embedded Signup rather than sharing tokens.

---

## 4. App Review submission (needs screencasts — script in §6)

For each requested permission Meta requires: a clear use-case description + a **screencast** demonstrating the exact flow a real user experiences, plus test credentials.

**Checklist per permission:**
- [ ] Plain-language use-case: *"A Thai SME merchant connects their Facebook Page / Instagram / WhatsApp so DJBOT can answer their customers' sales messages and capture leads on the merchant's behalf."*
- [ ] Screencast showing the full connect → grant → message-reply flow (§6).
- [ ] Test user / test page / test WABA Meta can use to reproduce.
- [ ] Data-handling explanation referencing the live Privacy URL.
- [ ] Confirmation that provider/model details are never exposed (product invariant) — not required by Meta but keep consistent.

**Acceptance for Phase 0:** Business Verification **submitted**; App created with icon + Privacy/Terms URLs; App Review checklist drafted with the screencast script ready. (Actual review approval lands during Phase 3.)

---

## 5. Callbacks engineering must wire (Phase 3 — noted here so the URLs are reserved)

These do not exist in `apps/api` yet. Reserve the paths now; implement in Phase 3.2:

- **Deauthorize callback** — Meta calls this when a user removes the app; mark the tenant's connection revoked and prompt reconnect.
- **Data-deletion request callback** — Meta calls this for user-initiated deletion; must return a confirmation URL + code and trigger the tenant privacy-job erasure path (reuse `tenancy.privacy_jobs`).

Suggested paths (finalize in Phase 3): `POST /public/meta/deauthorize`, `POST /public/meta/data-deletion`. Until wired, an interim **data-deletion instructions URL** (a page explaining how to request deletion) satisfies the App-settings field for submission.

---

## 6. Screencast script (record one per channel; keep each under ~2 min)

Record at desktop resolution, English narration (Meta reviews in English), showing a **real** connect flow end to end. Do not skip the permission-grant dialog — Meta must see it.

**Messenger:**
1. Show the DJBOT merchant dashboard → "Connect Facebook Page".
2. Click Connect → Facebook Login for Business dialog appears → narrate the permissions requested and why (answer customer messages, capture leads for the merchant).
3. Select the test Page → grant.
4. Show the Page now connected in DJBOT (green/connected state).
5. From another account, send the Page a message ("Do you have this in size M?"); show DJBOT's reply arriving in Messenger and the lead/conversation appearing in the merchant inbox.
6. Narrate the data handled and point to the Privacy URL.

**Instagram:** same arc via Business Login for Instagram; explicitly show the **"Allow access to messages"** toggle step (reviewers look for it); demonstrate an IG DM being answered.

**WhatsApp:** show Embedded Signup — merchant creates/links their WABA inside DJBOT, verifies their number, then a test WhatsApp message is answered. Emphasize the merchant onboards their own WABA (Tech Provider model), not token sharing.

---

## 7. Sequencing note

Business Verification (§1) and the Privacy URL dependency (§2, from Phase 0.2) are the two things that gate submission — start both this week. App Review screencasts (§6) can only be recorded once the Phase 3 connect flows exist, so App Review *approval* is a Phase 3 milestone; everything up to *submission-ready* is done now.

## 8. References

- Implementation plan 0.7 and 3.2 (`Implementation_Plan_CLAUDE_26JUL.md`).
- Phase 0.2 legal go-live (`docs/compliance/counsel-brief-sku1.md`) — provides the Privacy/Terms URLs this pack depends on.
