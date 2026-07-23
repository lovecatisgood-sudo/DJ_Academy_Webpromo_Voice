# Customer support playbook — SKU1 (`flowbot_basic`)

Last updated: 2026-07-23  
Audience: Support / Success

## Payment confirmed but access none

1. Ask for workspace business name + approximate checkout time.
2. Check tenant Usage: subscription `status` / `accessMode`.
3. If pending after >15 minutes: check Stripe payment + webhook delivery; do **not** manually flip access from browser success claims.
4. Macro: “Access activates only after our billing system confirms payment. We’re checking settlement now.”

## Webhook delay

1. Confirm Stripe Dashboard shows paid invoice.
2. Escalate Billing Eng with Stripe event id.
3. Merchant can leave Usage open — EXP-008 processing state polls briefly; refresh Usage after escalation.

## Checkout expired / canceled (EXP-008)

Merchant copy is on Usage return banner. Macro TH/EN:

- EN: “That checkout link expired. Open Plans and usage and start checkout again — you won’t be charged twice for an incomplete session.”
- TH: “ลิงก์ชำระเงินหมดอายุแล้ว ให้เปิดหน้าแผนและการใช้งานแล้วเริ่มชำระเงินใหม่ ระบบจะไม่เรียกเก็บซ้ำจากการชำระที่ไม่สำเร็จ”

## Payment action required / failed

1. Guide **Manage billing** (Stripe Customer Portal).
2. If Portal unavailable: verify Stripe customer mapping; escalate Billing Eng.
3. Per `SKU1-DEC-002`, Support does not promise automated dunning — recovery is Portal + human assist.

## Wrong widget origin

1. Confirm deployment allowed origin is exact HTTPS match.
2. Ask merchant to republish/redeploy if origin changed.
3. Macro: “The snippet only works on the exact website address saved in Deploy.”

## MFA lockout

1. Use recovery codes path; never reset MFA without identity verification.
2. Escalate Security if recovery codes lost.

## Invite expired

1. Owner resends invite from Team settings.
2. Do not create passwords for invited users.

## Erase / DSAR request

1. Follow `docs/runbooks/dsar.md` (30-day SLA).
2. Prefer merchant Data controls self-serve for contact erasure.

## MFA lockout (macros)

- EN: “Use a recovery code from when MFA was set up. We cannot email a temporary password.”
- TH: “ใช้รหัสกู้คืนที่บันทึกตอนเปิด MFA เราไม่สามารถส่งรหัสผ่านชั่วคราวทางอีเมลได้”

## Invite expired (macros)

- EN: “Ask your workspace owner to send a new invite from Team settings.”
- TH: “ให้เจ้าของเวิร์กสเปซส่งคำเชิญใหม่จากหน้าทีม”

## Wrong origin (macros)

- EN: “The snippet only works on the exact HTTPS website address saved under Deploy.”
- TH: “สคริปต์ใช้งานได้เฉพาะที่อยู่เว็บ HTTPS ที่บันทึกไว้ในการติดตั้งเท่านั้น”

## DSAR (macros)

- EN: “Privacy requests are handled in Data controls by the workspace owner, or via our DSAR process within 30 days.”
- TH: “คำขอความเป็นส่วนตัวทำได้ที่การควบคุมข้อมูลโดยเจ้าของเวิร์กสเปซ หรือผ่านกระบวนการ DSAR ภายใน 30 วัน”

## Pilot vs paid

- Pilot comps: Platform-only; not billed (`SKU1-DEC-003`).
- Never tell a paid merchant their access is a pilot grant.

## Kill-switch / checkout paused

- EN/TH templates: `docs/runbooks/sellable-kill-switch.md`
