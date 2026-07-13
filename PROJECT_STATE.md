# DJAI Voice Agent Current State

Last updated: 2026-07-13

## Runtime Status

- Deployed app: `https://voice.djai.academy`
- Current local source build marker: `admin-saas-inbox-2026-07-13`
- Production should be redeployed from the latest ZIP before running live acceptance against the new admin workflow.

## Current Source State

- Public landing page is Thai by default.
- Top language switch supports `TH` and `EN`.
- `?lang=en` renders the English landing page.
- Public admin link is not displayed on the landing page.
- `/widget-demo` was removed; the voice agent is embedded as a production section, not a demo page.
- Admin exists at `/admin` with the new SaaS-style operating shell: Overview, Inbox, Leads, Appointments, Customers, Channels, Team, and Settings.
- Admin uses a deep navy sidebar, light workspace, and topbar.
- Conversations are now reframed as Inbox:
  - `/admin/inbox` is the channel landing page.
  - `/admin/inbox/voice` is the active Website Voice Widget workspace.
  - `/admin/conversations` redirects to `/admin/inbox/voice`.
  - `/admin/conversations/[id]` redirects to `/admin/inbox/voice?id=...`.
- Future channels are visible but locked/inactive: Web Text Chat, FlowBot Widget, LINE, WhatsApp, Messenger, and Phone Voice.
- Admin V1.5 workflow is implemented locally:
  - Three-pane voice inbox with conversation list, analysis workspace, and customer/lead side panel.
  - Conversation filters for all, leads, no leads, starred, and failed analysis.
  - Conversation intelligence is shown before transcript; transcript remains secondary/expandable in the workspace.
  - Lead detail editing supports status, contact fields, meeting preference, and admin notes.
  - Conversation intelligence fields are editable by admin after AI analysis.
  - Leads page supports V1.5 statuses, structured contact fields, notes preview, search, and filtered CSV export.
  - Conversation starring, soft delete with confirmation, reanalysis, and filtered CSV export are available.
  - Overview is action-first with urgent queues, high-interest leads, pending appointments, recent conversations, and export actions.
  - Leads page uses a pipeline/detail workflow.
  - Appointments and Availability use the light workspace style.
  - Customers page provides lightweight contact profiles derived from captured leads.
  - Channels page exposes the active Website Voice Widget and honest future-channel placeholders.
  - Settings are grouped into Voice Agent, Booking, Post-call Analysis, Knowledge Document, and Advanced Voice Provider.
  - Database-backed admin users are in place.
  - `master_admin` and normal `admin` roles are in place.
  - Master admin Team page supports creating, editing, deactivating, soft-deleting, password reset, and active booking admin selection.
  - Normal admins get scoped access to their own assigned records.
  - Appointment list and calendar views are available at `/admin/appointments`.
  - Admin availability editor is available at `/admin/appointments/availability`.
  - Public booking pages are available at `/book/[slug]`.
  - Public booking APIs are available at `/api/booking/slots` and `/api/booking/appointments`.
  - Voice widget shows a booking CTA after successful lead capture when booking is enabled.
  - Appointment CSV export is available.
- Voice provider is configurable: `openai` or `gemini`.
- OpenAI remains the main recommended production provider.
- Gemini Live is available as an optional test provider using `gemini-3.1-flash-live-preview`.

## Current Voice Behavior State

- The base behavioral prompt has been restored to the user's original sales prompt wording and structure.
- Do not rewrite or "improve" the behavioral prompt without explicit user approval.
- The prompt module appends only technical plumbing after the restored behavior prompt:
  - Gemini-only turn-taking notes.
  - Knowledge grounding rules.
  - `capture_lead` tool-use instruction.
  - Support triage.
  - Injection resistance.
  - Configured greeting.
  - Knowledge document.
  - Dynamic session context.
- OpenAI realtime VAD was changed to reduce unwanted interruptions:
  - `threshold: 0.65`
  - `silence_duration_ms: 700`
  - `create_response: true`
  - `interrupt_response: false`
- Gemini realtime config keeps Gemini-specific interruption/backchannel controls.

## V1.5 Admin Workflow State

The current codebase already has the post-call admin workflow implemented locally:

- `DJAI_Voice_Admin_V1_5_PRD.md`
- `DJAI_Voice_Admin_V1_5_Architecture.md`
- `DJAI_Voice_Admin_V1_5_UIUX_Design.md`

Implemented V1.5 direction:

- Post-call analysis with `gpt-4o-mini`.
- Voice agent sells live; text model summarizes after the call.
- Summary-first admin review, transcript collapsed by default.
- Structured client details: name, company, phone, email, LINE, WhatsApp, preferred contact/time.
- Lead statuses: `pending_follow_up`, `appointment_set`, `follow_up_later`, `deal_closed`, `no_deal`.
- Admin notes, starred conversations, soft delete, CSV export.
- Manual edit of conversation intelligence fields after AI extraction.
- Safer Settings sections: Voice Agent, Post-call Analysis, Knowledge Document, Advanced.

## V1.5 Multi-Admin And Booking Workflow State

The V1.5 planning docs were implemented locally:

- `DJAI_Voice_Admin_V1_5_PRD.md`
- `DJAI_Voice_Admin_V1_5_Architecture.md`
- `DJAI_Voice_Admin_V1_5_Implementation_Plan.md`
- `Master_admin_V1.5_UIUX.md`
- `Normal_Admin_UIUX.md`

Implemented direction:

- Database-backed auth seeded from the existing env admin as the first master admin.
- Master admin can manage admin accounts manually. Email invites remain out of scope.
- Admin deletion is soft delete with guardrails.
- Master admin can view all appointments/calendars and filter by admin.
- Normal admin access is scoped server-side.
- Each admin can have a calendar profile and weekly availability.
- Availability supports two weekly ranges per day plus blocked/extra override records.
- Public booking creates `pending_confirmation` appointments.
- Booking prevents unavailable-slot submission by regenerating slots server-side.
- Voice lead capture returns a signed booking context and widget CTA when booking is available.

## Acceptance Gate Before Deployment

Before deploying or after deploying V1.5, run a fresh acceptance pass and confirm:

- OpenAI provider works end-to-end with `gpt-realtime-2.1`, `marin`, and `gpt-realtime-whisper`.
- Gemini remains optional/switchable and does not affect OpenAI behavior.
- Transcript saves on normal call end and tab close.
- Lead capture writes to Neon and appears in Admin with structured contact fields.
- Post-call analysis writes summary, problem, interest level, concern, recommendation, and next action.
- Conversations with contacts appear in Leads; conversations without contacts remain in No leads.
- Admin can update lead status, edit contact fields, add notes, star, soft-delete, reanalyse, and export CSV.
- Master admin can create a normal admin, set availability, and set active booking admin.
- Visitor can open `/book/[slug]`, choose an available time, and create a pending appointment.
- Admin can confirm/reject/cancel/reschedule/complete/no-show appointments.
- Knowledge edits apply to new calls without redeploy.
- Kill switch blocks new sessions immediately.
- Daily cap and rate limits still work.
- Thai and English golden-call scenarios pass with the restored original behavior prompt.
- If "kill switch hides widget immediately" is required for already-open pages, add lightweight widget polling or a clearer offline state.

## Verification Already Run After Latest Local Changes

- `npm run verify:source`
- `npm run typecheck`
- `npm run hostinger:build`
- `npm run package:source`
- `npm run verify:archive`
- Standalone server started locally on `127.0.0.1:3022`.
- `BASE_URL=http://127.0.0.1:3022 npm run smoke:public`
- Legacy route scan confirmed old dark admin content remains only on the intentional dark sidebar/login screen.
- `/admin/conversations` and `/admin/conversations/[id]` compile as compatibility redirects to the new inbox.
- Authenticated local standalone admin smoke passed for `/admin`, `/admin/conversations`, `/admin/leads`, `/admin/appointments`, `/admin/appointments?view=calendar&range=week`, `/admin/appointments/availability`, `/admin/team`, `/admin/settings`, `/api/admin/export/conversations.csv`, `/api/admin/export/leads.csv`, and `/api/admin/export/appointments.csv`.
- Booking smoke passed for active `/book/[slug]` and `/api/booking/slots`.
- Comprehensive SQA scripted flow passed with temporary records:
  - Created a temporary normal admin and calendar profile.
  - Created explicit extra availability.
  - Verified master admin routes and exports.
  - Verified normal admin scoped routes and settings restrictions.
  - Verified normal admin cannot access Team or global Settings API.
  - Verified booking page renders.
  - Verified slot API returns availability.
  - Verified public booking creates a `pending_confirmation` appointment.
  - Verified double booking is rejected.
  - Verified normal admin sees own appointment.
  - Verified master admin sees created appointment.
  - Verified assigned conversation access works for normal admin.
  - Verified CSV formula escaping for lead exports.
  - Temporary SQA records were cleaned up.
- Rendered UI/UX structure inspection passed:
  - Master nav includes Overview, Inbox, Leads, Appointments, Customers, Channels, Team, and Settings.
  - Normal nav excludes Team.
  - Inbox exposes channel landing and the active Website Voice Widget workspace.
  - Team page exposes active booking admin, create admin, and delete admin controls.
  - Appointments page exposes Availability, date filters, status filters, and list/calendar switch.
  - Availability page exposes calendar profile, weekly availability, and overrides.
  - Master Settings exposes global controls including Booking, Knowledge, and Advanced provider.
  - Normal Settings exposes personal profile and password only.
  - Public booking page clearly separates customer details and time selection.

Note: `smoke:no-secrets` was not applicable against the local standalone run because `.env.local` was intentionally loaded, so `/api/session` correctly returned 200 instead of the missing-env failure the script expects.

Residual verification notes:

- Real browser microphone/audio golden calls were not rerun in the SQA pass. Run Thai and English live calls after deployment.
- Playwright is not installed in this project, so UI inspection was performed through rendered HTML/route checks rather than screenshots.
- `verify:env` still warns that `GEMINI_API_KEY` does not look like a standard Gemini key. Build passes and OpenAI production path is unaffected.

## Deployment Artifact

Current source ZIP:

```text
/home/siamesedev/Documents/codex/DJAI_WebDev_Landing_Page/djai-voice-agent-v1-source.zip
```

The ZIP has been rebuilt after the restored prompt, OpenAI VAD changes, admin V1.5 workflow implementation, multi-admin booking implementation, and SaaS Inbox admin redesign.

## Current Uncommitted Changes

There are implementation and documentation changes pending commit at this checkpoint.

Unrelated/unreviewed untracked artifacts are also present and were not touched as part of the DJAI Voice Agent work:

- `FlowBot_V1_Codex_Bundle/` including its internal `FlowBot_V1.1_Codex_Final_Bundle.zip.sha256`

Current local branch:

```text
main...origin/main [ahead 1]
```

Last known previous implementation commit:

```text
99b0e79 Implement admin V1.5 workflow
```

## Hostinger Env Notes

Runtime env must include:

- `OPENAI_API_KEY` with the raw OpenAI key only, no quotes and no `OPENAI_API_KEY=` prefix.
- `GEMINI_API_KEY` only if testing Gemini provider.
- `DATABASE_URL`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `SESSION_PASSWORD`
- `SESSION_SIGNING_SECRET`
- `WIDGET_ALLOWED_ORIGINS=https://djai.academy,https://www.djai.academy,https://voice.djai.academy,https://dev.djai.academy`

If `POST /api/session` returns OpenAI `upstreamStatus:401`, Hostinger is using an invalid or unapplied OpenAI key.

## GitHub Note

Last known commit:

```text
99b0e79 Implement admin V1.5 workflow
```

Local `main` is ahead of `origin/main` and has uncommitted implementation/doc changes based on `git status --branch --short`.
