# DJAI Voice Agent Admin V1.5 Implementation Plan

**Project:** Multi-admin, appointment booking, availability, and sales follow-up workflow  
**Version:** 1.5 final implementation plan  
**Date:** 13 July 2026  
**Status:** Implemented locally on 13 July 2026

---

## Implementation Goal

After this plan is executed, the app should support:

- Database-backed admin users.
- Master admin and normal admin roles.
- Master admin team management.
- Scoped normal admin access.
- Existing post-call intelligence remains working.
- Lead assignment and lead workflow.
- Appointment booking from voice-agent leads.
- Admin availability management.
- Public booking page.
- Appointment confirmation/rejection.
- Master all-admin calendar.
- Normal personal calendar.
- Production-safe migration, auth, permissions, and verification.

## Non-Negotiable Rules

- Do not change the voice sales behavior prompt unless explicitly approved.
- Keep OpenAI/Gemini API keys server-side only.
- Keep voice audio browser-to-provider direct.
- Do not add Google/Outlook calendar sync yet.
- Do not add email invite, email reminder, payment, Redis, queues, or multi-tenancy.
- Every permission must be enforced server-side, not only hidden in UI.
- Use soft delete for admins and conversations.
- Transcript save must never fail because post-call analysis fails.

---

## Phase 0 - Baseline Audit And Safety Check

Purpose: confirm current app is stable before changing auth/data model.

Tasks:

1. Check git status and current branch.
2. Read current auth implementation.
3. Read current admin layout/nav/actions.
4. Read current migration script.
5. Read current lead/conversation schema and server actions.
6. Run current verification:
   - `npm run typecheck`
   - `npm run hostinger:build`
   - Existing smoke tests if local env is ready.

Deliverable:

- Short baseline note:
  - Current build passes/fails.
  - Known risks before implementation.
  - Files likely to change.

Do not proceed if current build is already broken.

Exit criteria:

- Baseline is understood.
- Current build status is known.
- No implementation begins on a broken foundation without documenting the blocker first.

---

## Phase 1 - Database Migration Foundation

Purpose: add the schema needed for admin users, calendars, appointments, and booking without changing UI yet.

Database changes:

1. Add `admin_users`.
2. Add `admin_calendar_profiles`.
3. Add `availability_rules`.
4. Add `availability_overrides`.
5. Add `meeting_types`.
6. Add `appointments`.
7. Add settings fields:
   - `booking_enabled`
   - `active_booking_admin_id`
   - `default_timezone`
   - `require_booking_confirmation`
   - `default_booking_window_days`
8. Add assignment fields where needed:
   - `leads.assigned_admin_id`
   - Optional `conversations.assigned_admin_id`
9. Add appointment-related indexes:
   - Appointments by assigned admin/time.
   - Appointments by lead.
   - Appointments by conversation.
   - Availability rules by admin.
   - Overrides by admin/time.
10. Seed default meeting type:
   - `Free Consultation`
   - 30 minutes
11. Seed first master admin from existing env credentials if no admin user exists.
12. Seed calendar profile for first master admin.
13. Set active booking admin to first master admin if booking is enabled.

Important migration behavior:

- Migrations must be idempotent.
- Existing admin login must not break during the transition.
- Existing conversations/leads must remain readable.
- Passwords must be stored hashed, not plaintext.

Verification:

- Run migration locally.
- Run schema verification.
- Confirm seeded master admin exists.
- Confirm default meeting type exists.
- Confirm active booking admin is set.
- Confirm old lead/conversation data remains accessible.

Exit criteria:

- Migration applies cleanly on an existing database.
- Migration applies cleanly on a fresh database.
- Build still passes.

---

## Phase 2 - Database-Backed Auth And Role System

Purpose: replace hardcoded single-admin behavior with DB-backed users while preserving master admin access.

Tasks:

1. Create admin auth helpers:
   - Get current session admin.
   - Require logged-in admin.
   - Require master admin.
   - Check normal admin record scope.
2. Update login:
   - Lookup `admin_users`.
   - Reject inactive/deleted users.
   - Verify password hash.
   - Store admin user ID and role in session.
   - Update `last_login_at`.
3. Add change-own-password action.
4. Add role-aware admin session object.
5. Add emergency fallback only if needed during migration, but avoid keeping it long term.
6. Update admin layout/nav:
   - Master sees Team.
   - Normal admin does not.
7. Protect all existing admin pages with DB-backed session.
8. Add server-side checks to existing admin actions:
   - Conversations.
   - Leads.
   - Settings.
   - Exports.

Permission rules:

- Master admin can access all existing records.
- Normal admin can only access assigned/linked records.
- Normal admin cannot edit global settings.
- Normal admin cannot access Team.
- Normal admin cannot delete conversations.

Verification:

- Master admin can log in.
- Invalid password rejected.
- Inactive/deleted user rejected.
- Normal admin cannot access `/admin/team`.
- Normal admin cannot call master-only actions directly.
- Existing admin pages still render.

Exit criteria:

- Auth works from DB.
- Role gates work server-side.
- Current V1.5 admin features still work for master admin.

---

## Phase 3 - Master Admin Team Management

Purpose: let master admin create and manage admin accounts safely.

Build UI:

- New `/admin/team` page.
- Team table:
  - Name
  - Username/email
  - Role
  - Calendar status
  - Active booking admin badge
  - Upcoming appointments
  - Pending confirmations
  - Account status
  - Last login
  - Actions

Build actions:

1. `createAdminUserAction`
2. `updateAdminUserAction`
3. `resetAdminPasswordAction`
4. `deactivateAdminUserAction`
5. `deleteAdminUserAction`
6. `setActiveBookingAdminAction`

Create admin modal:

- Name
- Username/email
- Temporary password
- Role
- Active/inactive

Edit admin modal:

- Name
- Username/email
- Role
- Active status
- Password reset

Delete admin guardrails:

- Cannot delete self.
- Cannot delete last master admin.
- Cannot downgrade last master admin.
- Soft delete only.
- If future appointments exist, require:
  - Reassign future appointments.
  - Leave unassigned.
  - Cancel future appointments.
- If active booking admin, require:
  - Replacement admin.
  - Or disable booking.

Verification:

- Master can create normal admin.
- New normal admin can log in.
- Master can deactivate admin.
- Deactivated admin cannot log in.
- Master can soft-delete admin.
- Deleted admin cannot log in.
- Self-delete blocked.
- Last-master delete/downgrade blocked.
- Active booking admin delete requires resolution.

Exit criteria:

- Team management is production-safe.
- No admin deletion can orphan the app into an unusable state.

---

## Phase 4 - Appointment Core Model And Admin List

Purpose: add appointment operations before building public booking.

Build backend helpers:

1. Appointment query helpers.
2. Appointment validation.
3. Appointment status transitions.
4. Conflict-check helper.
5. Assignment/scope helper.

Build server actions:

- `confirmAppointmentAction`
- `rejectAppointmentAction`
- `cancelAppointmentAction`
- `rescheduleAppointmentAction`
- `reassignAppointmentAction`
- `markAppointmentCompletedAction`
- `markAppointmentNoShowAction`
- `updateAppointmentNotesAction`

Status transition rules:

- `pending_confirmation` -> `confirmed`
- `pending_confirmation` -> `rejected`
- `confirmed` -> `completed`
- `confirmed` -> `no_show`
- `confirmed` -> `cancelled`
- `pending_confirmation` -> `cancelled`
- Rejected/cancelled should not block future slots.
- Completed/no-show remain historical.

Build `/admin/appointments` list view.

Master admin:

- All appointments.
- Filter by admin.
- Filter by status.
- Date filters.
- Search.

Normal admin:

- Own appointments only.
- No admin filter.

Appointment row/card:

- Customer.
- Company.
- Time.
- Assigned admin.
- Status.
- Contact.
- Source.
- Linked lead/conversation.
- Problem summary.
- Notes preview.
- Actions.

Build appointment detail drawer/page:

- Status.
- Customer details.
- Meeting details.
- Lead intelligence.
- Linked conversation.
- Notes.
- Allowed actions.

Verification:

- Master can see all appointments.
- Normal admin sees only own appointments.
- Master can confirm/reject/reassign any appointment.
- Normal admin can confirm/reject only own appointments.
- Status transitions persist.
- Invalid transitions are blocked.
- Appointment notes persist.

Exit criteria:

- Internal appointment workflow works even before public booking exists.

---

## Phase 5 - Availability And Calendar Profiles

Purpose: let admins define when they can be booked.

Build backend:

1. Calendar profile CRUD.
2. Weekly availability rule CRUD.
3. Availability override CRUD.
4. Validation:
   - Start before end.
   - No invalid weekday.
   - No overlapping duplicate ranges if possible.
   - Timezone present.
5. Slot calculation helper:
   - Weekly rules.
   - Extra availability.
   - Blocked times.
   - Existing appointments.
   - Buffers.
   - Minimum notice.
   - Booking window.
   - Daily cap.

Build UI:

- Master can edit any admin calendar.
- Normal admin can edit own calendar if allowed.
- Availability editor:
  - Profile fields.
  - Weekly availability.
  - Blocked full days.
  - Blocked time ranges.
  - Booking rules summary.

Profile fields:

- Display name.
- Booking slug.
- Timezone.
- Meeting title.
- Meeting location.
- Default duration.
- Buffers.
- Minimum notice.
- Max bookings per day.
- Booking window.

Verification:

- Availability saves correctly.
- Blocked time removes slots.
- Existing appointment removes slots.
- Buffer removes adjacent conflicting slots.
- Minimum notice works.
- Booking window works.
- Master can edit any profile.
- Normal admin cannot edit another admin's profile.

Exit criteria:

- Slot generator is trustworthy before public visitors can use it.

---

## Phase 6 - Public Booking Page And Booking API

Purpose: let qualified visitors book an available consultation slot.

Build public route:

- `/book/[slug]`

Build public APIs:

- `GET /api/booking/slots?slug=...&from=...&to=...`
- `POST /api/booking/appointments`

Booking page UX:

- Show meeting title.
- Show available days.
- Show available time slots.
- Required:
  - Name
  - Email
- Optional:
  - Phone
  - LINE
  - WhatsApp
  - Company
  - Note
- Clear confirmation page after booking.
- No availability state.
- Booking disabled state.
- Invalid slug state.

Context handling:

- Signed booking context can include:
  - Lead ID
  - Conversation ID
  - Prefilled name/company/contact
- Context expires.
- If invalid context, booking still works without link to lead/conversation.

Booking creation rules:

- Validate slug.
- Validate slot.
- Re-run conflict check server-side.
- Require name/email.
- Create appointment as `pending_confirmation`.
- Link lead/conversation if signed context is valid.
- Update lead status to appointment-related state.
- Store assigned admin snapshot.

Verification:

- Public slot page renders.
- Booking creates appointment.
- Double booking is blocked.
- Invalid slot is rejected.
- Required fields enforced.
- Booking context pre-fills fields.
- Appointment appears in admin.
- Lead/conversation links display.

Exit criteria:

- Visitor can book a real appointment safely.

---

## Phase 7 - Voice Widget Booking CTA Integration

Purpose: connect the voice-agent lead flow to the booking page.

Backend:

- Update `/api/lead` response to include:
  - Lead ID
  - Booking available boolean
  - Booking URL or slug
  - Signed booking context
- Do not expose private admin data.
- If booking disabled/no active admin/no availability, return clear unavailable state.

Widget:

- After successful lead capture, show CTA:
  - `Book consultation`
  - Thai equivalent.
- CTA opens booking page with signed context.
- Keep voice flow natural.
- Do not make voice model read long URLs.
- Do not change behavioral prompt except adding approved technical instruction:
  - After meaningful lead capture, the interface may show booking option.

Verification:

- Lead capture still works.
- CTA appears only after successful lead capture.
- CTA opens booking page.
- Prefill works.
- Booking links to the lead/conversation.
- If booking disabled, widget does not show broken CTA.

Exit criteria:

- Voice-to-booking handoff works end-to-end.

---

## Phase 8 - Master Calendar And Normal Calendar Views

Purpose: make appointments easy to manage visually.

Build calendar view in `/admin/appointments`.

Master admin:

- All-admin calendar.
- Admin filter.
- Day/week/month views.
- Color per admin.
- Pending/confirmed/blocked/cancelled/no-show visual states.
- Click item opens detail drawer.
- Can confirm/reject/reassign from drawer.

Normal admin:

- Own calendar only.
- Day/week/month views.
- Own appointments and blocked times.
- Can confirm/reject/update own appointments.

Calendar visual states:

- Pending: amber/outline.
- Confirmed: solid accent.
- Blocked: grey/striped.
- Rejected/cancelled: muted.
- No-show: danger/red.
- Completed: neutral success.

Verification:

- Master sees all admins.
- Normal sees only self.
- Blocked times appear.
- Appointment colors are stable.
- Calendar actions match permissions.

Exit criteria:

- Calendar view is operational, not just decorative.

---

## Phase 9 - Overview, Leads, Conversations Scope Updates

Purpose: integrate appointment data into the existing admin experience.

Overview:

Master admin:

- Company-wide appointment metrics.
- Pending appointment confirmations.
- Today's appointments.
- High-interest leads.
- Active booking admin warning.
- No availability warning.

Normal admin:

- Own appointment metrics.
- Own pending confirmations.
- Own appointments today.
- Own follow-up leads.

Leads:

- Show assigned admin.
- Show appointment status.
- Allow scoped edits.
- Link to appointment.
- Master can filter by admin.

Conversations:

- Show appointment badge.
- Role-scoped access.
- Master delete only.
- Transcript remains collapsed by default.

Exports:

- Add appointments CSV.
- Master all records.
- Normal scoped records.
- Continue CSV injection escaping.

Verification:

- Master overview correct.
- Normal overview scoped.
- Lead-to-appointment links work.
- Conversation-to-appointment links work.
- Exports work and are scoped.

Exit criteria:

- The whole admin dashboard feels coherent.

---

## Phase 10 - Settings And Operational Controls

Purpose: make global booking/admin settings manageable without exposing dangerous controls to normal admins.

Master Settings:

- Voice Agent.
- Post-call Analysis.
- Knowledge Document.
- Booking.
- Advanced Provider.

Booking settings:

- Booking enabled.
- Active AI booking admin.
- Require confirmation.
- Default timezone.
- Default booking window.
- Default meeting type.

Normal Settings:

- Profile.
- Change password.
- Own calendar/availability shortcut.
- No provider/model/knowledge controls.

Verification:

- Master can update booking settings.
- Normal cannot access global settings actions.
- Booking disabled blocks public booking and widget CTA.
- Changing active booking admin changes booking target.

Exit criteria:

- System controls are correctly separated by role.

---

## Phase 11 - Final Hardening

Purpose: eliminate production deployment surprises.

Security review:

- Password hash only.
- Role checks server-side.
- No secret exposure.
- Public endpoints rate-limited.
- Booking context signed and expiring.
- Deleted admins cannot log in.
- Normal admin cannot access all records via direct URL/action.

Data integrity review:

- Appointment conflicts blocked.
- Delete admin guardrails work.
- Active booking admin cannot silently disappear.
- Old leads/conversations still render.
- Analysis failure safe.
- Transcript save safe.

UX review:

- Empty states clear.
- Warning states clear.
- Mobile admin pages usable.
- Booking page works on mobile.
- No admin link public landing page.
- Thai/English booking CTA text reviewed.

Performance review:

- Slot calculation acceptable.
- Appointment list queries indexed.
- Admin overview not doing excessive queries.
- No DB reads during live call except session-start cached settings behavior.

Deployment review:

- Migration idempotent.
- Hostinger build passes.
- ZIP packaging passes.
- Build version updated.

Verification commands:

```bash
npm run verify:source
npm run typecheck
npm run hostinger:build
npm run package:source
npm run verify:archive
```

Manual acceptance:

- Master login.
- Create normal admin.
- Normal login.
- Set availability.
- Active booking admin selected.
- Voice lead capture.
- Booking CTA.
- Public booking.
- Pending appointment appears.
- Confirm appointment.
- Normal scoped calendar.
- Master all-admin calendar.
- Delete/deactivate admin guardrails.
- Export CSV.

Exit criteria:

- Product is production-ready for DJAI's internal use.
- No known critical auth, booking, or data-loss issue remains.

---

## Suggested Implementation Order Summary

1. Baseline audit.
2. Schema migration.
3. DB-backed auth.
4. Master Team page.
5. Appointment list/actions.
6. Availability editor.
7. Public booking page.
8. Voice widget booking CTA.
9. Calendar views.
10. Overview/leads/conversation integration.
11. Settings separation.
12. Final hardening and deployment package.

This order matters. The system should not expose public booking until auth, permissions, appointment status logic, availability, and conflict checks are already stable.
