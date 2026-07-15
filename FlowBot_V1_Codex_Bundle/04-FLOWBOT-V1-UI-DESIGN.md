# FlowBot V1.1 — Admin Dashboard UI/UX Design

**Companion:** `flowbot-v1-mockup.html`  
**Design purpose:** define production behavior; the mockup is illustrative and contains no production auth, persistence, session, or security logic.

## 1. Design direction

FlowBot is a conversation workbench. The interface should feel familiar to messaging-app users while remaining a disciplined business tool. Visual priority is:

1. conversations requiring staff attention;
2. clear bot/live state;
3. customer context and sales follow-up;
4. simple flow authoring;
5. unmatched-query improvement.

Channel brand colors are functional identifiers only. Avoid decorative use that competes with CRM status or alert state.

## 2. Design tokens

Retain the prototype palette:

| Role | Value |
|---|---|
| Ink | `#122A2E` |
| Primary teal | `#0E7C6B` |
| Teal soft | `#E3F2EE` |
| App surface | `#F5F7F6` |
| Card | `#FFFFFF` |
| Border | `#E2E8E6` |
| Muted | `#5E7370` |
| Alert | `#E5484D` |
| Amber | `#F0A63A` |

Typography: IBM Plex Sans Thai for UI/body; Space Grotesk for brand and prominent numerals. Minimum interactive target 44 px. Visible focus ring and WCAG AA contrast are required.

CRM status colors stay consistent everywhere:

- New: slate
- Pending Follow Up: amber
- Appointment Made: teal
- Deal Not Closed – Follow Again: violet
- Closed Deal: green

## 3. Application shell

Top-level navigation:

- Overview
- Chat
- Customers
- Settings

Topbar:

- contextual title/breadcrumb;
- global customer/conversation search;
- **bot health/status pill**: `Live`, `Draft changes`, `Disabled`, `No published flow`, `API unhealthy`;
- notifications;
- account menu.

The demo login credentials in the HTML prototype are for visual review only. Production has no hardcoded credential and no public signup. The initial owner is seeded from environment-provided setup values.

## 4. Overview

Answer two questions: “How is FlowBot performing?” and “What requires action?”

- Attention cards: Awaiting admin; unmatched queries.
- 7/30/90-day metrics.
- Conversation activity chart.
- CRM funnel.
- Unmatched-query table with language, count, last seen and Add as keyword.
- Publish/health card showing current version, active conversations by version, and draft changes.

`Add as keyword` opens Settings → Knowledge, selects the intended node or asks the admin to choose one, and stages the raw query without publishing automatically.

## 5. Chat landing

- Web Chat tile: connected, unread count, health and last message.
- LINE, Messenger and WhatsApp: locked future tiles, placed below active channels.
- Locked tiles explain that they are not implemented in V1; they must not imply a working connection or billing upgrade in the single-tenant app.
- All Conversations shortcut remains available for future channels.

## 6. Inbox

### 6.1 Desktop layout

Three panes at 1200 px and wider:

1. conversation list;
2. thread and composer;
3. customer and conversation panel.

Filters: All, Unread, Awaiting, Starred, Archived and CRM status. Search matches visitor/customer name, phone, email and message text according to privacy/performance limits.

### 6.2 Thread rendering

- Visitor bubbles left.
- Bot and admin bubbles right, visibly distinguished.
- System events centered.
- Option selections and lead submissions render as structured cards.
- Old option buttons are disabled after selection.
- All bot controls disable when status is `awaiting_admin` or `admin_active`.

### 6.3 State banner and composer

- `Bot handling`: composer replaced by Take over.
- `Awaiting staff`: alert banner; staff can Take over. Visitor receives Return to bot menu in widget.
- `You are replying · bot paused`: composer active; Release to bot visible.
- `Closed`: read-only with Start new conversation not available to admin in V1.

While `admin_active`, visitor Restart/Main Menu is disabled. This prevents state races and preserves the staff conversation. Release sends the root of the conversation's pinned version.

### 6.4 Customer panel

Customer card:

- linked profile fields;
- Save;
- create profile from lead/transcript fields;
- search and link existing;
- clear display of match suggestions;
- no automatic phone/email merge.

Conversation card:

- CRM status;
- star;
- archive;
- soft delete;
- notes;
- pinned flow version and start date;
- admin actions in an audit trail.

## 7. Customers

Table: name, phone, email, LINE ID, WhatsApp, last contact, conversation count and latest CRM status.

Profile drawer/page:

- editable fields and note;
- linked conversation timeline;
- leads and V1.5 bookings;
- export customer data;
- soft delete;
- separate `Erase personal data` action with a stronger confirmation and impact summary.

Shared phone/email values are allowed. When multiple possible matches exist, show all and require explicit choice.

## 8. Settings

Sub-navigation:

- Knowledge
- Widget
- Contact channels
- Team
- Data & privacy

### 8.1 Knowledge — flow builder

Header:

- bot selector;
- current published version;
- draft change count;
- Test flow;
- Publish;
- version history and rollback.

#### Owned tree

The nested editor shows only structural ownership:

- root;
- owned children;
- owned descendants.

References render as compact link rows such as `↗ Pricing (existing node)`. Clicking opens the target. Do not recursively expand references because cycles are valid.

#### Node editor

- node type;
- Thai and English content;
- optional image;
- searchable-content toggle;
- keywords with language, priority and substring setting;
- options with TH/EN labels and target choice;
- one to six options;
- delete action.

#### Delete dialog

Show before allowing deletion:

- owned descendants that would be removed;
- incoming option references from outside the owned subtree;
- incoming message `next` references;
- whether the node/version is referenced by active conversations.

External incoming references block deletion until rewired. Cascade applies only to owned descendants. Database `RESTRICT` is the final safeguard.

#### Mindmap

Read-only graph with different treatment for ownership edges and reference edges. Selecting a graph node selects the editor. Graph layout must handle cycles without recursive rendering.

#### Simulator

Runs the same engine and matcher as production against the draft. It shows state, matched keyword/ranking in a debug panel, and can restart without creating production conversations or analytics.

### 8.2 Widget

- brand color and avatar/logo;
- bottom-left/right position;
- greeting TH/EN;
- default language and toggle visibility;
- open-on-load;
- disabled toggle;
- allowed origins;
- embed snippet;
- live preview;
- status warning when no published flow exists.

### 8.3 Contact channels

Ordered list of LINE, WhatsApp, Messenger, Phone, Email or Custom URL. Validate the value based on type. Used by fallback and contact-card nodes.

### 8.4 Team

Owner/Admin accounts. Owner cannot remove the final owner. Invite email status and expiry are visible. No Agent role until SaaS unless explicitly added later.

### 8.5 Data and privacy

- transcript retention;
- alert email/preferences;
- customer export;
- customer erasure;
- privacy policy URL;
- default lead-form notice text TH/EN.

## 9. Visitor widget UI

- Launcher and panel; full-screen sheet below 480 px.
- Responsive option layout:
  - three columns when each option can remain readable;
  - two columns on narrow phones;
  - one column below roughly 340 px or for long labels.
- Labels wrap to two lines; no horizontal scrolling as the default solution.
- Text input remains visible in `bot`, `awaiting_admin` and `admin_active`, but automation controls change by state.
- `awaiting_admin`: display staff-waiting state, contacts and Return to bot menu.
- `admin_active`: display Chatting with staff; hide/disable Restart and Main Menu.
- While still in `bot`, sync on a 30-second cadence and on tab focus/visibility. If staff takes over from the inbox, the next sync receives the state and any reply, then the widget opens SSE.
- Offline/reconnect banner and Retry.
- API-down state uses cached non-sensitive contact configuration.
- Language toggle changes future bot copy; it does not rewrite historical messages.

## 10. Responsive behavior

- `≥1200`: full three-pane inbox.
- `768–1199`: conversation list + thread; profile is a slide-over.
- `<768`: single-pane drill-down with persistent back navigation: list → thread → profile.
- Flow builder under 1000 px: editor first; graph and simulator open as tabs or full-screen panels.
- Sidebar becomes a drawer below 768 px.
- Do not merely hide the profile pane without an accessible path to it.

## 11. Cross-cutting states

Every data surface needs loading, empty, permission, error, offline and retry states. Destructive actions use confirmation. Publish confirmation states that new sessions receive the new version and active sessions remain pinned to their old version.

Toasts report the action result, not a promise: `Published v5`, `Reply sent`, `Customer linked`, `Erasure completed`.

## 12. Prototype caveat

`flowbot-v1-mockup.html` remains a design reference. Its in-memory data and simplified matcher are not implementation examples. Production behavior must follow the PRD, architecture, API, schema and integration contract.
