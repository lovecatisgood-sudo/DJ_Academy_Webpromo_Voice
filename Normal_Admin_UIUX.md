# Normal Admin UI/UX Plan

## Core UX Principle

Normal admin should feel like they are managing their own follow-up desk, not the whole company. Their dashboard should answer:

- What appointments do I need to confirm?
- Who am I speaking with today?
- Which leads do I need to follow up?
- What did the AI learn before the appointment?
- What is my availability?
- What notes or status updates should I save after the call?

Normal admin should not see controls that affect the whole business.

## Normal Admin Navigation

Normal admin sees:

- Overview
- Conversations
- Leads
- Appointments
- Settings

Normal admin does not see:

- Team
- All-admin calendar
- Create admin
- Delete admin
- Active AI booking admin switch
- Provider/system-level dangerous settings, unless explicitly allowed later

## 1. Overview Page

Purpose: personal daily work queue.

Top metrics:

- My appointments today
- My pending confirmations
- My pending follow-up leads
- My high-interest leads
- My completed appointments
- My no-shows

Primary queues:

- Pending confirmations
  - Customer name
  - Requested time
  - Problem summary
  - Contact
  - Confirm/reject buttons

- Today's appointments
  - Time
  - Customer
  - Status
  - Contact shortcut
  - Open detail

- My follow-up leads
  - Customer
  - Interest level
  - Recommended service
  - Next action
  - Lead status

No all-admin filter here. If the logged-in user is a normal admin, every count and list is scoped to them.

## 2. Appointments Page

Default view: personal appointment list.

Top controls:

- Date range:
  - Today
  - This week
  - This month
  - Custom
- View:
  - List
  - Calendar
- Status filters:
  - Pending confirmation
  - Confirmed
  - Rejected
  - Cancelled
  - Completed
  - No-show

No admin filter.

Each appointment row/card shows:

- Customer name
- Company if known
- Appointment time
- Status badge
- Contact details
- Source: voice agent / manual
- Linked lead
- Linked conversation
- Problem summary
- Recommended service
- Notes preview

Actions allowed:

- Confirm
- Reject
- Reschedule, if permitted
- Mark completed
- Mark no-show
- Cancel, if permitted
- Save notes
- Open lead
- Open conversation

Actions not allowed:

- Reassign to another admin, unless master admin enables this later.
- View other admins' appointments.
- Edit another admin's availability.

## 3. Personal Calendar View

Normal admin calendar shows only their own schedule.

Views:

- Day
- Week
- Month

Calendar items:

- Pending appointment
- Confirmed appointment
- Blocked time
- Completed appointment
- No-show
- Cancelled/rejected appointment

Clicking an appointment opens detail drawer.

Clicking an empty available slot can optionally allow manual appointment creation, but this should remain a later feature unless needed.

## 4. Appointment Detail Drawer

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

- Date
- Time
- Duration
- Timezone
- Meeting type
- Meeting location/link

Lead intelligence:

- Business type
- Main problem
- Business goal
- Objection/concern
- Recommended service
- Interest level
- Suggested next action

Actions:

- Confirm appointment
- Reject appointment
- Mark completed
- Mark no-show
- Cancel appointment
- Save notes

## 5. Leads Page

Normal admin should see:

- Leads assigned to them.
- Leads connected to their appointments.
- Optional unassigned leads only if master admin allows it later.

Recommended default: show `My leads`.

Lead filters:

- Pending follow up
- Appointment set
- Follow up later
- Deal closed
- No deal

Lead row/card:

- Client name
- Company
- Contact
- Interest level
- Problem
- Recommended service
- Next action
- Appointment status if any
- Last updated

Allowed actions:

- Update lead status.
- Edit client contact fields.
- Add notes.
- Open linked conversation.
- Open linked appointment.

Not allowed:

- Delete lead globally, unless master admin grants it.
- Reassign lead to another admin, unless later added.

## 6. Conversations Page

Normal admin should not necessarily see every conversation.

Recommended rule:

- Master admin: all conversations.
- Normal admin: conversations linked to their assigned leads or appointments.

Conversation list should remain summary-first:

- Client/company
- Lead/no-lead
- Interest level
- Main problem
- Recommended service
- Next action
- Appointment badge if booked

Normal admin can:

- Star conversations for their own workflow.
- Add notes through the lead/appointment.
- Open transcript.
- Regenerate analysis only if allowed.

Normal admin should not soft-delete conversations in the first version. Keep delete power master-only.

## 7. Availability Settings

Normal admin needs a simple personal availability editor.

Recommended location:

- `Appointments > Availability`

Sections:

- My calendar profile
- Weekly availability
- Blocked dates/times
- Booking rules summary

Editable fields:

- Display name
- Timezone
- Meeting location/link, if allowed
- Weekly available hours
- Blocked full days
- Blocked time ranges

Potentially locked fields controlled by master admin:

- Booking slug
- Default duration
- Max bookings per day
- Minimum notice
- Booking window
- Whether this admin can receive AI bookings

The UI should clearly show locked fields as read-only, not hidden.

## 8. Settings Page

Normal admin settings should be personal only.

Recommended settings:

- Profile name
- Username/email display
- Change password
- Notification preferences later
- Personal calendar location/link if allowed

Do not show:

- OpenAI/Gemini provider settings
- Knowledge document
- Agent enabled toggle
- Daily cap
- Active booking admin
- System prompt controls
- Model IDs

Those should remain master-admin only.

## 9. Permission UX

Normal admin can:

- View own appointments.
- Confirm/reject own appointments.
- Mark own appointment completed/no-show.
- Edit own availability if allowed.
- Update own assigned leads.
- Add notes.
- View linked conversations.
- Update appointment notes.

Normal admin cannot:

- Create admins.
- Delete admins.
- View all-admin calendar.
- Set active AI booking admin.
- Change global booking settings.
- Change voice provider/model settings.
- Edit knowledge document unless explicitly promoted.
- Delete conversations globally.
- Export all company records.

## 10. Empty / Warning States

Normal admin should see clear states:

- No appointments today.
- No pending confirmations.
- No leads assigned.
- No availability set.
- Your calendar is not active for AI bookings.
- Booking disabled by master admin.
- Appointment was reassigned by master admin.
- Appointment conflict detected.
- Lead has no usable contact details.

## Recommended Normal Admin Build Priority

1. Personal appointment list with confirm/reject.
2. Appointment detail drawer.
3. Personal availability editor.
4. My leads view.
5. Personal calendar view.
6. Role-scoped conversation access.
7. Personal settings/change password.
