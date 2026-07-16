# Full rendered-route and role-state validation

- Result: full production-rendered route matrix passed
- Date: 2026-07-16
- Runtime contract: Node 24
- Deployment state: local production output accepted; deployed acceptance pending

## Scope

The production-browser gate covered the API root, public registration, service
status, login redirect, email verification, invitation acceptance, Tenant
login, password recovery request/completion, ownership acceptance, every one of
the twelve workspace routes, the Platform login, and Platform operations.
Every workspace route was rendered at 1365×900 and 390×844.

Role-state coverage included Tenant Master Admin, Tenant Admin, Operator, and
Analyst plus Platform Owner, AI Operations, Support, and Finance. The gate now
proves that:

- Analyst mutation controls are absent from onboarding, Contacts, Leads,
  Knowledge, and Inbox while useful read-only content remains;
- Operator write controls remain available for Contacts, Leads, and Inbox but
  Knowledge stays read-only;
- direct Analyst visits to Team and Security receive a branded access-denied
  state instead of an empty or misleading operations page;
- forbidden pages do not initiate their protected Team, Security, or privacy
  data loads;
- a failed workspace session load and every authoritative product-data failure
  render an explicit branded error with a retry action instead of empty data,
  stale success, or an indefinite loading state;
- a public catalog outage remains retryable without blocking owner
  registration or appearing to mean that the catalog is empty;
- Platform authentication failure is distinct from Platform service failure,
  and failed role-authorized operations resources are named without false
  “no records” claims;
- public login, verification, and invitation destinations never fall back to
  localhost in production output;
- every route has the shared DJAY Bot mark, no horizontal overflow, and no page
  or asset failure.

## Executed gates

```bash
scripts/use-node24.sh pnpm run qa:ui-foundation
scripts/use-node24.sh pnpm run qa:p3-ui
scripts/use-node24.sh pnpm run qa:p4-flowbot
scripts/use-node24.sh pnpm run qa:p5-ai-chat
scripts/use-node24.sh pnpm run qa:p6-line
scripts/use-node24.sh pnpm run qa:p7-voice
scripts/use-node24.sh pnpm run qa:p9-usage
scripts/use-node24.sh pnpm run qa:p9-operations
scripts/use-node24.sh pnpm run qa:p9-status
```

The P5 gate initially exposed an outdated mock that did not represent the
current social-connection read performed by AI Chat. The mock now supplies the
empty authorized state, and the full P5 dashboard/widget suite passes again.

The matrix uses controlled API responses to prove rendering and role behavior.
It also injects a controlled `503` into the authoritative read for Overview,
Contacts, Leads, Inbox, Knowledge, Data Controls, Team, Security, FlowBot, AI
Chat, Voice, and Usage, plus the shared workspace-session read. Each route must
preserve the correct shell, disclose that data could not be loaded, and offer a
retry without implying that saved data was lost.
The same gate forces the public catalog, Platform session, health, commerce,
subscription, tenant-directory, support-grant, Voice-control, Voice-routing,
and Voice-incident reads to fail. It proves each failure remains explicit,
role-aware, non-destructive, and retryable.
Target-environment acceptance must repeat it against the deployed artifacts and
does not replace managed-service, live-provider, named-merchant, legal,
commercial, or assistive-technology acceptance.
