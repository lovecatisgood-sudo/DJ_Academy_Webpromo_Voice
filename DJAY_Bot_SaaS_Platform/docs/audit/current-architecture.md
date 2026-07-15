# Current Architecture

Status: P0 evidence, 2026-07-14.

## System A: FlowBot V1

```text
Preact widget
  -> Next dashboard public APIs
  -> deterministic core engine
  -> Neon/PostgreSQL flowbot_* tables
  -> database replay + process-local SSE fan-out

Admin browser
  -> Next dashboard admin APIs
  -> hashed DB-backed admin sessions
  -> tenant predicates in service SQL

Worker
  -> notification outbox / heartbeats
```

The engine boundary is strong. The tenant boundary is incomplete: schema relationships include `tenant_id`, but application services can import raw SQL and the database has no active RLS policies.

## System B: current voice/text agent

Audited source: repository root `../../../`.

```text
Website widget
  -> Next /api/session or /api/chat/*
  -> provider-specific browser protocol for realtime voice
  -> OpenAI/Gemini APIs
  -> singleton settings + tenant-unscoped PostgreSQL tables

Admin browser
  -> HMAC cookie auth
  -> Next server actions/routes
  -> global Neon client
```

The root app uses Next 15.4, React 19.1, Node 22+, standalone output, Neon, and Google/OpenAI provider SDK/protocol code. It exposes 17 API routes and 11 migration-created tables.

## Voice/text route and UI inventory

Public/server APIs include:

- voice session creation;
- text chat session, message, and end;
- conversation save;
- lead capture;
- booking slots and appointment creation;
- health.

Admin APIs include lead/settings updates and CSV/JSON exports for leads, conversations, and appointments. Admin pages cover overview, inbox, voice inbox, conversations, customers, leads, calendar, booking links, appointments, channels, team, and settings.

## Voice/text data model

The root migration creates:

- `admin_users`;
- singleton `settings`;
- `conversations`;
- `conversation_messages`;
- `leads`;
- `admin_calendar_profiles`;
- `booking_links`;
- `availability_rules`;
- `availability_overrides`;
- `meeting_types`;
- `appointments`.

None is tenant-owned through a `tenant_id` column. Foreign keys link records globally. Settings includes provider and model fields, including voice provider, realtime model, analysis model, transcription model, and text-chat model (`scripts/migrate.mjs:163-257`). Conversation rows persist provider/model metadata (`migrate.mjs:260-318`).

## Voice/text authentication

- Admin role is `master_admin | admin` (`src/lib/admin-auth.ts:56-58`).
- The 12-hour admin cookie is an HMAC-signed payload, not a server-side session record (`admin-auth.ts:8-24,60-113`).
- Database lookup is global and tenant-unscoped (`admin-auth.ts:133-170`).
- Environment credential fallback exists for setup/compatibility.
- Public conversation context signs a conversation ID, expiry, and call duration but carries no tenant/deployment identity (`src/lib/session-context.ts`).
- `src/lib/db.ts:4-11` returns one cached global Neon client.

## Provider-confidentiality failure

The current contract cannot be reused for SaaS:

- `GET /api/session` returns `voiceProvider` (`src/app/api/session/route.ts:45-55`).
- `POST /api/session` branches on provider and returns `provider`, provider-specific credentials, and `modelId` (`route.ts:178-191,209-230,311`).
- The widget hardcodes OpenAI's realtime URL (`public/djai-voice-widget.js:1-6`).
- The widget implements Gemini-specific setup and consumes the returned model ID (`djai-voice-widget.js:1001-1025`).
- The widget chooses its client protocol from `tokenData.provider` (`djai-voice-widget.js:1073-1093`).
- Tenant admin settings and channels pages expose provider/model controls and labels.

The SaaS architecture must terminate browser media at an opaque DJAY gateway. Vendor credentials, protocols, adapters, routing, and model IDs remain internal.

## Current quota and booking behavior

Voice session quota uses one global daily conversation count and a single advisory lock (`src/app/api/session/route.ts:89-111`), so it is neither tenant-scoped nor a billable reservation/settlement ledger.

Booking may create either `pending_confirmation` or `confirmed`, and confirmed appointments can update a lead to `appointment_set` (`src/app/api/booking/appointments/route.ts:128-177`). This behavior is preserved only through the accepted appointment ADR and entitlements.

## Current release state

The local voice/text source archive passed its archive verification, but production acceptance remains external to this SaaS build: `voice.djai.academy` was still serving an older build marker at the last checkpoint. The SaaS migration treats the local repository as source evidence and requires a separate production data/export validation before cutover.

## Target delta

The target is not either current architecture with a tenant column added. It requires:

- global users plus tenant memberships;
- public verified signup and atomic tenant provisioning;
- separate platform and tenant realms;
- forced RLS and restricted DB roles;
- immutable plan versions and server-side entitlements;
- canonical contacts, leads, conversations, actions, and usage;
- opaque provider gateway;
- durable workers, outbox, tenant-scoped cache/queue/storage, and audit;
- additive migration and rollback windows for both current applications.

