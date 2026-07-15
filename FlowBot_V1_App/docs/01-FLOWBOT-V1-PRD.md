# PRD — FlowBot V1.1

**Product:** traditional deterministic rule-based chatbot  
**Mode:** single tenant, own business  
**V1 channel:** website widget only  
**Future family:** FlowBot → AI Chatbot → Voice Sales Agent → unified SaaS

## 1. Product summary

FlowBot lets a non-technical business owner build a bilingual Thai/English conversation flow, embed it on a website, capture customer interest, and hand conversations to staff when the scripted bot cannot answer.

Visitors primarily navigate with buttons. They may also type a message, which is matched deterministically against admin-defined keywords. There is no LLM, generative answer, vector search, fuzzy model, or autonomous learning in V1.

The application also provides the first version of the future shared operating shell: inbox, customer profiles, CRM statuses, leads, notes, analytics, notifications, and a channel-neutral conversation model.

## 2. Goals

- Let an admin create and publish a useful 20-node flow without developer help.
- Answer common website questions quickly in Thai and English.
- Capture leads and preserve the source path and transcript.
- Make failures visible through unmatched-query analytics and human handoff.
- Prove a stable conversation lifecycle before adding AI, voice, external channels, billing, or multi-tenancy.
- Preserve clean contracts so the V1 data and UI can later become the SaaS foundation.

## 3. Personas

- **Owner/Admin:** builds flows, publishes updates, monitors conversations, replies to visitors, manages customers and leads, and reviews analytics.
- **Visitor:** anonymous website user on mobile or desktop who wants an answer, contact option, booking interest form, or staff reply.

## 4. Flow model

### 4.1 Node types

Every visitor-facing node has Thai and English content.

1. `message` — sends text and optionally an image, then may auto-advance.
2. `options` — sends a prompt and one to six buttons.
3. `cta_link` — opens an external URL.
4. `cta_lead_form` — collects configured fields such as name, phone, and email.
5. `cta_contact_card` — shows configured contact channels.
6. `cta_live_chat` — requests a human handoff.
7. `cta_scheduler` — enum reserved; implementation is V1.5.

### 4.2 Owned children and reference links

The authoring model is a tree with graph references:

- Every node except the root has one structural owner through `parent_id`.
- An option or message `next` may target an owned descendant or reference any node in the **same flow version**.
- A reference does not transfer ownership and must render as a link row in the editor rather than recursively duplicating the target subtree.
- Cycles are allowed for navigation such as Back or Main Menu. Runtime traversal has a hop limit.
- Cross-version targets are forbidden by database constraints and publish validation.

### 4.3 Tree rules

- Exactly one root per flow version.
- Options node: one to six options.
- Option label target: 40 characters per language; UI may wrap to two lines.
- Maximum recommended depth: 10; warning only.
- Leaves without a CTA generate a non-blocking warning.
- A published version is immutable.
- A draft is mutable and separate from every published version.

### 4.4 Publish, rollback, and active conversations

Publishing creates a new immutable published version and snapshot. The bot's `published_version_id` is moved to it.

At session creation, the conversation stores that published `flow_version_id`. It never silently changes. Therefore:

- new sessions use the latest pointer;
- existing sessions continue on the version they started with;
- rollback affects only new sessions;
- a published version cannot be deleted while referenced by a conversation;
- retention may remove old unreferenced versions, but at least the five newest remain.

## 5. Deterministic keyword matching

### 5.1 Normalization

Normalize input and keywords with Unicode NFC, trim, lowercase Latin text, collapse whitespace, and remove surrounding punctuation. Store raw visitor text separately for the transcript and unmatched analytics.

### 5.2 Ranking

1. Exact normalized keyword match.
2. Input contains normalized keyword.
3. Optional searchable node-content match, enabled per node.
4. Within a tier: longest matched keyword wins, then lower admin priority number, then stable node order.
5. If multiple nodes remain tied, show up to three suggestion buttons.
6. No match triggers fallback.

Do **not** use `keyword contains input`. This causes short inputs such as `a` to match unrelated words.

Substring matching minimums:

- English/Latin keyword: at least three normalized characters.
- Thai keyword: at least two Unicode code points.
- Shorter values may match only by exact equality.

### 5.3 Improvement loop

Every typed input records whether it matched, which keyword and node won, and whether fallback occurred. Overview exposes unmatched queries with an `Add as keyword` action that opens the relevant draft editor. This is manual, governed improvement; the production flow never changes itself.

## 6. Conversation lifecycle and human handoff

### 6.1 States

```text
bot → awaiting_admin → admin_active → bot
  ↘ closed            ↘ closed
```

- `bot`: FlowBot processes valid options, text, forms, and actions.
- `awaiting_admin`: visitor text is stored; FlowBot does not answer. The widget offers contact channels and an explicit `Return to bot menu` action.
- `admin_active`: visitor text is stored and delivered to staff. Automation controls and Restart/Main Menu are disabled until staff release.
- `closed`: no further messages; starting again creates a new conversation.

### 6.2 Fallback

On unmatched text or `cta_live_chat`:

1. Send configured fallback copy and contact channels.
2. Set status `awaiting_admin`.
3. Increment inbox unread state.
4. Create a notification outbox item, deduplicated so email alerts occur at most once per conversation per 30-minute window.
5. Disable previously displayed option controls.

### 6.3 Takeover and release

- Admin clicks Take over; status becomes `admin_active`.
- Admin messages appear in the widget through SSE with durable replay.
- Release returns status to `bot` and sends the root menu from the conversation's pinned version.
- An awaiting visitor may explicitly select `Return to bot menu`; this transitions to `bot` and sends the pinned root.
- Option buttons are single-use and disabled after selection or after any state change away from `bot`.

## 7. Lead capture

A lead form is submitted as an input to `POST /message`; there is no separate public lead endpoint.

The server validates the form against the current node in the pinned snapshot. In one transaction it:

- records the visitor form message;
- creates one lead;
- records customer match suggestions without auto-merging;
- advances the conversation;
- inserts resulting bot/system messages;
- inserts analytics events;
- stores the idempotent response.

Retrying the same `inputId` returns the original result and produces no duplicates.

## 8. Admin application

Top-level navigation remains `Overview / Chat / Customers / Settings`.

### 8.1 Overview

- Attention cards: awaiting-admin conversations and unmatched queries.
- 7/30/90-day metrics: sessions, messages, option clicks, typed messages, match rate, fallback rate, CTA reach, lead conversion, takeover count.
- Conversations chart and CRM funnel.
- Unmatched-query table with count, last seen, language, and Add as keyword.
- Bot status card: `Live`, `Draft changes`, `Disabled`, `No published flow`, or `API unhealthy`.

### 8.2 Chat

- Channel landing with Web Chat active and LINE/Messenger/WhatsApp visibly locked as future functionality.
- Inbox filters: All, Unread, Awaiting, Starred, Archived, CRM status.
- Three-pane desktop layout: conversations, thread, customer/conversation details.
- Admin takeover, reply, release, mark read, star, archive, soft delete, notes, CRM status.
- Notification bell and live badges.

### 8.3 Customers and leads

Customer fields: name, phone, email, LINE ID, WhatsApp, note. A customer may have many conversations and leads.

- Create a customer from a conversation, or attach an existing customer.
- Exact phone/email matches produce suggestions that require confirmation.
- Search and filter customers; timeline shows conversations, leads, and later bookings.
- Leads retain source node/version and conversation.
- Customer and lead deletion is soft delete; a separate privacy-erasure action performs full PII removal/redaction.

### 8.4 Settings

- Knowledge: draft flow editor, graph preview, simulator, publish, rollback history.
- Widget: appearance, language, greeting, position, open behavior, disabled toggle, allowed origins, embed snippet.
- Contact channels: ordered fallback/contact-card channels.
- Team: owner/admin accounts and invite flow; no public signup.
- Data and privacy: retention, customer export, customer erasure, alert destination.

## 9. Flow builder behavior

- Left pane displays owned hierarchy only.
- Reference targets render as compact link rows with target icon and Open target action.
- Before deletion, show owned descendants, incoming option references, message-next references, and active conversation/version usage.
- Deleting a target with incoming references is blocked until the references are rewired.
- Cascade deletes only structurally owned descendants; it never silently deletes options from unrelated nodes.
- Simulator runs the same `packages/core` implementation and draft snapshot validator as production.

## 10. Visitor widget

- Embed with one loader script using a public bot key.
- Preact or vanilla TypeScript in Shadow DOM; target under 60 KB gzip.
- Mobile-first panel; full-screen sheet on small screens.
- Thai/English toggle where enabled.
- Responsive option grid: three columns when space allows, two on narrow screens, one on very narrow screens; never force a cramped 3-column row.
- Session token and last acknowledged decimal-string message sequence are stored in localStorage for 24 hours; resume catches up from that cursor, and the raw token never enters a URL.
- SSE opens only for `awaiting_admin` or `admin_active`; while status is `bot`, the open widget performs a lightweight sync every 30 seconds and on tab focus/visibility so a staff-initiated takeover is detected. Polling sync also becomes the fallback after repeated SSE failures.
- Offline/API failure state displays cached contact channels and a retry action.
- Keyboard navigation, visible focus, ARIA semantics, reduced-motion support.

## 11. Data and privacy requirements

- Lead/booking forms display admin-configured notice/consent copy and privacy-policy link.
- Default transcript retention: 12 months, configurable.
- Nightly purge removes expired transcript content and raw unmatched text.
- Export produces the selected customer's profile, conversations, messages, leads, and bookings.
- Erasure redacts/deletes PII across customer, leads, messages/form payloads, notes, bookings, event payloads, notification payloads, and generated exports. Soft delete is not sufficient.

## 12. Non-functional requirements

- Supported runtime: Node.js 24 LTS; tested and pinned Next.js 16.x.
- Public message p95 target below 300 ms at V1 expected load, excluding external email delivery.
- Snapshot runtime read is one pinned version fetch, cached by version ID.
- Strict input validation, output escaping, CORS origin allowlist, CSRF protection, rate limiting, secure cookies.
- Durable SSE replay and idempotency are release blockers.
- Thai keyword cases, cross-tenant isolation, version pinning, and erasure are mandatory automated tests.

## 13. Build milestones

| # | Deliverable | Estimate |
|---|---|---|
| M0 | Repo, runtime, shared contracts, DB, migrations, auth, tenant scoping, CI | 4–5 days |
| M1 | Pure engine, matcher, state machine, validator, effects, unit tests | 4–5 days |
| M2 | Seeded widget/inbox vertical slice, idempotency, SSE replay, outbox | 5–7 days |
| M3 | Draft editor, graph references, publish/rollback, simulator | 6–8 days |
| M4 | Production widget appearance, sessions, accessibility, failure states | 4–6 days |
| M5 | Full inbox, CRM, leads, profiles, analytics | 6–8 days |
| M6 | Responsive polish, privacy tools, hardening, deploy and release QA | 4–6 days |
| M7 | V1.5 scheduler after stable V1 | 7–10 days |

## 14. Explicitly out of scope

Multi-tenant signup; billing; entitlements; external channel delivery; AI/RAG/LLM; voice calls; hybrid AI escape hatch; autonomous self-learning; training-data pipeline; Google Calendar OAuth; native app; WebSockets; drag-and-drop graph authoring; A/B testing.

## 15. Pilot success criteria

- Admin can build and publish a 20-node bilingual flow in under 30 minutes.
- No duplicate lead/message/event from retried inputs.
- Publishing during an active conversation does not break that conversation.
- Missed admin messages replay after disconnect.
- Fallback rate falls below 25% after two weeks of manual keyword tuning.
- At least 30% of sessions reach a CTA; at least 40% of opened lead forms complete.
- Cross-tenant isolation test passes with a second test tenant despite single-tenant production.
