# Master Admin V1.5 UI/UX Plan

## Core UX Principle

The master admin should feel like they are managing the whole sales operation:

- Who can access the dashboard.
- Who receives appointments.
- Which calendar the AI agent uses.
- Which leads need action.
- Which appointments are pending, confirmed, rejected, or completed.
- Whether the team is following up properly.

The master admin should not need to jump between too many places. Important operational queues should surface immediately.

Reference products/features reviewed:

- Calendly scheduling: https://calendly.com/scheduling
- Calendly availability: https://calendly.com/scheduling/availability
- Calendly event types: https://calendly.com/scheduling/event-types
- Calendly routing: https://calendly.com/scheduling/routing
- Calendly admin management: https://calendly.com/features/admin-management

## Master Admin Navigation

Current admin nav should become:

- Overview
- Conversations
- Leads
- Appointments
- Team
- Settings

Only master admin sees `Team`.

Normal admin sees:

- Overview
- Conversations
- Leads
- Appointments
- Settings

Normal admin only sees their own appointments/calendar.

## 1. Overview Page

Purpose: master admin opens dashboard and immediately knows what needs action today.

Top metrics:

- Conversations today
- Leads captured
- Pending follow-up
- Pending appointment confirmations
- Appointments today
- High-interest leads
- No-show count
- Deal closed count

Primary queues:

- Pending appointment confirmations
  - Customer name
  - Requested time
  - Assigned admin
  - Lead status
  - Confirm/reject buttons

- Today's appointments
  - Time
  - Customer
  - Assigned admin
  - Status
  - Contact shortcut
  - Open appointment

- High-interest leads needing follow-up
  - Customer
  - Problem
  - Recommended service
  - Interest level
  - Assigned admin if any
  - Open lead

Master-admin-specific controls:

- Filter overview by `All admins` or selected admin.
- Quick link to change active AI booking admin.
- Warning banner if no active booking admin is selected.
- Warning banner if active booking admin has no availability.

## 2. Appointments Page

This becomes the main operational page.

Top layout:

- Page title: `Appointments`
- Admin filter:
  - All admins
  - Specific admin
- Date controls:
  - Today
  - This week
  - This month
  - Custom date range
- View switch:
  - List
  - Calendar
- Status filters:
  - Pending confirmation
  - Confirmed
  - Rejected
  - Cancelled
  - Completed
  - No-show

Recommended default for master admin:

- Default view: `Pending confirmation + Today`
- Secondary tab: `Calendar`

### Appointments List View

Each appointment row/card should show:

- Customer name
- Company if known
- Appointment date/time
- Assigned admin
- Status badge
- Contact details
- Source: voice agent / manual
- Linked lead
- Linked conversation
- Short problem summary
- Recommended service
- Admin notes preview

Actions:

- Confirm
- Reject
- Reschedule
- Reassign admin
- Mark completed
- Mark no-show
- Cancel
- Open detail

For pending appointments, `Confirm` and `Reject` should be visually prominent.

### Calendar View

Master admin calendar should support:

- All-admin calendar view
- One-admin calendar view
- Day view
- Week view
- Month view

Visual rules:

- Each admin gets a consistent color.
- Pending appointments use outline or amber styling.
- Confirmed appointments use solid accent styling.
- Blocked time uses grey striped styling.
- Rejected/cancelled appointments are muted.
- No-show is red/danger styling.

Calendar item should show:

- Time
- Customer name
- Assigned admin
- Status

Clicking a calendar item opens appointment detail side panel.

### Appointment Detail Panel

Use a right-side drawer or detail page. Drawer is better for speed.

Sections:

- Appointment status
- Customer details
- Meeting details
- Lead intelligence
- Linked conversation
- Admin notes
- Actions

Customer details:

- Name
- Company
- Email
- Phone
- LINE
- WhatsApp

Meeting details:

- Assigned admin
- Date
- Start time
- End time
- Duration
- Timezone
- Meeting type
- Meeting location/link
- Source booking page

Lead intelligence:

- Business type
- Main problem
- Business goal
- Concern/objection
- Recommended service
- Interest level
- Suggested next action

Actions:

- Confirm appointment
- Reject appointment
- Reassign appointment
- Reschedule appointment
- Mark completed
- Mark no-show
- Cancel appointment
- Save notes

## 3. Team Page

Only master admin sees this page.

Purpose: manage admin accounts and booking responsibility.

Top actions:

- Create admin
- View deleted/deactivated admins
- Set active AI booking admin

Team table columns:

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

Admin statuses:

- Active
- Inactive
- Deleted

Actions per admin:

- Edit profile
- Change password
- View calendar
- Set as active booking admin
- Deactivate
- Delete admin

Danger rules:

- Master admin cannot delete themselves.
- Last master admin cannot be deleted.
- Last master admin cannot be downgraded.
- Deleted admin cannot log in.
- Historical appointments remain visible.
- Future appointments must be reassigned or explicitly left unassigned before delete.

### Create Admin Modal

Fields:

- Name
- Username or email
- Temporary password
- Role:
  - Admin
  - Master admin
- Active/inactive

No email invite in this version.

After creation:

- Show generated credential summary.
- Remind master admin to share credentials manually.

### Edit Admin Modal

Fields:

- Name
- Username/email
- Role
- Active status
- Password reset field

Calendar summary:

- Booking slug
- Timezone
- Default meeting duration
- Weekly availability status
- Upcoming appointment count

### Delete Admin Flow

Do not instantly delete.

Step 1: click `Delete admin`.

Step 2: confirmation modal explains:

- Admin will no longer be able to log in.
- Historical records remain.
- Future appointments need handling.
- If this admin is active booking admin, another admin must be selected.

If future appointments exist:

- Show count.
- Require one choice:
  - Reassign all future appointments to another admin.
  - Leave appointments unassigned.
  - Cancel future appointments.

If admin is active booking admin:

- Require selecting replacement active booking admin.
- Or disable booking page.

Button text should be explicit:

- `Delete admin and reassign appointments`
- Not just `Delete`

## 4. Calendar Profile / Availability UX

This can live inside Team > Admin Detail, or Appointments > Availability.

For master admin, they can edit any admin's availability.

Sections:

- Calendar profile
- Weekly availability
- Blocked dates/times
- Booking rules

Calendar profile fields:

- Display name
- Booking slug
- Meeting title
- Timezone
- Meeting location/link
- Default meeting duration

Weekly availability UI:

- Monday to Sunday rows
- Toggle day available/unavailable
- One or more time ranges per day
- Add/remove time range

Example:

- Monday: 10:00-12:00, 14:00-18:00
- Tuesday: unavailable

Blocked time UI:

- Block full day
- Block time range
- Reason/note
- List of upcoming blocked times

Booking rules:

- Duration
- Buffer before
- Buffer after
- Minimum notice
- Max bookings per day
- Booking window, for example book up to 30 days ahead

## 5. Settings Page Changes For Master Admin

Settings should keep system-wide controls.

Add a `Booking` settings section:

- Enable booking page
- Active AI booking admin
- Default booking page URL
- Require admin confirmation before appointment is final
- Default meeting type
- Default timezone
- Booking form required fields:
  - Name required
  - Email required
- Optional fields:
  - Phone
  - LINE
  - WhatsApp
  - Company
  - Note

Important: active booking admin should also be visible on Overview and Team, not hidden only in Settings.

## 6. Voice Agent To Booking UX

The booking experience should not be "AI reads a link".

Better flow:

1. AI qualifies visitor.
2. AI gets agreement for consultation.
3. AI collects contact details first.
4. AI captures lead.
5. Widget shows `Book consultation` button.
6. Visitor clicks and opens booking page with prefilled details.
7. Visitor selects time.
8. Appointment enters `pending_confirmation`.
9. Master/admin confirms or rejects.

Widget state after lead capture:

- Show appointment CTA.
- Text: `Choose a consultation time`.
- Optional secondary text: `Your name and contact will be prefilled.`

## 7. Permission UX

Master admin:

- Sees all admins.
- Sees all appointments.
- Can create/edit/delete admins.
- Can confirm/reject any appointment.
- Can reassign any appointment.
- Can edit any calendar availability.
- Can set active AI booking admin.

Normal admin:

- Sees own appointments.
- Sees own availability.
- Can confirm/reject own appointments.
- Can edit own calendar if allowed.
- Cannot create/delete admins.
- Cannot set active AI booking admin.
- Cannot view all team calendars unless later allowed.

## 8. Empty / Warning States

Important states to design:

- No admin accounts yet.
- No active booking admin selected.
- Active booking admin has no availability.
- Booking page disabled.
- No available time slots.
- Appointment conflicts with another booking.
- Admin deleted but has historical appointments.
- Appointment pending confirmation.
- Appointment rejected.
- Lead has appointment but no confirmed time yet.

## Recommended Page Priority

Build UI in this order:

1. Team page with master admin user management.
2. Appointment list with confirm/reject.
3. Admin availability editor.
4. Public booking page.
5. Calendar view.
6. Overview appointment queues.
7. Voice widget booking CTA.
