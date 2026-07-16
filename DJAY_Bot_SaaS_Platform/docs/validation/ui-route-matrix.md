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
- Workspace Overview renders the same evidence-backed six-step onboarding
  checklist for every role, exposes refresh only to administrators, and has no
  browser control capable of choosing a readiness stage;
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
- approved Terms and Privacy pages render at desktop/mobile breakpoints, while
  missing legal authority disables registration and exposes a retryable state;
- Platform authentication failure is distinct from Platform service failure,
  and failed role-authorized operations resources are named without false
  “no records” claims;
- dropped public, Tenant, and Platform mutation requests resolve into safe,
  non-destructive feedback and never leave the initiating control busy;
- an unavailable support-access disclosure warns the Tenant user instead of
  silently implying that no restricted Platform grant is active;
- the Overview product summary reflects the authoritative subscription and
  access-mode response for read-only and administrative roles, while a failed
  subscription read cannot produce a false empty-product claim;
- Voice Studio secondary-dependency failures preserve the Studio while showing
  explicit Knowledge, notification-profile, and analytics retry states;
- FlowBot and AI Chat secondary-dependency failures preserve primary Studio
  data, expose panel-specific retry states, suppress false empty recipients and
  connections, and disable actions that require unavailable prerequisite data;
- FlowBot omits team and downgrade-preflight requests for roles without the
  respective permissions;
- restricted Platform copy does not claim that foundations are operational
  independently of the evidence-backed readiness and resource states;
- public login, verification, and invitation destinations never fall back to
  localhost in production output;
- newly issued account-link tokens remain outside HTTP query strings, legacy
  links are cleaned after hydration, terminal state is removed, and the branded
  existing-account invitation route works before and after Tenant sign-in at
  desktop and mobile breakpoints;
- registration, new-user invitation, and recovery expose matching password
  guidance and confirmation semantics; three mismatch journeys announce the
  same error, preserve correctable input/token state, and issue no API mutation;
- every rendered email input enforces the API maximum; registration and
  new-user invitation reject whitespace-only normalized names on the exact
  field, preserve correctable state, and issue no API mutation;
- Contact creation rejects a missing identity, short phone, or whitespace-only
  name on the exact field with assertive feedback and zero mutations; accepted
  values are trimmed and success is announced politely;
- first and additional Voice deployment creation use identical bounded fields;
  Studio rejects a greeting outside the immutable 500-character playbook limit
  before transport and switches to the Voice tab for correction;
- FlowBot and AI Chat website deployment forms expose identical name/origin
  boundaries, reject path-bearing URLs with assertive field feedback, preserve
  correction state, and issue no request until an exact origin is supplied;
- every exercised UI state passes the automated axe WCAG 2.2 A/AA rule set,
  including document titles, contrast, keyboard-scroll access, and ARIA
  structure;
- every document response carries the reviewed browser security-header policy,
  exposes no framework identity, and renders without a CSP-blocked resource;
- Public, Tenant, Platform, and API unknown routes return a branded 404 with a
  safe realm-specific recovery action at both desktop and mobile breakpoints;
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
Representative registration, contact-creation, and restricted Voice-control
requests are aborted at the browser boundary. The matrix proves no uncaught
page error occurs, the user sees an accurate failure message, and the submit or
command control becomes available again without an automatic replay.
Target-environment acceptance must repeat it against the deployed artifacts and
does not replace managed-service, live-provider, named-merchant, legal,
commercial, or manual assistive-technology acceptance.
