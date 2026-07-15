# DJAI Voice Agent Admin V1.5 PRD

**Project:** DJAI Voice Sales Agent Admin + Appointment Upgrade  
**Version:** 1.5 final plan  
**Date:** 13 July 2026  
**Owner:** DJAI Academy  
**Status:** Product plan updated with corrected calendar/booking-link flow

---

## V2 Planning Note

The next planned product expansion is documented separately as:

```text
DJAI_Agent_Widget_V2_PRD.md
DJAI_Agent_Widget_V2_Architecture.md
DJAI_Agent_Widget_V2_UIUX.md
DJAI_Agent_Widget_V2_Implementation_Plan.md
```

V2 adds a text chatbot beside the voicebot in the same visitor widget section, while sharing the same backend, knowledge document, lead pipeline, booking-link CTA, calendar, and admin dashboard. V1.5 remains the implemented voice-agent/admin/calendar foundation.

## 1. Product Goal

Upgrade the current voice-agent admin from a single-admin transcript/lead dashboard into a practical sales operations workspace for DJAI Academy.

The voice agent's job remains live selling: diagnose the visitor's business, recommend the right DJAI service, handle objections, capture lead details, and push qualified visitors toward a consultation.

The admin system's job is follow-up operations:

- Understand each conversation quickly.
- Organize leads.
- Manage lead status.
- Manage multiple admins.
- Let admins control their own availability.
- Let the AI agent hand qualified visitors to a booking page.
- Let master admin view and control the team's appointment pipeline.

This version is not a full Calendly clone and not a full CRM. It is the minimum production-grade appointment and follow-up layer needed for the voice-agent sales product.

Important correction added 13 July 2026: the calendar product must start from calendar setup and booking-link creation. The central object is a booking link/meeting type, not only an admin calendar profile. The admin calendar UI must look and behave like a real calendar workspace, similar in clarity to Google Calendar, not a grouped appointment table.

---

## 2. Product Principles

1. **Do not change live sales behavior without approval.** The user's behavioral prompt is product logic and must not be rewritten casually.
2. **Voice sells; text model summarizes.** Realtime voice handles the call. A cheaper text model handles post-call intelligence.
3. **Lead capture comes before booking.** The AI should collect contact details before showing the booking link.
4. **Booking is the conversion handoff.** The AI should not read long URLs aloud; the widget should show a clear booking CTA.
5. **Master admin controls the operation.** Master admin can create admins, delete/deactivate admins, view all calendars, and set the active AI booking link.
6. **Normal admin gets a personal work desk.** Normal admins see their own leads, appointments, and availability, not company-wide controls.
7. **Admin is the final authority.** AI fills summaries and suggestions; admins can edit statuses, notes, contact fields, and appointments.
8. **No V2 infrastructure creep.** No calendar OAuth, Google/Outlook sync, email invites, notifications, payments, RAG, workers, Redis, or multi-tenancy in this version.

---

## 3. Problems To Solve

The existing admin workflow has these gaps:

- Only one hardcoded admin exists.
- No real admin-user management.
- No appointment scheduling layer after a visitor agrees to a consultation.
- No availability management.
- No booking page connected to voice-agent leads.
- No appointment confirmation/rejection workflow.
- Master admin cannot see or control team calendars.
- Normal admins do not have a scoped personal work queue.
- Full transcripts are too prominent; admins need summary and intelligence first.
- Lead details need structured fields.
- Lead status needs to reflect sales follow-up reality.

---

## 4. User Roles

### Visitor

The website visitor talks to the voice agent.

Visitor can:

- Speak with the voice sales agent.
- Provide contact details.
- Click the booking CTA after lead capture.
- Select an available appointment slot.
- Submit required booking fields.

Visitor cannot:

- See admin pages.
- See internal calendar details.
- Book unavailable slots.

### Normal Admin

Normal admin is a DJAI operator or sales/admin team member.

Normal admin can:

- Log in with credentials created by master admin.
- View assigned leads.
- View conversations linked to assigned leads/appointments.
- View and manage their own appointments.
- Confirm/reject their own appointments.
- Mark appointments completed/no-show/cancelled.
- Add notes.
- Edit their own availability if allowed.
- Change their own password/profile fields.

Normal admin cannot:

- Create/delete admins.
- View all-admin calendars.
- Set the active AI booking link.
- Change global voice/provider/knowledge settings.
- Delete conversations globally.
- Export all company records unless later allowed.

### Master Admin

Master admin is the owner/operator role.

Master admin can:

- Do everything normal admin can.
- Create admin accounts manually.
- Edit admin accounts.
- Change/reset admin passwords.
- Deactivate admins.
- Soft-delete admins.
- View all admins' calendars.
- Confirm/reject/reassign any appointment.
- Edit any admin's availability.
- Set which admin calendar the AI booking flow uses.
- View all leads, conversations, and appointments.
- Access global Settings.

Master admin guardrails:

- Cannot delete themselves.
- Cannot delete or downgrade the last remaining master admin.
- Deleting an admin is soft delete.
- Historical records remain visible after admin deletion.
- If deleting an admin who owns the active AI booking link, master admin must choose a replacement booking link or disable booking.

---

## 5. In Scope

### A. Post-Call Intelligence

After `/api/conversation` saves a transcript, the backend runs a cheaper text model.

Default:

- Provider: OpenAI
- Model: `gpt-4o-mini`

Analyzer output:

- Short summary
- Business type
- Main problem
- Business goal
- Interest level: `low`, `medium`, `high`, `unknown`
- Concern or objection
- Recommended DJAI service
- Suggested next action
- Lead/no-lead classification
- Structured contact details

Rules:

- Use transcript and tool-captured lead data only.
- Do not invent details.
- Do not overwrite admin notes.
- Failure must not block transcript saving.

### B. Structured Leads

Lead fields:

- Client name
- Company name
- Phone
- Email
- LINE ID
- WhatsApp
- Other contact
- Preferred contact method
- Preferred meeting day
- Preferred meeting time
- Need/problem
- Status
- Admin notes
- Assigned admin

Lead statuses:

- `pending_follow_up`
- `appointment_set`
- `follow_up_later`
- `deal_closed`
- `no_deal`

Any conversation with a usable contact method is considered a lead.

### C. Conversation Organization

Admin can:

- View summary-first conversation list.
- Filter by all, leads, no leads, starred, failed analysis.
- Search conversations.
- Star/unstar conversations.
- Soft-delete conversations, master only by default.
- Regenerate analysis.
- Export conversations to CSV.
- Expand transcript only when needed.

### D. Multi-Admin Accounts

Add admin-user management.

Admin user fields:

- Name
- Username or email
- Password hash
- Role: `master_admin` or `admin`
- Status: active, inactive, deleted
- Last login
- Created/updated/deleted timestamps

Master admin can:

- Create admin.
- Edit admin.
- Change/reset password.
- Deactivate admin.
- Delete admin.
- View deleted/deactivated admins.

This version uses manual credential creation. Email invite setup is deferred.

### E. Appointment Module

Add appointment management tied to leads and conversations.

Appointment statuses:

- `pending_confirmation`
- `confirmed`
- `rejected`
- `cancelled`
- `completed`
- `no_show`

Appointment fields:

- Assigned admin
- Lead
- Conversation
- Meeting type
- Start/end time
- Timezone
- Customer details
- Meeting location/link/instruction
- Source: voice agent / manual
- Internal notes
- Status timestamps

Admin actions:

- Confirm
- Reject
- Reschedule
- Reassign, master only by default
- Cancel
- Mark completed
- Mark no-show
- Add notes

### F. Calendar, Availability, And Booking Links

Each admin can have a calendar profile.

Calendar profile fields:

- Display name
- Timezone
- Active/inactive

Each admin can create one or more booking links.

Booking link fields:

- Owner admin
- Link name, for internal admin display
- Public slug, for example `/book/free-consultation`
- Meeting title shown to visitors
- Meeting description/instructions
- Meeting location or call link
- Duration in minutes, with UI presets and custom input
- Active/inactive
- Require admin confirmation
- Booking window days
- Minimum notice
- Buffer before
- Buffer after
- Max bookings per day
- Required fields, V1.5 fixed to name and email
- Optional fields, V1.5 fixed to phone, LINE, WhatsApp, company, note

Availability:

- Weekly recurring availability.
- Multiple time ranges per day.
- Block full days.
- Block specific time ranges.
- Optional blocked-time reason.
- Booking rules:
  - Duration
  - Buffer before
  - Buffer after
  - Minimum notice
  - Maximum bookings per day
  - Booking window, for example 30 days ahead

Only one booking link is active for AI-agent booking at a time:

- Stored as active AI booking link.
- Master admin can change it.
- If none is selected, booking CTA is disabled.
- The AI/widget booking CTA must use the active AI booking link, not any random admin calendar slug.
- Public booking pages for inactive links should show unavailable or 404 depending on admin setting.

Calendar setup must be first-run aware:

- If an admin has no calendar profile, weekly hours, or booking link, show a setup flow instead of an empty appointment table.
- Setup must guide the admin through calendar profile, weekly availability, blocked time, and booking link creation.
- After setup, the admin lands on the calendar dashboard.

Calendar dashboard requirements:

- Must visually look like a real calendar, not a table.
- Must support at least week view in V1.5 rebuild.
- Day and month views are desirable if feasible in the same phase, but week view is the minimum.
- Show time rows and day columns.
- Show appointments as blocks positioned by time.
- Show blocked time as muted/striped blocks.
- Show pending appointments in amber.
- Show confirmed appointments in cyan/blue.
- Show completed appointments in green.
- Show cancelled/rejected appointments muted.
- Clicking an appointment opens a detail side panel.
- Empty available slots should be visible or previewable in the availability screen.

### G. Public Booking Page

Public booking page:

- URL by booking link slug, for example `/book/free-consultation`.
- Shows a customer-friendly booking flow: choose date, choose time, enter details, request appointment.
- Requires name and email.
- Optional phone, LINE, WhatsApp, company, note.
- Supports prefilled fields from voice-agent lead context.
- Prevents double booking.
- Creates appointment as `pending_confirmation`.
- Links appointment to lead and conversation when available.

### H. Voice Agent Booking CTA

After the voice agent gets appointment agreement and captures lead details:

1. Voice agent calls `capture_lead`.
2. Widget shows `Book consultation` CTA.
3. CTA opens the active AI booking link with signed lead/conversation context.
4. Visitor chooses a time.
5. Appointment appears in admin as `pending_confirmation`.
6. Admin confirms or rejects.

The AI should not read long booking URLs aloud.

### I. Admin Dashboards

Master admin sees:

- Company-wide overview.
- All-admin appointment queues.
- All-admin calendar.
- Team page.
- Active AI booking link controls.

Normal admin sees:

- Personal overview.
- Own appointments.
- Own leads.
- Own availability.
- Scoped conversations.

See:

- `Master_admin_V1.5_UIUX.md`
- `Normal_Admin_UIUX.md`

### J. CSV Export

Export support:

- Conversations
- Leads
- Appointments

CSV must escape formula-like values starting with `=`, `+`, `-`, or `@`.

---

## 6. Out Of Scope For This Version

- Google Calendar sync.
- Outlook/Microsoft calendar sync.
- Calendar OAuth.
- External calendar webhooks.
- Email invite flow for new admins.
- Password reset by email.
- Email/SMS/LINE reminders.
- Customer self-service reschedule/cancel.
- Payments.
- Round robin.
- Multiple active AI booking calendars.
- Collective/group meetings.
- Meeting polls.
- CRM owners beyond assigned admin.
- Multi-tenant SaaS accounts.
- RAG/vector search.
- Redis, queues, workers.
- Audio recording/playback.
- AI-generated outbound follow-up messages.

---

## 7. Primary User Flows

### Flow A: Voice Lead Captured

1. Visitor talks to voice agent.
2. Voice agent diagnoses problem and recommends service.
3. Visitor shows meaningful interest.
4. Voice agent collects contact details.
5. Voice agent calls `capture_lead`.
6. Lead appears in admin as `pending_follow_up`.
7. Conversation saves at call end.
8. Analyzer fills summary, client details, interest level, problem, concern, recommendation, and next action.

### Flow B: Voice Lead Books Appointment

1. Visitor agrees to consultation.
2. Voice agent collects contact details first.
3. Voice agent captures lead.
4. Backend returns the active AI booking link if booking is enabled and configured.
5. Widget shows booking CTA.
6. Visitor opens booking page with lead details prefilled.
7. Visitor chooses date.
8. Visitor chooses available time.
9. Visitor submits required name/email and optional contact details.
10. Appointment is created as `pending_confirmation`.
11. Lead status becomes `appointment_set` or remains linked to pending appointment depending on UI language.
12. Assigned admin/master admin confirms or rejects.

### Flow B2: First-Time Calendar Setup

1. Admin opens Calendar.
2. If no usable calendar profile, weekly availability, or booking link exists, show setup flow.
3. Admin creates calendar profile:
   - display name
   - timezone
   - meeting location or default call link
4. Admin sets weekly availability:
   - toggle each day available/unavailable
   - add one or more time ranges per day
   - optional copy weekday schedule
5. Admin adds blocked time if needed:
   - full day block
   - specific time block
   - optional reason
6. Admin creates a booking link:
   - link name
   - public slug
   - duration in minutes
   - meeting title
   - location/link
   - booking window
   - minimum notice
   - buffer before/after
7. Master admin can set this booking link as active for the AI.
8. Setup completion redirects to Calendar dashboard.

### Flow B3: Admin Creates Booking Link

1. Admin opens Calendar Links.
2. Clicks Create booking link.
3. Chooses the owner admin, master only. Normal admin defaults to self.
4. Enters link name and slug.
5. Chooses meeting duration:
   - 15 minutes
   - 30 minutes
   - 45 minutes
   - 60 minutes
   - custom minute input
6. Enters meeting title and meeting location/link.
7. Sets booking rules:
   - booking window
   - minimum notice
   - buffer before
   - buffer after
   - max bookings per day
   - require confirmation
8. Saves link.
9. Master admin may set it as the active AI booking link.

### Flow C: Master Admin Creates Admin

1. Master admin opens Team.
2. Clicks Create admin.
3. Enters name, username/email, temporary password, role.
4. Saves account.
5. New admin can log in with created credentials.

### Flow D: Master Admin Deletes Admin

1. Master admin opens Team.
2. Clicks Delete admin.
3. System checks:
   - Is this the current user?
   - Is this the last master admin?
   - Does this admin own the active AI booking link?
   - Does this admin have future appointments?
4. If future appointments exist, master admin chooses reassign, leave unassigned, or cancel.
5. If the admin owns the active AI booking link, master admin selects a replacement booking link or disables booking.
6. Admin is soft-deleted and cannot log in.
7. Historical records remain visible.

### Flow E: Normal Admin Confirms Appointment

1. Normal admin opens Overview or Appointments.
2. Sees pending confirmation.
3. Reviews customer details and lead intelligence.
4. Confirms or rejects.
5. Adds notes.
6. Appointment status updates.

### Flow F: Master Admin Views All Calendars

1. Master admin opens Calendar.
2. Calendar opens in week view by default.
3. Master can filter by all admins or one admin.
4. Reviews pending, confirmed, blocked, completed, no-show, cancelled slots in a real time-grid calendar.
5. Opens appointment side panel to confirm, reject, reassign, reschedule, cancel, complete, no-show, or add notes.

### Flow G: Availability Management

1. Admin opens Calendar Availability.
2. Sets weekly availability.
3. Adds blocked full days or time ranges.
4. Adds extra available time if needed.
5. Opens preview tab to confirm bookable slots are generated correctly.
6. Saves.
7. Public booking page immediately uses updated slots.

Master admin can do this for any admin.

---

## 8. Page-Level Product Requirements

### Overview

Master admin:

- Company-wide metrics.
- All-admin filters.
- Pending confirmation queue.
- Today's appointments.
- High-interest leads.
- Warnings for no active AI booking link or no availability.

Normal admin:

- Personal metrics.
- Own pending confirmations.
- Own appointments today.
- Own follow-up leads.

### Conversations

- Summary-first list.
- Transcript collapsed by default.
- Lead/no-lead badge.
- Appointment badge when linked.
- Filters and search.
- Master can delete.
- Regenerate analysis where allowed.

### Leads

- Structured contact fields.
- Status filters.
- Assigned admin.
- Appointment status.
- Notes preview.
- CSV export, master company-wide and normal scoped.

### Calendar

- First-run setup screen when no calendar/link exists.
- Real calendar dashboard, week view minimum.
- Day columns and time rows.
- Appointment blocks positioned by time.
- Blocked-time blocks.
- Date controls: today, previous, next, selected week/date.
- View controls: week minimum, day/month/list if feasible.
- Master admin filter by all/specific admin.
- Normal admin scoped to self.
- Detail drawer.
- Confirm/reject/reschedule/cancel/complete/no-show actions.

### Booking Links

- List booking links.
- Create booking link.
- Edit booking link.
- Activate/deactivate booking link.
- Master can set one booking link as active AI booking link.
- Normal admin can manage own links if allowed.
- Link detail shows public URL, duration, owner admin, availability status, upcoming appointments.

### Availability

- Weekly hours editor.
- Date-specific blocked time.
- Date-specific extra availability.
- Slot preview.
- Clear warning when no available slots are generated.

### Team

Master-only.

- Create admin.
- Edit admin.
- Reset password.
- Deactivate.
- Delete.
- View calendar.
- Set active AI booking link.
- View deleted/deactivated admins.

### Settings

Master settings:

- Voice agent controls.
- Provider/model controls.
- Knowledge document.
- Post-call analysis.
- Booking settings.
- Active AI booking link.

Normal admin settings:

- Profile.
- Change password.
- Personal availability/calendar fields where allowed.

### Public Booking Page

- Clean customer-facing page.
- Shows available slots only.
- Required name/email.
- Optional phone, LINE, WhatsApp, company, note.
- Creates pending appointment.
- Handles no availability state.
- Handles disabled booking state.

---

## 9. Success Criteria

V1.5 is successful when:

- Master admin can create, edit, deactivate, and delete admins safely.
- Normal admins can log in and see only their scoped work.
- Master admin can view all admins' calendars.
- Only one booking link can be selected for AI booking.
- Admin availability produces accurate public booking slots.
- Calendar dashboard looks like a real calendar with time grid and event blocks.
- Admin can create a booking link with duration and booking rules.
- Active AI booking link is the only link used by the voice widget CTA.
- Visitor can book after a voice-agent lead capture.
- Appointment appears in admin as pending confirmation.
- Admin can confirm/reject appointment.
- Lead, conversation, and appointment records are linked.
- Admin can understand a call without opening transcript.
- Analyzer failure never prevents transcript saving.
- The live voice-agent sales behavior is not changed by appointment/admin features.

---

## 10. Implementation Priority

Recommended build order:

1. Multi-admin auth foundation and role permissions.
2. Team page for master admin.
3. Booking-link data model.
4. Calendar setup flow.
5. Availability model and editor.
6. Real calendar dashboard with week view.
7. Public booking page and slot calculation.
8. Voice widget booking CTA after lead capture.
9. Master all-admin calendar view.
10. Normal admin scoped overview/leads/conversations.
11. CSV export for appointments.
12. Final acceptance run.
