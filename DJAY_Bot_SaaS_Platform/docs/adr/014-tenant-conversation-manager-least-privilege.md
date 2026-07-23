# ADR 014 — Narrow Tenant Conversation Manager publish/deploy

Status: Accepted  
Date: 2026-07-22

## Context

`tenant_conversation_manager` previously received product publish and deploy
permissions (`flowbot.publish`, `flowbot.deploy`, `ai_chat.publish`,
`ai_chat.deploy`, `voice.deploy`) plus `integrations.manage` and
`ai_chat.channels.manage`. That over-granted production launch authority to a
role intended for conversation design and inbox operations.

Phase 8 / G5 requires least privilege before paid traffic.

## Decision

Keep authoring and inbox capabilities for conversation managers:

- `flowbot.read`, `flowbot.author`
- `ai_chat.read`, `ai_chat.author`
- `voice.read`
- conversation reply/assign, contacts/leads write, knowledge write, actions

Remove production-launch and sensitive connector authority:

- `flowbot.publish`, `flowbot.deploy`
- `ai_chat.publish`, `ai_chat.deploy`, `ai_chat.channels.manage`
- `voice.deploy`
- `integrations.manage`

Publish/deploy and channel/connector management remain on
`tenant_master_admin` and `tenant_admin` (and platform-owned paths where
applicable).

## Consequences

- Conversation managers can draft FlowBot / AI Chat content but cannot publish
  or create website deployments.
- Existing UI already gates publish/deploy on those permissions; no new API
  surface is required beyond the authorization matrix change.
- Operators and human agents were already denied publish/deploy.

## Rollback

Restore the removed permissions in `packages/authorization/src/index.ts` and
update `index.test.ts` only if a named merchant program explicitly requires
conversation-manager launch authority.
