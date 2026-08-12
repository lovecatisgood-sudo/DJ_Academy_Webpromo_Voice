# Appointment calendar reconciliation

## Purpose

DJAY treats a merchant's local confirmation and an external calendar provider's response as different facts. The UI must never say that a calendar event exists, changed, or was cancelled until the provider returns a verified success response.

## State model

- Appointment state: requested, pending confirmation, team confirmed, rescheduled, completed, cancelled, rejected, or no-show.
- Calendar state: not configured, ready, pending, synchronizing, synchronized, failed/retrying, or action required.
- `synchronized` is operation-aware: create, update, and cancellation each have different Thai copy.
- Unknown, timed-out, or malformed provider responses remain failed/pending and never promote the calendar state to synchronized.

## Connection setup

1. Voice Advanced entitlement is required for the current Google Calendar connection profile.
2. Enable Google Calendar API in the merchant's Google Cloud project and create a least-privilege service account.
3. Share only the target calendar with the service-account email and grant event-editing authority.
4. In **Appointments → Appointment calendar**, enter a recognizable name, Calendar ID, service-account email, and private key.
5. The API encrypts the profile with `VOICE_TELEPHONY_ENVELOPE_KEY`; it never returns the private key. Creating a replacement disables the former active profile to prevent duplicate sends.
6. Keep the always-visible workspace support channel available for assisted setup. Do not request credentials in support-ticket prose or chat; use the encrypted connection form.

## Worker configuration

```text
APPOINTMENT_SYNC_WORKER_ENABLED=true
VOICE_TELEPHONY_ENVELOPE_KEY=<same independent 32-byte key used by the API>
```

Production startup fails closed if the appointment worker is disabled or the encryption key is absent. The worker supports Google Calendar and the existing hardened HTTPS webhook profile. Webhooks reject credentials in URLs, non-HTTPS targets, non-443 explicit ports, private/reserved DNS results, oversized responses, malformed result bodies, and missing external references.

## Recovery and evidence

- Jobs use a tenant-scoped idempotency key derived from appointment, operation, and selected source fact.
- Jobs form an explicit create → update(s) → cancel dependency chain. A later operation cannot be claimed until its exact predecessor is provider-confirmed, preventing overtaking across concurrent workers.
- Claims use `FOR UPDATE SKIP LOCKED`; stale processing can be reclaimed.
- Failed attempts back off and retry up to ten claims. The tenth failure becomes `dead_letter`. Platform recovery requires a request plus approval by a different Platform Owner, verifies the unchanged attempt and recovery generation, and opens one fresh bounded generation. At most three reviewed generations are admitted.
- Every provider completion writes an immutable attempt row. External event references are retained only on the protected job; immutable evidence stores only SHA-256.
- Success/failure/dead-letter outcomes enter the tenant notification center with an authoritative appointment deep link.
- Merchant exports include local appointment state and calendar synchronization state separately.

## Release evidence still required

Local tests prove database authority, repeated rescheduling, two-person dead-letter recovery, bounded retry generations, idempotency, tenant isolation, status wording, and connector payload minimization. Release still requires an unmocked staging Google Calendar account proving create, replay, repeated reschedule, cancel, timeout/retry, revoked credentials, provider outage, and recovered delivery against the real provider. Record provider response IDs/hashes without calendar content or credentials.
