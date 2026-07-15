# P2 Validation: Catalog, Entitlements, and Usage

- Result: Passed
- Date: 2026-07-15
- Database migration: `0006_catalog_entitlements_usage`

## Automated gates

```bash
scripts/use-node24.sh pnpm run verify
scripts/test-db-integration.sh
```

The workspace gate passed lint, strict type checking, unit tests, import/provider
boundary scans, and production builds across 15 packages/apps. The API build
contains 34 routes.

PostgreSQL 16 integration proved:

- six public plans and two tiers per product;
- public DTOs contain no restricted provider/model fields;
- signup selection creates one pending subscription, snapshot, and quota account;
- tenant A and B see only their own subscriptions and usage data;
- a second live tier for the same product is rejected;
- subscriptions for different products coexist;
- Platform Owner pilot activation creates a new active snapshot;
- reservation replay returns the original reservation;
- cross-tenant reservation substitution is rejected;
- settlement replay cannot double-count usage;
- webhook replay is idempotent and reused external event IDs with different
  payload hashes are conflicts;
- all P1 owner, identity, MFA, email, and RLS tests continue to pass.

## Runtime HTTP gates

- Public catalog returned six plans and no restricted terms.
- Tenant plan selection without recent assurance returned 403.
- The same command with fresh MFA/reauthentication created one pending plan.
- Tenant cookie to Platform Master returned 401.
- Platform password login returned only `mfa_required`; valid TOTP issued a
  platform session.
- Platform cookie to tenant session returned 401.
- Reauthenticated Platform Owner pilot activation succeeded.
- First signed webhook and exact replay returned 202; a body-tampered replay
  returned 400.

## Browser gates

Chromium checked 1440px/390px public registration, 1280px tenant usage, and
1365px/390px Platform Master views. All rendered without horizontal overflow,
unexpected console errors, or restricted provider/model text. Public registration
showed exactly six plan choices. The tenant showed only the public Voice Agent
Advanced name and active/available state. Platform Master showed tenant,
subscription, and activation status through the internal realm.

## Residual launch blockers

- ADR-008 commercial decisions and legal/accounting review.
- Real payment-provider adapter and reconciliation fixtures.
- Approved numeric plan versions and public price copy.
- Production checkout, invoices, refunds, dunning, and customer billing portal.

These block paid launch, not P3 shared-domain implementation.
