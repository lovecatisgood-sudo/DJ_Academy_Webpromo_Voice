# Legal hold behavior

Migration: `0080_privacy_g6c_erasure_hold`  
Runbook companion: `docs/runbooks/dsar.md`

## Behavior

1. Admin with `privacy.manage` + recent auth sets `conversations.legal_hold = true` with reason (8–500 chars).
2. Contact erasure still anonymizes the contact and non-held linked personal data.
3. For held conversations: **messages and notes are not overwritten**; lineage disposition `retained_legal` with `{ reason: "legal_hold", legalHoldReason }`.
4. Action/voice outcome redaction also skips rows tied to held conversations.
5. Clearing hold does not retroactively erase; run a new erasure job if content must then be wiped.

## API

- `GET /tenant/legal-holds` — list active holds
- `POST /tenant/conversations/{conversationId}/legal-hold` — `{ legalHold, reason? }`

## UI

- Data controls lists active holds
- Inbox marks held conversations with “legal hold”
