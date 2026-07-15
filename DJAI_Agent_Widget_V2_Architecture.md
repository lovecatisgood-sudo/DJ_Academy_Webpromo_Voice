# DJAI Agent Widget V2 Architecture

**Project:** Dual-mode text and voice AI sales widget
**Version:** V2 planning draft
**Date:** 13 July 2026
**Status:** Architecture plan for review before implementation

---

## 1. Architecture Summary

V2 adds a text chatbot channel beside the existing voicebot channel.

Current voice architecture remains:

```text
Browser widget
  -> POST /api/session
  -> browser connects directly to Realtime provider
  -> POST /api/lead
  -> POST /api/conversation
```

New text architecture:

```text
Browser widget
  -> POST /api/chat/session
  -> POST /api/chat/message
  -> server calls OpenAI text model
  -> server stores messages
  -> server extracts/updates lead when available
  -> server returns reply and optional booking CTA
  -> POST /api/chat/end
```

Both channels share:

- Settings table.
- Knowledge document.
- Behavioral prompt source.
- Leads table.
- Conversations table.
- Appointment calendar.
- Active AI booking link.
- Admin inbox.

---

## 2. Core Boundaries

### Browser Boundary

Browser may receive:

- Text chat replies.
- Conversation ID.
- Signed session context.
- Booking CTA URL.
- Voice ephemeral token.

Browser must never receive:

- OpenAI API key.
- Gemini API key.
- Database credentials.
- Admin-only fields.

### Voice Boundary

Voice remains provider-direct for audio:

- Browser connects to OpenAI/Gemini Realtime.
- Audio does not pass through DJAI server.
- Backend only mints session credentials and validates lead/conversation writes.

### Text Boundary

Text chatbot is server-mediated:

- Browser sends text to DJAI backend.
- DJAI backend calls OpenAI.
- Backend stores user/assistant messages.
- Backend validates lead data before writing.

This difference is acceptable because text payloads are small and do not require realtime WebRTC audio.

---

## 3. Prompt Architecture

Use one shared prompt assembly module.

Required order for cache friendliness:

```text
1. Stable identity and behavioral prompt
2. Stable sales policy
3. Stable hard rules
4. Stable knowledge document
5. Mode-specific instructions
6. Tool/output instructions
7. Volatile page URL
8. Volatile current datetime
9. Recent text conversation messages, if applicable
```

Important:

- Do not rewrite the approved behavioral prompt.
- Add text-specific behavior only as an appended mode layer.
- The text chatbot should not mention it is following the voice prompt.
- The text chatbot should not behave like support FAQ.

Recommended module shape:

```text
src/lib/prompt.ts
  buildVoiceSessionPrompt(...)
  buildTextChatPrompt(...)
  sharedBehaviorPrompt
  sharedKnowledgeBlock
```

---

## 4. Database Architecture

Use the same Neon database.

Do not create a separate database for text chatbot.

### Reason

The admin product needs one operational view:

- Same customers.
- Same leads.
- Same calendar.
- Same analytics.
- Same exports.
- Same admin permissions.

Separate databases would make cross-channel reporting and lead deduplication harder.

### New/Changed Tables

#### `conversations`

Add:

```sql
channel text not null default 'voice_widget',
interaction_mode text not null default 'voice',
provider text,
model_id text,
last_message_at timestamptz,
message_count int not null default 0
```

Indexes:

```sql
create index conversations_channel_started_idx
on conversations(channel, started_at desc)
where deleted_at is null;

create index conversations_mode_started_idx
on conversations(interaction_mode, started_at desc)
where deleted_at is null;
```

#### `conversation_messages`

New:

```sql
create table if not exists conversation_messages (
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

Indexes:

```sql
create index conversation_messages_conversation_time_idx
on conversation_messages(conversation_id, created_at asc);

create index conversation_messages_channel_time_idx
on conversation_messages(channel, created_at desc);
```

#### `leads`

Add:

```sql
source_channel text default 'voice_widget',
source_mode text default 'voice'
```

#### `appointments`

Extend source semantics:

```text
voice_agent
text_chat
public_booking
manual
```

No separate chatbot calendar table.

#### `settings`

Add:

```sql
text_chat_enabled boolean not null default true,
text_chat_model_id text not null default 'gpt-5-mini',
text_chat_greeting text,
text_chat_max_messages int not null default 40,
text_chat_daily_session_cap int not null default 200
```

---

## 5. API Architecture

### `POST /api/chat/session`

Responsibilities:

- Check `text_chat_enabled`.
- Enforce rate limit.
- Enforce daily text session cap.
- Create conversation stub:
  - `channel='text_widget'`
  - `interaction_mode='text'`
  - `provider='openai'`
  - `model_id=settings.text_chat_model_id`
- Return signed session context.
- Return greeting.

### `POST /api/chat/message`

Responsibilities:

- Verify signed session context.
- Validate message length.
- Enforce max messages.
- Store user message.
- Load cached settings and knowledge.
- Fetch recent messages.
- Build text prompt.
- Call OpenAI server-side.
- Store assistant reply.
- Extract lead details.
- Update conversation summary flags where cheap and reliable.
- Return reply and optional booking CTA.

Lead extraction options:

Option A, recommended for V2:

- Ask the text model to return a structured sidecar JSON object alongside natural reply.
- Server validates the sidecar.
- If parsing fails, keep reply and skip lead extraction for that turn.

Option B:

- Use a second cheap extraction call after each assistant response.
- More reliable separation but higher cost and latency.

V2 recommendation:

- Start with Option A.
- Run full post-conversation analyzer on `/api/chat/end`.

### `POST /api/chat/end`

Responsibilities:

- Mark conversation ended.
- Run existing conversation analysis pipeline.
- Update lead if needed.
- Never fail the saved conversation if analysis fails.

---

## 6. Booking Architecture

Both channels use:

```text
settings.active_booking_link_id
booking_links
availability_rules
availability_overrides
appointments
```

Text chatbot booking CTA logic:

```text
lead captured or visitor agrees to consultation
  -> get active AI booking link
  -> verify link is active and has future slots
  -> create signed booking context
  -> return booking CTA
```

Appointment creation:

- If source context came from voice conversation, `source='voice_agent'`.
- If source context came from text conversation, `source='text_chat'`.
- If no context, `source='public_booking'`.

Slot blocking:

- Existing appointment overlap check blocks both channels.
- No additional locking system in V2.
- Server rechecks slot at submit time.

---

## 7. Admin Architecture

### Inbox

Inbox should become channel-aware, not separate dashboards.

Query model:

```text
filter = all | leads | high_interest | ...
channel = all | voice_widget | text_widget
selected conversation id
```

### Conversation Detail

For text conversations:

- Show message bubbles when expanded.
- Show summary/intelligence first.

For voice conversations:

- Keep transcript view.
- Later can normalize into message bubbles if voice turns are stored.

### Overview

Add channel metrics by aggregating `conversations.channel`, `leads.source_channel`, and `appointments.source`.

### Settings

Add text-chat controls only for master admin.

---

## 8. Security

Required:

- Server-only OpenAI API key.
- Signed text chat session context.
- Rate limits on session and message endpoints.
- Message size limit.
- Max messages per session.
- Same CORS origin allowlist as voice widget.
- Prompt injection resistance.
- No admin data exposed to public widget.

Text chat abuse controls:

- Per-IP session cap.
- Per-IP message cap.
- Daily global text chat cap.
- Max message length, recommended 2000 characters.
- Max assistant response size.

---

## 9. Failure Handling

Text model failure:

- Return friendly "please try again" message.
- Store failed state or error metadata.
- Do not affect voicebot.

Lead extraction failure:

- Keep conversation going.
- Do not create malformed lead.

Booking CTA unavailable:

- Bot says a human will arrange the time.
- Still capture lead.

Analyzer failure:

- Mark `analysis_status='failed'`.
- Keep conversation messages.

---

## 10. Performance Architecture

V2 must address current backend lag before adding significant text-chat volume.

### Current Hotspots

Observed from the current codebase:

1. `POST /api/conversation` awaits `analyzeAndPersistConversation(...)` before returning. This makes the save endpoint dependent on an LLM call.
2. `AdminShell` computes nav counts on every admin route render.
3. Inbox/Lead pages run live joins and lateral subqueries for each page load.
4. Broad `ilike` search across summary/problem/customer fields can become slow as data grows.
5. Admin pages are server-rendered and dynamic, so every navigation can trigger database work.
6. Future text chat will add more conversation rows and message rows, amplifying the issue.

### Required Performance Strategy

#### A. Save Fast, Analyze After

Public save endpoints should prioritize persistence:

```text
save transcript/messages
return ok
run analysis after response or via explicit admin/maintenance trigger
```

Because V2 is still no-worker/no-queue, acceptable options are:

1. **Best V2 option:** save conversation, return immediately, then start non-blocking analysis with a guarded fire-and-forget promise.
2. **Fallback option:** save conversation as `analysis_status='pending'`, return immediately, and analyze on next admin open or manual regenerate.
3. **Do not do:** block `/api/conversation` or `/api/chat/end` on LLM analysis.

The code must catch and log analysis errors. Analysis failure must not affect the saved conversation.

#### B. Short TTL Admin Count Cache

Use in-process TTL caching for low-risk admin shell counts:

```text
cache key: admin id + role
ttl: 15-30 seconds
values: inbox count, pending leads, pending appointments, status chips
```

This avoids running count queries on every page render while staying operationally fresh enough.

No Redis is required for V2.

#### C. Query Shape Rules

Admin list pages should:

- Fetch only fields needed for cards.
- Use `limit + 1` to determine `hasMore`.
- Prefer keyset pagination by `started_at/id` or `updated_at/id`.
- Load transcript/message bodies only for selected detail.
- Avoid `select *` on large rows when listing.
- Avoid exact total counts on every request.

#### D. Index Plan

Add indexes for V2:

```sql
create index if not exists conversations_channel_started_idx
on conversations (channel, started_at desc)
where deleted_at is null;

create index if not exists conversations_channel_interest_idx
on conversations (channel, interest_level, started_at desc)
where deleted_at is null;

create index if not exists leads_status_channel_updated_idx
on leads (status, source_channel, updated_at desc);

create index if not exists appointments_source_start_idx
on appointments (source, start_at desc)
where deleted_at is null;

create index if not exists conversation_messages_conversation_time_idx
on conversation_messages (conversation_id, created_at asc);
```

For search, start with bounded `ilike` because the dataset is small. If search becomes slow, use PostgreSQL full-text search with a generated/search vector column. This is not RAG and does not require pgvector.

#### E. Text Chat Latency

Text chat response latency comes mainly from the OpenAI text model call.

Rules:

- Send only recent conversation messages to the model, not the whole thread.
- Cap recent context by message count and character/token budget.
- Keep stable prompt blocks first for provider-side caching.
- Store messages immediately.
- Consider streaming text responses only after non-streaming V2 works; streaming improves perceived latency but increases frontend complexity.

#### F. Instrumentation

Add lightweight timing logs:

```text
api.route
db_ms
model_ms
analysis_ms
total_ms
conversation_id
channel
```

Do not log secrets or full customer messages.

### Performance Acceptance Targets

Local/staging target:

- `/api/session`: no regression from current voice token mint path.
- `/api/conversation`: returns after DB save without waiting on model analysis.
- `/api/chat/message`: stores and responds with one model call; no extra extraction call unless necessary.
- Admin Inbox initial render: bounded query and no full transcript/message bulk load.
- Admin shell counts: cached or demonstrably cheap.

---

## 11. Deployment Architecture

No additional service required.

Still deploy as:

```text
Next.js App Router Node app on Hostinger Cloud
Neon serverless Postgres
OpenAI API from server
```

No workers or queues in V2.

Analysis may run inline after text chat end, same as current post-call pipeline.

Correction for V2: analysis should not block public save endpoints. If inline analysis remains temporarily, it must be treated as a known performance debt and fixed before production V2 acceptance.
