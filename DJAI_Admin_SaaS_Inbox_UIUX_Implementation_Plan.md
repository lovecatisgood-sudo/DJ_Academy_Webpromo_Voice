# DJAI Admin SaaS Inbox UI/UX Implementation Plan

**Project:** DJAI Voice Sales Agent Admin  
**Scope:** UI/UX redesign only, current single-tenant Voice Agent functionality  
**Design source:** `DJAI_Admin_SaaS_Inbox_UIUX_Redesign.md`  
**Date:** 13 July 2026  
**Status:** Implemented locally on 13 July 2026

## 1. Goal

Redesign the current Voice Agent admin into the first version of the future DJAI SaaS operating shell.

The finished implementation should:

- Keep all current Voice Agent functionality working.
- Replace the current horizontal-nav dark admin with a SaaS-style sidebar/topbar shell.
- Reframe `Conversations` as `Inbox`.
- Add a channel landing page and an active Website Voice Widget channel workspace.
- Present conversations in a WhatsApp Web-style 3-pane layout.
- Keep lead, appointment, team, settings, and export workflows functional.
- Make future channels visible but clearly inactive.
- Improve readability, scanning, and daily follow-up workflow.

This implementation must not add multi-tenancy, billing, FlowBot runtime, AI text chatbot runtime, or real external messaging integrations.

## 2. Non-Negotiable Rules

- Do not change the approved voice-agent behavior prompt.
- Do not change voice provider/session architecture unless required by UI display.
- Do not fake active LINE/WhatsApp/Messenger/phone integrations.
- Do not add new dependencies without explicit approval.
- Preserve server-side role checks.
- Preserve master/normal admin scoping.
- Preserve existing exports.
- Preserve booking, appointment, lead, and analysis actions.
- Use existing data first; only add schema if a UI requirement truly cannot be supported.
- Keep the UI production-level, not a demo.

## 3. Current-State Inputs

Current implemented pages:

- `/admin` overview.
- `/admin/conversations`.
- `/admin/conversations/[id]`.
- `/admin/leads`.
- `/admin/appointments`.
- `/admin/appointments/availability`.
- `/admin/team`.
- `/admin/settings`.

Current implementation traits:

- Dark full-page admin shell.
- Horizontal navigation in the header.
- Conversations are list/detail-page based.
- Leads use large inline edit forms.
- Settings is a long single form.
- Team page is functional but form-heavy.
- Appointments already support list/calendar and master/normal scoping.

Target design traits:

- Deep navy sidebar.
- Light/soft workspace.
- Topbar with search/status/notifications/account.
- Inbox channel landing.
- 3-pane channel workspace.
- Customer/lead/appointment right panel.
- Sectioned settings.
- Cleaner operational queues.

## 4. Proposed File/Route Shape

### Routes

Keep existing URLs where possible to avoid breaking bookmarks, but introduce new user-facing labels.

- `/admin` remains Overview.
- `/admin/inbox` becomes the channel landing.
- `/admin/inbox/voice` becomes the active Website Voice Widget workspace.
- `/admin/conversations` redirects or aliases to `/admin/inbox/voice`.
- `/admin/conversations/[id]` can remain as a direct deep link during transition.
- `/admin/leads` remains.
- `/admin/appointments` remains.
- `/admin/appointments/availability` remains.
- `/admin/customers` new lightweight profile/customer list if current schema supports it.
- `/admin/channels` new channel status/configuration page.
- `/admin/team` remains master-only.
- `/admin/settings` remains but becomes sectioned.

### Components

Create reusable admin UI components under `src/app/admin/components/`:

- `AdminSidebar.tsx`
- `AdminTopbar.tsx`
- `AdminLayoutFrame.tsx`
- `MetricCard.tsx`
- `StatusPill.tsx`
- `InterestPill.tsx`
- `ChannelTile.tsx`
- `QueueItem.tsx`
- `SplitInboxLayout.tsx`
- `ConversationList.tsx`
- `ConversationTimeline.tsx`
- `TranscriptBubble.tsx`
- `IntelligenceSummary.tsx`
- `CustomerLeadPanel.tsx`
- `AppointmentMiniCard.tsx`
- `SettingsSubnav.tsx`
- `DetailSection.tsx`

Only create components when used by at least one implemented screen.

### Data Helpers

Create focused query helpers if needed:

- `src/lib/admin-dashboard-queries.ts`
- `src/lib/admin-inbox-queries.ts`
- `src/lib/admin-channel-config.ts`

Do not introduce a client state library.

## 5. Phase 0 - Baseline And Regression Safety

Purpose: verify the current app before changing UI structure.

Tasks:

1. Check git status and note unrelated/uncommitted work.
2. Read:
   - `AdminShell.tsx`
   - `AdminNav.tsx`
   - current overview page
   - conversations pages
   - leads page
   - appointments page
   - settings page
   - team page
3. Run baseline checks:
   - `npm run typecheck`
   - `npm run verify:source`
   - `npm run verify:schema`
   - `npm run verify:live-schema`
   - `npm run hostinger:build`

Exit criteria:

- Baseline build status is known.
- Any pre-existing failures are documented before UI work starts.

## 6. Phase 1 - Design Tokens And Shell Foundation

Purpose: replace the admin frame without changing business workflows yet.

Tasks:

1. Define admin UI tokens:
   - Sidebar navy.
   - Workspace background.
   - Card background.
   - Border color.
   - Text colors.
   - Accent cyan/blue.
   - Success/amber/danger/status colors.
2. Refactor `AdminShell`:
   - Sidebar layout.
   - Topbar layout.
   - Main content workspace.
3. Replace `AdminNav` with sidebar nav:
   - Overview.
   - Inbox.
   - Leads.
   - Appointments.
   - Customers.
   - Channels.
   - Team, master only.
   - Settings.
4. Add badges:
   - Pending leads.
   - Pending appointments.
   - Recent/new conversations if available.
5. Add topbar:
   - Page title/breadcrumb from pathname.
   - Global search field placeholder.
   - Agent status pill.
   - Notification icon.
   - Admin avatar/role.
6. Keep logout accessible.

Validation:

- Master admin sees Team.
- Normal admin does not see Team.
- All current admin pages still render.
- Mobile/narrow viewport does not overlap or hide primary content.

Exit criteria:

- Shell redesign is live across admin.
- No route behavior has changed except navigation labels.
- Build passes typecheck.

## 7. Phase 2 - Shared Admin Components

Purpose: reduce visual inconsistency before redesigning pages.

Tasks:

1. Build `StatusPill`.
2. Build `InterestPill`.
3. Build `MetricCard`.
4. Build `QueueItem`.
5. Build basic `DetailSection`.
6. Normalize button styles:
   - primary
   - secondary
   - danger
   - ghost/icon
7. Normalize form input styles for light workspace.

Validation:

- Components render in server components without client-only assumptions.
- Existing forms still submit correctly.
- No contrast issues in primary text/status states.

Exit criteria:

- New shell and core components are available for page conversion.

## 8. Phase 3 - Overview Redesign

Purpose: make Overview action-first.

Tasks:

1. Keep existing stats queries but reorganize display.
2. Add attention cards:
   - Pending follow-up.
   - Pending appointments.
   - High-interest leads.
   - Analysis failures or provider issue if available.
3. Add metrics row:
   - Conversations.
   - Leads captured.
   - Capture rate.
   - High interest.
   - Pending follow-up.
   - Appointment set.
   - Pending appointments.
   - Appointments today.
4. Add combined action queue:
   - Pending appointment confirmations.
   - Pending follow-up leads.
   - High-interest leads.
5. Add recent conversations as compact rows.
6. Preserve export links, but move them to a secondary action area.

Role behavior:

- Master admin sees all scoped data.
- Normal admin sees assigned/linked scoped data only.

Validation:

- Empty states render.
- Pending appointment links work.
- Lead links work.
- Export links still work.

Exit criteria:

- Overview reads as operational dashboard, not only metrics.

## 9. Phase 4 - Inbox Channel Landing

Purpose: introduce the future multi-platform mental model without adding integrations.

Tasks:

1. Add `/admin/inbox`.
2. Add active channel tile:
   - Website Voice Widget.
   - Status: connected/active if agent enabled.
   - New/recent conversation count.
   - Last conversation preview.
   - Link to `/admin/inbox/voice`.
3. Add inactive/future channel tiles:
   - Web Text Chat.
   - FlowBot Widget.
   - LINE.
   - WhatsApp.
   - Messenger.
   - Phone Voice.
4. Each inactive tile must show:
   - Future channel / Not connected.
   - No setup button that implies current function.
5. Update sidebar nav label to `Inbox`.
6. Add backwards compatibility:
   - `/admin/conversations` can redirect to `/admin/inbox/voice`, or remain as a fallback during transition.

Validation:

- Active tile opens voice workspace.
- Inactive tiles do not start fake setup flows.
- Master/normal admin channel counts obey scope.

Exit criteria:

- Inbox landing establishes consolidated channel model.

## 10. Phase 5 - Voice Channel Workspace

Purpose: replace list/detail conversation review with a WhatsApp Web-style workspace.

Route:

- `/admin/inbox/voice`
- Optional selected conversation query: `/admin/inbox/voice?id=<conversationId>`

Tasks:

1. Create 3-pane layout:
   - Conversation list.
   - Center timeline/intelligence.
   - Right customer/lead panel.
2. Conversation list:
   - Filters:
     - All.
     - Leads.
     - No lead.
     - High interest.
     - Pending follow-up.
     - Appointment set.
     - Starred.
     - Failed analysis.
   - Search field.
   - Compact list items.
3. Center pane:
   - Header with conversation title, badges, duration, language, source page.
   - Summary/intelligence section visible by default.
   - Transcript as chat-style bubbles.
   - Lead capture/tool events as structured cards.
   - Reanalyse action.
   - Star action.
4. Right panel:
   - Customer/contact fields.
   - Lead status selector.
   - Appointment card if linked.
   - Notes.
   - Save actions.
   - Master-only delete action.
5. Preserve existing server actions:
   - `toggleConversationStarAction`
   - `regenerateConversationAnalysisAction`
   - `updateConversationIntelligenceAction`
   - `updateLeadAction`
   - `deleteConversationAction`
6. Keep `/admin/conversations/[id]` available as a direct fallback until workspace is fully verified.

Implementation note:

- This can be server-rendered first. Selection can use query params instead of client state to avoid new dependencies.

Validation:

- Conversation selection works.
- Filters work.
- Search works.
- Transcript renders correctly.
- Leads update from right panel.
- Analysis saves/regenerates.
- Master-only delete remains protected.
- Normal admin cannot access unassigned records.

Exit criteria:

- Admin can review and update a conversation from one workspace without jumping pages.

## 11. Phase 6 - Leads Pipeline Redesign

Purpose: make lead follow-up scannable and less form-heavy.

Tasks:

1. Keep `/admin/leads`.
2. Convert current list to compact pipeline list/table.
3. Add filters:
   - All.
   - Pending follow-up.
   - Appointment set.
   - Follow up later.
   - Deal closed.
   - No deal.
   - High interest.
4. Replace full inline edit form with:
   - Selected lead detail panel, or
   - Collapsible row editor.
5. Lead detail shows:
   - Contact fields.
   - Status.
   - Admin notes.
   - Main problem.
   - Recommended service.
   - Objection.
   - Next action.
   - Appointment link/status.
   - Open in Inbox.
6. Preserve export CSV.

Validation:

- Lead status updates.
- Contact field updates.
- Notes save.
- Search and filters work.
- Normal admin sees scoped leads only.
- CSV export still matches filters.

Exit criteria:

- Leads page is a pipeline/work queue, not a stack of edit forms.

## 12. Phase 7 - Appointments UI Polish

Purpose: keep current appointment functionality but improve layout and action priority.

Tasks:

1. Keep list/calendar view.
2. Improve top controls:
   - Date range.
   - Status.
   - View.
   - Admin filter, master only.
   - Search.
3. Put pending confirmations first by default.
4. Improve appointment card/table rows:
   - Customer/company.
   - Time.
   - Status.
   - Assigned admin.
   - Contact.
   - Lead intelligence preview.
   - Linked conversation.
5. Move less common actions into a cleaner secondary area.
6. Calendar:
   - Improve day grouping.
   - Make blocked time, pending, confirmed, completed/no-show visually distinct.
7. Detail drawer/panel if feasible without heavy client state. Otherwise preserve detail actions in row but make visual hierarchy cleaner.

Validation:

- Confirm/reject works.
- Reschedule works.
- Reassign works for master.
- Normal admin cannot reassign or see other calendars.
- Calendar view still renders.
- Availability link works.

Exit criteria:

- Appointments feels like a daily schedule/confirmation tool.

## 13. Phase 8 - Customers Page

Purpose: introduce the shared customer/contact profile layer for future SaaS.

Preferred minimal V1 implementation:

1. Add `/admin/customers`.
2. Build from existing leads/conversations data if no separate customer table exists:
   - Group by best available contact/email/phone where safe.
   - Do not silently merge records in database.
   - Present as "contact profiles" derived from current records.
3. Customer list:
   - Name/company.
   - Phone/email/LINE/WhatsApp.
   - Latest conversation.
   - Lead count.
   - Appointment count.
   - Latest status.
4. Customer detail:
   - Profile/contact summary.
   - Related conversations.
   - Related leads.
   - Related appointments.

If current schema makes this risky:

- Add only a placeholder `Customers` page explaining that customer profiles will be enabled after the contact profile schema is added.
- Do not fake editable customer persistence.

Validation:

- Page does not imply database merges that do not exist.
- Normal admin scope applies.
- Links to Inbox/Leads/Appointments work.

Exit criteria:

- Navigation has a future-compatible Customers area without unsafe identity behavior.

## 14. Phase 9 - Channels Page

Purpose: separate channel configuration/status from daily Inbox work.

Tasks:

1. Add `/admin/channels`.
2. Add active Website Voice Widget card:
   - Agent enabled/disabled.
   - Allowed origins summary.
   - Current provider.
   - Build version.
   - Link to Settings > Widget/Provider.
   - Link to test `/api/session` guidance if useful.
3. Add future channel cards:
   - Web Text Chat.
   - FlowBot Widget.
   - LINE.
   - WhatsApp.
   - Messenger.
   - Phone Voice.
4. Future cards show:
   - Not connected / future.
   - Description.
   - No fake credentials/setup flow.

Validation:

- Page is role-appropriate.
- No future channel has a working-looking integration path.

Exit criteria:

- Admin understands connected versus future channels.

## 15. Phase 10 - Settings Section Redesign

Purpose: split the long Settings page into navigable sections.

Tasks:

1. Add settings subnav:
   - Voice Agent.
   - Knowledge.
   - Prompt Behavior.
   - Booking.
   - Post-call Analysis.
   - Provider.
   - Widget / Embed.
   - Data & Privacy.
   - Profile / Password.
2. Use query param or anchor section:
   - `/admin/settings?section=knowledge`
3. Preserve one save action if simpler, but group fields visually by section.
4. Master admin:
   - Can access global sections.
5. Normal admin:
   - Sees Profile/Password only.
6. Prompt Behavior:
   - Display protected warning.
   - Do not alter prompt content unless already stored/editable.
   - Make explicit that behavior prompt changes require approval.
7. Provider section:
   - OpenAI/Gemini switching.
   - Model ID.
   - Voice.
   - Transcription model.
   - Gemini-specific notes.
8. Widget/Embed:
   - Allowed origins.
   - Embed snippet or link to channels page if currently elsewhere.

Validation:

- Master settings save still invalidates cache where required.
- Normal admin cannot post global settings API changes.
- Provider switch still works.
- Knowledge save still affects new sessions.

Exit criteria:

- Settings is navigable and less overwhelming.

## 16. Phase 11 - Team Page Polish

Purpose: keep master-admin team controls but reduce visual noise.

Tasks:

1. Keep `/admin/team`.
2. Move create admin into compact top form or modal-like section.
3. Make active booking admin a distinct top card.
4. Convert admin rows into clean management cards:
   - Identity.
   - Role/status.
   - Calendar/booking status.
   - Appointment counts.
   - Last login.
   - Actions grouped.
5. Keep dangerous actions visually separated:
   - Deactivate.
   - Delete admin.
   - Reset password.
6. Preserve all guardrails:
   - Cannot delete self.
   - Cannot delete/downgrade final master admin.
   - Delete active booking admin requires replacement/disable behavior.

Validation:

- All existing team actions work.
- Guardrails still enforced server-side.
- Normal admin cannot access.

Exit criteria:

- Team page is easier to scan and safer to operate.

## 17. Phase 12 - Responsive And Accessibility Pass

Purpose: make the redesigned admin usable across practical widths.

Tasks:

1. Desktop:
   - Verify sidebar/topbar/panes fit at 1440px and 1280px.
2. Tablet:
   - Inbox right panel becomes hidden/drawer or stacks below.
3. Mobile:
   - Sidebar collapses or becomes top/hamburger.
   - Inbox drill-down does not horizontally overflow.
4. Keyboard:
   - Focus visible.
   - Buttons and forms reachable.
5. Text:
   - Labels do not overflow.
   - Status pills do not wrap badly.
6. Empty states:
   - No conversations.
   - No leads.
   - No appointments.
   - No active admins.

Validation:

- Manual browser inspection or screenshot checks.
- No obvious overlap.
- Important actions remain visible.

Exit criteria:

- Admin is usable on desktop and acceptable on mobile for follow-up work.

## 18. Phase 13 - Verification And Release Package

Purpose: verify old behavior and new UI before deployment.

Required commands:

- `npm run verify:source`
- `npm run typecheck`
- `npm run verify:schema`
- `npm run verify:live-schema`
- `npm run hostinger:build`
- `npm run package:source`
- `npm run verify:archive`

Runtime smoke checks if local env/server is available:

- Master admin login.
- Normal admin login.
- Overview renders.
- Inbox channel landing renders.
- Voice channel workspace renders.
- Lead update works.
- Appointment confirm/reject works.
- Availability page renders.
- Team master-only access.
- Settings master/normal behavior.
- Export CSV routes.

Optional browser visual checks:

- 1440x1000 desktop.
- 1280x900 desktop.
- 390x900 mobile.

Exit criteria:

- Build passes.
- Existing functional workflows still pass.
- ZIP updated.
- Known residual risks documented.

## 19. Risk Register

### Risk: UI rewrite breaks server actions

Mitigation:

- Preserve form action names and hidden fields.
- Convert one page at a time.
- Test each action after moving layout.

### Risk: 3-pane inbox becomes too client-heavy

Mitigation:

- Start with query-param selected conversation.
- Use server-rendered pages.
- Add client interactivity later only where needed.

### Risk: Future channels look fake-active

Mitigation:

- Locked/future labels.
- No setup buttons for unimplemented integrations.
- Plain copy that current build only supports Website Voice Widget.

### Risk: Normal admin sees master data

Mitigation:

- Reuse existing scoped SQL predicates.
- Validate routes as normal admin.
- Do not rely on hidden UI only.

### Risk: Settings split changes save behavior

Mitigation:

- Keep existing `saveSettingsAction` initially.
- Only restructure display.
- Verify cache invalidation after knowledge save.

### Risk: Light workspace weakens DJAI brand

Mitigation:

- Keep deep navy sidebar.
- Use cyan/blue accents.
- Use clean typography and restrained cards.

## 20. Implementation Sequence Summary

1. Baseline checks.
2. Shell foundation.
3. Shared components.
4. Overview redesign.
5. Inbox channel landing.
6. Voice channel workspace.
7. Leads pipeline.
8. Appointments polish.
9. Customers page.
10. Channels page.
11. Settings sectioning.
12. Team polish.
13. Responsive/accessibility.
14. Verification/package.

The most important milestone is Phase 5: Voice Channel Workspace. That is where the future SaaS vision becomes visible while still serving the current Voice Agent product.

## 21. Implementation Record - 13 July 2026

Implemented scope:

- Replaced the admin shell with a deep navy sidebar, light workspace, and topbar.
- Reframed Conversations as Inbox.
- Added `/admin/inbox` channel landing with Website Voice Widget active and future channels locked.
- Added `/admin/inbox/voice` as the primary three-pane voice workspace.
- Simplified the voice inbox toolbar: search moved into the conversation pane, only All/Leads/High interest are primary filters, and secondary filters are hidden under More.
- Added master-admin bulk selection and bulk soft-delete for voice conversations.
- Converted `/admin/conversations` and `/admin/conversations/[id]` into compatibility redirects to the new voice inbox.
- Redesigned Overview as an action-first dashboard.
- Redesigned Leads into a pipeline/detail workflow.
- Polished Appointments and Availability into the light workspace style.
- Added lightweight Customers and Channels pages.
- Sectioned Settings while preserving the existing `saveSettingsAction`.
- Polished Team management while preserving master-admin-only guardrails.
- Preserved existing booking, lead, appointment, export, auth, and role-scoping workflows.

Verification completed:

- `npm run typecheck`
- `npm run verify:source`
- `npm run verify:schema`
- `npm run verify:live-schema`
- `npm run hostinger:build`
- `npm run package:source`
- `npm run verify:archive`
- Runtime standalone server smoke with `BASE_URL=http://127.0.0.1:3022 npm run smoke:public`

Notes:

- `smoke:no-secrets` was intentionally not used as final runtime evidence because the standalone server loads `.env.local` in this workspace. In that env-backed runtime, `/api/session` correctly returned a configured response instead of the missing-env 500 expected by the no-secrets script.
- The admin login page intentionally remains dark/branded. The dark sidebar also remains intentional.
- A local warning remains from `verify:env`: `GEMINI_API_KEY` is set but does not look like a standard Gemini API key. The build and runtime smoke still passed; production Gemini availability still depends on the deployed key being valid.
