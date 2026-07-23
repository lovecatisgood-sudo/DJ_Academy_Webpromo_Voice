# Path to ~10/10 for Every Role

> **Companion to:** `2026-07-22-ULTRA-FIX-PLAN.md` + Plan v2.  
> **Purpose:** Close the remaining gaps so **all prior roles** and the **five specialist roles** can reach **≥9.5**, with a clear path to **~9.9 / 10**.

---

## 1. Reality check

| Target | Meaning | How |
|--------|---------|-----|
| **≥9.5** | Evidence rubrics Pass for every role | Execute ULTRA **+** add-ons in §3 through **G8+** |
| **~9.9** | Adversarial + soak + ops | **G9** (14d soak, zero Sev-1, support live) |
| **10.0** | Sustained production excellence | **G10** (30–90d SLOs + external audit + privacy/finance letters) — **time**, not more features |

You cannot “plan” a flat 10 for Privacy or RevOps without counsel/finance sign-off and production time. You *can* make every role’s **Must-Pass rubric** achievable.

---

## 2. Full role roster (everyone)

### Cast A — Original
CTO · PM · Product Designer · SWE · SQA · UI · UX · Merchant · Staff · Coding Agent · Logician · Code expert · Red team · PRD Architect

### Cast B — Specialists
Privacy/Compliance · SRE · RevOps · Support/Success · a11y

**Rule:** G8 is not Pass until **Cast A and Cast B** rubrics are evidenced.

---

## 3. Add-ons missing from ULTRA (required for Cast B ≥9.5)

These become **Phases L–P** (run in parallel with late ULTRA phases; **hard gates before G7/G8** as noted).

### Phase L — Privacy program (before G7)  → Privacy ≥9.5

| ID | Work | Exit |
|----|------|------|
| L1 | **PII registry** doc: every table/column/object store holding personal data | Living `docs/compliance/pii-registry.md` |
| L2 | Extend erasure + export to cover gaps: `action_*` payloads, `voice_call_outcomes.summary_text`, social subject ciphertext, knowledge/object refs (or document irreversible legal-hold with counsel) | Integration tests: post-erasure search returns zero PII samples |
| L3 | **Legal hold** flag: erasure skips held conversations; UI + API | Runbook |
| L4 | Contact `consent_status` **or** documented legitimate-interest / contract basis for processing; block marketing processing without consent | Written legal basis matrix |
| L5 | **Subprocessors list** + DPA tracker + transfer mechanism in mounted Privacy Notice | Counsel-approved bundle version bump |
| L6 | DSAR SLA (e.g. 30 days) + Support macros | `docs/runbooks/dsar.md` |
| L7 | Sample Cloud Logging review: no transcripts/PII | Sign-off in validation |

**Gate:** **G6c Privacy** — required before **G7 sellable** (same severity as G6b pen-test).

### Phase M — SRE / observability (before G8; start in G5) → SRE ≥9.5

| ID | Work | Exit |
|----|------|------|
| M1 | Terraform/Cloud Run **readiness** probe → `/health/ready` (not only live) | Staging apply evidence |
| M2 | Worker ready = DB + optional outbox lag threshold | Doc + test |
| M3 | Minimal metrics: checkout success rate, webhook fail rate, API 5xx, widget 429 | Dashboard or Cloud Monitoring charts |
| M4 | Alerts: webhook fail spike, checkout 5xx, DB CPU (exists) | Paging target named |
| M5 | Root Voice: **durable rate limit** OR signed ops constraint “single instance only” in DEPLOYMENT.md | Choose one; evidence |
| M6 | Kill-switch drill logged (already ULTRA I1) | Timestamp in scoreboard |

**Gate:** **G6d Reliability** — required for SRE rubric at G8; M1–M4 before production G7 preferred.

### Phase N — RevOps / finance (before G7) → RevOps ≥9.5

| ID | Work | Exit |
|----|------|------|
| N1 | Decision: ADR-008 tax/dunning **implemented for SKU1** OR **explicit deferral** (“tax handled offline / inclusive price; no automated dunning in SKU1”) signed by finance+counsel | `market-release-decisions.yaml` |
| N2 | Stripe test→live checklist; price mapping `live_ready` | Release dashboard |
| N3 | Revenue recognition: pilot comps vs paid (no double-count) | Decision entry |
| N4 | Failed payment / expired checkout Support+merchant copy | EXP-008 states covered |
| N5 | Invoice/receipt visibility for paid SKU1 (even if minimal Stripe Customer Portal) | Merchant can self-serve receipt |

**Gate:** **G6e Commercial** — required before G7.

### Phase O — Support / Success (with G3–G7) → Support ≥9.5

| ID | Work | Exit |
|----|------|------|
| O1 | CS playbook pack: payment ok / access none; webhook delay; wrong origin; MFA lockout; invite expired; erase request | `docs/runbooks/customer-support-sku1.md` |
| O2 | Internal “status page” fields for Support: subscription accessMode, last webhook, deploy health | Platform or tenant Usage banner |
| O3 | TH macros for top 10 tickets | Attached to playbook |
| O4 | Success checklist for named merchant worksheet | Signed |

**Gate:** Playbook **O1** required at **G7**; O2–O4 at **G8**.

### Phase P — a11y completion (with G4–G6) → a11y ≥9.5

| ID | Work | Exit |
|----|------|------|
| P1 | MFA QR + manual + recovery download (ULTRA F2) | Done |
| P2 | Mobile drawer + skip link | Done |
| P3 | When studios tabbed: `role="tablist/tab/tabpanel"` + `aria-controls` | Axe clean |
| P4 | G6 **unmocked** axe on wizard, inbox, checkout return — **non-waivable** | Report |
| P5 | Keyboard-only pass of merchant journey (human) | Notes in validation |

**Gate:** P1–P4 in **G6**; P5 in **G8**.

---

## 4. Updated hard gate order (complete)

```
G0 → RV-G1 → G1b → G2 → G3 → G4 → G5
  → G6 (unmocked E2E)
  → G6b (pen-test)
  → G6c (privacy)     ← NEW hard before sellable
  → G6e (commercial)  ← NEW hard before sellable
  → G6d (reliability) ← NEW strongly before prod G7 / required G8
  → G7 (sellable one SKU + kill switch + Support playbook O1)
  → G8 (ALL role rubrics Cast A+B)
  → G9 (~9.9 soak)
  → G10 (10.0 SLOs + letters)
```

**Forbidden:** G7 without G6b + G6c + G6e.

---

## 5. Binary rubrics — Cast B Must-Pass (≥9.5)

### Privacy
- [x] PII registry published (`docs/compliance/pii-registry.md`)  
- [ ] Erasure/export coverage test Pass (or counsel-approved residual list)  
- [ ] Legal basis matrix + Privacy Notice lists subprocessors  
- [x] DSAR runbook + SLA (`docs/runbooks/dsar.md`)
- [ ] G6c signed (counsel notice + residual)  

### SRE
- [ ] Ready probes on Cloud Run (Terraform ready; staging apply open)
- [ ] Checkout + webhook metrics/alerts (code ready; deploy open)
- [ ] Kill-switch drill logged  
- [x] Root Voice durable RL **or** single-instance constraint documented (`DEPLOYMENT.md`)
- [ ] G6d signed (scaffolds ready; staging evidence open)  

### RevOps
- [x] Tax/dunning decision recorded (`SKU1-DEC-002`)
- [ ] One SKU live_ready + paid path E2E (mapping runbook ready; seed evidence open)  
- [x] Pilot vs paid rules written (`SKU1-DEC-003`)
- [ ] Merchant can retrieve receipt/invoice  
- [ ] G6e signed  

### Support
- [x] Playbook pack O1 published (`docs/runbooks/customer-support-sku1.md`)
- [ ] Named merchant Success worksheet signed (`docs/validation/named-merchant-worksheet-sku1.md` drafted)
- [x] TH macros for top tickets  
- [ ] No known Sev-1 “can’t activate after pay” open  

### a11y
- [x] MFA QR  
- [x] Mobile drawer  
- [x] Tab ARIA on collapsed studios  
- [ ] Unmocked axe G6 green  
- [ ] Keyboard merchant journey notes  

*(Cast A rubrics remain as in Plan v2 / ULTRA G8.)*

---

## 6. Projected scores after this path

| Role | Now (approx) | After G8+ | After G9 | After G10 |
|------|--------------|-----------|----------|-----------|
| Cast A (eng/product) | 4.5–7.5 | **9.5–9.7** | **9.7–9.9** | **~10** |
| Privacy | 5.8 | **9.5** | **9.7** | **~10** (with audit letter) |
| SRE | 6.8 | **9.5** | **9.8** | **~10** |
| RevOps | 7.3 | **9.5** | **9.7** | **~10** |
| Support | 6.5 | **9.5** | **9.7** | **~10** |
| a11y | 7.0 | **9.5** | **9.7** | **~10** |

---

## 7. What “everyone close to 10” actually requires

1. **Execute ULTRA** (self-serve SKU + wizard + security order).  
2. **Add L–P** (privacy, SRE, RevOps, Support, a11y) — especially **G6c/G6e before sellable**.  
3. **Do not waive** G6, G6b, G6c, live axe, kill-switch drill.  
4. **Hold one SKU** — expanding to six packages before G10 destroys scores.  
5. **G9 soak + G10 SLOs** for true 10 — no document can substitute.

### Calendar impact
- ULTRA P50 **14w** → with L–P expect **P50 ≈ 16–18w**, P80 ≈ 22w (counsel/DPA/Stripe).  
- Still cheaper than shipping sellable and failing Privacy/RevOps reviews.

---

## 8. This week (to start the path)

1. Amend ULTRA scoreboard: add G6c / G6d / G6e checkboxes.  
2. Open L1 PII registry draft + N1 tax decision request to finance/counsel.  
3. Open M1 readiness-probe Terraform PR.  
4. Draft O1 Support playbook skeleton.  
5. Continue RV-G1 + D1 purchase_intent as already planned.

---

*When G8 Passes with Cast A+B evidence, you may honestly say “everyone ≥9.5.” Say “everyone ~10” only after G9/G10.*
