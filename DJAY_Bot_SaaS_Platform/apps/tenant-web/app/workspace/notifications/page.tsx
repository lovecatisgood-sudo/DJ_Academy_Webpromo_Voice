"use client";

import { currentIntlLocale, safeMutationFetch } from "@djay/shared";
import { useEffect, useMemo, useState } from "react";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { WorkspaceSupportBanner } from "../WorkspaceSupportBanner";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Notice = { id: string; category: string; severity: string; eventKind: string; entityType: string; entityId: string; deepLink: string; occurredAt: string; read: boolean };
const categories = ["all", "action_needed", "product_health", "usage_cost", "billing", "team_security", "completed"] as const;
const categoryLabels: Record<string, string> = { all: "ทั้งหมด", action_needed: "ต้องดำเนินการ", product_health: "สถานะผลิตภัณฑ์", usage_cost: "การใช้งานและค่าใช้จ่าย", billing: "การเรียกเก็บเงิน", team_security: "ทีมและความปลอดภัย", completed: "เสร็จสิ้น" };
function title(kind: string) {
  const exact: Record<string, string> = {
    "deal_value.recorded": "บันทึกมูลค่าดีลแล้ว", "support.platform_response": "ทีมช่วยเหลือตอบกลับแล้ว",
    "support.attachment_clean": "ไฟล์แนบพร้อมดาวน์โหลด", "support.attachment_blocked": "ไฟล์แนบถูกบล็อกเพื่อความปลอดภัย",
    "team.invitation_pending": "คำเชิญสมาชิกกำลังรอตอบรับ", "team.invitation_accepted": "สมาชิกตอบรับคำเชิญแล้ว",
    "appointment.sync_succeeded": "ปฏิทินภายนอกตอบรับรายการนัดหมายแล้ว",
    "appointment.sync_failed": "ส่งรายการนัดหมายไปปฏิทินไม่สำเร็จ ระบบจะลองใหม่",
    "appointment.sync_dead_letter": "การเชื่อมปฏิทินต้องให้ทีมตรวจสอบ",
  };
  const families: [string, string][] = [
    ["onboarding.ready", "ตั้งค่าพื้นที่ทำงานเสร็จแล้ว"], ["onboarding.preferences_saved", "บันทึกเป้าหมายการใช้งานแล้ว"],
    ["onboarding.", "มีขั้นตอนตั้งค่าที่ต้องทำต่อ"], ["deployment.flowbot_active", "Flow Bot พร้อมใช้งาน"],
    ["deployment.ai_chat_active", "AI Text Bot พร้อมใช้งาน"], ["deployment.voice_active", "Voice Bot พร้อมใช้งาน"],
    ["deployment.flowbot_", "สถานะการใช้งาน Flow Bot เปลี่ยนแปลง"], ["deployment.ai_chat_", "สถานะการใช้งาน AI Text Bot เปลี่ยนแปลง"],
    ["deployment.voice_", "สถานะการใช้งาน Voice Bot เปลี่ยนแปลง"], ["privacy.export_", "สถานะคำขอส่งออกข้อมูลเปลี่ยนแปลง"],
    ["privacy.erasure_", "สถานะคำขอลบข้อมูลเปลี่ยนแปลง"], ["team.ownership_", "สถานะการโอนเจ้าของพื้นที่ทำงานเปลี่ยนแปลง"],
    ["support_access.active", "ทีมช่วยเหลือได้รับสิทธิ์เข้าถึงชั่วคราว"], ["support_access.", "สถานะสิทธิ์เข้าถึงของทีมช่วยเหลือเปลี่ยนแปลง"],
    ["test.flowbot_", "ผลทดสอบ Flow Bot เวอร์ชันปัจจุบัน"], ["test.ai_chat_", "ผลทดสอบ AI Text Bot เวอร์ชันปัจจุบัน"],
    ["test.voice_", "ผลทดสอบ Voice Bot เวอร์ชันปัจจุบัน"],
  ];
  const family = families.find(([prefix]) => kind.startsWith(prefix));
  if (family) return family[1];
  return exact[kind] ?? kind.replaceAll("_", " ").replaceAll(".", " · ");
}

export default function NotificationsPage() {
  const session = useWorkspaceSession(); const [notices, setNotices] = useState<Notice[]>([]);
  const [filter, setFilter] = useState<(typeof categories)[number]>("all"); const [loadError, setLoadError] = useState(false);
  const [workingId, setWorkingId] = useState("");
  const visible = useMemo(() => filter === "all" ? notices : notices.filter((notice) => notice.category === filter), [notices, filter]);
  async function load() {
    try { const response = await fetch("/tenant/notifications", { cache: "no-store" }); if (!response.ok) throw new Error(); setNotices((await response.json()).notifications ?? []); setLoadError(false); }
    catch { setLoadError(true); }
  }
  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);
  async function open(notice: Notice) {
    setWorkingId(notice.id);
    if (!notice.read) await safeMutationFetch("/tenant/notifications", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notificationId: notice.id }) });
    window.location.assign(notice.deepLink);
  }
  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดการแจ้งเตือน...</main>;
  if (loadError) return <WorkspacePageLoadError active="notifications" title="การแจ้งเตือน" resource="notifications" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;
  return <main className="workspace-shell"><WorkspaceSidebar active="notifications" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}><WorkspaceSupportBanner tenantId={session.selectedTenantId} />
      <header className="workspace-header"><div><p>ติดตามงานจากแหล่งข้อมูลจริง</p><h1>การแจ้งเตือน</h1></div><span className="role-label">{notices.filter((notice) => !notice.read).length} unread</span></header>
      <section className="notification-policy" aria-labelledby="notification-policy-title">
        <div><p>ช่องทางที่ใช้งานอยู่</p><h2 id="notification-policy-title">รู้เสมอว่าการแจ้งเตือนจะมาทางไหน</h2></div>
        <ul>
          <li><strong>ในระบบ:</strong> งานสำคัญจากการตั้งค่า บอต ลูกค้า การใช้งาน การชำระเงิน ทีม ความเป็นส่วนตัว และฝ่ายช่วยเหลือ</li>
          <li><strong>อีเมลที่จำเป็น:</strong> ยืนยันบัญชี กู้รหัสผ่าน คำเชิญทีม และการโอนเจ้าของ</li>
          <li><strong>อีเมลที่เลือกเปิดได้:</strong> การใช้งาน การชำระเงิน และลีด เมื่อผู้ดูแลตั้งค่าผู้รับแล้ว</li>
        </ul>
        <p className="notification-policy-note">รุ่นปัจจุบันยังไม่ส่ง SMS, push notification หรือข้อความผ่านช่องทางโซเชียลจากศูนย์แจ้งเตือนนี้</p>
      </section>
      <section className="tool-band notification-center"><div className="band-heading"><div><p>จัดกลุ่มตามสิ่งที่ต้องทำ</p><h2>งานและอัปเดตล่าสุด</h2></div><span>{visible.length} of {notices.length}</span></div>
        <div className="notification-filters" role="group" aria-label="กรองการแจ้งเตือน">{categories.map((category) => <button type="button" className={filter === category ? "active" : ""} aria-pressed={filter === category} key={category} onClick={() => setFilter(category)}>{categoryLabels[category]}{category !== "all" ? ` ${notices.filter((notice) => notice.category === category && !notice.read).length}` : ""}</button>)}</div>
        <div className="notification-list">{visible.map((notice) => <article className={notice.read ? "" : "unread"} data-severity={notice.severity} key={notice.id}><span className="notification-status" aria-hidden="true" /><div><small>{categoryLabels[notice.category]} · {notice.severity}</small><h3>{title(notice.eventKind)}</h3><time dateTime={notice.occurredAt}>{new Date(notice.occurredAt).toLocaleString(currentIntlLocale())}</time></div><button type="button" disabled={workingId === notice.id} onClick={() => void open(notice)}>{workingId === notice.id ? "กำลังเปิด..." : notice.read ? "เปิดดู" : "เปิดและทำเครื่องหมายว่าอ่านแล้ว"}</button></article>)}
          {!visible.length ? <div className="pending-line"><strong>{notices.length ? "ไม่มีรายการในหมวดนี้" : "ยังไม่มีการแจ้งเตือน"}</strong><span>งานที่ต้องทำและเหตุการณ์สำคัญจะปรากฏที่นี่พร้อมลิงก์ไปยังรายการต้นทาง</span></div> : null}</div>
      </section>
    </section></main>;
}
