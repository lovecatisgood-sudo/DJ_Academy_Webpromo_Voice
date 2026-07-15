# DJAI Agent Widget V2 PRD

**Project:** DJAI Dual-Mode AI Sales Widget
**Version:** V2 planning draft
**Date:** 13 July 2026
**Owner:** DJAI Academy
**Status:** Product plan for review before implementation

---

## 1. Product Goal

V2 expands the current voice-only sales widget into a dual-mode website sales widget:

- Text chatbot mode.
- Voicebot mode.
- One shared sales context.
- One shared lead and appointment pipeline.
- One admin dashboard that can compare both channels without becoming crowded.

The product should let a visitor choose the way they want to engage:

```text
Chatbot | Voicebot
```

Both modes should diagnose the visitor's business, recommend DJAI services based on the approved knowledge document, capture lead details, and guide qualified visitors to the same booking-link CTA.

The text chatbot is not a generic FAQ bot. It is a text version of the DJAI sales consultant, with the same consultative behavior as the voice agent, adapted for typed conversation.

---

## 2. Why This Matters

Voice is powerful, but not every visitor can or wants to speak:

- Some visitors browse in public.
- Some visitors are at work.
- Some visitors prefer reading.
- Some visitors want to test the bot quietly before booking.
- Some visitors may have microphone issues.

Adding text chat improves conversion coverage while keeping the same sales operation behind it.

The strategic goal is also SaaS preparation. This V2 architecture should become the first step toward a future multi-channel platform where voice, text chat, FlowBot, LINE, WhatsApp, Messenger, and other channels can share the same inbox, leads, customers, and calendar.

---

## 3. Product Principles

1. **Same sales brain, different interaction mode.** Text chatbot and voicebot should share the approved behavior prompt and knowledge document, with small mode-specific instructions only.
2. **One backend source of truth.** Do not create a separate database. Separate channels in the same database.
3. **One lead pipeline.** Leads from chat and voice should appear in the same Leads page with clear channel labels.
4. **One calendar.** Both bots use the same active AI booking link in V2.
5. **No prompt improvisation.** Do not rewrite the approved behavioral prompt unless the user explicitly approves.
6. **No text chatbot scope creep.** No RAG, vector DB, multi-tenant SaaS billing, external channels, notifications, or human handoff in this version.
7. **Admin clarity first.** The dashboard must stay neat by using channel filters, source badges, and progressive disclosure.
8. **Backend validates everything.** The model can propose lead details. The server validates and writes.
9. **Fast admin first.** Admin pages must feel responsive even as conversations grow. Summary cards should not load full transcripts/messages until needed.
10. **Fast save path.** Conversation/message save endpoints should persist data first and defer expensive AI analysis where possible.

---

## 4. User Roles

### Website Visitor

Visitor can:

- Open the website widget section.
- Select Chatbot or Voicebot.
- Chat by text.
- Start a voice conversation.
- Share business details.
- Share contact details.
- Click booking CTA if offered.
- Book an available slot.

Visitor cannot:

- Access admin pages.
- See internal notes.
- Book unavailable slots.
- Directly write to leads, conversations, or appointments.

### Normal Admin

Normal admin can:

- View assigned voice and text conversations.
- Filter inbox by text chat or voice chat.
- Edit assigned leads.
- Manage assigned appointments.
- Add notes.
- View channel source on leads and appointments.

Normal admin cannot:

- Change global text-chat settings.
- Change global knowledge document.
- Set active AI booking link.
- View all company conversations unless assigned.

### Master Admin

Master admin can:

- Configure text chatbot settings.
- Enable/disable text chatbot.
- View all channel analytics.
- Filter all conversations by channel.
- Export channel-filtered records.
- Manage active AI booking link used by both bots.
- Manage admin users and calendar configuration.

---

## 5. V2 Scope

### In Scope

#### A. Dual-Mode Website Widget

The current production website widget area becomes a single dual-mode experience.

Required UI:

- Top segmented control:
  - Chatbot
  - Voicebot
- Shared shell:
  - Same brand styling.
  - Same widget section placement.
  - Same CTA intent.
- Chatbot mode:
  - Message history.
  - Text input.
  - Send button.
  - Loading/typing state.
  - Lead capture CTA when relevant.
  - Booking CTA when relevant.
- Voicebot mode:
  - Existing voice states.
  - Mic permission flow.
  - Call start/end.
  - Booking CTA when lead capture succeeds.

Mode behavior:

- Switching to Chatbot starts or resumes the current text conversation in that page session.
- Switching to Voicebot starts a new voice conversation when the visitor begins the voice call.
- Text and voice conversations should be separate conversation rows, not mixed into one transcript.

#### B. Text Chatbot Backend

Add a server-side text chat API.

The browser calls DJAI backend only:

```text
POST /api/chat/session
POST /api/chat/message
POST /api/chat/end
```

The browser must never receive the OpenAI API key.

Default text model:

```text
gpt-5-mini
```

Text chat should use:

- Same approved behavior prompt.
- Same knowledge document.
- Same no-invented-facts rules.
- Same consultative sales objective.
- Text-mode-specific instruction:
  - concise chat replies
  - one to two questions at a time
  - do not pretend to be on a voice call
  - use booking CTA instead of reading a URL

#### C. Shared Lead Capture

Text chatbot should capture:

- Client name
- Company name
- Phone
- Email
- LINE
- WhatsApp
- Preferred meeting day
- Preferred meeting time
- Business problem
- Recommended service

The text model may identify or propose contact details, but the backend validates and writes.

Any text conversation with usable contact details becomes a lead.

#### D. Shared Booking CTA

Both bots use the same active AI booking link in V2.

Flow:

```text
Visitor agrees to consultation
  -> bot asks for contact details
  -> backend creates or updates lead
  -> backend returns booking CTA
  -> widget displays booking button
  -> visitor opens /book/[slug]?context=...
  -> slot is reserved only after appointment creation
```

Once an appointment is booked, that slot becomes unavailable for both bots because availability is calculated from the same `appointments` table.

#### E. Unified Admin Inbox

Admin Inbox must support both channels neatly.

Primary filters:

- All
- Leads
- High interest

Channel filter:

- All channels
- Voice widget
- Text widget

Conversation cards show:

- Channel badge
- Lead/no-lead badge
- Interest level
- Summary
- Main problem
- Last activity
- Customer name if known

Full transcript/messages should stay collapsed until opened.

#### F. Dashboard Analytics

Overview should show combined and channel-split performance:

- Total conversations
- Voice conversations
- Text conversations
- Leads captured
- Lead capture rate
- High-interest conversations
- Appointments requested
- Appointments confirmed
- Conversion by channel

V2 does not need advanced charting. Simple metric cards and filters are enough.

#### G. Settings

Master admin Settings should add a Text Chat section:

- Text chat enabled
- Text model ID
- Greeting
- Max messages per session
- Daily text session cap
- Shared knowledge document indicator
- Optional separate text-chat temperature if needed

Do not duplicate the full knowledge editor. The same knowledge document should remain the source of truth.

#### H. Backend Performance Optimization

Current backend performance risks observed in the V1.5 codebase:

- `POST /api/conversation` saves the transcript and then waits for post-call analysis before returning. This can make call ending slow and can increase risk for tab-close/beacon saves.
- `AdminShell` runs count queries on every admin page render.
- Inbox and Leads pages perform multi-join queries and broad `ilike` searches on every request.
- Inbox list loads up to 100 records, then selected conversation detail loads separately; this is acceptable short term but needs tighter pagination and indexes as channels grow.
- Some dashboard pages compute counts live every time instead of using a short TTL cache.
- Text chat would add more writes and admin rows, making the above issues worse if not addressed first.

V2 must include backend performance work before or alongside the text chatbot.

Performance requirements:

- Public save endpoints should respond quickly after data is safely persisted.
- AI analysis should not block transcript/message save.
- Admin shell counts should use short in-process TTL caching or lighter queries.
- Inbox and Leads must use keyset pagination or bounded `limit + hasMore`, not unbounded counts.
- Full transcript/message bodies should load only for the selected conversation.
- Add channel-aware indexes before launching text chat.
- Add simple server timing logs around slow admin/API queries.
- Keep the no-Redis/no-worker rule for V2 unless the user explicitly approves infrastructure expansion.

---

## 6. Out Of Scope For V2

Do not build:

- Separate database for text chatbot.
- External messaging platforms.
- Human takeover/live agent handoff.
- File uploads.
- RAG/embeddings/vector search.
- Billing/subscription packaging.
- Multi-tenancy.
- Google Calendar/Outlook sync.
- Email/LINE/WhatsApp notifications.
- CRM automations.
- A separate chatbot-only admin dashboard.
- A separate booking calendar for chatbot.
- A separate active booking link per channel.

These can be V3+.

---

## 7. Data Model Requirements

V2 should extend the current schema instead of duplicating it.

### `conversations`

Add or confirm:

```sql
channel text not null default 'voice_widget',
interaction_mode text not null default 'voice',
provider text,
model_id text,
last_message_at timestamptz,
message_count int default 0
```

Allowed `channel` values for V2:

```text
voice_widget
text_widget
```

Allowed `interaction_mode` values:

```text
voice
text
```

### `conversation_messages`

New table for text chat messages and later unified transcript storage:

```sql
create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations(id),
  channel text not null,
  role text not null,
  content text not null,
  token_count int,
  metadata jsonb,
  created_at timestamptz not null default now()
);
```

Allowed roles:

```text
user
assistant
system
tool
```

For V2, text chat writes every turn to `conversation_messages`.

Voice transcript can stay in the existing transcript field, but V2 should be designed so voice turns can be migrated into `conversation_messages` later.

### `leads`

Add or confirm:

```sql
source_channel text default 'voice_widget',
source_mode text default 'voice'
```

### `appointments`

Expand source values:

```text
voice_agent
text_chat
public_booking
manual
```

### `settings`

Add:

```sql
text_chat_enabled boolean default true,
text_chat_model_id text default 'gpt-5-mini',
text_chat_greeting text,
text_chat_max_messages int default 40,
text_chat_daily_session_cap int default 200
```

---

## 8. API Requirements

### `POST /api/chat/session`

Creates a text conversation stub.

Input:

```json
{
  "pageUrl": "https://voice.djai.academy/",
  "preferredLanguage": "th"
}
```

Output:

```json
{
  "conversationId": "...",
  "greeting": "...",
  "maxMessages": 40,
  "sessionContext": {
    "conversationId": "...",
    "expiresAt": 123,
    "signature": "..."
  }
}
```

Rules:

- Enforce text-chat enabled.
- Enforce rate limits and daily cap.
- Store `channel='text_widget'`.
- Store `interaction_mode='text'`.
- Do not call OpenAI yet unless needed for generated greeting.

### `POST /api/chat/message`

Sends one visitor message and returns one assistant response.

Input:

```json
{
  "sessionContext": {},
  "message": "I run an ecommerce store",
  "pageUrl": "https://voice.djai.academy/"
}
```

Output:

```json
{
  "reply": "Nice. What kind of products do you sell, and where do most customers find you now?",
  "lead": {
    "captured": false
  },
  "booking": {
    "available": false
  }
}
```

When lead details are captured:

```json
{
  "reply": "...",
  "lead": {
    "captured": true,
    "leadId": "..."
  },
  "booking": {
    "available": true,
    "url": "/book/free-consultation?context=..."
  }
}
```

Rules:

- Verify signed session context.
- Load settings and knowledge through the existing cache.
- Assemble prompt in cache-friendly order.
- Include recent conversation messages.
- Store user message before model call.
- Store assistant reply after model call.
- Extract lead details server-side using structured output or a second cheap extraction pass if needed.
- Do not expose provider API key.

### `POST /api/chat/end`

Ends the text conversation.

Rules:

- Mark conversation ended.
- Run conversation analysis if enabled.
- Do not fail if analysis fails.

---

## 9. Admin UI Requirements

### Inbox

The Inbox should become explicitly channel-aware.

Header layout:

- Search bar.
- Primary filters: All, Leads, High interest.
- Channel dropdown: All channels, Voice widget, Text widget.
- More filters collapsed.

Conversation list:

- Channel badge.
- Customer/lead name.
- Summary/problem.
- Interest level.
- Lead status.
- Last activity.

Conversation detail:

- Intelligence panel first.
- Lead panel shared for both channels.
- Message transcript collapsed by default.
- Text chat transcript uses message bubbles when expanded.
- Voice transcript can remain text transcript for now.

### Overview

Add compact channel metrics:

- Voice conversations
- Text conversations
- Voice leads
- Text leads
- Appointments from voice
- Appointments from text

### Leads

Add channel badge and channel filter.

### Calendar

Appointment detail shows source:

- Voice agent
- Text chat
- Public booking
- Manual

No separate calendar needed.

### Settings

Add Text Chat section below Voice Agent or near Advanced Provider:

- Enable text chatbot
- Text model ID
- Greeting
- Max messages/session
- Daily text cap

Keep knowledge document shared.

---

## 10. Success Metrics

V2 is successful if:

- Visitors can choose text or voice from the same widget section.
- Text chatbot can hold a natural consultative sales conversation.
- Text chatbot captures leads.
- Leads from text and voice appear in one admin flow.
- Admin can filter by text/voice without visual clutter.
- Both bots can offer the same booking CTA.
- A booked time blocks the same slot for both channels.
- Text chatbot failures do not affect voicebot.
- Voicebot behavior remains unchanged unless explicitly modified.
- Admin Inbox and Leads pages remain usable after text chat increases conversation volume.
- Conversation save and chat message endpoints do not wait on expensive analysis work.

---

## 11. Acceptance Criteria

### Visitor

- Visitor opens the page and sees Chatbot/Voicebot toggle.
- Chatbot mode works without microphone permission.
- Voicebot mode still works as before.
- Switching to Voicebot starts a new voice conversation.
- Text chat can capture a lead and show booking CTA.
- Booking CTA opens `/book/[slug]` with signed context.
- Booking a slot prevents another booking at the same time.

### Admin

- Text conversations appear in Inbox.
- Voice conversations still appear in Inbox.
- Admin can filter by channel.
- Leads show source channel.
- Overview shows channel split.
- Calendar appointment source is visible.
- Settings can enable/disable text chat.

### Technical

- OpenAI key never reaches browser.
- Text chat uses server-side OpenAI call.
- No separate database is introduced.
- Existing V1.5 voice and calendar flows still pass.
- Hostinger build passes.
- Backend performance checks confirm no new obvious slow path was introduced.
