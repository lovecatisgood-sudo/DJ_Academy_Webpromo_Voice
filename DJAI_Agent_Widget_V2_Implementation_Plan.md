# DJAI Agent Widget V2 Implementation Plan

**Project:** Dual-mode text and voice AI sales widget
**Version:** V2 implementation plan
**Date:** 13 July 2026
**Status:** Implemented locally; deployment acceptance pending

---

## 1. Implementation Goal

After this plan is executed, the product should support:

- A single visitor widget section with Chatbot and Voicebot modes.
- Server-side OpenAI text chatbot using `gpt-5-mini` by default.
- Shared behavior prompt and knowledge document.
- Shared lead capture and appointment booking CTA.
- Channel-aware admin inbox, leads, overview, calendar, and settings.
- No regression to the existing voicebot and calendar flow.

Current local status:

- Phases 0 through 10 have been implemented and verified locally.
- Phase 11 requires redeploying the latest source ZIP to production and running live acceptance on `voice.djai.academy`.
- Do not mark V2 complete in production until the Phase 11 checks pass against the deployed build.

---

## 2. Key Rules

- Do not rewrite the approved voice sales behavior prompt.
- Do not expose OpenAI API key to browser.
- Do not create a separate database.
- Do not create a separate calendar for text chatbot.
- Do not add dependencies without approval.
- Do not add multi-tenancy, external channels, RAG, workers, or notifications in V2.
- Verify each phase before moving to the next.

---

## Phase 0 - Baseline Audit

Purpose: confirm current V1.5/V1.5-calendar state is stable.

Tasks:

1. Check git status.
2. Read current widget code.
3. Read current session/lead/conversation APIs.
4. Read current prompt module.
5. Read current admin inbox queries.
6. Run:
   - `npm run typecheck`
   - `npm run verify:source`
   - `npm run verify:schema`
   - `npm run verify:live-schema`
   - `npm run next:build`

Exit criteria:

- Current baseline passes.
- Any existing failures are documented before V2 work starts.

---

## Phase 0.5 - Backend Performance Fixes

Purpose: fix known backend lag before adding text-chat traffic.

Current findings from code review:

- `/api/conversation` currently waits for `analyzeAndPersistConversation(...)` before returning. This is the highest-risk latency issue because conversation save should be fast and reliable.
- `AdminShell` computes live counts on every admin route render.
- Inbox and Leads pages run live multi-join list queries with broad `ilike` search.
- Text chatbot will increase conversation/message volume, so adding it before optimization will make admin lag worse.

Tasks:

1. Make conversation save fast:
   - Save transcript and return `{ ok: true, analysis: "pending" }`.
   - Move analysis to non-blocking guarded execution or admin-triggered pending analysis.
   - Ensure analysis errors are caught and persisted as `analysis_status='failed'`.
2. Prepare text-chat end behavior the same way:
   - `/api/chat/end` must not block on analysis.
3. Add lightweight timing helper:
   - route name
   - database duration
   - model duration
   - analysis duration
   - total duration
   - no secrets or full messages
4. Add short TTL cache for `AdminShell` counts:
   - key by admin ID and role
   - TTL 15-30 seconds
   - invalidate naturally by time only for V2
5. Optimize admin list queries:
   - use card-only fields in list query
   - load transcript/messages only for selected conversation
   - use `limit + 1` and `hasMore`
   - avoid exact total counts in primary render
6. Add/verify indexes:
   - conversations by deleted/date/assignment
   - conversations by channel/date for V2
   - leads by status/source channel/updated date
   - appointments by status/source/start date
   - conversation messages by conversation/time
7. Add a simple backend latency checklist to QA:
   - `/api/conversation` returns without waiting on LLM analysis
   - Inbox renders without loading every transcript
   - Admin shell counts do not query repeatedly on rapid navigation

Verification:

- `npm run typecheck`
- `npm run verify:source`
- `npm run verify:schema`
- `npm run verify:live-schema`
- Manual timing logs show `/api/conversation` response is no longer dominated by analysis.
- Admin pages still show correct counts within TTL tolerance.

Exit criteria:

- Existing voice flow still saves transcript.
- Post-call analysis still eventually completes or can be regenerated.
- Admin navigation feels faster locally and does not add correctness risk.

Do not proceed to text chatbot implementation until this phase is complete.

---

## Phase 1 - Database Migration

Purpose: add channel and message storage.

Schema tasks:

1. Add to `conversations`:
   - `channel`
   - `interaction_mode`
   - `provider`
   - `model_id`
   - `last_message_at`
   - `message_count`
2. Create `conversation_messages`.
3. Add to `leads`:
   - `source_channel`
   - `source_mode`
4. Extend appointment source handling to include `text_chat`.
5. Add to `settings`:
   - `text_chat_enabled`
   - `text_chat_model_id`
   - `text_chat_greeting`
   - `text_chat_max_messages`
   - `text_chat_daily_session_cap`
6. Add indexes:
   - conversations by channel/date.
   - conversations by channel/interest/date.
   - messages by conversation/date.
   - leads by status/source channel/updated date.
   - appointments by source/start date.

Backfill:

- Existing conversations:
  - `channel='voice_widget'`
  - `interaction_mode='voice'`
- Existing leads:
  - `source_channel='voice_widget'`
  - `source_mode='voice'`

Verification:

- Migration idempotent.
- Schema verifier updated.
- Live schema verifier updated.
- Existing voice/admin pages still build.

Exit criteria:

- `npm run migrate`
- `npm run verify:schema`
- `npm run verify:live-schema`
- `npm run typecheck`

---

## Phase 2 - Prompt And Settings Foundation

Purpose: prepare shared prompt usage without changing voice behavior.

Tasks:

1. Refactor prompt module only if needed:
   - preserve existing voice prompt output.
   - add `buildTextChatPrompt`.
2. Add text-mode instruction block:
   - text-only conversation.
   - concise replies.
   - no voice-call language.
   - ask one or two questions at a time.
   - use booking CTA instead of displaying raw URL.
3. Extend settings validation for text-chat fields.
4. Update Settings UI with Text Chatbot section.
5. Ensure text chatbot uses same knowledge document.

Verification:

- Confirm voice prompt output unchanged except unrelated dynamic fields.
- `npm run typecheck`
- `npm run verify:source`

Exit criteria:

- Voice session path still passes.
- Settings save supports text chat fields.

---

## Phase 3 - Text Chat APIs

Purpose: implement backend text chat flow.

Build:

1. `POST /api/chat/session`
   - validate CORS/origin.
   - enforce enabled setting.
   - enforce rate limits.
   - create text conversation.
   - return signed session context.
2. `POST /api/chat/message`
   - verify signed context.
   - validate message length.
   - enforce max message count.
   - store user message.
   - load recent messages.
   - call OpenAI text model server-side.
   - store assistant reply.
   - extract structured lead sidecar if available.
   - return reply, lead state, optional booking CTA.
3. `POST /api/chat/end`
   - close text conversation.
   - mark analysis pending.
   - trigger non-blocking analysis or leave pending for admin/manual processing.

Recommended model response shape:

```json
{
  "reply": "Natural message to visitor",
  "lead_candidate": {
    "client_name": "",
    "company_name": "",
    "phone": "",
    "email": "",
    "line_id": "",
    "whatsapp": "",
    "business_problem": "",
    "recommended_service": "",
    "ready_for_booking": false
  }
}
```

Server behavior:

- Parse JSON defensively.
- If JSON parse fails, fallback to plain reply and no lead update.
- Validate contact fields before writing lead.
- Do not let extraction failure break chat.
- Do not let post-chat analysis block the end response.

Verification:

- Curl session creates conversation.
- Curl message stores user and assistant messages.
- Fake lead details create/update lead.
- Booking CTA appears only when active link has slots.
- Text chat disabled returns controlled error.

Exit criteria:

- Text API works end to end without browser widget.

---

## Phase 4 - Widget UI

Purpose: add the dual-mode visitor experience.

Tasks:

1. Update widget shell with segmented control:
   - Chatbot
   - Voicebot
2. Add text chat state:
   - session.
   - messages.
   - loading.
   - error.
   - booking CTA.
3. Add text message composer:
   - enter send.
   - shift+enter newline.
   - disabled during send.
4. Keep existing voice mode behavior.
5. Handle mode switching:
   - text mode persists current text session.
   - voice mode starts new voice session only on user action.
   - do not kill active voice call silently.
6. Ensure mobile layout works.

Verification:

- Chat mode works without mic permission.
- Voice mode still works.
- Booking CTA displays correctly in both modes.
- No API key in browser bundle.

Exit criteria:

- Public widget works in both modes.

---

## Phase 5 - Lead And Booking Integration

Purpose: make text and voice share conversion flow.

Tasks:

1. Update lead creation/update helpers to accept source channel.
2. Update booking context to include:
   - conversation ID.
   - lead ID.
   - source channel.
   - source mode.
3. Update `/api/booking/appointments`:
   - source is `text_chat` when context source is text.
   - source remains `voice_agent` when context source is voice.
4. Ensure slot blocking works across both channels.
5. Ensure lead status updates to `appointment_set` after booking.

Verification:

- Text lead books appointment.
- Voice lead books appointment.
- Same slot cannot be double-booked.
- Calendar shows source correctly.

Exit criteria:

- Shared booking flow is stable.

---

## Phase 6 - Admin Inbox And Conversation UI

Purpose: make admin channel-aware without clutter.

Tasks:

1. Update inbox query filters:
   - primary filter.
   - channel filter.
2. Add channel badges to conversation cards.
3. Add text message transcript rendering:
   - message bubbles.
   - collapsed by default.
4. Keep voice transcript rendering intact.
5. Update bulk delete and exports to respect filters.
6. Update conversation detail side panel with source channel.

Verification:

- Voice conversations still display.
- Text conversations display.
- Channel filter works.
- Search works across text messages and conversation summaries.

Exit criteria:

- Admin can review both modes in one Inbox.

---

## Phase 7 - Overview, Leads, Calendar, Settings

Purpose: complete admin operational integration.

Overview:

- Add channel split metrics.

Leads:

- Add channel badge.
- Add channel filter.

Calendar:

- Show appointment source.
- Support `text_chat` source display.

Settings:

- Add Text Chatbot section.
- Add enable/model/greeting/limits fields.

Verification:

- Master admin sees all controls.
- Normal admin sees scoped records only.
- Existing role gates still work.

Exit criteria:

- Admin UI is complete and not crowded.

---

## Phase 8 - Analysis And Analytics Hardening

Purpose: make post-chat intelligence reliable and cost-controlled.

Tasks:

1. Reuse existing `gpt-4o-mini` analyzer for ended text conversations.
2. Ensure analyzer can read `conversation_messages`.
3. Ensure analyzer can still read voice transcript.
4. Store analysis status and errors.
5. Track basic token/model metadata where available.

Verification:

- Text conversation summary created after chat end.
- Failed analysis does not break saved messages.
- Voice analysis still works.

Exit criteria:

- Post-conversation intelligence works for both modes.

---

## Phase 9 - Security, Abuse, And Reliability

Purpose: protect public text endpoints.

Tasks:

1. CORS checks on text endpoints.
2. Per-IP session and message rate limits.
3. Daily text session cap.
4. Max message length.
5. Max messages per session.
6. Session expiry.
7. Prompt injection resistance.
8. Server-side validation for all lead fields.

Verification:

- Abuse limits return controlled errors.
- Expired session cannot send messages.
- Oversized message rejected.
- Browser bundle contains no API key.

Exit criteria:

- Public endpoint risk is acceptable.

---

## Phase 10 - QA And Release

Run:

- `npm run typecheck`
- `npm run verify:source`
- `npm run verify:schema`
- `npm run verify:live-schema`
- `npm run next:build`
- `npm run hostinger:build`
- `npm run package:source`
- `npm run verify:archive`

Manual acceptance:

1. Thai text chat lead capture.
2. English text chat lead capture.
3. Text chat objection handling.
4. Text chat booking CTA.
5. Voice chat still works.
6. Voice booking CTA still works.
7. Admin Inbox channel filters.
8. Leads channel filters.
9. Calendar source display.
10. Settings enable/disable text chat.

Exit criteria:

- Build passes.
- Archive verified.
- No voice regression.
- Text chatbot conversion flow works.

---

## Phase 11 - Deployment Acceptance

After deploying:

1. `curl /api/health`.
2. Test `/api/chat/session`.
3. Test one full text chat.
4. Test one full voice call.
5. Confirm both appear in admin.
6. Confirm both can create leads.
7. Confirm booking from text creates appointment.
8. Confirm booking from voice still creates appointment.
9. Confirm double-booking is rejected.
10. Confirm admin channel metrics update.

Do not mark V2 complete until live production acceptance passes.
