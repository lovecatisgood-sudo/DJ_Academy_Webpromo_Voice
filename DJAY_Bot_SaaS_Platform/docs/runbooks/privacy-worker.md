# Privacy Worker

Privacy export and erasure run only under `djay_worker`. Production requires:

```text
WORKER_DATABASE_URL
PRIVACY_WORKER_ENABLED=true
PRIVACY_EXPORT_KEY
```

`PRIVACY_EXPORT_KEY` must be an independent base64-encoded 32-byte key shared only
with the API deployment that serves authenticated downloads. Do not reuse auth,
MFA, billing, or notification keys.

Build and start the worker with:

```bash
scripts/use-node24.sh pnpm --filter @djay/workers build
scripts/use-node24.sh pnpm --filter @djay/workers start
```

Exports are encrypted JSON, integrity-digested, capped at 50 MiB, and expire after
seven days. Alert on oldest requested job, failed jobs, processing age, artifact
size, and download/decryption failures. Logs may contain job IDs and job types,
but never contact identities, message bodies, export content, or encryption keys.

Erasure is irreversible. The database function verifies worker session identity,
service context, tenant context, job type, contact, and processing state before
redacting. Never grant direct message update permission to the worker and never
manually disable the immutable-message trigger.
