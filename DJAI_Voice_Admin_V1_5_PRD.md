# DJAI Voice Agent Admin V1.5 PRD

**Project:** DJAI Voice Sales Agent Admin + Appointment Upgrade  
**Version:** 1.5 final plan  
**Date:** 13 July 2026  
**Owner:** DJAI Academy  
**Status:** Product plan for implementation

---

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

---

## 2. Product Principles

1. **Do not change live sales behavior without approval.** The user's behavioral prompt is product logic and must not be rewritten casually.
2. **Voice sells; text model summarizes.** Realtime voice handles the call. A cheaper text model handles post-call intelligence.
3. **Lead capture comes before booking.** The AI should collect contact details before showing the booking link.
4. **Booking is the conversion handoff.** The AI should not read long URLs aloud; the widget should show a clear booking CTA.
5. **Master admin controls the operation.** Master admin can create admins, delete/deactivate admins, view all calendars, and set the active AI booking admin.
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
- Set the active AI booking admin.
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
- If deleting the active booking admin, master admin must choose a replacement or disable booking.

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

### F. Availability And Booking

Each admin can have a calendar profile.

Calendar profile fields:

- Display name
- Booking slug
- Timezone
- Meeting title
- Meeting location/link/instruction
- Default meeting duration
- Active/inactive

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

Only one admin calendar is active for AI-agent booking at a time:

- Stored as `active_booking_admin_id`.
- Master admin can change it.
- If none is selected, booking CTA is disabled.

### G. Public Booking Page

Public booking page:

- URL by booking slug, for example `/book/dj`.
- Shows available days and time slots.
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
3. CTA opens public booking page with signed lead/conversation context.
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
- Active AI booking admin controls.

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
4. Widget shows booking CTA.
5. Visitor opens booking page.
6. Visitor selects available slot.
7. Visitor submits required name/email and optional contact details.
8. Appointment is created as `pending_confirmation`.
9. Lead status becomes `appointment_set` or remains linked to pending appointment depending on UI language.
10. Assigned admin/master admin confirms or rejects.

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
   - Is this the active booking admin?
   - Does this admin have future appointments?
4. If future appointments exist, master admin chooses reassign, leave unassigned, or cancel.
5. If active booking admin, master admin selects replacement or disables booking.
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

1. Master admin opens Appointments.
2. Selects Calendar view.
3. Uses filter: All admins or one admin.
4. Reviews pending, confirmed, blocked, completed, no-show, cancelled slots.
5. Opens appointment drawer to confirm, reject, reassign, or update status.

### Flow G: Availability Management

1. Admin opens personal availability.
2. Sets weekly availability.
3. Adds blocked full days or time ranges.
4. Saves.
5. Public booking page immediately uses updated slots.

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
- Warnings for no active booking admin or no availability.

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

### Appointments

- List and calendar view.
- Status filters.
- Date controls.
- Master admin filter by all/specific admin.
- Normal admin scoped to self.
- Detail drawer.
- Confirm/reject/reschedule/cancel/complete/no-show actions.

### Team

Master-only.

- Create admin.
- Edit admin.
- Reset password.
- Deactivate.
- Delete.
- View calendar.
- Set active AI booking admin.
- View deleted/deactivated admins.

### Settings

Master settings:

- Voice agent controls.
- Provider/model controls.
- Knowledge document.
- Post-call analysis.
- Booking settings.
- Active AI booking admin.

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
- Only one admin calendar can be selected for AI booking.
- Admin availability produces accurate public booking slots.
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
3. Appointment data model and appointment list.
4. Availability model and editor.
5. Public booking page and slot calculation.
6. Voice widget booking CTA after lead capture.
7. Master all-admin calendar view.
8. Normal admin scoped overview/leads/conversations.
9. CSV export for appointments.
10. Final acceptance run.
