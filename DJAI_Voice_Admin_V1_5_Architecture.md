# DJAI Voice Agent Admin V1.5 Architecture

**Project:** Multi-admin, post-call intelligence, and appointment booking upgrade  
**Version:** 1.5 final plan  
**Date:** 13 July 2026  
**Status:** Architecture updated with corrected calendar/booking-link model

---

## 1. Architecture Summary

V1.5 keeps the existing live voice architecture intact and adds three operational layers:

1. Post-call text intelligence.
2. Multi-admin account and permission system.
3. Native calendar, availability, booking-link, and appointment module.

The live call path remains:

```text
Browser widget
  -> POST /api/session
  -> OpenAI Realtime or Gemini Live
  -> POST /api/lead
  -> POST /api/conversation
```

The post-call path starts after transcript save:

```text
POST /api/conversation
  -> save transcript
  -> run analyzer with gpt-4o-mini
  -> store conversation intelligence
  -> update/create structured lead
```

The appointment path starts after a qualified lead agrees to consultation:

```text
Voice agent captures lead
  -> widget shows booking CTA
  -> /book/[booking-link-slug]?context=...
  -> visitor selects available slot
  -> POST /api/booking/appointments
  -> appointment pending confirmation
  -> admin confirms/rejects
```

No audio passes through the DJAI server. The OpenAI/Gemini API keys never reach the browser. Calendar availability is native to this app in V1.5; there is no Google/Outlook OAuth sync yet.

---

## 2. Core Boundaries

### Live Voice Boundary

Keep unchanged:

- Settings and knowledge are read from in-process cache at session creation.
- Knowledge is injected once per voice session.
- Browser connects directly to OpenAI/Gemini.
- The only live-call tool remains lead capture unless a separate booking tool is explicitly approved later.

The voice agent should not book a time directly in this version. It should collect contact details and trigger the widget booking CTA.

### Post-Call Boundary

The analyzer receives:

- Transcript.
- Existing lead/tool data.
- Basic metadata.

The analyzer must not receive:

- Full voice system prompt.
- Full knowledge document unless later required.
- Admin notes.

### Appointment Boundary

V1.5 appointment scheduling is native and simple:

- Admin calendar profile.
- Booking links / meeting types.
- Weekly availability.
- Blocked times.
- Internal appointments.
- No external calendar sync.
- No reminder automation.
- No payments.

---

## 3. Roles And Permissions

### Role Values

```text
master_admin
admin
```

### Permission Matrix

| Capability | Master admin | Normal admin |
|---|---:|---:|
| View all conversations | Yes | No, scoped |
| View assigned conversations | Yes | Yes |
| Soft-delete conversations | Yes | No |
| View all leads | Yes | No, scoped |
| Edit assigned leads | Yes | Yes |
| Reassign leads | Yes | No |
| View all appointments | Yes | No |
| View own appointments | Yes | Yes |
| Confirm/reject own appointment | Yes | Yes |
| Confirm/reject any appointment | Yes | No |
| Reassign appointments | Yes | No |
| View all calendars | Yes | No |
| Edit own availability | Yes | Yes, if allowed |
| Edit any availability | Yes | No |
| Create admin | Yes | No |
| Edit/delete admin | Yes | No |
| Set active AI booking link | Yes | No |
| Edit global voice settings | Yes | No |
| Edit knowledge document | Yes | No |
| Export all records | Yes | No |

### Server-Side Enforcement

All permissions must be enforced in server actions/API routes, not only hidden in UI.

Normal admin queries must always include scoping by:

- `assigned_admin_id`
- or appointment ownership
- or lead ownership
- or conversation linked through assigned lead/appointment

---

## 4. Database Changes

Use additive migrations. Keep old columns until compatibility risk is gone.

### `admin_users`

```sql
create table admin_users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  username text unique not null,
  email text unique,
  password_hash text not null,
  role text not null default 'admin',
  is_active boolean not null default true,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

Allowed roles:

```text
master_admin
admin
```

Soft delete:

- Set `deleted_at`.
- Set `is_active=false`.
- Do not remove historical references.

Bootstrap:

- Existing env-based hardcoded admin becomes the first `master_admin`.
- Migration/seed should create it if no `admin_users` row exists.

### `settings`

Existing settings remain. Add:

```sql
analysis_enabled boolean default true,
analysis_model_id text default 'gpt-4o-mini',
booking_enabled boolean default true,
active_booking_admin_id uuid references admin_users(id),
active_booking_link_id uuid,
default_timezone text default 'Asia/Bangkok',
require_booking_confirmation boolean default true,
default_booking_window_days int default 30
```

`active_booking_admin_id` is legacy compatibility. The corrected V1.5 rebuild should use `active_booking_link_id` as the source of truth for the voice widget booking CTA. During migration, if `active_booking_link_id` is null and `active_booking_admin_id` exists, create/select that admin's default consultation booking link.

Optional later:

```sql
analysis_provider text default 'openai'
```

### `conversations`

Existing conversation fields remain. Add/confirm:

```sql
summary text,
business_type text,
main_problem text,
business_goal text,
interest_level text default 'unknown',
concern_or_objection text,
recommended_service text,
next_action text,
analysis_status text default 'pending',
analysis_error text,
analysis_model_id text,
analysis_updated_at timestamptz,
starred boolean default false,
deleted_at timestamptz
```

Optional assignment:

```sql
assigned_admin_id uuid references admin_users(id)
```

Accepted `interest_level`:

```text
low
medium
high
unknown
```

Accepted `analysis_status`:

```text
pending
completed
failed
skipped
```

### `leads`

Existing lead fields remain. Add/confirm:

```sql
client_name text,
company_name text,
phone text,
email text,
line_id text,
whatsapp text,
other_contact text,
preferred_contact_method text,
preferred_meeting_day text,
preferred_meeting_time text,
admin_notes text,
assigned_admin_id uuid references admin_users(id),
updated_at timestamptz default now()
```

Accepted lead statuses:

```text
pending_follow_up
appointment_set
follow_up_later
deal_closed
no_deal
```

Migration mapping:

```text
new -> pending_follow_up
contacted -> follow_up_later
closed -> deal_closed
```

### `admin_calendar_profiles`

Calendar profile stores the admin's calendar identity and broad permission settings. It should not own meeting duration or public booking URL by itself. Those belong to booking links.

```sql
create table admin_calendar_profiles (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references admin_users(id),
  display_name text not null,
  timezone text not null default 'Asia/Bangkok',
  default_meeting_location text,
  is_active boolean not null default true,
  allow_admin_self_edit boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Backward compatibility: existing columns such as `booking_slug`, `meeting_title`, `default_duration_minutes`, buffers, notice, and booking window may remain temporarily but new code should read these from `booking_links`.

### `availability_rules`

Weekly recurring availability.

```sql
create table availability_rules (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references admin_users(id),
  weekday int not null,
  start_time time not null,
  end_time time not null,
  timezone text not null default 'Asia/Bangkok',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

`weekday` values:

```text
0 Sunday
1 Monday
...
6 Saturday
```

### `availability_overrides`

Blocked time and date-specific availability.

```sql
create table availability_overrides (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references admin_users(id),
  override_type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_by_admin_id uuid references admin_users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Accepted `override_type`:

```text
blocked
extra_available
```

### `booking_links`

Booking links are the central scheduling object. They define a public booking URL, meeting duration, owner admin, customer-facing copy, and booking rules. One booking link can be selected as the active AI booking link.

```sql
create table booking_links (
  id uuid primary key default gen_random_uuid(),
  owner_admin_id uuid not null references admin_users(id),
  name text not null,
  slug text unique not null,
  title text not null,
  description text,
  meeting_location text,
  duration_minutes int not null,
  buffer_before_minutes int not null default 0,
  buffer_after_minutes int not null default 0,
  minimum_notice_minutes int not null default 240,
  max_bookings_per_day int,
  booking_window_days int not null default 30,
  require_confirmation boolean not null default true,
  is_active boolean not null default true,
  is_ai_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Constraints:

- `duration_minutes` should be between 10 and 240.
- `slug` should be URL-safe and unique.
- At most one link should be AI active. This can be enforced in application code in V1.5 if partial unique indexes are not used.
- Master admin can create/edit links for any admin.
- Normal admin can create/edit own links only if allowed by settings/profile.

### `meeting_types`

Legacy compatibility table. Existing appointments can continue referencing it, but booking-link ID should become the preferred relationship for new appointments.

```sql
create table meeting_types (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  duration_minutes int not null default 30,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### `appointments`

```sql
create table appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references leads(id),
  conversation_id uuid references conversations(id),
  assigned_admin_id uuid references admin_users(id),
  assigned_admin_name_snapshot text,
  meeting_type_id uuid references meeting_types(id),
  booking_link_id uuid references booking_links(id),
  status text not null default 'pending_confirmation',
  source text not null default 'voice_agent',
  start_at timestamptz not null,
  end_at timestamptz not null,
  timezone text not null default 'Asia/Bangkok',
  duration_minutes int not null,
  client_name text not null,
  company_name text,
  email text not null,
  phone text,
  line_id text,
  whatsapp text,
  note text,
  meeting_location text,
  admin_notes text,
  confirmed_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  completed_at timestamptz,
  no_show_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
```

Accepted appointment statuses:

```text
pending_confirmation
confirmed
rejected
cancelled
completed
no_show
```

Accepted appointment sources:

```text
voice_agent
manual
public_booking
```

### Optional Audit Table

Recommended if time allows:

```sql
create table admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_admin_id uuid references admin_users(id),
  action text not null,
  target_type text not null,
  target_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
```

If not implemented immediately, core tables should still include enough timestamps to debug operations.

---

## 5. Slot Calculation

Availability is computed server-side only.

Input:

- Calendar profile.
- Booking link.
- Weekly availability rules.
- Availability overrides.
- Existing appointments.
- Requested date range.

Algorithm:

1. Resolve booking link by slug and confirm it is active.
2. Resolve owner admin and calendar profile.
3. Resolve timezone from calendar profile.
4. Generate candidate time windows from weekly rules.
5. Add `extra_available` overrides.
6. Remove `blocked` overrides.
7. Remove existing non-rejected/non-cancelled appointment windows.
8. Apply booking-link buffer before/after.
9. Apply booking-link minimum notice.
10. Apply booking-link booking window.
11. Apply booking-link max bookings per day.
12. Return slots in timezone-aware ISO format.

Appointment statuses that block time:

```text
pending_confirmation
confirmed
completed
no_show
```

Appointment statuses that do not block future booking:

```text
rejected
cancelled
```

Before creating, rescheduling, or reassigning an appointment, repeat conflict and availability checks server-side. Never trust slots generated earlier by the browser.

Reschedule rules:

- The new time must fit the assigned admin's weekly availability or extra availability.
- The new time must not overlap blocked time.
- The new time must not overlap blocking appointment statuses.
- The new time must respect the booking link duration/rules unless the admin explicitly uses a manual override flow.

Reassign rules:

- The target admin must be active.
- The target admin must have an active calendar profile.
- The appointment time must fit the target admin's availability unless the master admin explicitly confirms a manual override.
- The target admin must not have a conflict.

---

## 6. Public APIs And Server Actions

Prefer server actions for admin forms. Use public API routes for widget/booking flows.

### Public Existing APIs

```text
POST /api/session
POST /api/lead
POST /api/conversation
```

Update `/api/lead`:

- Keep current capture behavior.
- Return lead ID and safe booking context if lead capture succeeds.
- Do not expose sensitive admin data.

Update `/api/conversation`:

- Save transcript.
- Run analyzer if enabled.
- Link/update leads.
- Never fail transcript save because analyzer fails.

### Public Booking APIs

```text
GET /api/booking/slots?slug=...&from=...&to=...
POST /api/booking/appointments
```

`GET /api/booking/slots`:

- Public.
- Rate-limited.
- Returns available slots for the booking link slug.
- Does not expose internal notes or private admin data.

`POST /api/booking/appointments`:

- Public.
- Rate-limited.
- Validates booking link slug, slot, required fields.
- Validates signed lead/conversation context when present.
- Rechecks conflicts server-side.
- Creates appointment as `pending_confirmation`.
- Links lead/conversation when valid.
- Updates lead status toward appointment workflow.

### Admin Auth Actions

```text
loginAction
logoutAction
changeOwnPasswordAction
```

Session should store:

```json
{
  "adminUserId": "uuid",
  "role": "master_admin|admin",
  "name": "string"
}
```

### Master Admin Team Actions

```text
createAdminUserAction
updateAdminUserAction
resetAdminPasswordAction
deactivateAdminUserAction
deleteAdminUserAction
setActiveAiBookingLinkAction
```

`deleteAdminUserAction` must:

- Reject deleting self.
- Reject deleting/downgrading last master admin.
- Soft-delete only.
- Reassign/cancel/leave future appointments based on explicit master-admin choice.
- Replace or disable active AI booking link if needed.

### Booking Link Actions

```text
createBookingLinkAction
updateBookingLinkAction
deleteBookingLinkAction
setActiveAiBookingLinkAction
toggleBookingLinkActiveAction
```

Rules:

- Master admin can manage all links.
- Normal admin can manage own links only if allowed.
- Deleting a booking link should be soft delete or inactive in V1.5; do not break historical appointments.
- Setting active AI booking link must clear previous active link.
- Voice widget booking CTA uses active AI booking link only.

### Appointment Actions

```text
confirmAppointmentAction
rejectAppointmentAction
cancelAppointmentAction
rescheduleAppointmentAction
reassignAppointmentAction
markAppointmentCompletedAction
markAppointmentNoShowAction
updateAppointmentNotesAction
```

Add:

```text
validateAppointmentAvailabilityForAction
```

This helper must be called by public booking, reschedule, and reassign flows.

Normal admin action scope:

- Only appointments where `assigned_admin_id=session.adminUserId`.

Master admin action scope:

- Any appointment.

### Availability Actions

```text
updateCalendarProfileAction
updateWeeklyAvailabilityAction
createAvailabilityOverrideAction
deleteAvailabilityOverrideAction
previewAvailabilitySlotsAction or GET /api/admin/calendar/preview-slots
```

Normal admin scope:

- Own calendar only.
- Only fields allowed by profile/settings.
- Respect `allow_admin_self_edit` for profile, weekly availability, blocked time, and extra availability.

Master admin scope:

- Any admin calendar.

### Existing Admin Actions To Keep

```text
updateConversationIntelligenceAction
deleteConversationAction
toggleConversationStarAction
regenerateConversationAnalysisAction
updateLeadAction
```

Update scoping:

- Master admin: all records.
- Normal admin: assigned/linked records only.

### Export Routes

```text
GET /api/admin/export/conversations.csv
GET /api/admin/export/leads.csv
GET /api/admin/export/appointments.csv
```

Export scope:

- Master admin: all filtered records.
- Normal admin: scoped filtered records.

CSV values must be escaped against spreadsheet formula injection.

---

## 7. Analyzer Contract

### Input

```json
{
  "conversation_id": "uuid",
  "page_url": "string",
  "language": "th|en|mixed|unknown",
  "transcript": [
    { "role": "user|assistant|tool|system", "text": "string", "t": 123 }
  ],
  "existing_leads": [
    {
      "name": "string",
      "contact": "string",
      "contact_type": "phone|line|email|other",
      "need": "string",
      "preferred_time": "string"
    }
  ]
}
```

### Output

```json
{
  "has_lead": true,
  "client": {
    "client_name": "",
    "company_name": "",
    "phone": "",
    "email": "",
    "line_id": "",
    "whatsapp": "",
    "other_contact": "",
    "preferred_contact_method": "",
    "preferred_meeting_day": "",
    "preferred_meeting_time": ""
  },
  "conversation": {
    "summary": "",
    "business_type": "",
    "main_problem": "",
    "business_goal": "",
    "interest_level": "low|medium|high|unknown",
    "concern_or_objection": "",
    "recommended_service": "",
    "next_action": ""
  }
}
```

Rules:

- Strict JSON only.
- Validate all fields server-side.
- Clamp field lengths.
- Do not invent contact details.
- Leave uncertain values blank.
- Admin notes are never overwritten.

---

## 8. Frontend Structure

Recommended route structure:

```text
src/app/admin/page.tsx
src/app/admin/inbox/page.tsx
src/app/admin/inbox/voice/page.tsx
src/app/admin/leads/page.tsx
src/app/admin/calendar/page.tsx
src/app/admin/calendar/setup/page.tsx
src/app/admin/calendar/availability/page.tsx
src/app/admin/calendar/links/page.tsx
src/app/admin/appointments/page.tsx (compatibility redirect or secondary list)
src/app/admin/team/page.tsx
src/app/admin/settings/page.tsx
src/app/book/[slug]/page.tsx
```

Recommended admin components:

```text
AdminNav
RoleGate
CalendarTimeGrid
CalendarEventBlock
CalendarToolbar
AppointmentDetailDrawer
AvailabilityEditor
WeeklyHoursEditor
BlockedTimeEditor
BookingLinkForm
BookingLinksTable
TeamTable
AdminUserForm
DeleteAdminDialog
BookingSlotPicker
```

Calendar UI requirements:

- Use a Google Calendar-like time grid.
- Week view is required.
- Day view is optional but recommended.
- Month view is optional if implementation time allows; list view can remain secondary.
- The grid must have fixed time rows and day columns.
- Appointment blocks must be positioned by start/end time.
- Blocked time must appear as muted blocks.
- Clicking an event opens a side panel, not an inline row form.
- Header must include Today, previous, next, date range, view switcher, admin filter for master, and create/block/link actions.
- Empty setup state must route to setup flow instead of showing a blank calendar.

Master UI reference:

- `Master_admin_V1.5_UIUX.md`

Normal admin UI reference:

- `Normal_Admin_UIUX.md`

---

## 9. Security

### Passwords

- Store password hashes only.
- Never store plaintext passwords.
- Use a slow password hash available in the current stack.
- If adding a dependency for password hashing is needed, ask before adding it.

### Sessions

- Existing cookie session should move from env-only admin to database-backed admin users.
- Cookie must include admin user ID and role.
- Refresh role/status from DB on protected admin requests or invalidate session when user is inactive/deleted.

### Public Booking

- Rate-limit slot and booking endpoints.
- Validate all public inputs.
- Signed lead/conversation context should expire.
- Never expose admin emails unless intentionally used as display contact.
- Do not expose internal notes.

### Role Enforcement

- UI hiding is not enough.
- Every server action/API must check role and record scope.

### Data Preservation

- Use soft delete for admins and conversations.
- Preserve historical appointment ownership with `assigned_admin_name_snapshot`.

---

## 10. Migration Plan

1. Add `admin_users`.
2. Seed first master admin from existing env credentials when table is empty.
3. Add settings columns for booking and active AI booking link.
4. Add/confirm post-call intelligence columns.
5. Add structured lead columns and assignment.
6. Migrate lead statuses.
7. Add calendar profile, booking links, availability, meeting type compatibility, and appointment tables.
8. Seed default consultation booking link for first master admin when appropriate.
9. Create calendar profile for first master admin.
10. Point `active_booking_link_id` to the default link if booking is enabled.
11. Update auth to use DB admin users.
12. Add admin role scoping.

Backward compatibility:

- Existing env admin can remain as emergency fallback only during migration if needed.
- Remove fallback after DB login is verified.

---

## 11. Reliability And Cost

Post-call analysis:

- Timeout around 15 seconds.
- Mark failed on error.
- Allow manual regenerate.
- Use `gpt-4o-mini`.
- Send transcript and lead data only.

Booking:

- Recheck conflicts on submission.
- Handle no-slot state.
- Handle disabled booking.
- Handle active booking link missing/no availability.

No queues/workers in this version:

- Analysis can run synchronously after transcript save.
- If latency becomes a problem, worker/queue is a V2 trigger.

---

## 12. Verification Plan

### Build Checks

- `npm run verify:source`
- `npm run typecheck`
- `npm run hostinger:build`
- `npm run verify:archive`

### Auth Checks

- Existing master admin can log in.
- Master admin can create normal admin.
- Normal admin can log in.
- Normal admin cannot access Team.
- Normal admin cannot access master-only server actions.
- Deleted/deactivated admin cannot log in.

### Appointment Checks

- Master admin can create booking link.
- Master admin can set active AI booking link.
- Admin can set weekly availability.
- Admin can block time.
- Booking page shows only available slots.
- Booking submission creates pending appointment.
- Double booking is blocked.
- Reschedule into unavailable time is blocked unless explicit manual override is implemented.
- Reassign into unavailable/conflicting admin is blocked unless explicit manual override is implemented.
- Admin can confirm/reject.
- Lead/conversation/appointment links display correctly.

### Role Checks

- Master admin sees all calendars in real week calendar grid.
- Normal admin sees only their own calendar.
- Master admin can reassign appointment.
- Normal admin cannot reassign appointment.
- Master admin can delete admin with required guardrails.

### Voice Flow Checks

- Voice agent still captures lead.
- Widget shows booking CTA after lead capture.
- Booking CTA uses signed context.
- Voice behavior prompt remains unchanged unless explicitly approved.

### Regression Checks

- OpenAI provider still works.
- Gemini provider remains optional.
- Transcript saving still works.
- Post-call analysis failure does not block transcript save.
- CSV exports still escape risky values.
