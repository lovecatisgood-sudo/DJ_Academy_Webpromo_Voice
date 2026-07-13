# DJAI Voice Agent Admin V1.5 Architecture

**Project:** Multi-admin, post-call intelligence, and appointment booking upgrade  
**Version:** 1.5 final plan  
**Date:** 13 July 2026  
**Status:** Architecture plan for implementation

---

## 1. Architecture Summary

V1.5 keeps the existing live voice architecture intact and adds three operational layers:

1. Post-call text intelligence.
2. Multi-admin account and permission system.
3. Native appointment/availability/booking module.

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
  -> /book/[slug]?context=...
  -> visitor selects available slot
  -> POST /api/bookings
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
| Set active booking admin | Yes | No |
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
default_timezone text default 'Asia/Bangkok',
require_booking_confirmation boolean default true,
default_booking_window_days int default 30
```

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

```sql
create table admin_calendar_profiles (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references admin_users(id),
  display_name text not null,
  booking_slug text unique not null,
  timezone text not null default 'Asia/Bangkok',
  meeting_title text not null default 'DJAI Consultation',
  meeting_location text,
  default_duration_minutes int not null default 30,
  buffer_before_minutes int not null default 0,
  buffer_after_minutes int not null default 0,
  minimum_notice_minutes int not null default 240,
  max_bookings_per_day int,
  booking_window_days int not null default 30,
  is_active boolean not null default true,
  allow_admin_self_edit boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

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

### `meeting_types`

Start with one default meeting type.

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
- Weekly availability rules.
- Availability overrides.
- Existing appointments.
- Requested date range.

Algorithm:

1. Resolve timezone.
2. Generate candidate time windows from weekly rules.
3. Add `extra_available` overrides.
4. Remove `blocked` overrides.
5. Remove existing non-rejected/non-cancelled appointment windows.
6. Apply buffer before/after.
7. Apply minimum notice.
8. Apply booking window.
9. Apply max bookings per day.
10. Return slots in timezone-aware ISO format.

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

Before creating an appointment, repeat conflict checks inside the booking transaction/action. Never trust slots generated earlier by the browser.

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
- Returns available slots for the booking slug.
- Does not expose internal notes or private admin data.

`POST /api/booking/appointments`:

- Public.
- Rate-limited.
- Validates booking slug, slot, required fields.
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
setActiveBookingAdminAction
```

`deleteAdminUserAction` must:

- Reject deleting self.
- Reject deleting/downgrading last master admin.
- Soft-delete only.
- Reassign/cancel/leave future appointments based on explicit master-admin choice.
- Replace or disable active booking admin if needed.

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
```

Normal admin scope:

- Own calendar only.
- Only fields allowed by profile/settings.

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
src/app/admin/conversations/page.tsx
src/app/admin/conversations/[id]/page.tsx
src/app/admin/leads/page.tsx
src/app/admin/appointments/page.tsx
src/app/admin/team/page.tsx
src/app/admin/settings/page.tsx
src/app/book/[slug]/page.tsx
```

Recommended admin components:

```text
AdminNav
RoleGate
AppointmentList
AppointmentCalendar
AppointmentDetailDrawer
AvailabilityEditor
TeamTable
AdminUserForm
DeleteAdminDialog
BookingSlotPicker
```

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
3. Add settings columns for booking and active booking admin.
4. Add/confirm post-call intelligence columns.
5. Add structured lead columns and assignment.
6. Migrate lead statuses.
7. Add calendar profile, availability, meeting type, and appointment tables.
8. Seed default meeting type.
9. Create calendar profile for first master admin.
10. Point `active_booking_admin_id` to first master admin if booking is enabled.
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
- Handle active admin missing/no availability.

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

- Master admin can set active booking admin.
- Admin can set weekly availability.
- Admin can block time.
- Booking page shows only available slots.
- Booking submission creates pending appointment.
- Double booking is blocked.
- Admin can confirm/reject.
- Lead/conversation/appointment links display correctly.

### Role Checks

- Master admin sees all calendars.
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
