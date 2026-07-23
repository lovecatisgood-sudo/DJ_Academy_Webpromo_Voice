# Score evidence ≥9.5 (G8)

Last updated: 2026-07-23  
SKU scope: `flowbot_basic`  
Rule: A role is **≥9.5** only when **every** Must-Pass row is Pass with a link. No vibes.

**G8 posture today:** **scaffold only — not certified.** Depends on G7 + closed G6/G6b/G6c/G6e (and G6d for SRE).

Legend: **Pass** = evidence linked · **Partial** = eng/docs present, staging/counsel open · **Open** = missing

---

## Cast A

### Logician / PM measurement

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| Gate diagram matches executed order (no skipped G1b/G6b) | Partial | `docs/plans/2026-07-22-path-to-10-all-roles.md` §4; G6b not closed |
| Release dashboard ≤1 sellable package | Pass | `docs/plans/release-dashboard.md` — all `sellable: false` |
| Decision register reconciled with G7 | Partial | `SKU1-DEC-001..003`; G7 flip not done |

### Code expert

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| `purchase_intent` migration + types | Pass | `packages/db/migrations/0079_purchase_intents.sql` |
| `withTenantMutation` covers checkout/deploy/privacy/team | Pass | `apps/api/lib/tenant-mutation.ts`; `docs/validation/phase8-engineering-hardening.md` |
| Commerce capability profile (API without Stripe) | Pass | `apps/api/lib/commerce-capability-profile.ts` |

### CTO

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| Two-train ownership in PROJECT_STATE | Pass | `PROJECT_STATE.md` owners + SKU1 program |
| Sellable kill switch drilled once | Open | `docs/runbooks/sellable-kill-switch.md` — drill ☐ |
| P50/P80 vs actual published weekly | Open | Scoreboard calendar present; weekly actuals not logged |

### Red team

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| G1b rate limits + checkout reauth | Partial | Unit Pass (`tenant-mutation`/`g1b`/`assurance`); staging flood open |
| G6b pen-test lite report | Partial | Wave 1.5 unit/static Pass; HTTP + Crit/High disposition open |
| Widget origin + webhook signature in G6 | Partial | Smoke script + `verifyStripeWebhook` unit Pass; staging HTTP open |
| Root missing-Origin session mint (RV-G1) | Pass | Root Voice safety complete (PROJECT_STATE RV-G1) |

### Merchant

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| Pay alone → active access | Open | Needs G6 staging paid path |
| Wizard next-step always linked | Pass | Phase 5–6 `nextHref` / setup wizard |
| Deploy snippet + install check | Pass | `/workspace/setup` deploy step |
| MFA QR | Pass | Phase 7 MFA QR + recovery download |
| Honest signup copy | Partial | Paid-first copy present; live review open |
| TH or EN UI chrome selectable | Pass | `apps/tenant-web/lib/i18n/setup-chrome.ts` |

### Staff (interim)

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| Default landing = Inbox | Pass | Role homes Phase 7 |
| Search conversations | Pass | Inbox `q=` Phase 7 |
| Studios hidden/demoted for agent | Pass | Sidebar role filter Phase 7 |
| Takeover/reply/release on first-SKU channel | Partial | Routes exist; staging journey open |

### SQA

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| G6 unmocked E2E green | Open | `docs/validation/p-first-sku-e2e.md` |
| G6b adversarial closed | Open | pen-test lite |
| SKU requirement IDs accepted | Open | `docs/compliance/sku1-requirement-acceptance-list.md` |
| Feature matrix / no Pass without link | Partial | Scoreboard + this file |

### UX / UI

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| Grouped nav + mobile drawer | Pass | Phase 7 |
| Wizard primary CTA | Pass | Phase 6 |
| Studios tabbed | Pass | FlowBot tabs Phase 7 |
| No snake_case roles/stages in chrome | Pass | `workspace-labels` + FlowBot/AI Chat/Team/Usage/Operations chrome (2026-07-23) |
| TH/EN chrome | Pass | setup-chrome |

### SWE / product engineering

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| G5 hardening | Pass | Phase 8 validation |
| RV-G1 | Pass | PROJECT_STATE |
| Commerce profile | Pass | Phase 8 |
| No open High from G6b | Open | G6b not closed |

### Product Designer / Product / Coding Agent / PRD Architect

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| First-SKU IA matches wizard + grouped nav | Pass | Phases 5–7 |
| PRD EXP/ONB subset tracked | Partial | Acceptance list drafted; not accepted |
| Agent/coding constraints respected (no sellable flip) | Pass | `pnpm gate:sellable-flip` |

---

## Cast B

### Privacy / Compliance

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| PII registry | Pass | `docs/compliance/pii-registry.md` |
| Erasure/export coverage or residual list | Partial | `0080` + `docs/compliance/dsar-residual-list.md` (counsel ☐) |
| Legal basis + Notice subprocessors | Partial | matrix + subprocessors draft; counsel Notice ☐ |
| DSAR runbook + SLA | Pass | `docs/runbooks/dsar.md` |
| G6c signed | Open | `docs/validation/phase10-privacy-g6c.md` |

### SRE

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| Ready probes on Cloud Run | Partial | Terraform updated; staging apply ☐ |
| Checkout + webhook metrics/alerts | Partial | `monitoring-commerce.tf`; deploy ☐ |
| Kill-switch drill logged | Open | sellable-kill-switch checklist ☐ |
| Root Voice single-instance constraint | Pass | `DEPLOYMENT.md` G6d decision |
| G6d signed | Open | `docs/validation/phase12-reliability-g6d.md` |

### RevOps

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| Tax/dunning decision | Pass | `SKU1-DEC-002` |
| One SKU live_ready + paid E2E | Open | mapping runbook; seed ☐ |
| Pilot vs paid rules | Pass | `SKU1-DEC-003` |
| Merchant receipt/invoice | Partial | Portal + documents UI; live receipt ☐ |
| G6e signed | Open | `docs/validation/phase11-commercial-g6e.md` |

### Support / Success

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| Playbook O1 published | Pass | `docs/runbooks/customer-support-sku1.md` |
| Named merchant worksheet | Partial | drafted; signed ☐ |
| TH macros top tickets | Pass | playbook + kill-switch comms |
| No Sev-1 pay→access open | Open | needs production/staging watch |

### a11y

| Must-Pass | Status | Evidence |
|-----------|--------|----------|
| MFA QR | Pass | Phase 7 |
| Mobile drawer + skip link | Pass | Phase 7 |
| Tab ARIA on studios | Pass | Phase 7 FlowBot tabs |
| Unmocked axe G6 green | Open | phase9 axe attachments ☐ |
| Keyboard merchant journey notes | Open | human notes ☐ |

---

## Open debt (must be Low only for G8 Pass)

| ID | Severity | Item | Owner |
|----|----------|------|-------|
| D1 | High* | G6/G6b staging evidence | SQA / Security |
| D2 | High* | Privacy counsel Notice + residual | Privacy / Counsel |
| D3 | High* | Stripe live_ready + paid E2E | Commerce / RevOps |
| D4 | Med | Kill-switch drill timestamp | SRE |
| D5 | Med | Named merchant signed | Success |
| D6 | Low | Weekly P50/P80 actuals log | PM |

\*High items **block G8**. Reclassify to Low only after evidence.

---

## Certification signatures (G8)

| Role | Name | Date | Score claim |
|------|------|------|-------------|
| PM | | | all Cast A+B Must-Pass Pass |
| CTO | | | same + kill-switch drill |

**Announcement:** only after signatures — draft in `docs/validation/phase14-g8-announcement-draft.md`.

## Gate posture

| Gate | Status |
|------|--------|
| G8 ≥9.5 board | **scaffold complete; certification BLOCKED** |
