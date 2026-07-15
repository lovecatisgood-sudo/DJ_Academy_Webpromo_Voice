# ADR-006: Opaque Voice Gateway and Release Sequence

- Status: Accepted
- Date: 2026-07-14
- Phase: P0

## Context

The current widget talks to provider-specific realtime endpoints and receives provider/model details. This violates the platform decision that model routing is controlled only by the internal Platform Master Dashboard and remains invisible to tenant users and public clients.

## Decision

Release browser voice first through a separately deployable DJAY voice gateway. Telephony is deferred until Voice Basic browser acceptance, metering, concurrency, fraud, recording/consent, and incident controls pass.

The browser receives an opaque DJAY session grant containing only public fields such as:

```text
sessionId, gatewayUrl, protocolVersion, capabilityProfile,
expiresAt, maxCallSeconds, locale, greeting, reconnectPolicy
```

Allowed capability profiles are `voice_gen1` and `voice_gen2`. No provider, adapter, model, vendor URL/token, internal error, or cost field is serialized.

The gateway:

- authenticates a signed deployment and resolves tenant/subscription/entitlement server-side;
- reserves concurrency, minutes, and spend before provider allocation;
- resolves the capability profile through restricted platform routing configuration;
- holds provider credentials and implements provider adapters;
- normalizes lifecycle, audio, transcript, tools, interruption, errors, and usage;
- executes lead/appointment/handover effects only through Action Gateway;
- settles usage exactly once and releases reservations on all terminal paths;
- exposes provider-neutral client errors and capability health;
- emits restricted routing/cost telemetry separately from tenant-visible conversation data.

Routing changes are available only to Platform Owner or delegated Platform AI Operations. Production changes require MFA/recent reauthentication, evaluation evidence, effective dating, canary/rollback controls, and immutable before/after audit.

Voice Advanced never silently falls back from Gen2 to Gen1. An incident may reject new sessions, route to an approved equivalent Gen2 implementation, or expose a provider-neutral availability state. Any temporary policy exception requires explicit incident authorization and audit.

## Security and privacy

- short-lived one-purpose session grants;
- origin/deployment allow-list and replay protection;
- tenant/product concurrency and abuse controls;
- no raw media or transcript in routine logs;
- recording off by default until jurisdictional disclosure/consent/retention policy is configured;
- provider payload minimization and configured data handling;
- signed gateway events and internal mTLS/service authentication where supported.

## Validation

- static scan of browser bundle and public DTO fixtures finds no provider/model identifiers or vendor realtime URLs;
- Gen1/Gen2 quality, interruption, silence, noise, reconnect, timeout, cleanup, and bilingual evaluations pass;
- concurrent session limits and minute reservation/settlement reconcile under retries and disconnects;
- tenant tokens cannot query routing configuration;
- provider outage returns provider-neutral errors and follows generation policy;
- browser/gateway protocol versions support controlled rollback.

