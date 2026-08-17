# Knowledge source cleanup

## Authority

Deleting a source removes it from retrieval and every editable bot draft in the same transaction. Migration `0130_knowledge_source_cleanup.sql` then queues physical cleanup immediately and records `purge_by` from the tenant's enforced `retention_policies.knowledge_days` maximum.

The knowledge worker deletes private object-storage keys and, when present, vector references through the configured deletion gateway. Local chunks and revision content are purged only after those external operations succeed. Retries are bounded and completed evidence is immutable.

## Required production configuration

- `KNOWLEDGE_WORKER_ENABLED=true`
- `KNOWLEDGE_OBJECT_BUCKET`
- `KNOWLEDGE_VECTOR_DELETE_ENDPOINT` and `KNOWLEDGE_VECTOR_DELETE_TOKEN` together when the selected vector provider writes non-null references

The vector endpoint accepts `POST` JSON `{ "references": ["opaque-ref"] }` and must make repeated deletion idempotent. A 404 is treated as already deleted. Provider names and opaque references must not appear in customer errors or logs.

## Operations

- Alert on `dead_letter`, any `failed` job whose next attempt is overdue, and any incomplete job at or after `purge_by`.
- Investigate object/vector provider health without editing the cleanup row.
- Retry only through the bounded worker claim. Never mark cleanup completed manually.
- Completed rows retain counts and timestamps as deletion evidence; source content, chunks and external artifacts do not.

## Acceptance boundary

Local and fake-provider evidence does not satisfy `KNO-DEC-001`. Production enablement still requires the selected storage/vector provider, encryption/deletion test, security review and live evidence.
