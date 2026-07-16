# Legal document and registration validation

- Result: approved-file contract and fail-closed local registration gate passed
- Date: 2026-07-16
- Deployment state: engineering accepted; approved legal content and production review remain external

## Accepted local evidence

The API no longer records invented date-like legal versions. A bounded,
absolute, mounted JSON file must parse as an explicitly approved Terms and
Privacy bundle before new registration is enabled. The server owns the current
versions; the browser submits the versions it displayed, and the registration
service rejects stale acceptance before persistence or email delivery.
Verification and resend remain available when new registration authority is
paused.

The public application now exposes branded `/terms` and `/privacy` pages with
responsive plain-text rendering, version and effective-date disclosure,
loading, retry, and safe unavailable states. Registration links both documents,
shows both accepted versions, disables submission without current evidence, and
preserves the user-entered account fields when a version rotation requires
renewed acceptance.

Executed engineering gates:

```bash
scripts/use-node24.sh pnpm --filter @djay/shared test
scripts/use-node24.sh pnpm --filter @djay/auth test
scripts/use-node24.sh pnpm --filter @djay/api test
scripts/use-node24.sh pnpm run lint:legal-registration
scripts/use-node24.sh pnpm run qa:ui-foundation
scripts/use-node24.sh pnpm run verify
```

Unit coverage rejects missing, draft, malformed, relative-path, unreadable, and
oversized authority; validates the public schema; proves stale versions create
no signup intent; and proves verification remains usable while signup is
paused. Static policy rejects reintroduced hard-coded versions, missing public
routes, unbound browser versions, unsafe HTML rendering, or a production
configuration contract without the mounted file.

Chromium covers Terms and Privacy at desktop and mobile breakpoints, the
registration links and visible versions, automated WCAG 2.2 A/AA rules,
responsive overflow, approved-content rendering, document failure, legal
metadata failure, retry, and disabled registration without current authority.
Visual evidence is:

- `/tmp/djay-public-terms-desktop.png`
- `/tmp/djay-public-terms-mobile.png`
- `/tmp/djay-public-privacy-desktop.png`
- `/tmp/djay-public-privacy-mobile.png`

Platform release readiness now treats the mounted bundle as a live,
non-attestable admission requirement. Even 7/7 service objectives, 9/9
attestations, zero incidents, and healthy usage cannot produce `ready` while
registration authority is unavailable. Platform Owner, Finance, Support, and AI
Operations views expose the blocker without approval references or legal text.

No repository test constitutes legal approval. Production remains blocked until
qualified counsel/privacy review supplies the exact signed bundle, processor and
jurisdiction disclosures, and approval reference, followed by acceptance
through the deployed public and API origins.
