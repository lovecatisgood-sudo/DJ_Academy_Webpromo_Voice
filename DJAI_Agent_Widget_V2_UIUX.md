# DJAI Agent Widget V2 UIUX Plan

**Project:** Dual-mode website sales widget and channel-aware admin
**Version:** V2 planning draft
**Date:** 13 July 2026
**Status:** UIUX plan for review before implementation

---

## 1. Design Goal

The visitor experience should feel like one polished AI sales assistant with two contact modes:

```text
Chatbot | Voicebot
```

The admin experience should feel like one sales operations inbox with channel awareness, not two separate products bolted together.

---

## 2. Visitor Widget UI

### Placement

The dual-mode widget remains in the same production section where the current voice agent is shown.

Do not create a demo page.

### Widget Shell

Top area:

- DJAI assistant identity.
- Small status label.
- Segmented control:
  - Chatbot
  - Voicebot

Main area:

- Chatbot mode renders message conversation.
- Voicebot mode renders voice call controls and state.

Bottom area:

- Chat input in Chatbot mode.
- Mic/call controls in Voicebot mode.
- Booking CTA appears in either mode when available.

### Chatbot Mode

Layout:

```text
[Chatbot] [Voicebot]

DJ: Hi, I am DJ from DJAI Academy...

Visitor message bubble
Assistant message bubble

[ Type your message...                         Send ]
```

States:

- Ready.
- Sending.
- Assistant typing.
- Lead captured.
- Booking available.
- Error/retry.
- Ended.

Interaction rules:

- Enter sends message.
- Shift+Enter adds line break.
- Send button disabled while waiting.
- Message list auto-scrolls to latest.
- Long messages wrap cleanly.
- Booking CTA remains visible after shown.

### Voicebot Mode

Keep current production voice behavior:

- Idle.
- Connecting.
- Listening.
- Speaking.
- Ended.
- Error/unavailable.

When user switches from Chatbot to Voicebot:

- Show voice intro state.
- Voice conversation starts only after user clicks start/mic.
- It should not merge with the text conversation.

When user switches from Voicebot to Chatbot:

- If no active call, return to text chat.
- If active call, ask to end call or keep voice mode. Do not silently terminate a live voice call.

### Booking CTA

Appears as a clear card/button:

```text
Book a free consultation
Choose a time that works for you.
[Book appointment]
```

Rules:

- Do not display raw long URLs.
- CTA opens `/book/[slug]?context=...`.
- Same CTA component for text and voice.

---

## 3. Admin Inbox UI

### High-Level Layout

Keep the current SaaS-style inbox direction:

```text
Sidebar nav
Topbar
Inbox workspace
  Left: conversation list
  Middle: conversation intelligence and transcript/messages
  Right: lead/customer panel
```

### Header

Remove unnecessary secondary titles when the topbar already explains the product.

Header controls:

- Search input.
- Primary filters:
  - All
  - Leads
  - High interest
- Channel dropdown:
  - All channels
  - Voice widget
  - Text widget
- More filter disclosure:
  - Starred
  - No leads
  - Failed analysis
  - Date range

### Conversation List Cards

Each card should show:

- Channel badge:
  - Voice
  - Chat
- Lead badge if lead exists.
- Interest pill.
- Customer name or anonymous label.
- One-line summary/problem.
- Last activity timestamp.

Avoid showing full transcript in cards.

### Conversation Workspace

Top:

- Channel badge.
- Interest.
- Lead status.
- Source page.

Main:

- Summary.
- Business type.
- Main problem.
- Objection/concern.
- Recommended service.
- Next action.

Transcript/message section:

- Collapsed by default.
- Text chat expands into bubbles.
- Voice expands into transcript text for now.

### Right Panel

Shared for both modes:

- Customer details.
- Lead status.
- Contact fields.
- Appointment links.
- Admin notes.

No separate text-chat lead form.

---

## 4. Admin Overview UI

Add a compact channel performance section.

Suggested metrics:

- Conversations total.
- Voice conversations.
- Text conversations.
- Leads captured.
- Voice lead rate.
- Text lead rate.
- Appointments requested.
- Appointments confirmed.

Use small cards, not large decorative charts.

---

## 5. Leads UI

Add:

- Channel badge on list rows.
- Channel filter near search:
  - All
  - Voice
  - Chat

Keep status pipeline unchanged.

---

## 6. Calendar UI

Keep the calendar shared.

Appointment detail should show:

- Source:
  - Voice agent
  - Text chat
  - Public booking
  - Manual
- Linked conversation.
- Linked lead.

No separate chatbot calendar view.

---

## 7. Settings UI

Add a new section:

```text
Text Chatbot
```

Fields:

- Enabled toggle.
- Text model ID.
- Greeting.
- Max messages per session.
- Daily text session cap.

Add helper copy:

```text
Text chatbot uses the same sales behavior and knowledge document as the voice agent.
```

Do not duplicate knowledge editor.

---

## 8. UX Guardrails

- Do not crowd the inbox with every possible filter visible.
- Use channel dropdown instead of many channel pills.
- Keep transcript/messages collapsed by default.
- Do not create separate admin pages for text chat unless absolutely required.
- Use badges and filters to distinguish channels.
- Keep booking calendar shared.
- Keep settings grouped by operational concern.
