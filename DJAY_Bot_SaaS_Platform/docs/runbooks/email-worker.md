# Email Worker

The notification path is the only process that decrypts notification recipients and
template variables. The outbox remains durable when the provider is unavailable.

Required production settings:

```text
WORKER_DATABASE_URL
AUTH_EMAIL_ENVELOPE_KEY
EMAIL_DELIVERY_MODE=http
EMAIL_DELIVERY_ENDPOINT
EMAIL_DELIVERY_API_TOKEN
EMAIL_FROM
EMAIL_WORKER_INTERVAL_MS
```

Build and start it with:

```bash
scripts/use-node24.sh pnpm --filter @djay/workers build
scripts/use-node24.sh pnpm --filter @djay/workers start
```

For a deployment smoke test, set `EMAIL_WORKER_ONCE=true`. The worker claims
rows with `SKIP LOCKED`, sends one bounded batch, records success or schedules
backoff, and eventually dead-letters exhausted deliveries. Alert on oldest
pending age, retry volume, and dead-letter count. Never log decrypted addresses,
links, tokens, API credentials, or payload bodies.

During provider outage, leave the worker running unless delivery behavior is
unsafe; committed outbox rows can be retried after provider recovery. Do not
manually duplicate rows because producer idempotency and outbox dedupe keys are
the delivery authority.

The same worker binary can also process privacy jobs, but it uses the separate
`PRIVACY_EXPORT_KEY` and tenant-contextual privacy repository. See
`privacy-worker.md`; never share the email envelope key with privacy processing.
