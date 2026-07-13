# DJAI Admin SaaS Inbox UI/UX Redesign

**Project:** DJAI Voice Sales Agent Admin  
**Design direction:** Future SaaS shell, current single-tenant Voice Agent implementation  
**Date:** 13 July 2026  
**Status:** UI/UX design plan for review before code changes

## 1. Product Vision

DJAI should become one SaaS operating system for automated business conversations.

The product tiers are:

- FlowBot: deterministic button/keyword flow bot.
- AI Chatbot: LLM-powered text sales chatbot.
- Voice Agent: live AI voice sales agent.

These products should not become three separate dashboards. They should share the same sales operations layer:

- Unified inbox.
- Customer/contact profiles.
- Leads.
- Appointments.
- Notes.
- Status pipeline.
- Team/admin management.
- Analytics.
- Channel configuration.
- Conversation intelligence.

The current Voice Agent admin should be redesigned as the first version of that shared SaaS shell, while only enabling the features that actually exist today.

## 2. Core UI Principle

The admin is not a settings panel. It is a sales command center.

The admin should help the team answer:

- Which conversations need attention?
- Which leads were captured?
- What does the customer want?
- What problem or pain point did the agent discover?
- What did the agent recommend?
- What objection or concern did the customer raise?
- What should the team do next?
- Is there an appointment?
- Who is responsible for follow-up?

The full transcript matters, but it should not be the first thing shown. The first view should be operational intelligence and next action.

## 3. Visual Direction

Use FlowBot's admin layout strength, adapted to DJAI branding.

Recommended style:

- Deep navy left sidebar.
- Light or very soft neutral main workspace for readability.
- Cyan to blue DJAI accents.
- Dense, practical UI.
- Clear status pills.
- Clean cards and tables.
- Minimal decoration.
- Business-tool feel, not marketing-page feel.

Avoid:

- Large dark cards everywhere.
- Long full-page forms when a side panel or grouped settings would be clearer.
- Showing future channels as if they are active.
- Hiding critical lead/contact/appointment actions under long transcript content.
- Using transcript as the primary conversation summary.

## 4. Global Information Architecture

Recommended main navigation:

1. Overview
2. Inbox
3. Leads
4. Appointments
5. Customers
6. Channels
7. Team
8. Settings

For the current build:

- `Team` is master-admin only.
- `Customers` can begin as a lightweight contact/profile layer if the full customer module is not implemented yet.
- `Channels` should show active and inactive/future channels honestly.
- `Inbox` replaces the old `Conversations` mental model.

## 5. Global Shell

### 5.1 Sidebar

Left sidebar:

- DJAI logo/wordmark.
- Navigation items with icons.
- Badges for queues:
  - Inbox unread/new conversations.
  - Leads pending follow-up.
  - Appointments pending confirmation.
- Tenant/business label at bottom.
- Logged-in admin name/role.
- Logout.

Sidebar items:

- Overview
- Inbox
- Leads
- Appointments
- Customers
- Channels
- Team, master admin only
- Settings

### 5.2 Topbar

Topbar should be consistent on all pages:

- Page title and breadcrumb.
- Global search: customers, leads, conversations, appointments.
- Agent health/status pill:
  - Voice Agent live
  - Disabled
  - Provider error
  - Booking disabled
  - Knowledge updated
- Notification bell.
- Current admin avatar/menu.

### 5.3 Main Workspace

Use a light or soft-neutral workspace for dense reading. The sidebar can carry the deep navy brand.

Default page container:

- Full width.
- Comfortable 16-24px spacing.
- Dense tables/cards.
- No oversized hero sections.

## 6. Overview Page

### Purpose

The overview is the daily operating dashboard.

It should answer:

- What needs action now?
- How many leads did the agent capture?
- How many appointments need confirmation?
- Which high-interest prospects need follow-up?
- Is the agent healthy?

### Layout

Top attention row:

- Pending follow-up leads.
- Pending appointment confirmations.
- Analysis failures.
- Agent/provider issues.

Metric row:

- Conversations/calls.
- Leads captured.
- Capture rate.
- High-interest leads.
- Pending follow-up.
- Appointment set.
- Pending confirmations.
- Appointments today.

Main content:

- Left: action queue.
- Right: performance/CRM funnel.
- Bottom: recent conversations and recent leads.

### Action Queue

Single combined queue sorted by urgency:

1. Pending appointment confirmation.
2. High-interest lead with no appointment.
3. Lead marked pending follow-up.
4. Failed analysis requiring reanalysis.
5. Conversation with contact detail but missing lead status.

Each queue item shows:

- Customer/company.
- Channel/source.
- Main problem.
- Recommended service.
- Interest level.
- Current status.
- Assigned admin.
- Primary action.

## 7. Inbox

### 7.1 Inbox Concept

Inbox is the consolidated command center for all channels.

The first screen of Inbox should be a channel landing page:

Active now:

- Website Voice Widget.

Inactive/future:

- Web text chat.
- LINE.
- WhatsApp.
- Messenger.
- Phone voice.
- FlowBot widget.

Each channel tile shows:

- Channel name.
- Connection status.
- New/unread count.
- Last conversation preview.
- Health/status.
- Clear label if locked/future.

Do not imply inactive channels work. Use labels like `Future channel`, `Not connected`, or `Coming later`.

### 7.2 Channel Workspace

Clicking an active channel opens a WhatsApp Web-style workspace.

Desktop layout:

```text
Sidebar | Conversation list | Conversation timeline | Customer/Lead panel
```

Recommended widths:

- Sidebar: 220px.
- Conversation list: 300-340px.
- Center timeline: flexible.
- Right panel: 320-380px.

Tablet:

- Conversation list + timeline.
- Right profile panel opens as drawer.

Mobile:

- Drill-down:
  - Channel list
  - Conversation list
  - Conversation detail
  - Customer/lead panel drawer

### 7.3 Conversation List

Filters:

- All.
- Leads.
- No lead.
- High interest.
- Pending follow-up.
- Appointment set.
- Starred.
- Failed analysis.

Search:

- Customer name.
- Company.
- Phone/email/LINE/WhatsApp.
- Main problem.
- Recommended service.
- Page URL.

Each conversation list item:

- Avatar/initial.
- Customer/company or fallback ID.
- Channel/source icon.
- Last activity time.
- Lead/no lead badge.
- Interest pill.
- Lead status.
- Appointment status if any.
- Short summary/problem.
- Unread/new badge if relevant.
- Star indicator.

For voice conversations, show:

- Call duration.
- Language.
- Page URL/source.
- Provider/model status only if needed for debugging, not as primary user info.

### 7.4 Center Timeline

The timeline should support all future channel types.

For current Voice Agent:

- Show transcript as chat bubbles:
  - Visitor/user on left.
  - AI voice agent on right.
  - Tool/lead capture events as structured system cards.
  - Booking CTA or appointment events as structured cards.
- Top of timeline:
  - Conversation title.
  - Status badges.
  - Start time and duration.
  - Source page.
  - Language.
  - Star button.
  - Reanalyse action.

Above transcript, show the intelligence summary:

- Summary.
- Main problem.
- Business goal.
- Recommended service.
- Objection/concern.
- Suggested next action.
- Interest level.

This summary should be collapsible, but visible by default. Full transcript can be below it or in a transcript tab.

Tabs in center pane:

- Summary.
- Transcript.
- Events.

For current V1, Summary + Transcript is enough. Events can be added later if useful.

### 7.5 Right Customer/Lead Panel

This is the CRM control panel.

Sections:

1. Customer profile.
2. Lead status.
3. Appointment.
4. Conversation intelligence.
5. Internal notes.
6. Admin actions.

Customer profile fields:

- Client name.
- Company.
- Phone.
- Email.
- LINE.
- WhatsApp.
- Other contact.
- Preferred contact method.

Lead status:

- Pending follow-up.
- Appointment set.
- Follow up later.
- Deal closed.
- No deal.

Appointment:

- Existing appointment status.
- Date/time.
- Assigned admin.
- Confirm/reject when pending.
- Open calendar.
- Book/reschedule later if implemented.

Conversation intelligence:

- Interest level.
- Main problem.
- Concern/objection.
- Recommended service.
- Next action.

Notes:

- Admin notes text area.
- Note history if later needed.

Actions:

- Save profile.
- Save lead.
- Star conversation.
- Delete conversation, master admin only.
- Export or copy summary, optional later.

### 7.6 No-Lead Conversations

No-lead conversations should not disappear.

They should be useful for:

- Understanding missed opportunities.
- Seeing objections.
- Improving prompt behavior.
- Identifying visitors who were interested but did not leave contact.

No-lead item should show:

- Summary.
- Why no lead if known.
- Interest level.
- Objection.
- Suggested prompt/offer improvement if analysis detected one.

## 8. Leads Page

### Purpose

Leads page is the sales pipeline, not just captured contact rows.

Default view:

- Pending follow-up.

Views/filters:

- All.
- Pending follow-up.
- Appointment set.
- Follow up later.
- Deal closed.
- No deal.
- High interest.
- Unassigned, master admin only if assignment exists.

Recommended layout:

- Left/table area: compact lead list.
- Right/detail drawer: edit selected lead.

Lead row:

- Customer/company.
- Contact method.
- Lead status.
- Interest level.
- Recommended service.
- Main problem.
- Next action.
- Appointment status.
- Assigned admin.
- Updated time.

Actions:

- Open in Inbox.
- Update status.
- Add note.
- Open appointment.

Avoid showing a full edit form inside every row. It creates visual noise and slows scanning.

## 9. Appointments Page

### Purpose

Appointments page manages the calendar outcome of conversations.

Top controls:

- Date range: Today, Week, Month, Upcoming, All.
- Status filter.
- Admin filter, master admin only.
- View switch: List / Calendar.
- Availability link.

List view:

- Pending confirmations first.
- Customer/company.
- Time.
- Assigned admin.
- Status.
- Contact.
- Linked lead.
- Linked conversation.
- Problem summary.
- Recommended service.
- Actions.

Calendar view:

- Day/week/month behavior later.
- For current V1, week-style grouped days are acceptable if clear.
- Master admin can view all admins or one admin.
- Normal admin sees only their own calendar.

Appointment detail drawer:

- Customer.
- Meeting.
- Lead intelligence.
- Linked conversation.
- Notes.
- Actions:
  - Confirm.
  - Reject.
  - Reschedule.
  - Reassign, master only.
  - Mark completed.
  - Mark no-show.
  - Cancel.

## 10. Customers Page

### Purpose

Customers are the long-term profile layer across all products and channels.

For current V1, this can be lightweight but should be designed now.

Customer list:

- Name.
- Company.
- Phone.
- Email.
- LINE.
- WhatsApp.
- Last contact.
- Lead count.
- Appointment count.
- Latest status.

Customer detail:

- Profile fields.
- Timeline:
  - Voice conversations.
  - Leads.
  - Appointments.
  - Notes.
- Current lead status.
- Export/delete later if privacy tooling expands.

Important rule:

- Phone/email matches should suggest a customer, not silently merge profiles.

## 11. Channels Page

### Purpose

Channels page explains what is connected today and what will be supported later.

This is separate from Inbox because Inbox is for operations, while Channels is configuration/connection state.

Current channel cards:

- Website Voice Widget: active.
- Web Text Chat: future.
- FlowBot Widget: future.
- LINE: future.
- WhatsApp: future.
- Messenger: future.
- Phone Voice: future.

Each channel card:

- Status.
- Description.
- Connected domain/account if active.
- Last health check if active.
- Setup/manage button if active.
- Locked/future label if inactive.

For Website Voice Widget:

- Embed snippet.
- Allowed origins.
- Widget status.
- Test session link.
- Current provider.

For future LINE/WhatsApp/Messenger:

- Show only honest locked state.
- Do not build fake setup flows.

## 12. Settings

Settings should use a sub-navigation, not one long form.

Recommended settings sections:

1. Voice Agent
2. Knowledge
3. Prompt Behavior
4. Booking
5. Post-call Analysis
6. Provider
7. Widget / Embed
8. Data & Privacy
9. Profile / Password

Master admin sees global/system sections:

- Voice Agent.
- Knowledge.
- Prompt Behavior.
- Booking.
- Analysis.
- Provider.
- Widget / Embed.
- Data & Privacy.

Normal admin sees:

- Profile.
- Password.
- Own availability if linked from appointments.

### 12.1 Voice Agent

Fields:

- Agent enabled.
- Greeting.
- Language mode.
- Max call seconds.
- Daily session cap.
- Default provider display.

### 12.2 Knowledge

Fields:

- Knowledge document editor.
- Version.
- Save/invalidate cache behavior.
- Last saved by/at later if needed.

Important:

- This is factual company/service knowledge.
- It should not casually rewrite the sales behavior prompt.

### 12.3 Prompt Behavior

This should preserve the user's approved natural consultative prompt.

Fields:

- Sales behavior prompt.
- Read-only or protected edit mode.
- Version/history later.

Rule:

- Do not change the behavior prompt without explicit approval.

### 12.4 Booking

Fields:

- Booking enabled.
- Active booking admin.
- Require confirmation.
- Default timezone.
- Booking window days.

Link:

- Manage availability.

### 12.5 Post-call Analysis

Fields:

- Analysis enabled.
- Text analysis model.
- Regeneration behavior.
- Extraction fields.

This section must make clear:

- Live voice model is separate.
- Text summarization/lead extraction happens after the call.

### 12.6 Provider

Fields:

- Voice provider: OpenAI / Gemini.
- Live model ID.
- Voice.
- Transcription model.
- Gemini thinking level if applicable.
- Provider-specific guardrail notes.

Keep Gemini-specific backchannel guardrails separate from OpenAI behavior.

### 12.7 Widget / Embed

Fields:

- Allowed origins.
- Embed snippet.
- Landing page status.
- Widget label/copy.
- Test endpoint.

### 12.8 Data & Privacy

Fields:

- Conversation retention.
- Export links.
- Delete rules.
- Privacy/contact policy.

## 13. Team Page

Master admin only.

Purpose:

- Create admins.
- Edit admins.
- Reset passwords.
- Deactivate/delete admins.
- Choose active booking admin.
- View each admin's appointment load.

Recommended layout:

- Top: active booking admin card.
- Middle: create admin compact form or drawer.
- Main: admin list.

Admin list item:

- Name.
- Role.
- Status.
- Booking slug.
- Calendar active.
- Upcoming appointments.
- Pending confirmations.
- Last login.
- Actions.

Actions should be grouped and visually less noisy than the current inline form-heavy layout.

## 14. Role Behavior

### Master Admin

Can see:

- All conversations.
- All leads.
- All appointments.
- All calendars.
- Team.
- Global settings.

Can do:

- Delete conversations.
- Delete/deactivate admins.
- Reassign appointments.
- Set active booking admin.
- Edit provider/knowledge/global settings.

### Normal Admin

Can see:

- Assigned leads.
- Assigned appointments.
- Conversations linked to assigned leads/appointments.
- Own availability.
- Own profile/password.

Cannot see:

- Team.
- Other admins' calendars.
- Provider/global settings.
- Master-only destructive actions.

## 15. Mobile Behavior

Mobile admin should be usable for follow-up but not optimized for heavy configuration.

Mobile priority:

1. View pending leads.
2. Read summary.
3. Call/copy contact.
4. Update lead status.
5. Confirm/reject appointment.
6. Add note.

Mobile patterns:

- Sidebar becomes bottom nav or hamburger.
- Inbox uses drill-down.
- Right panel becomes drawer.
- Settings can remain stacked sections.

## 16. Component System

Reusable components needed:

- AdminShell.
- SidebarNav.
- Topbar.
- StatusPill.
- InterestPill.
- ChannelBadge.
- MetricCard.
- QueueCard.
- SplitInboxLayout.
- ConversationListItem.
- TranscriptBubble.
- IntelligenceSummary.
- CustomerProfilePanel.
- LeadStatusControl.
- AppointmentMiniCard.
- NotesPanel.
- SettingsSubnav.
- DetailDrawer.
- ConfirmActionButton.

## 17. Mapping From Current UI

Current `Conversations` becomes:

- `Inbox` channel workspace.
- Conversation detail becomes center/right split view instead of a separate long page.

Current `Leads` becomes:

- Pipeline list + detail drawer.
- Full edit forms move out of every row.

Current `Appointments` remains:

- But gets cleaner list/calendar/detail-drawer structure.

Current `Settings` becomes:

- Sectioned settings with sub-navigation.

Current `Team` remains:

- But becomes less form-heavy and more management-card oriented.

Current `Overview` remains:

- But becomes action-first, with operational queues before charts.

## 18. Implementation Order

Do not implement all screens at once.

Recommended order:

1. Admin shell redesign:
   - Sidebar.
   - Topbar.
   - Layout tokens.
   - Shared status pills/cards.

2. Inbox landing and channel workspace:
   - Rename/reframe conversations as Inbox.
   - Active Website Voice Widget channel.
   - Future locked channel tiles.
   - 3-pane workspace.

3. Conversation intelligence panel:
   - Summary first.
   - Transcript second.
   - Right CRM panel.

4. Leads redesign:
   - Compact list.
   - Detail drawer/panel.
   - Cleaner status workflow.

5. Appointments redesign:
   - Better list/calendar.
   - Detail drawer.
   - Master/normal scoping retained.

6. Settings redesign:
   - Subnav sections.
   - Preserve existing settings behavior.

7. Team polish:
   - Master-admin management view.
   - Reduce inline form noise.

8. QA:
   - Master admin route coverage.
   - Normal admin scoped coverage.
   - Mobile drill-down.
   - Empty states.
   - Export links.
   - Booking and lead actions.

## 19. Non-Negotiable Scope Guard

This redesign must not accidentally build the full future SaaS.

Allowed now:

- Future-compatible navigation.
- Honest locked channel cards.
- Channel-neutral inbox layout.
- Current Voice Agent operations.
- Current booking/lead/team/settings functions.

Not allowed now:

- Multi-tenant signup.
- Billing.
- Real LINE/WhatsApp/Messenger integration.
- FlowBot runtime.
- AI text chatbot runtime.
- Fake active channels.
- Rewriting the approved voice-agent behavior prompt without explicit approval.

## 20. Design Decision

The product should feel like FlowBot's admin shell and inbox concept, but branded for DJAI and adapted to voice sales operations.

The most important screen is the Inbox channel workspace. If that screen is right, the future SaaS direction becomes clear:

- FlowBot conversations can appear there.
- AI chatbot conversations can appear there.
- Voice transcripts can appear there.
- LINE/WhatsApp/Messenger conversations can appear there.
- All of them can share customer profile, lead status, appointment, and notes.

