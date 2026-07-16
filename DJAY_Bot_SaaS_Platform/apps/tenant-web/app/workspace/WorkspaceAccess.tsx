import { WorkspaceSidebar, type WorkspaceArea, type WorkspaceSummary } from "./WorkspaceSidebar";

export function WorkspaceViewOnly({ children }: Readonly<{ children: string }>) {
  return <div className="workspace-access-note" role="status"><strong>View-only access</strong><span>{children}</span></div>;
}

export function WorkspaceSessionLoadError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <main className="workspace-session-error">
      <header><span className="mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span className="realm">Workspace</span></header>
      <section aria-labelledby="workspace-session-error-title" role="alert">
        <p>Temporarily unavailable</p>
        <h1 id="workspace-session-error-title">We couldn’t load your workspace</h1>
        <p className="control-copy">Your account and saved data have not changed. Check your connection and try again.</p>
        <button type="button" onClick={onRetry}>Try again</button>
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
        <header className="workspace-header"><div><p>Workspace</p><h1>{title}</h1></div><span className="role-label">{workspace?.businessName}</span></header>
        <section className="tool-band workspace-access-denied" role="alert">
          <div className="band-heading"><div><p>Restricted</p><h2>You don’t have access to this area</h2></div></div>
          <p className="control-copy">Your current workspace role does not include this permission. Ask a workspace owner to change your role if you need access.</p>
          <a className="primary-link" href="/workspace">Return to overview</a>
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
        <header className="workspace-header"><div><p>Workspace</p><h1>{title}</h1></div><span className="role-label">{workspace?.businessName}</span></header>
        <section className="tool-band workspace-load-error" role="alert">
          <div className="band-heading"><div><p>Temporarily unavailable</p><h2>We couldn’t load {resource}</h2></div></div>
          <p className="control-copy">Your saved data has not changed. Check your connection and try again.</p>
          <button className="secondary-command" type="button" onClick={onRetry}>Try again</button>
        </section>
      </section>
    </main>
  );
}
