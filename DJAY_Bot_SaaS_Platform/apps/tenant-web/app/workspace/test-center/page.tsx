"use client";

import { useEffect, useMemo, useState } from "react";
import { currentIntlLocale } from "@djay/shared";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../WorkspaceAccess";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Bot = { id: string; name: string; currentPublishedVersionId: string | null };
type Deployment = { id: string; botId: string; name: string; status: string; allowedOrigins: string[] };
type InstallCheck = { id: string; deploymentId: string; targetOrigin: string; status: string; safeResultCode: string | null; checkedAt: string | null; createdAt: string };
type RegressionRun = { id: string; productKey: "flowbot" | "ai_chat" | "voice"; subjectId: string; artifactVersionId: string; suiteKey: string; locale: "th" | "en"; status: "passed" | "failed"; checks: Record<string, boolean>; observedAt: string };
type Evidence = {
  onboarding: { preferences: { complete: boolean; firstProduct: string | null; launchChannel: "website" | null }; readiness: { businessProfile: boolean; activeAccess: boolean; productStates: Array<{ productKey: string; activeAccess: boolean; configured: boolean; deployed: boolean; tested: boolean; launchReady: boolean }> } };
  bots: Bot[]; deployments: Deployment[]; checks: InstallCheck[];
  regressionRuns: RegressionRun[];
  analytics: { executions: number; completed: number; handovers: number; leads: number; messages: number } | null;
};

const productCopy = {
  flowbot: { name: "FlowBot", href: "/workspace/flowbot/canvas", configure: "เปิดผังและโหมดทดลอง" },
  ai_chat: { name: "AI Text", href: "/workspace/ai-chat", configure: "เปิดสตูดิโอและโหมดทดสอบ" },
  voice: { name: "Voice", href: "/workspace/voice", configure: "เปิด Voice Studio และทดสอบเสียง" },
} as const;

type Check = { key: string; title: string; detail: string; passed: boolean; required: boolean; href: string; action: string };

export default function TestCenterPage() {
  const session = useWorkspaceSession();
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loadingEvidence, setLoadingEvidence] = useState(false);

  async function load() {
    setLoadError(false); setLoadingEvidence(true);
    try {
      const [onboardingResponse, regressionResponse] = await Promise.all([
        fetch("/tenant/onboarding", { cache: "no-store" }),
        fetch("/tenant/test-center", { cache: "no-store" }),
      ]);
      if (!onboardingResponse.ok || !regressionResponse.ok) throw new Error("test_center_unavailable");
      const onboarding = (await onboardingResponse.json()).onboarding;
      const regressionRuns = (await regressionResponse.json()).runs || [];
      let bots: Bot[] = []; let deployments: Deployment[] = []; let checks: InstallCheck[] = [];
      let analytics: Evidence["analytics"] = null;
      if (onboarding.preferences.firstProduct === "flowbot") {
        const [botsResponse, checksResponse, analyticsResponse] = await Promise.all([
          fetch("/tenant/flowbot/bots", { cache: "no-store" }), fetch("/tenant/flowbot/install-checks", { cache: "no-store" }),
          fetch("/tenant/flowbot/analytics?days=30", { cache: "no-store" }),
        ]);
        if (!botsResponse.ok || !checksResponse.ok) throw new Error("test_center_unavailable");
        bots = (await botsResponse.json()).bots || [];
        deployments = (await Promise.all(bots.map(async (bot) => {
          const response = await fetch(`/tenant/flowbot/bots/${bot.id}/deployments`, { cache: "no-store" });
          return response.ok ? ((await response.json()).deployments || []) as Deployment[] : [];
        }))).flat();
        checks = (await checksResponse.json()).checks || [];
        analytics = analyticsResponse.ok ? (await analyticsResponse.json()).analytics || null : null;
      }
      setEvidence({
        onboarding, bots, deployments, checks, analytics, regressionRuns,
      });
    } catch { setEvidence(null); setLoadError(true); }
    setLoadingEvidence(false);
  }

  useEffect(() => { if (session.selectedTenantId) void load(); }, [session.selectedTenantId]);

  const checks = useMemo<Check[]>(() => {
    if (!evidence) return [];
    const productKey = evidence.onboarding.preferences.firstProduct as keyof typeof productCopy | null;
    const product = productKey ? productCopy[productKey] : productCopy.flowbot;
    const state = evidence.onboarding.readiness.productStates.find((item) => item.productKey === productKey);
    const activeDeployments = evidence.deployments.filter((item) => item.status === "active");
    const verifiedInstall = evidence.checks.some((item) => item.status === "verified" && activeDeployments.some((deployment) => deployment.id === item.deploymentId));
    const common: Check[] = [
      { key: "goal", title: "เป้าหมายและ Bot", detail: "เลือกผลลัพธ์ทางธุรกิจและ Bot ตัวแรกสำหรับเว็บไซต์แล้ว", passed: evidence.onboarding.preferences.complete && Boolean(evidence.onboarding.preferences.firstProduct), required: true, href: "/workspace/setup", action: "เลือกเป้าหมาย" },
      { key: "profile", title: "โปรไฟล์ธุรกิจ", detail: "ชื่อ ภาษา เขตเวลา และเวลาทำการพร้อม", passed: evidence.onboarding.readiness.businessProfile, required: true, href: "/workspace/setup", action: "ตั้งค่าโปรไฟล์" },
      { key: "access", title: `สิทธิ์ ${product.name}`, detail: "สิทธิ์แผนทำงานอยู่และอนุญาตให้ตั้งค่าได้", passed: Boolean(state?.activeAccess), required: true, href: "/workspace/usage", action: "ตรวจแผน" },
      { key: "configured", title: "การตั้งค่าหลักพร้อม", detail: `มี ${product.name} ที่บันทึกและเผยแพร่การตั้งค่าปัจจุบันแล้ว`, passed: Boolean(state?.configured), required: true, href: product.href, action: product.configure },
      { key: "deployment", title: "การติดตั้งทำงานอยู่", detail: "มี deployment ที่เปิดใช้งานและผูกกับเวอร์ชันปัจจุบัน", passed: Boolean(state?.deployed), required: true, href: "/workspace/setup", action: "สร้าง deployment" },
      { key: "journey", title: "การทดสอบจริงจบสำเร็จ", detail: `มี ${product.name} journey บนเวอร์ชันปัจจุบันที่ทำงานจบ โดยโหมดทดลองปลอดภัยยังเปิดได้จากสตูดิโอ`, passed: Boolean(state?.tested), required: true, href: product.href, action: product.configure },
      { key: "ready", title: "พร้อมเปิดใช้", detail: "หลักฐานสิทธิ์ การตั้งค่า การติดตั้ง และการทดสอบตรงกัน", passed: Boolean(state?.launchReady), required: true, href: "/workspace", action: "ดูภาพรวม" },
    ];
    if (productKey === "flowbot") common.splice(5, 0, { key: "website", title: "เว็บไซต์พบ Widget", detail: "ระบบได้รับหลักฐาน widget_seen จากโดเมนที่อนุญาต", passed: verifiedInstall, required: true, href: "/workspace/setup", action: "ตรวจเว็บไซต์" });
    return common;
  }, [evidence]);
  const required = checks.filter((item) => item.required);
  const passed = required.filter((item) => item.passed).length;
  const ready = required.length > 0 && passed === required.length;
  const activeWorkspace = session.activeWorkspace;

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">กำลังโหลดศูนย์ทดสอบ…</main>;
  if (loadError) return <WorkspacePageLoadError active="test_center" title="ศูนย์ทดสอบ" resource="launch evidence" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} onRetry={() => void load()} />;

  return <main className="workspace-shell"><WorkspaceSidebar active="test_center" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}><header className="workspace-header"><div><p>หลักฐานจากระบบจริง</p><h1>ศูนย์ทดสอบก่อนเปิดใช้</h1></div><span className="role-label" data-no-localize>{activeWorkspace?.businessName}</span></header>
      <section className={`test-center-summary ${ready ? "ready" : "attention"}`} aria-live="polite"><div><p>{ready ? "ผ่านครบ" : "ยังต้องดำเนินการ"}</p><h2>{ready ? `${productCopy[(evidence?.onboarding.preferences.firstProduct as keyof typeof productCopy) || "flowbot"].name} พร้อมเปิดใช้` : `ผ่าน ${passed} จาก ${required.length} รายการที่จำเป็น`}</h2><span>ผลมาจากข้อมูลบนเซิร์ฟเวอร์ ไม่สามารถกดข้ามหรือทำเครื่องหมายผ่านเองได้</span></div><button type="button" disabled={loadingEvidence} onClick={() => void load()}>{loadingEvidence ? "กำลังตรวจ…" : "ตรวจอีกครั้ง"}</button></section>
      <section className="tool-band"><div className="test-center-grid">{checks.map((item) => <article className={item.passed ? "passed" : item.required ? "failed" : "optional"} key={item.key}><span className="test-status" aria-hidden="true">{item.passed ? "✓" : item.required ? "!" : "–"}</span><div><h2>{item.title}</h2><p>{item.detail}</p>{item.key === "website" && evidence?.checks[0] ? <small>ตรวจล่าสุด {new Date(evidence.checks[0].checkedAt || evidence.checks[0].createdAt).toLocaleString(currentIntlLocale())} · {evidence.checks[0].safeResultCode || evidence.checks[0].status}</small> : null}</div><a href={item.href}>{item.passed ? "ดูรายละเอียด" : item.action}</a></article>)}</div></section>
      <section className="tool-band"><div className="band-heading"><div><p>ผูกกับเวอร์ชันที่เผยแพร่</p><h2>ประวัติการทดสอบถาวร</h2></div><span>{evidence?.regressionRuns.length || 0} รายการ</span></div>
        {evidence?.regressionRuns.length ? <div className="data-table">{evidence.regressionRuns.map((run) => <div className="data-row regression-run-row" key={run.id}><div><strong>{productCopy[run.productKey].name} · {run.suiteKey.replaceAll("_", " ")}</strong><span>{new Date(run.observedAt).toLocaleString(currentIntlLocale())} · {run.locale.toUpperCase()}</span></div><span className={run.status === "passed" ? "status-positive" : "status-danger"}>{run.status === "passed" ? "ผ่าน" : "ไม่ผ่าน"}</span><small>{Object.entries(run.checks).map(([key, value]) => `${value ? "✓" : "!"} ${key.replaceAll("_", " ")}`).join(" · ")}</small></div>)}</div>
          : <div className="empty-state"><strong>ยังไม่มีหลักฐานการทดสอบเวอร์ชันที่เผยแพร่</strong><p>เผยแพร่เวอร์ชันปัจจุบัน แล้วทดสอบจากสตูดิโอ ระบบจะบันทึกผลโดยอัตโนมัติเมื่อฉบับร่างตรงกับเวอร์ชันนั้น</p></div>}
      </section>
      <section className="tool-band muted-band"><div className="band-heading"><div><p>ต้องการคนช่วยตรวจ?</p><h2>ส่งผลทดสอบให้ทีมเทคนิค</h2></div><a className="primary-link" href="/workspace/support?from=/workspace/test-center">เปิดคำขอความช่วยเหลือ</a></div><p className="control-copy">ทีมช่วยเหลือจะเห็นเฉพาะบริบทของศูนย์ทดสอบและข้อมูลที่คุณเขียนในคำขอ การเข้าถึงเวิร์กสเปซต้องขอสิทธิ์แยกต่างหาก</p></section>
    </section></main>;
}
