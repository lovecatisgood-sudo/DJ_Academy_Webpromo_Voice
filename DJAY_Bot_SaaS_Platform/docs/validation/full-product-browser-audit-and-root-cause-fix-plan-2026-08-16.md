# DJAY Bot full-product browser audit and root-cause fix plan

Date: 2026-08-16  
Scope: non-social Flow Bot, AI Text Bot, AI Voice Bot, deployment account, merchant workspace, Platform operations, and release verification  
Authority: market-release PRD, approved experience contract, approved full-flow reference, then maintained architecture and implementation documents  
Commercial state: pre-release; all six catalog packages remain non-sellable until accepted evidence exists

## Audit method and evidence boundary

The audit used a fresh project-managed Playwright Chromium profile against isolated localhost services. It did not use a user browser, saved profile, production account, real Stripe transaction, or production customer data. Desktop and mobile builder journeys were checked visually, with keyboard traversal, automated WCAG rules, direct interaction, request inspection, and the maintained Flow connector and UI suites. Provider packages, database migrations, registry state, environment wiring, dependency advisories, and release gates were also inspected through the CLI.

The public Builder was audited in Chromium at `127.0.0.1:3110`. The first Tenant and Platform processes found at ports 3101 and 3102 were development servers running under production CSP. React development hydration attempted `eval`, the CSP correctly denied it, and those pages remained in their loading shell. Results from that invalid environment are not product-feature verdicts. Clean production-mode Tenant and Platform instances were prepared on ports 3111 and 3112, but the environment approval reviewer required a new, explicitly production-mode browser authorization before those suites could run. That final browser gate remains pending; no browser workaround is permitted.

## Remediation checkpoint after implementation

The following status is evidence-bounded. “Fixed locally” means the root-cause
code and focused regression pass; it does not mean production/provider or human
acceptance has been invented.

| Finding | Status on 2026-08-16 | Evidence or remaining boundary |
|---|---|---|
| AUD-001 | Open architecture migration | `/build` remains the approved static reference. Server-owned anonymous drafts and application routes are still required. |
| AUD-002 | Open | Superseded registration implementation and its legacy browser suite still require a deliberate account-at-deploy replacement, not a partial deletion. |
| AUD-003 | Partial | The invalid dev+CSP cause is documented and all new Builder suites close Chromium in `finally`; a reusable production-app identity/hydration preflight is still required before Tenant/Platform browser acceptance. |
| AUD-004 | Fixed locally | One `activateSurface` authority now applies `hidden`, `inert`, and `aria-hidden`; keyboard containment and surface isolation pass on Text/Voice desktop and mobile. |
| AUD-005 | Fixed locally | Mobile tester now has a bounded transcript, pinned action area and viewport-safe sheet. Long Flow conversation and Text/Voice mobile reachability pass. |
| AUD-006 | Fixed locally for audited Builder states | Semantic foreground changes plus reduced-motion Axe runs produce zero serious/critical violations on the focused Text/Voice matrix. Full page-by-page EN/TH acceptance remains part of the final browser gate. |
| AUD-007 | Partial | Public QA now sets the server-authoritative locale cookie and the configuration says supported customer languages. Complete Builder UI localization and one shared locale contract across all realms remain. |
| AUD-008 | Open product workflow | A complete versioned side-by-side Text/Voice translation review resource is not yet implemented. |
| AUD-009 | Fixed locally | Empty-canvas panning uses pointer capture and verified visible hit points; the connector suite now passes. |
| AUD-010 | Fixed locally | Symmetric connect/reconnect/disconnect, wire selection, connected-node deletion, undo/redo and persistence pass for all 33 option edges. |
| AUD-011 | Fixed locally | Exhaustive EN/TH option traversal remains layer-by-layer and tree-authoritative; services, hours and pricing no longer jump to contact. |
| AUD-012 | Fixed for the current Builder projection | New live-browser QA imports `djai.academy`, reaches review with DJAI Academy identity/services/contact/sources and fails if Harbor data survives. Server-owned persistence is covered by AUD-013. |
| AUD-013 | Open architecture migration | Safe one-request failure recovery exists, but durable idempotent import jobs and anonymous-draft ownership transfer do not. |
| AUD-014 | Fixed locally | Builder/API now send hours, contact, FAQs, approved knowledge chunks and bounded prior messages. Browser request inspection verifies first-turn knowledge and second-turn history. |
| AUD-015 | External configuration gate | Adapters exist, but no active provider/model/API key/gateway route is present in the audited environment; no live Grok claim is permitted. |
| AUD-016 | Partial | One preserving repair plus safe fallback is implemented, usage is aggregated, provider timeout defaults to 20 seconds, and output budget defaults to 1,600 tokens. Live latency/cost/quality evidence remains. |
| AUD-017 | Fixed locally | The Product Owner approved a 200 locale-aware word ceiling on 2026-08-17. Normative registry/docs, Sales Core, AI runtime and Builder use concise targets, one preserving rewrite and no string slicing. EN/TH boundary tests pass. |
| AUD-018 | Open | Builder Voice remains a clearly labelled simulation; a real consent/microphone/media tester requires the live provider route. |
| AUD-019 | External configuration and qualification gate | Gemini Live and OpenAI Realtime adapters/tests exist; active Voice deployment configuration and unmocked acceptance do not. |
| AUD-020 | Open architecture migration | Account-at-deploy remains a local reference interaction; real draft claim, registration, verification and one-time survey continuation are not wired into `/build`. |
| AUD-021 | Open Stripe integration | Text card verification and one-trial-per-card remain simulated. No real card was used in this audit. |
| AUD-022 | Open architecture migration | Publish/install/verify/go-live remain reference interactions rather than server-owned deployment state. |
| AUD-023 | Fixed locally | `nanoid` override is 3.3.18; a successful registry audit reported no known vulnerabilities before the later network-only advisory lookup failure. |
| AUD-024 | Fixed locally with repeat evidence | Appointment claim and stale comparison share PostgreSQL `transaction_timestamp()`. On 2026-08-17, 20 consecutive focused isolated runs and three fresh full 102-migration database suites passed. |
| AUD-025 | Partial | Current public Builder/package copy uses Flow/Text/Voice names and the maintained 337-record registry validates at zero accepted/six non-sellable. Legacy fixtures and internal compatibility aliases still need a bounded cleanup. |
| AUD-026 | Partial | ADR-013, current 337-count documents, response policy and public locale QA are reconciled. The old signup-first UI foundation suite still needs replacement with account-at-deploy E2E. |
| AUD-027 | External staging gate | Unmocked email, Stripe, object storage, Calendar, Text, Voice and telephony evidence cannot be created without approved configured staging services. |
| AUD-028 | External authority gate | Legal/tax/security/human acceptance and soak evidence remain exactly as listed; code cannot invent them. |
| AUD-029 | Preserved and verified by repository gate | Social remains a separate disabled release train and all packages remain non-sellable. |

Focused Chromium evidence now passes `qa:flow-demo-connectors`,
`qa-flow-studio-uiux.mjs`, `qa:builder-accessibility`, and
`qa:builder-live-import`. The full `pnpm verify` gate also passed after the core
fixes, covering lint, typecheck, unit/integration-capable tests and production
builds for all 35 packages.

## Confirmed findings

### A. Product and experience architecture

#### AUD-001 — `/build` is the approved reference HTML, not a production application

- Evidence: `apps/public-site/app/build/route.ts` reads `docs/design/djay-bot-text-voice-configuration-flow.html` from disk and returns it as one static document.
- Impact: the page can demonstrate the approved sequence, but it cannot truthfully provide production persistence, authentication, subscription provisioning, deployment, installation verification, or merchant ownership.
- Root cause: the approved clickable reference was promoted to the main product entry before its states were implemented as application routes and server-owned resources.
- Required fix: implement the approved pages in maintained application code and keep the HTML file as a design reference only. Do not add a second competing flow.
- Acceptance: page refresh, browser change, and authenticated continuation preserve the server-owned draft; every state-changing control maps to an authenticated or anonymous-draft API; no production page calls itself a demo or simulation.

#### AUD-002 — superseded public account code remains in source while `/register` redirects to `/build`

- Evidence: `apps/public-site/app/register/page.tsx` still contains the old signup-first form and legacy plan labels, while `next.config.ts` redirects `/register` to `/build`.
- Impact: dead code, stale QA, and future regressions can restore the explicitly rejected signup-first experience.
- Root cause: routing was changed without deleting or replacing the superseded implementation and contracts.
- Required fix: remove the superseded registration page implementation and replace tests with deployment-account continuation tests. Preserve email verification, password recovery, and invitation APIs as reusable account capabilities.
- Acceptance: repository search finds no active signup-first CTA or obsolete Basic/Premium customer copy; `/register` has one documented compatibility behavior; deployment is the only new-owner account prompt in the builder.

#### AUD-003 — merchant and Platform browser QA can produce false failures under dev+CSP

- Evidence: Chromium logged `eval() is not supported in this environment`; no hydrated `/tenant/*` requests occurred; pages remained loading. The running processes were `next dev` while production CSP was active.
- Impact: a port can be healthy while the application is not testable, and browser suites can time out without identifying the environmental cause.
- Root cause: browser QA preflight validates HTTP only, not build mode, hydration, console state, or expected application identity.
- Required fix: add a QA preflight that requires production builds, verifies an app-specific marker and hydration, rejects React dev mode/HMR, and prints the app-to-port map. Make every browser suite close its browser in `finally`.
- Acceptance: wrong app, dev mode, hydration failure, and stale build each fail in under ten seconds with a specific message.

### B. Onboarding, layout, accessibility, and navigation

#### AUD-004 — Text and Voice onboarding do not isolate the later Configuration Studio

- Chromium evidence: the onboarding surface has no modal semantics; the Studio is not inert; Tab escapes after the fifth onboarding control to `Back to dashboard`, configuration navigation, fields, and tester controls.
- Mobile evidence: later configuration and the tester are rendered below the active onboarding step, creating a 2,152px initial document.
- Impact: keyboard and assistive-technology users can edit future steps out of order; sighted mobile users see conflicting stages and controls.
- Root cause: onboarding and Studio are sibling surfaces toggled visually, but inactive surfaces are neither hidden nor inert and there is no focus boundary/restoration.
- Required fix: make the current top-level surface the only rendered or non-inert surface; use route/state ownership instead of overlays where practical; otherwise apply `hidden`, `inert`, and correct dialog/focus management. Restore focus to the initiating control on backward navigation.
- Acceptance: Tab and Shift+Tab remain within the current step; accessibility tree contains no later-stage controls; mobile initial height contains only the active page; browser Back restores the prior approved step.

#### AUD-005 — mobile Text and Voice testers can be visible yet unusable

- Chromium evidence: Playwright found `#sendTest` and `#voiceTest` visible and enabled but could not scroll either into the viewport. The controls remained outside the viewport through all retry attempts.
- Impact: a merchant can start a test but cannot reach the latest response or submit the next turn.
- Root cause: the fixed/sticky tester layout is active behind onboarding and combines document scrolling with an unbounded panel instead of a bounded transcript and pinned composer.
- Required fix: hide the tester until Studio opens; on mobile open it as an accessible sheet/full-screen route with a bounded `minmax(0,1fr)` transcript, `overflow-y:auto`, a pinned composer, safe-area padding, and automatic latest-turn scroll that does not steal focus.
- Acceptance: 30-turn Text and Voice transcripts keep the latest response and composer visible at 320, 360, 390, 768, and desktop widths; keyboard appearance does not cover Send; closing restores focus.

#### AUD-006 — serious color-contrast failures exist in navigation and selected role cards

- Axe evidence: six Flow desktop nodes and seven Text/Voice desktop nodes failed color contrast; the selected Sales role description also failed on mobile.
- Impact: important state and guidance are unreadable for low-vision users and fail WCAG AA.
- Root cause: muted foreground colors designed for white are reused on tinted/forest or selected surfaces.
- Required fix: define semantic foreground tokens for canvas, selected, forest, warning, and disabled states; do not patch individual nodes with arbitrary colors.
- Acceptance: zero serious/critical Axe violations on every audited builder page in English and Thai, desktop and mobile; token contrast is unit-tested where feasible.

#### AUD-007 — package/onboarding localization state is not server-first and QA keys conflict

- Evidence: the public site renders from the `djay-locale` cookie, while several browser scripts set only `djay-ui-locale`; builder content is largely fixed English. Old scripts wait for English headings after a Thai server render.
- Impact: tests are unreliable and customers can select Thai but still see English options.
- Root cause: two locale storage mechanisms and prototype-only English strings coexist.
- Required fix: use one locale contract (`djay-locale` cookie as initial authority, local storage only as a synchronized convenience); every customer-facing builder string and generated customer option must have EN/TH values. Merchant configuration must say supported customer languages, not imply the merchant chooses one permanent customer language.
- Acceptance: first response HTML uses the selected locale; changing locale updates route/state and cookie; customer chooses EN/TH when the Bot starts; Flow choices and Text/Voice generated messages use the active conversation language; no DOM text mutation localization.

#### AUD-008 — translation review is not a complete merchant workflow

- Evidence: Flow options have translation support, but Text/Voice generated business messages and FAQs do not expose a complete side-by-side EN/TH review with missing/stale status.
- Impact: merchants cannot verify what Thai and English customers will receive.
- Root cause: translation is treated as field-level generation rather than a versioned review resource.
- Required fix: add a Translation panel covering greetings, disclosures, Flow messages/options, FAQ questions/answers, fallback/handover text, booking/contact prompts, and generated role messages. Mark source revision, translated revision, missing, stale, reviewed, and intentionally shared text.
- Acceptance: editing either language marks the counterpart stale only when applicable; missing customer-facing text is a structural publish blocker, while unreviewed but complete translations remain advisory.

### C. Flow Bot canvas and deterministic runtime

#### AUD-009 — empty-canvas middle-button drag does not pan

- Chromium suite failure: viewport stayed `{x:80,y:60,zoom:1}` after a middle-button drag on empty canvas.
- Impact: the claimed infinite canvas cannot be navigated naturally and right-side space becomes unreachable.
- Root cause: pan initiation is restricted to the wrong mouse button/event path or is intercepted by the canvas surface.
- Required fix: centralize pointer-state handling; allow primary-button drag on true empty canvas and middle-button drag anywhere non-interactive; use pointer capture; exclude nodes, ports, wires, controls, inputs, and open panels; remove finite coordinate clamps.
- Acceptance: mouse, trackpad/pointer, and middle drag pan in all directions at every zoom; node drag never pans; canvas does not select page text.

#### AUD-010 — connector interaction needs one symmetric state machine

- Current evidence: right-source and left-connected endpoints now support connect, reconnect, and direct disconnect in the maintained suite, but the canvas-pan failure stops the complete connector suite before final acceptance.
- Risk: previous fixes changed one endpoint at a time, causing asymmetric behavior and regressions.
- Root cause: source selection, destination selection, wire selection, drag, reconnect, disconnect, and keyboard delete were historically implemented through separate event branches.
- Required fix: retain one route identity `{sourceId, kind, optionIndex}`, one selected-edge state, and one pending-connection state. Both endpoint directions must call the same reconnect/disconnect command. Removing a node must atomically remove all incoming/outgoing references without blocking deletion.
- Acceptance: connect from either side, reconnect from either side, drag either endpoint to empty canvas to disconnect exactly one route, select wire then Delete/Disconnect, remove a connected node, undo/redo every operation, and reload persistence all pass.

#### AUD-011 — Flow execution must remain layer-by-layer and tree-authoritative

- Current evidence: the maintained suite validates 33 option edges, 66 localized resolutions, opening-hours/service/pricing branches, and explicit contact-form consent. Previous regressions jumped directly to contact or appended a generic next-step message.
- Risk: future intent matching may bypass configured options.
- Root cause: typed intent matching and automatic path execution were previously allowed to traverse more than one customer decision node.
- Required fix: resolve a typed utterance only against choices available at the current decision node; execute deterministic non-choice nodes until the next decision/action boundary; never cross a choice without an explicit customer input; actions/forms require the configured explicit edge.
- Acceptance: exhaustive EN/TH traversal of every template and every option; no skipped decision node; services/opening-hours/pricing stop at the next layer; contact form opens only from its explicit option.

### D. Website import and generated configuration

#### AUD-012 — website import success is not protected by end-to-end identity assertions

- Chromium evidence: a controlled import correctly populated DJAI Academy name, summary, offers, hours, contact, one FAQ, and two sources. Earlier user testing saw stale Harbor Studio sample data.
- Impact: a successful fetch can still leave sample fields elsewhere in the draft, tester, account form, or dashboard.
- Root cause: imported profile application is a set of direct assignments without a single normalized draft projection and no invariant banning seed identity after a successful non-seed import.
- Required fix: normalize one `ImportedBusinessProfile`, apply it through one reducer to business, Bot identity, knowledge, account business name, services, sources, tester, and dashboard preview. Keep previous data on failure and never substitute samples.
- Acceptance: import `djai.academy` and assert the imported identity across every visible surface and persisted payload; repository/browser checks fail if `Harbor` survives after successful import.

#### AUD-013 — import failure recovery is safer but still prototype-local

- Evidence: current copy preserves the draft and offers Retry/manual paths; the endpoint can return clear URL, timeout, rate, or availability reasons.
- Impact: there is no durable job, retry identity, source evidence, or authenticated continuation.
- Root cause: import state exists only inside the static page and a single request.
- Required fix: create an anonymous draft/import job with idempotency, safe public-URL policy, bounded crawl, source snapshot metadata, progress polling, cancellation, retry, and later account ownership transfer.
- Acceptance: retry never duplicates sources; cancellation terminates work; failure never overwrites the last good profile; allowed partial public pages can be selected explicitly; login/private pages remain excluded.

### E. AI Text runtime

#### AUD-014 — AI tester omits FAQs, hours, contact, sources, and conversation history

- Chromium request evidence: both test requests contained only name, summary, offers, objective, behavior, and boundaries. `faqs`, `hours`, `contact`, `messages`, and source revisions were absent.
- API evidence: `/public/builder/ai-test` sends `knowledgeChunks: []`.
- Impact: opening-hours and FAQ questions can fail even though the merchant configured the answer; follow-up turns are stateless.
- Root cause: the public test DTO is a reduced prototype shape, disconnected from the production agent draft and Sales Core knowledge contract.
- Required fix: define one versioned `AgentTestRequest` shared by anonymous Builder and authenticated Test Center. Include bounded recent messages, approved FAQ/hours/contact/offer knowledge chunks with source IDs/revisions, active locale, role behavior, and safe action policy. Retrieve knowledge server-side rather than trusting arbitrary client claims after account ownership.
- Acceptance: English and Thai opening-hours/services/FAQ tests cite the configured source; a follow-up pronoun depends on prior history; unauthorized knowledge cannot be injected; payload bounds and redaction are tested.

#### AUD-015 — live Grok/Text provider is not configured in the active environment

- Evidence: `.env.example` documents provider variables, but active `.env` files contain only `AI_TEXT_GATEWAY_SERVICE_TOKEN`; no active provider, model, key, or gateway endpoint exists.
- Impact: the UI claims live Grok testing while the gateway is unavailable.
- Root cause: adapter implementation and deployment configuration were treated as the same completion state.
- Required fix: keep provider-neutral owner configuration, validate one selected provider/model at startup, fail closed with an honest UI state, and document secret placement without printing secrets. The SaaS owner chooses provider/model; merchants never do.
- Acceptance: an unmocked staging call succeeds through Builder -> API -> AI gateway -> selected provider -> Sales Core; provider/model names remain absent from merchant UI/log exports; kill switch and timeout work.

#### AUD-016 — provider adapters lack bounded repair and production optimization evidence

- Evidence: structured output, service auth, HTTPS enforcement, timeout, idempotency, usage capture, and provider-leak guards exist. Output-token defaults remain 2,000; no controlled repair handles invalid or over-limit content; no live latency/cost/quality evidence exists.
- Required fix: use role/channel-specific concise prompts and output-token budgets, schema validation, one bounded repair call, safe fallback, latency/usage metrics, and executable quality cases. Never silently switch providers.
- Acceptance: invalid schema and oversized replies recover once then fail safely; p50/p95 latency, usage, error class, repair rate, and citation coverage are observable without exposing provider secrets to merchants.

#### AUD-017 — response-length policy reconciled to the approved user requirement

- Evidence: PRD, Sales Core, builder fields, test evidence, and Voice all enforce 200 visible grapheme characters. The user requires concise responses with a hard maximum of 200 words and no direct cutoff.
- Required fix: update the normative contract to a platform-owner policy: Text aims for roughly 40–80 words, Voice 20–50 words, with a shared hard maximum of 200 locale-aware words. Use `Intl.Segmenter(locale,{granularity:"word"})` for English and Thai. Instruct the model before generation; if oversized, perform one fact/action/citation-preserving rewrite; validate; use a safe concise fallback if repair fails. Never slice the string.
- Acceptance: EN/TH 199, 200, and 201-word tests; no broken graphemes; no lost citations, facts, disclosure, or proposed actions; Voice validation occurs before TTS.

### F. AI Voice runtime

#### AUD-018 — Builder Voice test is an explicit timer-based simulation

- Chromium evidence: the control says `Start simulated voice test`; it does not request microphone access; after 600ms it replaces the transcript and says simulation complete.
- Impact: merchants cannot validate microphone permission, streaming transcription, interruption, actual model response, or TTS before deployment.
- Root cause: the clickable reference was never replaced with the implemented Voice gateway client.
- Required fix: wire an explicit-consent live tester to an ephemeral Voice session grant, selected owner provider/model, microphone permission, disclosure-first playback, transcription, interruption, Sales Core tools, termination, and evidence. Keep a clearly labeled no-microphone scripted diagnostic as a separate option.
- Acceptance: allow/deny microphone paths, English/Thai speech, interruption, reconnect, idle timeout, provider failure, capacity denial, tool proposal, transcript/recording policy, and session cleanup pass unmocked in staging.

#### AUD-019 — Voice runtime code exists but active deployment configuration is absent

- Evidence: Gemini Live and OpenAI Realtime adapters, admission, reconnect, capacity, settlement, and 19 passing gateway tests exist. Active `VOICE_RUNTIME_ENABLED`, gateway URL, provider/media/auth/turn endpoints, and keys are absent.
- Required fix: deploy one explicitly selected provider behind the provider-neutral gateway, validate all required configuration atomically, expose only a generic unavailable state, and retain fail-closed admission. Grok may be selected for Text only if it does not provide the required real-time Voice contract; provider selection remains an owner decision.
- Acceptance: unmocked staging media session, disclosure, interruption, tool call, settlement, capacity, and shutdown evidence; no fallback or provider identity leakage.

### G. Account, trial, billing, deployment, and persistence

#### AUD-020 — deployment account creation is local simulation with no network mutation

- Chromium evidence: valid account fields set `state.accountCreated=true` and open the Text card prompt, while zero account mutations were sent. Draft persistence remained prototype-local.
- Impact: signup, email verification, one-time onboarding, legal acceptance, workspace ownership, and continuation are not real in the approved flow.
- Root cause: production auth APIs exist behind a superseded page but are not connected to the deployment continuation.
- Required fix: create an anonymous server-owned draft token; at Deploy Bot, register or sign in, bind current Terms/Privacy versions, send verification email, and after verification atomically transfer the draft to the new workspace. Existing accounts sign in and attach the draft with authorization checks.
- Acceptance: new verified email, existing email, resend, expired token, recovery, duplicate request, conflict, and cross-account draft-claim tests; first-time survey occurs once per account after first entry and never after a failed save.

#### AUD-021 — Text trial card verification is simulated and does not enforce one trial per card

- Evidence: Builder validates card field lengths locally, then marks the card verified and trial live. It does not contact Stripe, perform the approved small verification, or persist a fingerprint.
- Required fix: only after a configured Bot reaches Deploy, create a Stripe SetupIntent/payment verification flow; store Stripe Customer and a one-way keyed hash of the payment-method fingerprint; enforce one Text trial per card transactionally. Do not charge automatically at trial end. Flow trial uses verified email only and no card. Voice has no trial.
- Acceptance: one successful Text trial per card across emails/workspaces, retries are idempotent, declined/3DS/cancelled paths preserve the draft, raw card/fingerprint is never stored, and Flow never asks for a card.

#### AUD-022 — publish, install, verify, and go-live controls are simulated

- Evidence: publish copies local JavaScript objects; verification checks a string/timer; deployment only flips local booleans.
- Required fix: use immutable server versions, deployment keys/origin allowlists, real snippet installation checks, explicit traffic state, audit log, rollback, and kill switch. Structural errors may block publish; advisory warnings may not.
- Acceptance: publish cannot mutate the prior version; install failure does not imply publish failure; verify cannot enable traffic; Deploy revalidates account, access, trial/payment, version, origin, and safety invariants server-side.

### H. Security, test reliability, documentation, and release evidence

#### AUD-023 — high-severity `nanoid` advisory

- Evidence: `pnpm audit` reports GHSA-2v37-7h3g-55p8; workspace pins 3.3.17; patched version is at least 3.3.18.
- Required fix: upgrade the override to a patched compatible version, refresh the lockfile, build and run all affected Vite/Vitest/PostCSS paths.
- Acceptance: no high/critical audit finding and no generated-ID/build regression.

#### AUD-024 — database appointment retry test has a clock race

- Evidence: a full fresh database run failed because `available_at=now()` could be slightly later than the JavaScript `claimed_at`; the focused suite passed.
- Root cause: database and process clocks are compared without one injected authority.
- Required fix: use a controlled database timestamp or pass one deterministic instant to both update and claim; do not add sleeps.
- Acceptance: at least 20 consecutive focused runs and three fresh full migration/integration runs pass.

#### AUD-025 — package and registry vocabulary are stale

- Evidence: old QA fixtures still expose `FlowBot Basic`, `AI Chatbot Premium`, and legacy product keys; the maintained registry now has 337 requirements: 9 implemented, 11 in progress, 316 planned, 1 blocked, and 0 accepted.
- Required fix: use approved Flow, Text, and Voice public names everywhere while preserving internal migration aliases only where required. Reconcile implementation statuses against evidence, but never mark accepted or sellable without authorized acceptance.
- Acceptance: generated registry validates; all six packages remain `sellable:false` until their required evidence is accepted; no customer-facing legacy names remain.

#### AUD-026 — documentation and QA contracts conflict with current code

- Evidence: ADR-013 says OpenAI Realtime is not implemented although adapter code exists; older readiness docs cite 297 requirements; `qa-ui-foundation` expects `/register` signup-first; status/locale suites seed the wrong locale authority.
- Required fix: update normative/current docs, mark historical evidence as historical, revise QA to the approved package-first/account-at-deploy flow, and use current generated registry counts.
- Acceptance: source-of-truth checks fail stale counts, stale route expectations, and superseded names; ADR status distinguishes implemented adapter from production-qualified provider.

#### AUD-027 — active provider and external-service evidence remains incomplete

- Missing unmocked evidence: email delivery, Stripe, object storage/malware scanning, Google Calendar, AI Text, AI Voice, and telephone carrier/media/CDR for advanced Voice.
- Required fix: create staging runbooks and machine-verifiable evidence collectors; secrets remain deployment-only.
- Acceptance: each integration has success, timeout, invalid credential, provider outage, retry/idempotency, and kill-switch evidence.

#### AUD-028 — human/legal/security/release gates remain external

- Pending: formal legal/privacy/DPA/retention/international-transfer/subprocessor/AI/Voice-recording evidence reconciliation; Thai tax evidence; penetration test; named Thai merchant usability acceptance; 48-hour staging soak and kill-switch drill.
- Boundary: previous counsel approval and non-VAT status may be recorded as supplied authority, but technical work must not invent a signed document, tax determination, penetration result, merchant acceptance, or soak duration.

#### AUD-029 — Social/LINE must remain disabled

- Evidence: social is a deferred release train and must default false.
- Required fix: preserve `SOCIAL_CHANNELS_RELEASE_ENABLED=false`; public Builder, catalog, credentials, and workers must fail closed and must not require social credentials for non-social launch.
- Acceptance: release tests prove social routes/actions unavailable when the gate is false and non-social Flow/Text/Voice remain independent.

## Dependency-aware implementation plan

### Wave 0 — protect the source of truth and test environment

1. Add the production-browser preflight and app identity markers.
2. Update locale setup in browser QA and replace stale `/register` assumptions.
3. Add regression tests for every confirmed Builder failure before changing behavior.
4. Update current documentation counts and ADR implementation/qualification wording.

Exit gate: wrong app/build mode cannot produce a false product verdict; tests describe the approved flow only.

### Wave 1 — repair current Builder usability without changing product decisions

1. Isolate onboarding from Studio and tester using one top-level surface state, `hidden`/`inert`, and focus restoration.
2. Rebuild mobile tester geometry with bounded transcript and pinned composer.
3. Replace contrast values with semantic tokens.
4. Repair infinite-canvas pan and complete the symmetric connector suite.
5. Keep deterministic Flow traversal tests exhaustive in both languages.

Exit gate: Flow/Text/Voice onboarding, keyboard, responsive, contrast, tester, canvas, connectors, deletion, undo/redo, translation choices, and deterministic paths pass in Chromium.

### Wave 2 — unify anonymous draft, import, translation, and AI test contracts

1. Define versioned anonymous draft and imported-profile schemas.
2. Project imports through one reducer and ban stale seed identities.
3. Add durable import jobs and ownership-safe continuation.
4. Add the side-by-side translation resource and review UI.
5. Send full bounded knowledge and conversation history to one shared Test Center contract.

Exit gate: `djai.academy` propagates everywhere; EN/TH FAQ/hours/services and follow-ups are grounded; refresh/retry does not lose the draft.

### Wave 3 — implement the 200-word concise-response policy

1. Amend normative product/architecture/UX/runtime contracts from 200 characters to the approved platform policy.
2. Add locale-aware word counting, channel-specific target lengths, one controlled rewrite, and safe fallback.
3. Apply before TTS and update evidence UI.

Exit gate: EN/TH 199/200/201 cases and fact/citation/action preservation pass across Sales Core, Text gateway, Builder, and Voice gateway.

### Wave 4 — connect owner-selected live Text and Voice providers

1. Validate owner-only provider/model configuration and deployment secrets.
2. Tune token/latency budgets and add repair/observability.
3. Wire live Text tester.
4. Wire ephemeral-consent Voice tester and disclosure/media lifecycle.

Exit gate: unmocked staging Text and Voice journeys pass without provider leakage; fail-closed states are honest.

### Wave 5 — make account-at-deploy and trials real

1. Replace dead signup-first UI with draft claim at deployment.
2. Connect registration/sign-in, legal versions, verification, recovery, one-time survey, and workspace ownership.
3. Implement Flow email trial and Stripe Text card trial at Deploy only; keep Voice trial unavailable.
4. Revalidate and provision immutable versions/deployments server-side.

Exit gate: full new/existing account E2E, one-survey-only behavior, one-trial rules, no automatic trial charge, and recovery/idempotency pass.

### Wave 6 — hardening and release evidence

1. Upgrade `nanoid`, repair the database clock race, and run repeated stability suites.
2. Reconcile registry status and all current docs without inventing acceptance.
3. Run unmocked integration evidence, accessibility/responsive acceptance, penetration test, named merchant acceptance, and soak/kill-switch drill under the required authorities.

Exit gate: only after required evidence is accepted may a package become sellable.

## Mandatory regression matrix

- Viewports: 320x568, 360x800, 390x844, 768x1024, 1280x800, 1440x900.
- Locales: Thai-first server render and English-first server render; customer-selected EN and TH conversations.
- Input: mouse, middle-button pan, primary empty-canvas pan, keyboard-only, touch/pointer, reduced motion.
- Flow: all six templates, all options in both languages, typed intent at each current layer, connect/reconnect/disconnect from both endpoints, wire selection, delete connected node, undo/redo/reload.
- Import: success, partial, invalid URL, private URL, redirect rejection, timeout, rate limit, cancellation, retry, stale job, duplicate submission.
- Text: FAQ, hours, services, contact, follow-up context, unsupported claim, adversarial prompt, action proposal, provider timeout, invalid schema, 199/200/201 words EN/TH.
- Voice: permission allow/deny, disclosure, English/Thai, interruption, silence, reconnect, capacity, provider failure, tool proposal, limit repair before TTS, cleanup.
- Account: new email, existing email, wrong password, verification resend/expiry, recovery, legal version change, duplicate request, failed save, survey once, cross-tenant denial.
- Trial/deploy: Flow no card, Text card only at Deploy, duplicate card, decline/3DS/cancel, no auto-charge, Voice no trial, publish/install/verify/go-live separation.
- Security/reliability: RLS, CSP/security headers, no secret/provider leakage, audit advisory, migration/full DB repeatability, kill switches, social disabled.

## Completion rule

A code path is not complete merely because it exists or a mocked test passes. It is complete only when its root-cause acceptance criteria pass, dependent journeys remain green, documentation and registry state match the evidence, and no acceptance or sellability is claimed without the required authority.
