# DJAI Voice Agent Current State

Last updated: 2026-07-15

## DJAY Bot SaaS Platform State

The separate multi-tenant implementation is under:

```text
/home/siamesedev/Documents/codex/DJAI_WebDev_Landing_Page/DJAY_Bot_SaaS_Platform
```

- P0-P5 engineering gates are complete; P6 AI Chatbot Premium Social is active.
- The PostgreSQL 16 integration gate applies migrations `0000`-`0027` and passes
  forced RLS, tenant isolation, identity, commerce, shared domain, FlowBot, and
  AI Chat runtime/worker journeys, including local LINE and WhatsApp social
  delivery.
- P5 includes provider-neutral Sales Conversation Core, Web-only AI Basic,
  immutable playbooks/knowledge pins, exact-origin widgets, durable idempotent
  effects, pending appointment requests, encrypted merchant notification,
  takeover, usage settlement, bilingual/adversarial fixtures, and tenant UI.
- P5 production build and Chromium desktop/mobile/widget QA pass.
- External gates remain explicit: three named FlowBot pilots; an approved live AI
  text routing profile and live bilingual/adversarial evaluation; named merchant
  acceptance; commercial decisions; and paid-GA authorization.
- Authoritative phase evidence is in `DJAY_Bot_SaaS_Platform/docs/phases/` and
  `DJAY_Bot_SaaS_Platform/docs/validation/`. Do not infer completion from the
  protected FlowBot V1 or single-tenant voice/text applications below.

## Runtime Status

- Deployed app: `https://voice.djai.academy`
- Current local source build marker: `agent-widget-v2-openai-text-chat-2026-07-13`
- Production should be redeployed from the latest ZIP before running live V2 acceptance for the dual-mode widget, text chatbot, voicebot, and shared booking flow.

## FlowBot V1 App State

FlowBot is now being built as a separate local app first, under:

```text
/home/siamesedev/Documents/codex/DJAI_WebDev_Landing_Page/FlowBot_V1_App
```

Current purpose:

- Separate FlowBot V1 testing app before later SaaS integration.
- Uses the same previous Neon test database for now, with prefixed `flowbot_*` tables.
- Local env files already point to the same previous Neon host/database as the parent app:
  - `FlowBot_V1_App/.env.local`
  - `FlowBot_V1_App/apps/dashboard/.env.local`
- Actual SaaS production keys/database will be switched later.

FlowBot implemented scope:

- Node 24 local runtime wrapper: `scripts/use-node24.sh`.
- pnpm/Turborepo workspace with:
  - `apps/dashboard`
  - `apps/widget`
  - `packages/shared`
  - `packages/core`
  - `packages/db`
  - `packages/notifications`
- DB migration and seed are in place for test tenant, owner user, website bot, draft flow, active published demo flow, and contact channel.
- Dashboard auth supports owner/admin login, logout, session lookup, and guarded admin APIs.
- Public widget runtime APIs are implemented:
  - config
  - session
  - message
  - sync
  - stream token
  - SSE stream
- Runtime supports option flow, form lead capture, unmatched text handoff, admin takeover/reply/release, idempotent visitor inputs, DB replay, and SSE live admin replies.
- Flow authoring APIs support draft editing, nodes, options, keywords, simulator, publish, rollback, and guarded deletion.
- Production visitor widget package is implemented with Shadow DOM, responsive chat panel, language toggle, cached config fallback, persisted sessions, sync/reconnect, SSE, offline/retry states, forms, CTA rendering, and disabled stale actions.
- Admin dashboard includes Overview, Chat, Customers, and Settings.
- Settings include Knowledge flow builder, Widget settings, Contact channels, Team management, and Data/privacy.
- Owner privacy tools support customer export and erasure.
- Rate limiting is in place for admin login and public widget/session/message/sync/stream routes.
- CI, secret scan, release verification, browser QA, and dependency audit gates are in place.

FlowBot latest hardening:

- Added Playwright browser QA for desktop/mobile dashboard flows and public widget flows using the compiled production widget bundle.
- Added SSE mini-soak smoke test: `pnpm run smoke:sse-soak`.
- Parameterized SSE soak for staging with `FLOWBOT_SSE_SOAK_CONCURRENCY`, `FLOWBOT_SSE_SOAK_UNIQUE_IPS=1`, and `FLOWBOT_SSE_SOAK_TIMEOUT_MS`.
- Upgraded vulnerable direct dependencies:
  - `vitest@3.2.6`
  - `preact@10.28.2`
  - `turbo@2.9.14`
- Added workspace override for patched `postcss@8.5.17`.
- `verify:audit` now runs `pnpm audit --audit-level low`, so any known advisory fails the gate.

FlowBot latest verification evidence:

```bash
cd FlowBot_V1_App
scripts/use-node24.sh pnpm install
scripts/use-node24.sh pnpm run verify
scripts/use-node24.sh pnpm run test:e2e
scripts/use-node24.sh pnpm run verify:release
scripts/use-node24.sh pnpm run verify:audit
scripts/use-node24.sh pnpm audit --audit-level low
scripts/use-node24.sh pnpm run smoke:sse-soak
```

Latest results:

- Full typecheck/unit/build/secret scan passed.
- Browser QA passed: 12 Playwright tests on desktop and mobile.
- Widget browser QA verifies production bundle mount, option flow, lead form capture, free-text handoff, viewport fit, and no horizontal overflow.
- `pnpm run test:e2e` now builds the widget bundle before browser tests, so it is safe on a clean checkout where ignored `dist/` files do not exist yet.
- Release verification passed.
- Dependency audit reports `No known vulnerabilities found`.
- SSE mini-soak passed with 4 concurrent streams and 4 live admin replies.
- Updated parameterized SSE soak default passed with 4 streams, `timeoutMs: 5000`, and runtime rate limits still enabled.
- Local FlowBot server used for smoke testing: `127.0.0.1:3025`; server was stopped after the smoke.

FlowBot remaining before public production launch:

- Full axe accessibility scan.
- Larger staging SSE load test.
- Hostinger/VPS reverse-proxy SSE timeout/buffering validation.

FlowBot important docs:

- `FlowBot_V1_App/docs/specs/M0-implementation-status.md`
- `FlowBot_V1_App/docs/12-RELEASE-CHECKLIST.md`
- `FlowBot_V1_App/README.md`

## Current Source State

- Public landing page is Thai by default.
- Top language switch supports `TH` and `EN`.
- `?lang=en` renders the English landing page.
- Public admin link is not displayed on the landing page.
- `/widget-demo` was removed; the voice agent is embedded as a production section, not a demo page.
- Admin exists at `/admin` with the new SaaS-style operating shell: Overview, Inbox, Leads, Calendar, Customers, Channels, Team, and Settings.
- Admin uses a deep navy sidebar, light workspace, and topbar.
- Conversations are now reframed as Inbox:
  - `/admin/inbox` is the channel landing page.
  - `/admin/inbox/voice` is the active Website Voice Widget workspace.
  - Voice inbox search now lives directly in the conversation pane.
  - Voice inbox primary filters are simplified to All, Leads, and High interest; lower-priority filters are under More.
  - Master admin can select multiple voice conversations and bulk soft-delete them.
  - `/admin/conversations` redirects to `/admin/inbox/voice`.
  - `/admin/conversations/[id]` redirects to `/admin/inbox/voice?id=...`.
- Future channels are visible but locked/inactive: FlowBot Widget, LINE, WhatsApp, Messenger, and Phone Voice.
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
  - Channels page exposes the active Website Agent Widget for voice and text, plus honest future-channel placeholders.
  - Settings are grouped into Voice Agent, Booking, Post-call Analysis, Knowledge Document, and Advanced Voice Provider.
  - Database-backed admin users are in place.
  - `master_admin` and normal `admin` roles are in place.
  - Master admin Team page currently supports creating, editing, deactivating, soft-deleting, and password reset. Active AI booking target is now selected from Booking Links, not Team.
  - Normal admins get scoped access to their own assigned records.
  - Calendar is now the primary appointment workspace at `/admin/calendar`.
  - Setup-first calendar workflow is available at `/admin/calendar/setup`.
  - Booking-link management is available at `/admin/calendar/links`.
  - Admin availability editor with slot preview is available at `/admin/calendar/availability`.
  - Legacy appointment list remains available at `/admin/appointments` as a compatibility route.
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

Calendar correction note:

- The corrected calendar product plan is documented in `DJAI_Calendar_Booking_Link_Rebuild_Implementation_Plan.md`.
- The corrected model starts with calendar setup, uses booking links as the central scheduling object, and requires one active AI booking link for the voice widget CTA.
- The calendar dashboard now uses a real week time-grid with appointment blocks and blocked-time blocks.
- Public booking now resolves booking links, not raw admin calendar slugs.

## V2 Dual-Mode Agent Widget Plan

The V2 dual-mode website agent implementation is documented in:

- `DJAI_Agent_Widget_V2_PRD.md`
- `DJAI_Agent_Widget_V2_Architecture.md`
- `DJAI_Agent_Widget_V2_UIUX.md`
- `DJAI_Agent_Widget_V2_Implementation_Plan.md`

Implemented V2 direction:

- Text-only chatbot is added beside the current voicebot in the same production widget section.
- Visitor can toggle between Chatbot and Voicebot at the top of the same chat window.
- Text chatbot uses the same approved sales behavior and knowledge document, adapted for text.
- Text chatbot uses server-side OpenAI text calls, with `gpt-5-mini` as the default setting.
- Text and voice conversations stay separate rows but share the same backend, database, admin inbox, leads, customer profile, booking link, and calendar.
- Both bots use the same active AI booking link.
- A booked appointment blocks the time slot for both channels because availability is calculated from the shared `appointments` table.
- Admin dashboard is channel-aware through badges, compact filters, overview metrics, and CSV export fields, not separate dashboards.
- V2 must not introduce a separate database, external messaging platforms, RAG, workers, notifications, billing, or multi-tenancy.

Implemented V2 backend/performance changes:

- `/api/conversation` now persists the conversation first and schedules post-call analysis without blocking the response.
- Admin shell counts use a short in-process TTL cache.
- Text chat sessions/messages/endpoints are available at `/api/chat/session`, `/api/chat/message`, and `/api/chat/end`.
- Text chat messages persist to `conversation_messages`; post-chat analysis can analyze those rows.
- Text chat public endpoints reject disallowed browser origins when an `Origin` header is present.
- Public save/chat routes emit lightweight `server_timing` logs with route, channel, conversation id, DB/model/analysis/total timings, and no customer message content.
- Inbox and Leads lists use bounded `limit + 1` queries with `hasMore` notices; full transcripts/messages load only for the selected conversation.
- Inbox search includes text-chat message content through an existence check.
- Channel-aware indexes and schema verification were added for conversations, leads, appointments, and conversation messages.
- Settings now include text chatbot enablement, model, greeting, max messages, and daily cap.
- Text chatbot default was switched to `gpt-5-mini`; the chat request builder uses GPT-5-compatible `max_completion_tokens` and omits custom `temperature` for GPT-5-family models.
- Text-chat prompt adapter now adds explicit proactive sales behavior on top of the approved core prompt: do not behave like a passive FAQ, connect direct answers to business outcomes, sell the benefit of the benefit, handle objections without giving up, and move toward consultation/contact capture on buying signals.

## Acceptance Gate Before Deployment

Before deploying or after deploying V1.5, run a fresh acceptance pass and confirm:

- OpenAI provider works end-to-end with `gpt-realtime-2.1`, `marin`, and `gpt-realtime-whisper`.
- Gemini remains optional/switchable and does not affect OpenAI behavior.
- Transcript saves on normal call end and tab close.
- Lead capture writes to Neon and appears in Admin with structured contact fields.
- Text chatbot starts from the website widget, replies through `/api/chat/message`, saves `conversation_messages`, and appears in Admin as a Chat conversation.
- Text chatbot lead capture writes source channel `text_widget` and can return the shared active booking CTA.
- Post-call analysis writes summary, problem, interest level, concern, recommendation, and next action.
- Conversations with contacts appear in Leads; conversations without contacts remain in No leads.
- Admin can update lead status, edit contact fields, add notes, star, soft-delete, reanalyse, and export CSV.
- Master admin can create a normal admin and set availability. The intended AI booking target is now active AI booking link, not active booking admin.
- Visitor can open `/book/[slug]`, choose an available time, and create a pending appointment.
- Admin can confirm/reject/cancel/reschedule/complete/no-show appointments.
- Knowledge edits apply to new calls without redeploy.
- Kill switch blocks new sessions immediately.
- Daily cap and rate limits still work.
- Thai and English golden-call scenarios pass with the restored original behavior prompt.
- Thai and English text-chat scenarios pass with the same approved sales behavior and knowledge document.
- If "kill switch hides widget immediately" is required for already-open pages, add lightweight widget polling or a clearer offline state.

## Verification Already Run After Latest Local Changes

- `node --check public/djai-voice-widget.js`
- `npm run verify:source`
- `npm run typecheck`
- `npm run verify:schema`
- `npm run verify:live-schema`
- `npm run next:build`
- `npm run hostinger:build`
- `npm run package:source`
- `npm run verify:archive`
- `npm run acceptance:phase11` exists for production API acceptance after deployment. It checks build marker, `/api/chat/session`, `/api/session`, CORS rejection, and cleans temporary rows when `DATABASE_URL` is available.
- `BASE_URL=https://voice.djai.academy npm run acceptance:phase11`
- Production `/api/chat/session`, `/api/chat/message`, and `/api/chat/end` smoke passed with the current `gpt-5-mini` text-chat setting; temporary production audit rows were deleted.
- Local built text-chat behavior smoke passed for an e-commerce/high-ad-cost objection: response acknowledged the objection, explained business impact, sold outcomes, and asked next discovery questions. Temporary audit rows were deleted.
- Standalone server started locally on `127.0.0.1:3022`.
- `BASE_URL=http://127.0.0.1:3022 npm run smoke:public`
- Local standalone `/api/chat/session` smoke passed:
  - Disallowed browser origin returned `403`.
  - Same-app/no-origin request returned `200` and created a text chat session.
  - Temporary smoke-test conversation row was deleted after the test.
- Legacy route scan confirmed old dark admin content remains only on the intentional dark sidebar/login screen.
- `/admin/conversations` and `/admin/conversations/[id]` compile as compatibility redirects to the new inbox.
- Authenticated local standalone admin smoke from the previous V1.5 pass covered `/admin`, `/admin/conversations`, `/admin/leads`, `/admin/appointments`, `/admin/appointments?view=calendar&range=week`, `/admin/appointments/availability`, `/admin/team`, `/admin/settings`, `/api/admin/export/conversations.csv`, `/api/admin/export/leads.csv`, and `/api/admin/export/appointments.csv`.
- Latest build compiled `/admin/calendar`, `/admin/calendar/setup`, `/admin/calendar/availability`, `/admin/calendar/links`, `/api/chat/session`, `/api/chat/message`, and `/api/chat/end`; authenticated visual/browser smoke for these new routes should still be run before production signoff.
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
  - Team page exposes legacy active booking admin, create admin, and delete admin controls. This must be replaced or supplemented by active AI booking link controls in the calendar rebuild.
  - Appointments page exposes Availability, date filters, status filters, and list/calendar switch.
  - Availability page exposes calendar profile, weekly availability, and overrides.
  - Master Settings exposes global controls including Booking, Knowledge, and Advanced provider.
  - Normal Settings exposes personal profile and password only.
  - Public booking page clearly separates customer details and time selection.

Note: `smoke:no-secrets` was not applicable against the local standalone run because `.env.local` was intentionally loaded, so `/api/session` correctly returned 200 instead of the missing-env failure the script expects.

Residual verification notes:

- Production API acceptance later passed on 2026-07-13 for build marker `agent-widget-v2-openai-text-chat-2026-07-13`.
- Production `/api/chat/session`, `/api/chat/message`, and `/api/chat/end` were smoke-tested with the current `gpt-5-mini` text-chat setting; temporary audit rows were deleted from Neon.
- Real browser microphone/audio golden calls were not rerun in the SQA pass. Run Thai and English live calls after deployment.
- Real browser text-chat golden chats should still be manually checked after redeploy because the API smoke does not inspect final browser rendering.
- Playwright is not installed in this project, so UI inspection was performed through rendered HTML/route checks rather than screenshots.
- `verify:env` still warns that `GEMINI_API_KEY` does not look like a standard Gemini key. Build passes and OpenAI production path is unaffected.

## Deployment Artifact

Current source ZIP:

```text
/home/siamesedev/Documents/codex/DJAI_WebDev_Landing_Page/djai-voice-agent-v1-source.zip
```

The ZIP has been rebuilt after the 2026-07-14 voice behavior restore, restored prompt/product-knowledge context, OpenAI VAD timing rollback, Voicebot-default widget mode, admin V1.5 workflow implementation, multi-admin booking implementation, SaaS Inbox admin redesign, booking-link calendar rebuild, V2 dual-mode widget, `gpt-5-mini` text-chat switch, chatbot input/layout fix, and proactive-sales text-chat prompt correction.

## Latest Checkpoint - 2026-07-14

- Voice behavior restore was applied after live behavior was reported as odd/bad.
- Voice prompt now restores the original-style Product Knowledge section inside the approved behavior prompt so the agent has concrete sales context again.
- The editable Knowledge Document remains the factual tie-breaker if any package/detail conflicts with the prompt context.
- OpenAI Realtime turn detection was reverted closer to the best-performing original setup:
  - `threshold: 0.5`
  - `prefix_padding_ms: 300`
  - `silence_duration_ms: 500`
  - `idle_timeout_ms: 30000`
  - removed extra `create_response` / `interrupt_response` overrides.
- The dual-mode widget now defaults to `Voicebot`; `Chatbot` remains available by toggle but no longer auto-starts first.
- Build marker is now `voice-behavior-restore-2026-07-14`.
- Local built-server smoke confirmed `/api/session` returns:
  - `provider: openai`
  - `modelId: gpt-realtime-2.1`
  - client secret present
  - build marker `voice-behavior-restore-2026-07-14`.
- Verification passed:
  - `node --check public/djai-voice-widget.js`
  - `npm run typecheck`
  - `npm run verify:source`
  - `npm run verify:schema`
  - `npm run verify:live-schema`
  - `npm run next:build`
  - `npm run hostinger:build`
  - local built `/api/session` token mint smoke
  - `BASE_URL=http://127.0.0.1:3028 npm run smoke:public`
  - `npm run package:source`
  - `npm run verify:archive`
- Still required after deployment: real Thai and English browser voice golden calls to judge actual tone, warmth, objection handling, interruption behavior, and benefit-led sales quality.

## Latest Checkpoint - 2026-07-13

- Voice remains on the approved original sales behavior prompt. Do not rewrite that core behavior prompt.
- Text chatbot uses the same approved behavior prompt plus text-only sales guardrails that make it proactive instead of FAQ-like.
- Text chatbot default model is `gpt-5-mini`.
- Text-chat OpenAI request builder is GPT-5-compatible:
  - GPT-5-family models use `max_completion_tokens`.
  - GPT-5-family models omit custom `temperature`.
  - Older configurable chat models still use `temperature` and `max_tokens`.
- Widget chat input no longer waits disabled while `/api/chat/session` loads.
- Widget chat panel now flexes inside the production card so the message area and composer are not floating mid-card.
- Text-chat lead capture no longer requires a known client name if there is a usable contact method plus business need.
- `ready_for_booking` only triggers from strict boolean `true`.
- Latest local verification passed:
  - `npm run typecheck`
  - `npm run verify:source`
  - `npm run hostinger:build`
  - local built text-chat behavior smoke
  - `npm run package:source`
  - `npm run verify:archive`

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

## Deployment Gate Checkpoint - 2026-07-14 14:14 +0700

- Current production readiness goal was marked blocked because Hostinger is still serving the old build, so live production quality cannot be verified yet.
- Live check command:

```bash
curl -sS https://voice.djai.academy/api/session
```

- Latest live response still showed:

```json
"buildVersion":"agent-widget-v2-openai-text-chat-2026-07-13"
```

- Verified local release artifact is:

```text
/home/siamesedev/Documents/codex/DJAI_WebDev_Landing_Page/djai-voice-agent-v1-source.zip
```

- The local ZIP contains:

```ts
export const buildVersion = "voice-behavior-restore-2026-07-14";
```

- `npm run verify:archive` passed for that ZIP.
- Next required action: deploy the exact ZIP above on Hostinger, then rerun the curl check.
- Expected live marker after deploy:

```json
"buildVersion":"voice-behavior-restore-2026-07-14"
```

- Only after that marker is live should the browser voice acceptance be judged:
  - one real English call
  - one real Thai call
  - evaluate warmth, naturalness, interruption behavior, benefit-led selling, objection handling, and lead capture.

## Pricing Copy Cleanup Checkpoint - 2026-07-14 16:23 +0700

- Removed the stray Complete Website/10,000 package savings row that could appear as:
  - `You are thrifty.`
  - `5,000 baht`
- Source changes made:
  - `assets/js/promo.js`: removed English `You save / 5,000 THB` comparison row from Complete Website package.
  - `public/assets/js/promo.js`: removed English `You save / 5,000 THB` and Thai `คุณประหยัด / 5,000 บาท` comparison rows from Complete Website package.
  - `src/lib/knowledge-seed.ts`: removed the Complete Website seed knowledge sentence about the customer saving 5,000 THB.
  - `scripts/migrate.mjs`: removed the same seed sentence and added a targeted `replace(...)` cleanup so existing `settings.knowledge_md` can drop the old sentence when migrations run.
- Verification passed:
  - `node --check assets/js/promo.js`
  - `node --check public/assets/js/promo.js`
  - `node --check scripts/migrate.mjs`
  - `npm run typecheck`
- Migration/deploy not run in this checkpoint.
- Repo had many unrelated pending changes before this cleanup; do not treat the full worktree diff as belonging to this copy fix.

## DJAY Bot SaaS Platform Review Checkpoint - 2026-07-14 16:31 +0700

- Reviewed the completed local FlowBot V1 chatbot and DJAI voice/text agent against the SaaS final-vision bundle.
- Verification passed in this review:
  - root voice/text agent: `npm run typecheck`
  - FlowBot V1: `scripts/use-node24.sh pnpm run verify`
  - FlowBot verification covered type checks, unit tests, production build and secret scan.
- Renamed the umbrella product to `DJAY Bot SaaS Platform` while retaining the three product families and six stable plan keys:
  - FlowBot Basic / Premium
  - AI Chatbot Basic / Premium
  - Voice Agent Basic / Advanced
- Renamed the plan bundle directory:
  - old: `flow-saas-six-plan-final-vision-v3/`
  - new: `djay-bot-saas-platform-final-vision-v3/`
- Updated bundle titles, product statement, metadata, decision register, changelog, migration-document naming and checksum manifest.
- Important integration gaps identified for P0/P1 planning:
  - the current public voice widget/session contract exposes provider/model identifiers and uses provider-specific browser protocols, which conflicts with the target provider-confidentiality boundary;
  - the current voice/text agent remains single-tenant and needs explicit tenant/membership migration into the shared platform domain;
  - FlowBot and voice/text apps use different lead/CRM status vocabularies and require a canonical migration map;
  - the current calendar can create confirmed bookings, while the target plan currently defines appointment requests only; preserve or limit this through an explicit product/Action Gateway decision;
  - production voice acceptance remains blocked until Hostinger serves build marker `voice-behavior-restore-2026-07-14` and real English/Thai calls pass.
- No multi-tenant SaaS implementation was started in this checkpoint. The bundle requires repository audit and ADR approval before broad implementation.

## Platform Master Dashboard Model-Control Decision - 2026-07-14 19:19 +0700

- Locked provider/model visibility and configuration to the internal DJAY Bot SaaS Platform Master Dashboard only.
- Authorized platform roles:
  - Platform Owner
  - explicitly delegated Platform AI Operations
- Explicitly denied:
  - Client Super Admin
  - Client Admin
  - every other tenant role
- Tenant dashboards and APIs may expose only public capability labels such as First-Generation and Second-Generation Voice Engine.
- Provider/model routing changes require reauthentication, validation/evaluation evidence, effective dating, immutable before/after audit and rollback.
- Browser/widget/channel session contracts must be opaque and provider-neutral; selected provider, adapter and model identifiers remain behind the platform gateway.
- Updated the authoritative PRD, architecture, UI/UX, roadmap, risk register, QA plan, security plan, domain model, decision register, implementation guide, provider-routing matrix, README and changelog in `djay-bot-saas-platform-final-vision-v3/`.
- This checkpoint updates the future SaaS specification only. It does not remove the current provider/model controls from the existing single-tenant voice-agent admin application.

## Detailed Multi-Tenant SaaS Implementation Plan - 2026-07-14 19:52 +0700

- Added `djay-bot-saas-platform-final-vision-v3/15-detailed-multi-tenant-implementation-plan.md`:
  - 1,232 lines / 6,580 words;
  - covers platform-vs-tenant roles, self-service registration, identity, tenant provisioning, RLS/isolation, RBAC, six-plan entitlements, shared domain, all three product tracks, Platform Master Dashboard, usage/billing, APIs/events/workers, migration, phase gates, QA, security, observability, rollback and first implementation backlog.
- Locked terminology:
  - Platform Master Admin/Platform Owner is DJAY internal.
  - Tenant Master Admin is the SME subscriber's workspace owner.
- Locked subscriber ownership behavior:
  - the SME creates and verifies the Tenant Master Admin on the public DJAY Bot SaaS site;
  - no platform or tenant dashboard creates merchant passwords;
  - initial release has exactly one active Tenant Master Admin per tenant;
  - ownership transfer is reauthenticated, confirmed, atomic and audited;
  - tenant roles cannot access provider/model routing.
- Reordered delivery so no product plan is sellable before identity, tenant isolation, membership, entitlement and usage foundations pass.
- New high-level sequence:
  - P0 audit/ADRs
  - P1 identity and tenant provisioning
  - P2 isolation/catalog/entitlements
  - P3 shared domain/workspace
  - P4 FlowBot Basic/Premium
  - P5 AI Chatbot Basic
  - P6 AI Chatbot Premium
  - P7 Voice Agent Basic
  - P8 Voice Agent Advanced
  - P9 billing and paid GA
- Added locked decisions D-007 through D-009 and T-019 through T-020.
- Added signup/ownership risks R-032 and R-033.
- Synchronized README/index, vision, PRD, architecture, UI/UX, roadmap, risk, QA, security, domain, decision register, Codex guide, provider-routing matrix, metadata and changelog.
- Verification passed:
  - all bundle SHA-256 manifest entries;
  - Markdown fence balance;
  - `BUNDLE-METADATA.json` parse;
  - no stale `Client Super Admin`, `Client Admin`, `Six-Plan Flow SaaS` or `Flow SaaS` naming in the bundle.
- This checkpoint is planning/documentation only. SaaS implementation has not started; the next authorized implementation action is P0 repository audit and ADR creation.

## DJAY Bot SaaS P0 Completion Checkpoint - 2026-07-14

- Created the separate target workspace `DJAY_Bot_SaaS_Platform/`; SaaS code will not be added inside protected `FlowBot_V1_App/` because its local authority explicitly limits it to the single-tenant deterministic product.
- Completed the six required P0 audit/migration documents:
  - FlowBot inventory;
  - current FlowBot and voice/text architecture;
  - accepted behavior matrix;
  - reuse/refactor/replace matrix;
  - security/data/provider-leak map;
  - legacy-to-platform migration strategy.
- Accepted ADR-001 through ADR-007 covering target runtime/workspace, reuse boundaries, forced RLS/database roles, verified public signup/session/MFA/ownership, canonical realtime events, opaque voice gateway, and canonical lead/appointment semantics.
- ADR-008 remains Proposed only for payment/THB tax invoice/trial/refund/overage decisions and blocks paid P9 launch, not P1 identity work.
- Locked initial stack to Node 24, pnpm 11.12, Turbo, strict TypeScript 5.9.3, pinned Next 16.2.10/React 19.2.7, PostgreSQL 16, Drizzle, Zod, Vitest, and Playwright.
- Locked initial target as a modular monolith with separate public, tenant and platform applications, separate workers, and a separately deployable opaque voice gateway.
- Fresh baseline verification:
  - root voice/text `npm run typecheck`, `npm run verify:source`, and `npm run verify:schema` passed;
  - FlowBot `scripts/use-node24.sh pnpm run verify` passed typecheck, 22 tests, production build, and secret scan;
  - root HTTP no-secrets smoke was not executed because no local app server was available and localhost was denied by the managed environment.
- P1 identity/tenant-provisioning scope is defined in `DJAY_Bot_SaaS_Platform/docs/phases/p1-identity-tenant-provisioning.md`.
- P0 gate is complete. Authorized next work is P1 foundation, database/RLS harness, identity schema, and self-service registration vertical slice. Product migration and paid launch remain gated.

## DJAY Bot SaaS P1 Completion Checkpoint - 2026-07-14

- Completed the separate `DJAY_Bot_SaaS_Platform/` Node 24/pnpm/Turbo workspace with public, tenant, Platform Master, API, and worker applications plus shared security packages.
- Implemented verified public self-registration that atomically creates one SME tenant, exactly one Tenant Master Admin, onboarding state, legal acceptance, audit event, and encrypted notification outbox entry.
- Implemented password login/recovery, session rotation and revocation, tenant workspace selection, recipient-created invitation accounts, tenant MFA, and dual-reauthenticated atomic ownership transfer.
- Implemented a physically/logically separate Platform Master identity realm with its own database role, cookies, sessions, mandatory TOTP, recovery codes, and one-time offline Platform Owner bootstrap.
- Applied PostgreSQL migrations `0000` through `0005` with forced RLS, same-tenant foreign keys, deferred exactly-one-owner enforcement, and NOBYPASSRLS runtime roles.
- Implemented a restricted email worker with encrypted outbox payloads, `SKIP LOCKED` claims, retries/backoff, dead-letter handling, and an HTTP provider adapter.
- Full workspace verification, disposable PostgreSQL integration tests, production HTTP/realm-confusion checks, desktop/mobile Playwright checks, provider-leak scan, and backup/restore drill all passed.
- Added validation evidence and operational runbooks under `DJAY_Bot_SaaS_Platform/docs/validation/` and `docs/runbooks/`.
- Product code migrated: none. Paid plans remain disabled. P2 catalog, subscription, entitlement, and quota work is now authorized.

## DJAY Bot SaaS P2 Completion Checkpoint - 2026-07-15

- Added `@djay/catalog`, `@djay/entitlements`, and `@djay/usage-billing` with the exact six-plan matrix, explicit subscription state policy, immutable entitlement snapshots, quota contracts, payment-provider interface, and timestamped HMAC webhook verification.
- Added migration `0006_catalog_entitlements_usage` for global catalog/billing schemas and forced-RLS tenant subscriptions, overrides, snapshots, quota accounts, reservations, and immutable usage events.
- Published seed plan versions are intentionally non-sellable with nullable price, allowance, and overage values until ADR-008 is accepted.
- Public registration can select one stable plan key; verified provisioning resolves the effective database version and atomically creates a pending subscription, initial no-access snapshot, and quota account.
- Tenant subscription changes are Tenant Master Admin-only and require fresh password reauthentication plus MFA. Tenant Admin and lower roles are denied.
- Platform Master now has commerce counts/subscription visibility; only reauthenticated Platform Owner can perform audited manual pilot activation.
- Signed webhook inbox encrypts raw bodies, detects event-ID payload conflicts, and accepts exact replay idempotently under the worker database role.
- P2 tests passed for six-plan capability denial, one-live-tier enforcement, multi-product coexistence, A/B RLS isolation, activation, quota reserve/settle replay, cross-tenant substitution, webhook replay/tamper, realm confusion, and provider/model DTO leakage.
- Full 15-package lint/typecheck/unit/build verification, PostgreSQL integration, production HTTP checks, and desktop/mobile Chromium checks passed.
- Product code migrated: none. P3 shared customer/conversation domain is authorized; paid checkout remains blocked on ADR-008 and exact commercial/legal decisions.
