# Notification delivery policy — proposed

| Field | Value |
| --- | --- |
| Status | Proposed; not product/legal approved |
| Scope | Website-first non-social release |
| Code authority | `packages/notifications/src/delivery-policy.ts` |
| In-app authority | `packages/db/migrations/0096_tenant_notification_center.sql` and `0099_notification_source_coverage.sql` |

This document records what the product implements today. It is not permission to market a response-time promise, activate a new recipient category, or relabel the policy as approved. Approval requires a named product owner and legal/privacy reviewer in release evidence.

## Current channel matrix

| Event family | In-app | Email | Intended recipient |
| --- | --- | --- | --- |
| Email verification, password recovery | Not sent | Required | Account user |
| Team invitation, ownership transfer | Required | Required | Invited/transferring account and authorized workspace members |
| Billing and usage | Required | Configurable | Authorized workspace members or configured allow-listed recipient |
| Flow/AI lead capture | Not sent by this center | Configurable | Configured allow-listed recipient |
| Appointments, callbacks, confirmed value | Required | Not implemented | Authorized workspace members |
| Support responses and attachment scan outcomes | Required | Not implemented | Authorized workspace members |
| Onboarding and deployment state | Required | Not implemented | Authorized workspace members |
| Privacy jobs and support-access changes | Required | Not implemented | Authorized workspace members |
| Current-version bot test results | Required | Not implemented | Authorized workspace members |

The current release does not send notification-center events through SMS, push notification, or social channels.

## Delivery controls

- In-app events are created only from authoritative lifecycle tables, deduplicated by tenant and source event, immutable after insertion, restricted to `/workspace` deep links, and read separately by each active membership.
- Email delivery uses the durable outbox identifier as its provider idempotency key. Production fails closed unless the HTTP delivery transport is configured.
- Configurable email paths require an enabled notification profile and an allow-listed recipient; event payloads must not add arbitrary recipient addresses.
- Templates must minimize personal data. Secrets, credentials, provider/model routing, message bodies, and support-access reasons must never be copied into notification-center records.
- Retries must reuse the durable event/outbox identifier. Exhausted delivery belongs in the existing reviewed dead-letter and recovery process.

## Approval and staging checklist

1. Product owner approves every required/configurable/not-sent decision and records the decision version.
2. Legal/privacy reviewer approves recipient authority, content minimization, retention, unsubscribe applicability, and cross-border processing.
3. Operations selects the transactional email provider and configures a verified sending domain, DNS, credentials, rate limits, and spend controls outside Git.
4. Staging proves verification, recovery, invitation, ownership, billing, usage, and configured lead templates through the real provider with no duplicate delivery on replay.
5. Staging records delivery, bounce, complaint, suppression, timeout, retry, and dead-letter evidence without exposing message content or credentials.
6. Browser acceptance confirms Thai labels, keyboard navigation, narrow-screen layout, per-member read state, filters, empty/error/retry states, and authoritative deep links.
7. Only after steps 1–6 may release evidence change the policy status from `proposed`.
