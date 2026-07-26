"use client";

import { resolveOnboardingLocale, type OnboardingLocale } from "@djay/channel-onboarding/messages";
import { flowSnapshotSchema } from "@djay/flowbot-domain";
import { useEffect, useState } from "react";
import { flowCanvasCopy } from "../../../../lib/i18n/flow-canvas";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../../WorkspaceAccess";
import { WorkspaceSidebar } from "../../WorkspaceSidebar";
import { useWorkspaceSession } from "../../useWorkspaceSession";
import { FlowCanvas } from "../FlowCanvas";

type Bot = Readonly<{ id: string; name: string; status: string }>;
type Draft = Readonly<{ revision: number; definition: Record<string, unknown> }>;

/**
 * Read-only conversation map for the selected bot's draft. The linear editor in
 * `/workspace/flowbot` stays the only place a flow can be changed during this stage.
 */
export default function FlowCanvasPage() {
  const session = useWorkspaceSession();
  const [locale, setLocale] = useState<OnboardingLocale>("th");
  const [bots, setBots] = useState<readonly Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const copy = flowCanvasCopy(locale);

  useEffect(() => {
    if (!session.selectedTenantId) return;
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/tenant/flowbot/bots", { cache: "no-store" });
        if (!response.ok) throw new Error("flowbot_unavailable");
        const result = await response.json() as { bots?: Bot[] };
        if (!active) return;
        const list = result.bots ?? [];
        setBots(list);
        setSelectedBotId((current) => current && list.some((bot) => bot.id === current) ? current : list[0]?.id ?? "");
        setLoadError(false);
        if (!list.length) setLoading(false);
      } catch {
        if (active) { setLoadError(true); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, [session.selectedTenantId]);

  useEffect(() => {
    if (!selectedBotId) { setDraft(null); return; }
    let active = true;
    setLoading(true);
    void (async () => {
      try {
        const response = await fetch(`/tenant/flowbot/bots/${selectedBotId}/draft`, { cache: "no-store" });
        if (!response.ok) throw new Error("flowbot_draft_unavailable");
        const result = await response.json() as { draft?: Draft };
        if (!active) return;
        setDraft(result.draft ?? null); setLoadError(false); setLoading(false);
      } catch {
        if (active) { setDraft(null); setLoadError(true); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, [selectedBotId]);

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">{copy.loading}</main>;
  if (loadError) {
    return <WorkspacePageLoadError active="flowbot" title="FlowBot" resource={copy.title} workspaces={session.workspaces}
      selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)}
      onLogout={() => void session.logout()} onRetry={() => window.location.reload()} />;
  }
  const nodeCount = Object.keys((draft?.definition.nodes as Record<string, unknown> | undefined) ?? {}).length;
  const invalidDefinition = Boolean(draft) && !flowSnapshotSchema.safeParse(draft?.definition).success;

  return <main className="workspace-shell">
    <WorkspaceSidebar active="flowbot" workspaces={session.workspaces} selectedTenantId={session.selectedTenantId}
      onSelect={(id) => void session.selectWorkspace(id)} onLogout={() => void session.logout()} chromeLocale={locale} />
    <section id="workspace-main" className="workspace-main" tabIndex={-1}>
      <header className="workspace-header">
        <div><p>FlowBot</p><h1>{copy.title}</h1></div>
        <label>{copy.localeToggle}
          <select value={locale} onChange={(event) => setLocale(resolveOnboardingLocale(event.target.value))}>
            <option value="th">ไทย</option>
            <option value="en">English</option>
          </select>
        </label>
      </header>
      <section className="tool-band">
        <div className="band-heading">
          <div><p>{copy.subtitle}</p><h2>{bots.find((bot) => bot.id === selectedBotId)?.name ?? copy.title}</h2></div>
          <span>{draft ? `${copy.draftRevision} ${draft.revision} · ${nodeCount} ${copy.nodeCount}` : ""}</span>
        </div>
        {bots.length > 1 ? <label>{copy.botLabel}
          <select value={selectedBotId} onChange={(event) => setSelectedBotId(event.target.value)}>
            {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
          </select>
        </label> : null}
        {!bots.length ? <p className="pending-line">{copy.noBots}</p> : null}
        {loading && bots.length ? <p className="flow-canvas-placeholder">{copy.loading}</p> : null}
        {draft && !loading ? <FlowCanvas definition={draft.definition} locale={locale} invalidDefinition={invalidDefinition} /> : null}
        <p className="field-help"><a href="/workspace/flowbot">{copy.backToStudio}</a> · <a href="/workspace/flowbot#flowbot-panel-flow">{copy.openLinearEditor}</a></p>
      </section>
    </section>
  </main>;
}
