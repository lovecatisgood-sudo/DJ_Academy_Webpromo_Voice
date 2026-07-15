# P0 Baseline Validation

- Date: 2026-07-14
- Phase: P0
- Result: P0 gate passed for P1 foundation work

## Documentation and inventory checks

Passed:

- 18 P0 Markdown files present in the new workspace;
- Markdown code-fence balance check;
- stale umbrella/role naming scan for `Flow SaaS`, `Six-Plan Flow SaaS`, `Client Admin`, and `Client Super Admin` returned no matches;
- FlowBot inventory counted 23 tables, 39 API route handlers, and 19 test/smoke files;
- root voice/text inventory counted 11 migration-created tables and 17 API route handlers;
- FlowBot migration scan found no active `CREATE POLICY`, `ENABLE ROW LEVEL SECURITY`, or `FORCE ROW LEVEL SECURITY` statements;
- current voice public/widget/admin provider/model exposure is cited in the security map.

## FlowBot V1 executable baseline

Command:

```bash
cd FlowBot_V1_App
scripts/use-node24.sh pnpm run verify
```

Result: passed, exit 0.

The command completed:

- typecheck for all 6 packages;
- 9 Vitest files with 22 passing tests;
- builds for all 6 packages, including successful Next.js 16.2.10 production dashboard build;
- secret scan.

Turbo replayed valid local cache entries for these tasks. The route build output listed all expected admin, widget, and health routes.

Not part of this command: Playwright E2E, PostgreSQL integration against a disposable database, and smoke/SSE scripts requiring a running app/database.

## Voice/text executable baseline

Commands and results:

```bash
npm run typecheck       # passed
npm run verify:source   # passed
npm run verify:schema   # passed
```

The root app has no colocated Vitest/Playwright suite. Its verification strategy currently relies on source/schema scripts, build/deployment checks, and HTTP smoke scripts.

Attempted:

```bash
npm run smoke:no-secrets
```

Result: not executed against an application. The script attempted `127.0.0.1:3000`; no dev server was established for this check and the managed environment denied the localhost connection with `EPERM`. This is recorded as a test-environment limitation, not a passing smoke and not evidence of an application defect.

The full root `hostinger:build` was not rerun in P0 because it performs live environment verification and database migration. A previously verified source archive exists, while external production still required deployment/build-marker acceptance at the latest checkpoint.

## Gate assessment

Passed for P1:

- target workspace and runtime are decided;
- current behavior and reuse claims cite implementation/tests;
- tenant boundary, database roles, forced RLS, identity, sessions, MFA, ownership, provider confidentiality, realtime, voice sequence, statuses, appointment semantics, and rollback strategy are decided;
- P1 scope is independently sliced and testable;
- no product migration or paid launch is authorized by this gate.

Open but non-blocking for P1:

- final payment provider, VAT/tax invoice, price, allowance, overage, trial, grace, and refund policy are P9 blockers under ADR-008;
- current production voice build acceptance is separate from target SaaS foundation work;
- FlowBot E2E/smoke and root HTTP smoke remain required when their source systems are used for migration parity/cutover.

## P0 conclusion

P0 is complete. P1 may scaffold and implement identity/tenant provisioning only. P2/product work remains gated.

