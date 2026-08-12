"use client";

import { currentIntlLocale, safeMutationFetch } from "@djay/shared";
import { use, useEffect, useState } from "react";
import { PlatformNavigation } from "../../PlatformNavigation";

type PlatformUser = { id: string; displayName: string; role: string };
type Tenant360 = {
  tenant: { id: string; businessName: string; slug: string; status: string; createdAt: string; activeMembers: number; openLeads: number; openConversations: number };
  subscriptions: Array<{ id: string; productKey: string; planKey: string; status: string; periodStart: string | null; periodEnd: string | null; updatedAt: string }>;
  entitlements: Array<{ productKey: string; accessMode: string; subscriptionStatus: string; createdAt: string }>;
  usage: Array<{ productKey: string; unit: string; included: string | null; reserved: string; settled: string; periodStart: string; periodEnd: string; updatedAt: string }>;
  deployments: Array<{ kind: string; id: string; name: string; status: string; createdAt: string }>;
  support: Array<{ id: string; category: string; priority: string; status: string; lastActivityAt: string }>;
  privacyJobs: Array<{ id: string; jobType: string; status: string; requestedAt: string; completedAt: string | null }>;
  auditReferences: Array<{ id: string; action: string; targetType: string; targetId: string | null; result: string; createdAt: string }>;
};

function label(value: string) { return value.replaceAll("_", " "); }
function when(value: string | null) { return value ? new Date(value).toLocaleString(currentIntlLocale()) : "—"; }

export default function Tenant360Page({ params }: Readonly<{ params: Promise<{ tenantId: string }> }>) {
  const { tenantId } = use(params);
  const [user, setUser] = useState<PlatformUser | null>(null);
  const [overview, setOverview] = useState<Tenant360 | null>(null);
  const [stage, setStage] = useState<"loading" | "ready" | "denied" | "error">("loading");

  async function load() {
    setStage("loading");
    try {
      const [meResponse, overviewResponse] = await Promise.all([
        fetch("/platform/me", { cache: "no-store" }),
        fetch(`/platform/tenants/${encodeURIComponent(tenantId)}`, { cache: "no-store" }),
      ]);
      if ([401, 403, 404].includes(meResponse.status) || [401, 403, 404].includes(overviewResponse.status)) {
        setUser(null); setOverview(null); setStage("denied"); return;
      }
      if (!meResponse.ok || !overviewResponse.ok) throw new Error("tenant_360_unavailable");
      const me = await meResponse.json(); const result = await overviewResponse.json();
      setUser(me.user); setOverview(result.overview); setStage("ready");
    } catch { setStage("error"); }
  }
  useEffect(() => { void load(); }, [tenantId]);

  async function logout() {
    await safeMutationFetch("/platform/auth/logout", { method: "POST" });
    window.location.assign("/");
  }

  if (stage === "loading") return <main className="platform-loading">กำลังโหลด Tenant 360 ที่ได้รับอนุญาต…</main>;
  if (stage === "denied") return <main><section className="platform-session-error" role="alert"><p>จำกัดสิทธิ์</p><h1>ไม่พบ Tenant 360 นี้</h1><span>เข้าสู่ระบบด้วยบทบาทที่ได้รับสิทธิ์ หรือกลับไปยังพื้นที่ปฏิบัติการของคุณ</span><a className="secondary-command" href="/">กลับไปเข้าสู่ระบบ</a></section></main>;
  if (stage === "error" || !user || !overview) return <main><section className="platform-session-error" role="alert"><p>ไม่พร้อมใช้งานชั่วคราว</p><h1>โหลด Tenant 360 ไม่สำเร็จ</h1><span>ไม่มีข้อมูลหรือสถานะใดถูกเปลี่ยน</span><button type="button" onClick={() => void load()}>ลองใหม่</button></section></main>;

  return <main className="platform-shell"><aside><div className="platform-brand"><span className="mark">D</span><strong>DJAY BOT</strong></div><p>ระบบจัดการแพลตฟอร์ม</p><PlatformNavigation role={user.role} activeArea="support-access" /><button className="quiet-button" type="button" onClick={() => void logout()}>ออกจากระบบ</button></aside>
    <section className="platform-content tenant-360"><header><div><p>Tenant 360 · อ่านอย่างเดียว</p><h1 data-no-localize>{overview.tenant.businessName}</h1></div><span><span data-no-localize>{user.displayName}</span><small>{label(user.role)}</small></span></header>
      <div className="tenant-360-notice"><strong>การเข้าดูครั้งนี้ถูกบันทึก</strong><span>ไม่มี secret, provider/model routing, ข้อความสนทนา หรือข้อมูลติดต่อส่วนบุคคลในมุมมองนี้</span>{["platform_owner", "platform_support"].includes(user.role) ? <a href={`/operations/incidents?tenantId=${encodeURIComponent(overview.tenant.id)}`}>เปิดเหตุขัดข้องของลูกค้านี้</a> : null}</div>
      <section className="metrics-band" aria-label="ภาพรวม tenant"><div><span>สถานะ</span><strong>{label(overview.tenant.status)}</strong></div><div><span>สมาชิกที่ใช้งาน</span><strong>{overview.tenant.activeMembers}</strong></div><div><span>ผู้สนใจที่เปิดอยู่</span><strong>{overview.tenant.openLeads}</strong></div><div><span>การสนทนาที่เปิดอยู่</span><strong>{overview.tenant.openConversations}</strong></div></section>
      <section className="subscription-band"><div><p>สิทธิ์และการเรียกเก็บเงิน</p><h2>การสมัครใช้และสิทธิ์ล่าสุด</h2></div><div className="tenant-360-grid">{overview.subscriptions.map((item) => <article key={item.id}><strong>{label(item.productKey)} · {label(item.planKey)}</strong><span>{label(item.status)}</span><small>{when(item.periodStart)} — {when(item.periodEnd)}</small></article>)}{!overview.subscriptions.length ? <p className="empty-row">ไม่มีการสมัครใช้</p> : null}</div><div className="tenant-360-grid">{overview.entitlements.map((item) => <article key={item.productKey}><strong>{label(item.productKey)}</strong><span>{label(item.accessMode)}</span><small>{label(item.subscriptionStatus)} · {when(item.createdAt)}</small></article>)}</div></section>
      <section className="subscription-band"><div><p>การใช้งาน</p><h2>บัญชีรอบปัจจุบันและล่าสุด</h2></div><div className="platform-table" role="list">{overview.usage.map((item, index) => <div className="platform-row tenant-usage-row" role="listitem" key={`${item.productKey}:${item.periodStart}:${index}`}><div><strong>{label(item.productKey)}</strong><span>{label(item.unit)}</span></div><span>ใช้แล้ว {item.settled}</span><span>สำรอง {item.reserved}</span><span>รวม {item.included ?? "ไม่จำกัด"}</span></div>)}{!overview.usage.length ? <p className="empty-row" role="listitem">ยังไม่มีบัญชีการใช้งาน</p> : null}</div></section>
      <section className="subscription-band"><div><p>การเปิดใช้</p><h2>Deployment</h2></div><div className="platform-table" role="list">{overview.deployments.map((item) => <div className="platform-row" role="listitem" key={`${item.kind}:${item.id}`}><div><strong data-no-localize>{item.name}</strong><span>{label(item.kind)}</span></div><span>{label(item.status)}</span><span>{when(item.createdAt)}</span></div>)}{!overview.deployments.length ? <p className="empty-row" role="listitem">ยังไม่มี deployment</p> : null}</div></section>
      <section className="subscription-band"><div><p>การดูแลและความเป็นส่วนตัว</p><h2>คำขอช่วยเหลือและงานข้อมูล</h2></div><div className="platform-table" role="list">{overview.support.map((item) => <div className="platform-row" role="listitem" key={item.id}><div><strong>คำขอ …{item.id.slice(-8)}</strong><span>{label(item.category)} · {label(item.priority)}</span></div><span>{label(item.status)}</span><span>{when(item.lastActivityAt)}</span></div>)}{!overview.support.length ? <p className="empty-row" role="listitem">ไม่มีคำขอช่วยเหลือ</p> : null}</div><div className="platform-table" role="list">{overview.privacyJobs.map((item) => <div className="platform-row" role="listitem" key={item.id}><div><strong>{label(item.jobType)}</strong><span>งานข้อมูล</span></div><span>{label(item.status)}</span><span>{when(item.requestedAt)}</span></div>)}{!overview.privacyJobs.length ? <p className="empty-row" role="listitem">ไม่มีงานข้อมูล</p> : null}</div></section>
      <section className="subscription-band"><div><p>หลักฐานตรวจสอบ</p><h2>100 รายการอ้างอิงล่าสุด</h2></div><div className="platform-table tenant-audit-list" role="list">{overview.auditReferences.map((item) => <div className="platform-row" role="listitem" key={item.id}><div><strong>{label(item.action)}</strong><span>{label(item.targetType)}{item.targetId ? ` · …${item.targetId.slice(-8)}` : ""}</span></div><span>{label(item.result)}</span><span>{when(item.createdAt)}</span></div>)}{!overview.auditReferences.length ? <p className="empty-row" role="listitem">ยังไม่มีหลักฐานตรวจสอบ</p> : null}</div></section>
    </section></main>;
}
