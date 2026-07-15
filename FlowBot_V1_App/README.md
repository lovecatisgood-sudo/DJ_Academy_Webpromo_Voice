# FlowBot V1

Single-tenant deterministic website chatbot for the DJAI conversational SaaS foundation.

Read `docs/00-CODEX-HANDOFF.md` first. `docs/INTEGRATION-CONTRACT.md` overrides conflicting implementation detail.

## Current Scope

FlowBot V1 currently includes:

- deterministic website widget runtime;
- admin login;
- Overview, Chat, Customers, Leads, and Settings dashboard;
- visual Knowledge flow editor over the M3 authoring APIs;
- widget/contact/team/privacy settings;
- customer export and erasure;
- public/admin smokes and local release verification.

Do not add AI, voice, billing, external channels, public tenant signup, or scheduler code in V1.

## Node Runtime

FlowBot targets Node.js 24 LTS. For local work in this workspace, install Node `v24.18.0` under `.node/` and run commands through:

```bash
scripts/use-node24.sh pnpm run verify
```

This keeps FlowBot's runtime isolated from the existing DJAI Voice Agent app.

## Release

Use `docs/12-RELEASE-CHECKLIST.md` before deploying. The minimum local gate is:

```bash
scripts/use-node24.sh pnpm run verify
scripts/use-node24.sh pnpm run verify:release
```
