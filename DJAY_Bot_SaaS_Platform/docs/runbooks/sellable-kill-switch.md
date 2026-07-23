# Sellable kill switch — SKU1 (`flowbot_basic`)

Purpose: stop new paid intake in **&lt;15 minutes** without destroying merchant data.  
Owners: SRE + Commerce + Product Owner  
Related gates: G6d rehearsal · G7 production flip

## Controls (in priority order)

1. **Catalogue / sellable** — set `flowbot_basic.sellable = false` in active catalogue + `requirements/market-release-v1.yaml` (blocks new checkout).
2. **Stripe mapping** — `UPDATE catalog.provider_price_mappings SET status = 'disabled' … WHERE item_key = 'flowbot_basic'`.
3. **Terraform commerce** — `commerce_enabled = false` (heavier; next apply).
4. **Worker flags** — `BILLING_WEBHOOK_WORKER_ENABLED=false` / `COMMERCE_WORKERS_ENABLED=false` (may leave paid users pending — last resort).
5. **Platform Voice** — `emergency_stop` (Voice only; not FlowBot checkout).

Preferred SKU1 kill: **(1) or (2)**.

## &lt;15 minute production procedure

| Minute | Action | Owner |
|--------|--------|-------|
| 0 | Declare kill on incident channel; page Commerce + SRE | PO / SRE |
| 0–5 | Disable live mapping **or** set sellable=false in prod catalogue | Commerce |
| 5–8 | Verify checkout returns `checkout_unavailable` (no new Stripe sessions) | SRE |
| 8–12 | Post customer/status comms (template below) | Support / PO |
| 12–15 | Confirm Portal still opens for existing customers; open incident ticket | Support |

### Comms template (EN)

> We have temporarily paused new Flow Bot Starter checkouts while we investigate a billing issue. Existing workspaces keep their current access. If you were mid-checkout, wait and retry later from Plans and usage — you will not be charged for an incomplete checkout.

### Comms template (TH)

> เราได้ระงับการชำระเงิน Flow Bot Starter ชั่วคราวเพื่อตรวจสอบระบบบิล เวิร์กสเปซที่มีสิทธิ์อยู่แล้วยังใช้งานได้ หากค้างอยู่ระหว่างชำระเงิน ให้รอแล้วลองใหม่จากหน้าแผนและการใช้งาน — การชำระที่ไม่สำเร็จจะไม่ถูกเรียกเก็บ

## Staging dry-run checklist

| # | Step | Pass? | Evidence |
|---|------|-------|----------|
| 1 | Confirm staging checkout path works (or is intentionally unavailable) | ☐ | |
| 2 | Disable mapping or sellable for `flowbot_basic` | ☐ | SQL / config diff |
| 3 | Attempt checkout → `checkout_unavailable` (no charge) | ☐ | screenshot / request id |
| 4 | Confirm existing active tenant still loads Usage/Inbox | ☐ | |
| 5 | Re-enable mapping/sellable for staging soak | ☐ | |
| 6 | Record timestamp + operator below | ☐ | |

Operator: _____________  
Date (UTC): _____________  
Environment: staging  
Elapsed minutes: _____________  

Copy drill UTC into `docs/validation/phase13-sellable-g7.md` as `KILL_SWITCH_DRILL_UTC:`.

## Production notes

- Never flip `sellable: true` without Phases 9–11 evidence.
- After a real kill, open an incident; Support uses `docs/runbooks/customer-support-sku1.md`.
- Rollback = reverse the control used; do not delete Stripe customers.
