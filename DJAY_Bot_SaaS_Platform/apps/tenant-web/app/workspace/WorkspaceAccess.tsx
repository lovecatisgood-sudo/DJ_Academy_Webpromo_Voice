import { WorkspaceSidebar, type WorkspaceArea, type WorkspaceSummary } from "./WorkspaceSidebar";

export function WorkspaceViewOnly({ children }: Readonly<{ children: string }>) {
  return <div className="workspace-access-note" role="status"><strong>สิทธิ์ดูอย่างเดียว</strong><span>{children}</span></div>;
}

export function WorkspaceSessionLoadError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <main className="workspace-session-error">
      <header><span className="mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span className="realm">เวิร์กสเปซ</span></header>
      <section aria-labelledby="workspace-session-error-title" role="alert">
        <p>ไม่พร้อมใช้งานชั่วคราว</p>
        <h1 id="workspace-session-error-title">โหลดเวิร์กสเปซไม่สำเร็จ</h1>
        <p className="control-copy">บัญชีและข้อมูลที่บันทึกไว้ไม่ถูกเปลี่ยน โปรดตรวจการเชื่อมต่อแล้วลองใหม่</p>
        <button type="button" onClick={onRetry}>ลองใหม่</button>
      </section>
    </main>
  );
}

export function WorkspaceAccessDenied({
  active,
  title,
  workspaces,
  selectedTenantId,
  onSelect,
  onLogout,
}: Readonly<{
  active: WorkspaceArea;
  title: string;
  workspaces: readonly WorkspaceSummary[];
  selectedTenantId: string;
  onSelect: (tenantId: string) => void;
  onLogout: () => void;
}>) {
  const workspace = workspaces.find((item) => item.tenantId === selectedTenantId);

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar active={active} workspaces={workspaces} selectedTenantId={selectedTenantId} onSelect={onSelect} onLogout={onLogout} />
      <section className="workspace-main">
        <header className="workspace-header"><div><p>เวิร์กสเปซ</p><h1>{title}</h1></div><span className="role-label">{workspace?.businessName}</span></header>
        <section className="tool-band workspace-access-denied" role="alert">
          <div className="band-heading"><div><p>จำกัดสิทธิ์</p><h2>คุณไม่มีสิทธิ์เข้าถึงส่วนนี้</h2></div></div>
          <p className="control-copy">บทบาทปัจจุบันไม่มีสิทธิ์นี้ หากจำเป็นต้องใช้งาน โปรดขอเจ้าของเวิร์กสเปซเปลี่ยนบทบาทให้</p>
          <a className="primary-link" href="/workspace">กลับหน้าภาพรวม</a>
        </section>
      </section>
    </main>
  );
}

export function WorkspacePageLoadError({
  active,
  title,
  resource,
  workspaces,
  selectedTenantId,
  onSelect,
  onLogout,
  onRetry,
}: Readonly<{
  active: WorkspaceArea;
  title: string;
  resource: string;
  workspaces: readonly WorkspaceSummary[];
  selectedTenantId: string;
  onSelect: (tenantId: string) => void;
  onLogout: () => void;
  onRetry: () => void;
}>) {
  const workspace = workspaces.find((item) => item.tenantId === selectedTenantId);

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar active={active} workspaces={workspaces} selectedTenantId={selectedTenantId} onSelect={onSelect} onLogout={onLogout} />
      <section className="workspace-main">
        <header className="workspace-header"><div><p>เวิร์กสเปซ</p><h1>{title}</h1></div><span className="role-label">{workspace?.businessName}</span></header>
        <section className="tool-band workspace-load-error" role="alert">
          <div className="band-heading"><div><p>ไม่พร้อมใช้งานชั่วคราว</p><h2>We couldn’t load {resource}</h2></div></div>
          <p className="control-copy">ข้อมูลที่บันทึกไว้ไม่ถูกเปลี่ยน โปรดตรวจการเชื่อมต่อแล้วลองใหม่</p>
          <button className="secondary-command" type="button" onClick={onRetry}>ลองใหม่</button>
        </section>
      </section>
    </main>
  );
}
