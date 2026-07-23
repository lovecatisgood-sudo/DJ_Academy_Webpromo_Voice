# DSAR residual list (counsel-approved target)

Date: 2026-07-23  
SKU: `flowbot_basic`

Items **not** fully covered by automated contact erasure after migration `0080_privacy_g6c_erasure_hold`. Selling requires counsel signature or closure via engineering follow-up.

| Residual | Why retained / not auto-wiped | Proposed control | Counsel |
|----------|-------------------------------|------------------|---------|
| Knowledge source revision bodies / object-store blobs | May contain merchant-uploaded text referencing people; no reliable contact FK | Manual review + delete source; or block PII uploads in policy | ☐ |
| Immutable audit log metadata | Security/accountability | Keep; no message bodies | ☐ |
| Privacy lineage + completed job rows | Prove DSAR fulfillment | Retain | ☐ |
| Conversation shell rows after erase | Referential integrity / audit | `retained_legal`; content wiped unless legal hold | ☐ |
| Provider-side copies (email, Stripe, channels, AI) | Off-platform | Subprocessor deletion / retention policies | ☐ |
| Aggregated usage counters | Not personal once unlinked | Keep | ☐ |
| Legal-hold conversation transcripts | Explicit hold | Skip wipe until hold cleared + re-erase | ☐ |

**Engineering closed in 0080:** action request/result payloads, voice outcome summaries, AI/Flow social subject ciphertext, contact attributes/tags (prior), voice turns (prior trigger), messages/notes (unless hold).

Signer: _____________  Date: _____________
