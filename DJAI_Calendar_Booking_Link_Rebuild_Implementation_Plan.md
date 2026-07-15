# DJAI Calendar And Booking Link Rebuild Implementation Plan

**Project:** DJAI Voice Agent Admin Calendar Rebuild
**Version:** V1.5 calendar correction plan
**Date:** 13 July 2026
**Status:** Implemented locally; pending final release packaging and live acceptance

## Implementation Status Update - 13 July 2026

Completed locally:

- Added `booking_links` schema and `settings.active_booking_link_id`.
- Backfilled the existing calendar profile into a booking link.
- Rebuilt booking slot generation around booking links.
- Updated voice lead booking CTA to use the active AI booking link.
- Updated public `/book/[slug]` and booking appointment creation to resolve `booking_links.slug`.
- Added `/admin/calendar/setup` setup-first workflow.
- Added `/admin/calendar/links` booking-link management.
- Added `/admin/calendar/availability` weekly hours, overrides, and slot preview.
- Added `/admin/calendar` real week time-grid dashboard with appointment blocks and blocked-time blocks.
- Moved primary navigation from Appointments to Calendar.
- Kept `/admin/appointments` as a compatibility route.
- Updated Team/Settings/Overview to stop treating active booking admin as the primary AI booking target.

Verification completed after implementation:

- `npm run typecheck`
- `npm run verify:source`
- `npm run verify:schema`
- `npm run verify:live-schema`
- `npm run next:build`

Remaining before deployment:

- Run full Hostinger build/package verification.
- Run authenticated UI smoke after build.
- Run live booking acceptance on deployment.

---

## 1. Goal

Rebuild the appointment/calendar feature so it matches the intended product:

- Calendar starts with setup when it has not been configured.
- Admins can define weekly availability and blocked time.
- Admins can create meeting booking links with duration and booking rules.
- Master admin can select one booking link for the AI voice agent to use.
- The admin calendar looks and behaves like a real calendar, similar in clarity to Google Calendar.
- The public booking flow is date-first, time-second, details-third.
- Booking, reschedule, and reassign flows validate availability and conflicts server-side.

This plan corrects the current implementation, which has useful primitives but is not product-complete.

---

## 2. Non-Negotiable Rules

- Do not change the approved voice-agent behavior prompt.
- Do not add Google Calendar or Outlook sync in this version.
- Do not add email reminders, SMS, LINE notifications, queues, workers, payments, or multi-tenancy.
- Do not add dependencies without asking.
- The calendar must not be another table view. Week view must be a real time-grid calendar.
- Public booking must use booking links, not raw admin calendar slugs.
- The AI booking CTA must use only the active AI booking link.
- Server-side validation must enforce availability, conflicts, role scope, and active-link rules.
- Normal admin permissions must be enforced server-side, not only hidden in UI.

---

## 3. Correct Product Model

### Calendar Profile

One per admin.

Purpose:

- Who the calendar belongs to.
- Display name.
- Timezone.
- Default location/link.
- Whether the admin can edit their own availability.

The calendar profile does not define the public booking URL or meeting duration.

### Availability

Belongs to admin.

Includes:

- Weekly availability.
- Blocked time.
- Extra available time.

Availability decides when the admin is open.

### Booking Link

Belongs to admin.

This is the central booking product object.

Includes:

- Public URL slug.
- Internal link name.
- Meeting title.
- Duration.
- Location/link.
- Booking window.
- Minimum notice.
- Buffer before/after.
- Max bookings per day.
- Confirmation rule.
- Active/inactive.

The AI voice agent uses exactly one active AI booking link selected by master admin.

### Appointment

Created from:

- Voice-agent booking link.
- Public booking link.
- Manual admin action later, if implemented.

Appointments are linked to:

- Booking link.
- Admin.
- Lead, when available.
- Conversation, when available.

---

## 4. Target Routes

### Admin

```text
/admin/calendar
/admin/calendar/setup
/admin/calendar/availability
/admin/calendar/links
/admin/appointments
```

Route behavior:

- `/admin/calendar` is the main calendar dashboard.
- `/admin/calendar/setup` appears when calendar setup is incomplete.
- `/admin/calendar/availability` manages weekly hours, blocked time, extra availability, and preview.
- `/admin/calendar/links` manages booking links.
- `/admin/appointments` can remain as compatibility route or secondary list view, but it should not be the main calendar product.

### Public

```text
/book/[slug]
```

Public route resolves `slug` against `booking_links.slug`.

---

## 5. Target User Flow

### Flow 1: First-Time Calendar Setup

Trigger:

- Admin opens Calendar.
- No calendar profile exists, or no weekly availability exists, or no booking link exists.

Screen:

- Setup checklist with progress:
  1. Calendar profile
  2. Weekly availability
  3. Blocked time, optional
  4. Booking link
  5. AI booking link selection, master only

Steps:

1. Create calendar profile:
   - display name
   - timezone, default Asia/Bangkok
   - default location/link
2. Set weekly availability:
   - day on/off toggles
   - one or more time ranges per day
   - copy weekday schedule action
3. Add blocked time:
   - full day
   - specific time range
   - optional reason
4. Create booking link:
   - owner admin
   - link name
   - slug
   - title
   - duration preset or custom minutes
   - location/link
   - booking window
   - minimum notice
   - buffer before/after
   - max bookings per day
   - require confirmation
5. Master admin selects active AI booking link.
6. Redirect to `/admin/calendar`.

Exit criteria:

- Calendar profile exists.
- At least one weekly availability rule or extra availability exists.
- At least one active booking link exists.
- If booking is enabled, an active AI booking link exists.

### Flow 2: Master Admin Manages Calendar

1. Master opens Calendar.
2. Default view is current week.
3. Header shows:
   - Today
   - previous/next
   - current date range
   - view switcher
   - all-admin/admin filter
   - active AI booking link status
   - Create booking link
   - Block time
4. Calendar shows a real time grid:
   - days as columns
   - hours as rows
   - appointment blocks positioned by start/end
   - blocked-time blocks
5. Click event opens right detail panel.
6. Master can confirm, reject, reassign, reschedule, cancel, complete, no-show, and add notes.

### Flow 3: Normal Admin Manages Own Calendar

1. Normal admin opens Calendar.
2. Sees own week calendar only.
3. Can confirm/reject own appointments.
4. Can edit own availability only if allowed.
5. Cannot see all-admin filter.
6. Cannot set active AI booking link.

### Flow 4: Booking Link Creation

1. Admin opens Calendar Links.
2. Clicks Create booking link.
3. Enters:
   - link name
   - slug
   - title
   - duration
   - location
   - booking rules
4. Saves.
5. Link appears in list with:
   - public URL
   - owner admin
   - duration
   - active status
   - AI active badge if selected
   - upcoming appointments count
6. Master can click Set as AI booking link.

### Flow 5: Voice Agent Booking Handoff

1. Visitor agrees to consultation.
2. AI captures lead details.
3. `/api/lead` writes lead.
4. Backend checks:
   - booking enabled
   - active AI booking link exists
   - owner admin active
   - calendar profile active
   - available slots exist
5. Widget shows booking CTA.
6. Visitor opens `/book/[slug]?context=...`.
7. Booking page pre-fills known details.
8. Visitor selects date.
9. Visitor selects time.
10. Visitor confirms details.
11. Appointment created as pending confirmation.
12. Admin confirms or rejects.

### Flow 6: Public Booking

Page layout:

- Left panel:
  - meeting title
  - duration
  - host display name
  - location/link if relevant
- Main panel:
  1. date picker
  2. time slots for selected date
  3. customer details form

Rules:

- Name and email required.
- Phone, LINE, WhatsApp, company, note optional.
- Empty dates disabled.
- Unavailable selected slot rejected server-side.
- Success page says appointment requested and pending confirmation.

---

## 6. Calendar UI Design Requirements

The main calendar must look like a calendar.

Minimum V1.5 rebuild:

- Week view.
- Time column on the left.
- Seven day columns.
- Hour rows from configurable display range, default 08:00-20:00.
- Event blocks positioned by start/end time.
- Current day highlighted.
- Today button.
- Previous/next week buttons.
- Date range title.
- Admin filter for master admin.
- Detail side panel when event is selected.

Event colors:

- Pending confirmation: amber.
- Confirmed: cyan/blue.
- Completed: green.
- No-show: red.
- Cancelled/rejected: muted grey.
- Blocked time: grey/striped.
- Extra available time preview: light green or outline.

Calendar density:

- No large hero sections.
- No cards inside cards.
- No long inline row forms in the calendar grid.
- Actions live in the detail side panel.

Mobile behavior:

- Week view can collapse to day selector plus one-day time grid.
- Event detail panel becomes full-screen drawer or stacked panel.

---

## 7. Data Model Changes

### Add `booking_links`

Fields:

- `id`
- `owner_admin_id`
- `name`
- `slug`
- `title`
- `description`
- `meeting_location`
- `duration_minutes`
- `buffer_before_minutes`
- `buffer_after_minutes`
- `minimum_notice_minutes`
- `max_bookings_per_day`
- `booking_window_days`
- `require_confirmation`
- `is_active`
- `is_ai_active`
- `created_at`
- `updated_at`
- optional `deleted_at`

### Add Settings Field

- `active_booking_link_id`

Keep `active_booking_admin_id` temporarily for compatibility only.

### Update `appointments`

Add:

- `booking_link_id`

Keep `meeting_type_id` for compatibility.

### Migration Rules

1. Add new columns/tables idempotently.
2. For each existing calendar profile with a booking slug, create a default booking link.
3. If `settings.active_booking_admin_id` exists, select that admin's default booking link as `active_booking_link_id`.
4. Set exactly one `booking_links.is_ai_active = true`.
5. New booking code must use booking links.

---

## 8. Backend Rules

### Slot Calculation

Inputs:

- booking link
- owner admin
- calendar profile
- weekly rules
- overrides
- appointments

Validation:

- booking link active
- owner admin active
- profile active
- requested date within booking window
- start time after minimum notice
- slot fits weekly availability or extra availability
- slot does not overlap blocked time
- slot does not overlap existing blocking appointments
- max bookings per day not exceeded
- buffer before/after respected

### Public Booking

`GET /api/booking/slots`

- Resolves slug to booking link.
- Returns grouped available dates and slots.
- Does not expose internal admin data.

`POST /api/booking/appointments`

- Resolves slug to booking link.
- Rechecks selected slot server-side.
- Creates appointment with `booking_link_id`.
- Assigns appointment to booking link owner.
- Links lead/conversation when signed context is valid.
- Applies `pending_confirmation` unless link is configured otherwise.

### Admin Reschedule

Must validate:

- appointment access
- target time valid
- assigned admin availability
- blocked time
- conflicts
- booking-link duration/rules when appointment has booking link

### Admin Reassign

Must validate:

- master admin only
- target admin active
- target admin calendar profile active
- current appointment time fits target admin availability
- no target admin conflict

If manual override is later allowed, it must be explicit and visible. Do not silently reassign into invalid time.

---

## 9. Implementation Phases

### Phase 0 - Audit And Freeze

Purpose: document current broken calendar behavior and prevent accidental expansion.

Tasks:

- Review current calendar, availability, booking API, widget CTA, and appointment actions.
- Confirm all current route names and data dependencies.
- Run:
  - `npm run typecheck`
  - `npm run verify:source`
  - `npm run verify:schema`
  - `npm run verify:live-schema`
  - `npm run hostinger:build`

Exit criteria:

- Current baseline is known.
- Any pre-existing failures are documented.

### Phase 1 - Schema And Compatibility Migration

Purpose: introduce booking links without breaking existing appointments.

Tasks:

- Add `booking_links`.
- Add `settings.active_booking_link_id`.
- Add `appointments.booking_link_id`.
- Backfill default booking links from existing calendar profiles.
- Backfill active AI booking link from existing active booking admin.
- Update schema verifiers.
- Update types.

Verification:

- Migration runs on current DB.
- Migration runs on fresh DB.
- Exactly one AI active link when booking is enabled and data exists.
- Existing appointments still load.

### Phase 2 - Booking Link Query And Validation Layer

Purpose: create one trusted backend layer for booking logic.

Tasks:

- Replace slug lookup from calendar profile with booking link lookup.
- Create helpers:
  - `getBookingLinkBySlug`
  - `getActiveAiBookingLink`
  - `getCalendarSetupState`
  - `getAvailableSlotsForBookingLink`
  - `validateAppointmentSlot`
  - `validateReassignTarget`
- Move duration, buffers, notice, booking window, and max per day to booking link rules.
- Keep profile timezone/display name.

Verification:

- Active link resolves.
- Inactive link returns unavailable.
- Wrong slug returns 404/empty safely.
- Slot generation uses booking link duration.

### Phase 3 - First-Time Calendar Setup Flow

Purpose: make setup the first-class starting point.

Routes:

- `/admin/calendar/setup`

Tasks:

- Detect incomplete setup.
- Build setup checklist.
- Build calendar profile form.
- Build weekly availability form.
- Build optional blocked time step.
- Build create booking link step.
- Master-only Set as AI booking link step.
- Redirect incomplete admins from `/admin/calendar` to setup or show setup banner.

Verification:

- New admin sees setup flow.
- Existing configured admin goes to calendar dashboard.
- Normal admin cannot set active AI link.
- Master can set active AI link during setup.

### Phase 4 - Booking Links Management

Purpose: give admins a clear place to create and manage booking links.

Route:

- `/admin/calendar/links`

Tasks:

- Booking links list.
- Create link form.
- Edit link form.
- Activate/deactivate link.
- Copy public URL display.
- Master Set as AI booking link.
- Show owner admin.
- Show duration.
- Show upcoming appointments count.
- Show no-availability warning for each link.

Verification:

- Master can create link for any admin.
- Normal admin can create own link if allowed.
- Link slug uniqueness works.
- Setting active AI link clears previous active link.

### Phase 5 - Availability Workspace Rebuild

Purpose: make availability understandable and previewable.

Route:

- `/admin/calendar/availability`

Tabs/sections:

- Weekly hours.
- Blocked time.
- Extra availability.
- Slot preview.

Tasks:

- Day toggles.
- Multiple ranges per day.
- Copy weekday schedule.
- Block full day.
- Block time range.
- Extra available time range.
- Preview slots for selected booking link.
- Enforce `allow_admin_self_edit` for all availability actions.

Verification:

- Weekly hours create slots.
- Blocked time removes slots.
- Extra availability adds slots.
- Locked normal admin cannot edit any availability section.

### Phase 6 - Real Calendar Dashboard

Purpose: replace table-like calendar with real calendar UI.

Route:

- `/admin/calendar`

Tasks:

- Calendar toolbar:
  - Today
  - Previous
  - Next
  - date range
  - week/day/list switch, week required
  - admin filter for master
  - active AI booking link indicator
- Week time-grid:
  - day columns
  - hour rows
  - appointment blocks
  - blocked time blocks
- Right detail panel:
  - appointment details
  - linked lead/conversation
  - contact details
  - notes
  - confirm/reject
  - reschedule
  - reassign, master only
  - cancel
  - complete/no-show
- Mobile fallback:
  - selected day list/time grid

Verification:

- It visually reads as a calendar, not a table.
- Master can view all admins or one admin.
- Normal admin sees only own calendar.
- Clicking event opens detail panel.
- Actions work from panel.

### Phase 7 - Public Booking Page Rebuild

Purpose: make booking customer-friendly.

Route:

- `/book/[slug]`

Tasks:

- Resolve booking link.
- Show meeting info.
- Date picker with available dates.
- Time slots for selected date.
- Customer details form.
- Prefill from signed context.
- Confirmation state.
- Disabled/no availability states.

Verification:

- Inactive link cannot be booked.
- Active link shows dates.
- Date selection narrows times.
- Booking creates pending appointment.
- Double booking rejected.

### Phase 8 - Widget CTA Uses Active AI Booking Link

Purpose: fix AI handoff.

Tasks:

- `/api/lead` returns booking CTA only when:
  - booking enabled
  - active AI booking link exists
  - link owner active
  - calendar profile active
  - at least one future slot exists
- Widget opens active booking link with signed context.
- Remove dependence on `active_booking_admin_id` for new booking CTA logic.

Verification:

- No active AI link means no broken CTA.
- Active AI link CTA opens correct slug.
- Lead details prefill on booking page.

### Phase 9 - Reschedule/Reassign Hardening

Purpose: prevent invalid calendar states.

Tasks:

- Reschedule validates target slot against availability.
- Reassign validates target admin availability and conflicts.
- If invalid, return clear error.
- Do not silently override availability.

Verification:

- Reschedule into blocked time fails.
- Reschedule outside weekly hours fails.
- Reassign to busy admin fails.
- Reassign to available admin succeeds.

### Phase 10 - Route Cleanup And Navigation

Purpose: make Calendar the mental model.

Tasks:

- Nav label becomes Calendar instead of Appointments if approved.
- `/admin/appointments` redirects to `/admin/calendar` or becomes secondary list.
- Keep CSV exports.
- Update Overview links to Calendar.
- Update Inbox/Lead appointment links.

Verification:

- No broken old links.
- User naturally lands in calendar dashboard.

### Phase 11 - Full QA And Release

Checks:

- `npm run typecheck`
- `npm run verify:source`
- `npm run verify:schema`
- `npm run verify:live-schema`
- `npm run hostinger:build`
- `npm run package:source`
- `npm run verify:archive`
- Runtime smoke.

Functional QA:

- Fresh admin setup.
- Master creates booking link.
- Master sets AI active link.
- Normal admin scoped calendar.
- Availability preview.
- Public booking.
- Widget booking CTA.
- Confirm/reject.
- Reschedule validation.
- Reassign validation.
- CSV export.

Exit criteria:

- Calendar is production-usable.
- Calendar looks like a real calendar.
- Booking link flow is functional.
- Active AI booking link controls the voice-agent booking handoff.
- No known critical calendar data-integrity issue remains.

---

## 10. Acceptance Checklist

- New admin sees setup first.
- Admin can create weekly availability.
- Admin can block busy time.
- Admin can create booking link with duration.
- Master can set active AI booking link.
- Calendar week view shows real time grid.
- Calendar appointments are event blocks.
- Blocked time appears on calendar.
- Public booking page uses booking links.
- Public booking page is date-first and time-second.
- Name/email are required.
- Phone/LINE/WhatsApp/company/note are optional.
- Booking creates pending appointment.
- Admin confirms/rejects from detail panel.
- Reschedule respects availability.
- Reassign respects target admin availability.
- Normal admin cannot see all calendars.
- Normal admin cannot set AI active booking link.
- Locked normal admin cannot edit availability.
- Voice widget CTA opens active AI booking link only.
