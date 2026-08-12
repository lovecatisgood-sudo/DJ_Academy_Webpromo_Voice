"use client";

import { resolveOnboardingLocale, type OnboardingLocale } from "@djay/channel-onboarding/messages";
import { flowSnapshotSchema } from "@djay/flowbot-domain";
import { safeMutationFetch } from "@djay/shared";
import { useCallback, useEffect, useState } from "react";
import { flowCanvasCopy } from "../../../../lib/i18n/flow-canvas";
import { WorkspacePageLoadError, WorkspaceSessionLoadError } from "../../WorkspaceAccess";
import { WorkspaceSidebar } from "../../WorkspaceSidebar";
import { useWorkspaceSession } from "../../useWorkspaceSession";
import { FlowCanvas } from "../FlowCanvas";
import { FlowSimulator } from "../FlowSimulator";
import { emptyDefinitionHistory, recordDefinition, redoDefinition, undoDefinition, type DefinitionHistory } from "../definition-history";

type Bot = Readonly<{ id: string; name: string; status: string }>;
type Draft = Readonly<{ revision: number; definition: Record<string, unknown> }>;

/**
 * Visual editor for the selected bot's draft. The list editor remains available for merchants who
 * prefer forms and for detailed node content that is easier to understand outside a graph.
 */
export default function FlowCanvasPage() {
  const session = useWorkspaceSession();
  const [locale, setLocale] = useState<OnboardingLocale>("th");
  const [bots, setBots] = useState<readonly Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [history, setHistory] = useState<DefinitionHistory<Record<string, unknown>>>(emptyDefinitionHistory);
  const [previewStart, setPreviewStart] = useState<{ id: string; title: string } | null>(null);
  const [previewTrace, setPreviewTrace] = useState<readonly string[]>([]);
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
        setDraft(result.draft ?? null); setHistory(emptyDefinitionHistory()); setPreviewStart(null); setPreviewTrace([]); setDirty(false); setMessage(""); setLoadError(false); setLoading(false);
      } catch {
        if (active) { setDraft(null); setLoadError(true); setLoading(false); }
      }
    })();
    return () => { active = false; };
  }, [selectedBotId, reloadKey]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const canAuthor = session.allows("flowbot.author");
  const invalidDefinition = Boolean(draft) && !flowSnapshotSchema.safeParse(draft?.definition).success;

  const applyDefinition = useCallback((definition: Record<string, unknown>) => {
    if (!draft || draft.definition === definition) return;
    setHistory((value) => recordDefinition(value, draft.definition));
    setDraft({ ...draft, definition });
    setDirty(true); setMessage("");
  }, [draft]);

  const undo = useCallback(() => {
    if (!draft) return;
    const result = undoDefinition(history, draft.definition);
    if (!result) return;
    setHistory(result.history);
    setDraft({ ...draft, definition: result.value });
    setDirty(true); setMessage("");
  }, [draft, history]);

  const redo = useCallback(() => {
    if (!draft) return;
    const result = redoDefinition(history, draft.definition);
    if (!result) return;
    setHistory(result.history);
    setDraft({ ...draft, definition: result.value });
    setDirty(true); setMessage("");
  }, [draft, history]);

  useEffect(() => {
    if (!canAuthor) return;
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      if (event.key.toLowerCase() === "z" && !event.shiftKey && history.past.length) {
        event.preventDefault(); undo();
      } else if ((event.key.toLowerCase() === "y" || (event.key.toLowerCase() === "z" && event.shiftKey)) && history.future.length) {
        event.preventDefault(); redo();
      }
    };
    window.addEventListener("keydown", handleHistoryShortcut);
    return () => window.removeEventListener("keydown", handleHistoryShortcut);
  }, [canAuthor, history.future.length, history.past.length, redo, undo]);

  const saveMap = useCallback(async () => {
    if (!draft || !selectedBotId || invalidDefinition || !canAuthor) return;
    const parsed = flowSnapshotSchema.safeParse(draft.definition);
    if (!parsed.success) { setMessage(copy.invalidDefinition); return; }
    setWorking(true); setMessage("");
    const response = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/draft`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: draft.revision, definition: parsed.data }),
    });
    setWorking(false);
    if (!response.ok) { setMessage(response.status === 409 ? copy.saveConflict : copy.saveFailed); return; }
    const result = await response.json() as { revision?: number };
    setDraft((current) => current ? { ...current, revision: result.revision ?? current.revision + 1 } : current);
    setDirty(false); setMessage(copy.saved);
  }, [canAuthor, copy.invalidDefinition, copy.saveConflict, copy.saveFailed, copy.saved, draft, invalidDefinition, selectedBotId]);

  useEffect(() => {
    if (!dirty || invalidDefinition || !canAuthor) return;
    const timer = window.setTimeout(() => { void saveMap(); }, 2500);
    return () => window.clearTimeout(timer);
  }, [canAuthor, dirty, invalidDefinition, saveMap]);

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) return <main className="workspace-loading">{copy.loading}</main>;
  if (loadError) {
    return <WorkspacePageLoadError active="flowbot" title="FlowBot" resource={copy.title} workspaces={session.workspaces}
      selectedTenantId={session.selectedTenantId} onSelect={(id) => void session.selectWorkspace(id)}
      onLogout={() => void session.logout()} onRetry={() => window.location.reload()} />;
  }
  const nodeCount = Object.keys((draft?.definition.nodes as Record<string, unknown> | undefined) ?? {}).length;
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
          <select value={selectedBotId} onChange={(event) => {
            const nextBotId = event.target.value;
            if (dirty && !window.confirm(copy.discardChanges)) return;
            setSelectedBotId(nextBotId);
          }}>
            {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
          </select>
        </label> : null}
        {!bots.length ? <p className="pending-line">{copy.noBots}</p> : null}
        {loading && bots.length ? <p className="flow-canvas-placeholder">{copy.loading}</p> : null}
        {draft && !loading ? <>
          <FlowCanvas definition={draft.definition} locale={locale} invalidDefinition={invalidDefinition} readOnly={!canAuthor}
            onChange={applyDefinition} canUndo={history.past.length > 0} canRedo={history.future.length > 0}
            onUndo={undo} onRedo={redo}
            highlightedNodeIds={previewTrace}
            onSelectedNodeChange={(id, title) => setPreviewStart(id ? { id, title: title ?? id } : null)}
            onEditorMessage={setMessage} />
          {message ? <p className={`inline-message${message === copy.saved ? "" : " error"}`} role={message === copy.saved ? "status" : "alert"}>{message}</p> : null}
          {canAuthor ? <div className="studio-save-bar">
            <span>{dirty ? copy.unsaved : `${copy.draftRevision} ${draft.revision}`}</span>
            {message === copy.saveConflict ? <button type="button" className="secondary-command" onClick={() => {
              if (!dirty || window.confirm(copy.discardChanges)) setReloadKey((value) => value + 1);
            }} disabled={working}>{copy.reload}</button> : null}
            <button type="button" onClick={() => void saveMap()} disabled={working || !dirty || invalidDefinition}>{working ? copy.saving : copy.save}</button>
          </div> : null}
          {canAuthor ? <FlowSimulator botId={selectedBotId} locale={locale}
            startNodeId={previewStart?.id ?? null} startNodeTitle={previewStart?.title ?? null}
            disabled={dirty || invalidDefinition} onTrace={setPreviewTrace} /> : null}
        </> : null}
        <p className="field-help"><a href="/workspace/flowbot">{copy.backToStudio}</a> · <a href="/workspace/flowbot#flowbot-panel-flow">{copy.openLinearEditor}</a></p>
      </section>
    </section>
  </main>;
}
