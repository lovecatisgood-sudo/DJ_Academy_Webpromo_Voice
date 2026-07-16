# Production configuration admission

The checked `.env.example` is a field inventory, not a deployable secret file.
API, workers, and Voice gateway strip undeclared host variables and refuse
production startup when any declared configuration value still contains a
repository example marker such as
`change-me`, `replace-with`, `base64-encoded`, `placeholder`,
`local-unreleased`, or an IANA-reserved `.test`, `.invalid`, or `.example`
endpoint.

## Prepare reviewed configuration

1. Put each environment in a separate secret/configuration scope. Never copy a
   development database, credential, provider key, or legal bundle into
   production.
2. Generate every base64-encoded 32-byte key independently. A suitable local
   command is `openssl rand -base64 32`; store the output directly in the
   deployment secret manager and do not paste it into tickets or logs.
3. Give API, workers, Voice gateway, browser realms, monitoring ingestion, and
   provider connections only their documented values. Do not reuse a key
   across purposes or environments.
4. Set `OPERATIONS_RELEASE_VERSION` to the immutable deployed revision. Mount
   the approved legal bundle read-only as described in `legal-documents.md`.
5. Keep public, Tenant, and Platform browser origins on distinct HTTPS
   hostnames. Voice browser routing must use WSS. Review all public/provider
   endpoints before rollout.
6. Start the release artifact in the target environment and require its
   readiness contract. A live process is not release evidence; the Platform
   release gate must also pass.

The rejection error names only the configuration field. It must never echo the
credential or URL value. Do not weaken or bypass this admission rule for a
deployment; replace the example value at its authoritative source.

## Verification

```bash
scripts/use-node24.sh pnpm run lint:production-config
scripts/use-node24.sh pnpm --filter @djay/shared test
scripts/use-node24.sh pnpm run package:release
scripts/use-node24.sh pnpm run qa:release-artifacts
```

Artifact QA starts the isolated Voice gateway with an example authority token,
requires a non-zero exit, verifies the error identifies only the field, and
rejects any error output containing the token value.
