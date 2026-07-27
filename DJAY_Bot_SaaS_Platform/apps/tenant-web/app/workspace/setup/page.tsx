"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { tenantRoleAllows, type TenantRole } from "@djay/authorization";
import { safeMutationFetch, uiCopy } from "@djay/shared";
import { createWidgetInstallSnippet } from "@djay/shared/widget-install";
import { WebsiteDeploymentForm } from "../WebsiteDeploymentForm";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { useWorkspaceSession } from "../useWorkspaceSession";
import { tenantWidgetInstallEnvironment } from "../../../lib/widget-install-environment";
import {
  resolveChromeLocale,
  setupChrome,
  type ChromeLocale,
} from "../../../lib/i18n/setup-chrome";
import { greetingTemplate, leadCaptureTemplate } from "./flowbot-templates";

type Onboarding = {
  business_name: string;
  locale: string;
  timezone: string;
  slug: string;
  readiness: {
    businessProfile: boolean;
    productSelected: boolean;
    activeAccess: boolean;
    launchReadyProducts: Array<"flowbot" | "ai_chat" | "voice">;
    productStates: Array<{
      productKey: "flowbot" | "ai_chat" | "voice";
      activeAccess: boolean;
      configured: boolean;
      tested: boolean;
      deployed: boolean;
      launchReady: boolean;
      nextAction: "activate" | "configure" | "deploy" | "test" | "operate";
    }>;
  };
};

type Profile = {
  businessName: string;
  locale: string;
  timezone: string;
  slug: string;
};

type Bot = { id: string; name: string; status: string; currentPublishedVersionId: string | null };
type Draft = { revision: number; definition: unknown };
type Deployment = {
  id: string;
  name: string;
  status: string;
  allowedOrigins: string[];
};

type WizardStepId = "profile" | "access" | "configure" | "deploy" | "test" | "celebrate";

const commonTimezones = [
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Jakarta",
  "Asia/Ho_Chi_Minh",
  "Asia/Tokyo",
  "UTC",
] as const;

function flowbotState(onboarding: Onboarding | null) {
  return onboarding?.readiness.productStates.find((state) => state.productKey === "flowbot") ?? null;
}

function resolveActiveStep(input: Readonly<{
  businessProfile: boolean;
  flowbot: ReturnType<typeof flowbotState>;
  launchReady: boolean;
}>): WizardStepId {
  if (!input.businessProfile) return "profile";
  if (!input.flowbot?.activeAccess) return "access";
  if (!input.flowbot.configured) return "configure";
  if (!input.flowbot.deployed) return "deploy";
  if (!input.flowbot.tested) return "test";
  return "celebrate";
}

export default function SetupWizardPage() {
  const session = useWorkspaceSession();
  const [onboarding, setOnboarding] = useState<Onboarding | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [newDeploymentKey, setNewDeploymentKey] = useState("");
  const [chromeLocale, setChromeLocale] = useState<ChromeLocale>("th");
  const [loadError, setLoadError] = useState(false);
  const [working, setWorking] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error" | null>(null);
  const [templateKind, setTemplateKind] = useState<"greeting" | "lead">("greeting");
  const [manualStep, setManualStep] = useState<WizardStepId | null>(null);

  const chrome = setupChrome(chromeLocale);
  const activeWorkspace = session.workspaces.find((workspace) => workspace.tenantId === session.selectedTenantId);
  const canUpdateProfile = activeWorkspace
    ? tenantRoleAllows(activeWorkspace.role as TenantRole, "tenant.update")
    : false;
  const canAuthor = session.allows("flowbot.author");
  const canPublish = session.allows("flowbot.publish");
  const canDeploy = session.allows("flowbot.deploy");
  const canRefresh = activeWorkspace
    ? tenantRoleAllows(activeWorkspace.role as TenantRole, "onboarding.update")
    : false;
  const canMutateSetup = canAuthor || canPublish || canDeploy || canUpdateProfile;
  const flowbot = flowbotState(onboarding);
  const launchReady = Boolean(flowbot?.launchReady)
    || Boolean(onboarding?.readiness.launchReadyProducts.includes("flowbot"));
  const derivedStep = resolveActiveStep({
    businessProfile: Boolean(onboarding?.readiness.businessProfile),
    flowbot,
    launchReady,
  });
  const activeStep = manualStep ?? derivedStep;
  const selectedBot = bots.find((bot) => bot.id === selectedBotId);
  const installSnippet = newDeploymentKey
    ? createWidgetInstallSnippet("flowbot", newDeploymentKey, tenantWidgetInstallEnvironment)
    : "";

  const steps = useMemo(() => ([
    { id: "profile" as const, label: chrome.stepProfile, complete: Boolean(onboarding?.readiness.businessProfile) },
    { id: "access" as const, label: chrome.stepAccess, complete: Boolean(flowbot?.activeAccess) },
    { id: "configure" as const, label: chrome.stepConfigure, complete: Boolean(flowbot?.configured) },
    { id: "deploy" as const, label: chrome.stepDeploy, complete: Boolean(flowbot?.deployed) },
    { id: "test" as const, label: chrome.stepTest, complete: Boolean(flowbot?.tested) },
    { id: "celebrate" as const, label: chrome.stepCelebrate, complete: launchReady },
  ]), [chrome, flowbot, launchReady, onboarding?.readiness.businessProfile]);

  async function loadEvidence() {
    const [onboardingResponse, profileResponse, botsResponse] = await Promise.all([
      fetch("/tenant/onboarding", { cache: "no-store" }),
      fetch("/tenant/profile", { cache: "no-store" }),
      fetch("/tenant/flowbot/bots", { cache: "no-store" }),
    ]);
    if (!onboardingResponse.ok || !profileResponse.ok) throw new Error("setup_unavailable");
    const onboardingResult = await onboardingResponse.json();
    const profileResult = await profileResponse.json();
    setOnboarding(onboardingResult.onboarding);
    setProfile(profileResult.profile);
    setChromeLocale(resolveChromeLocale(profileResult.profile?.locale || onboardingResult.onboarding?.locale));
    if (botsResponse.ok) {
      const nextBots = (await botsResponse.json()).bots || [];
      setBots(nextBots);
      setSelectedBotId((current) => (
        current && nextBots.some((bot: Bot) => bot.id === current) ? current : nextBots[0]?.id || ""
      ));
    } else {
      setBots([]);
      setSelectedBotId("");
    }
  }

  async function loadBotDetail(botId: string) {
    if (!botId) {
      setDraft(null);
      setDeployments([]);
      return;
    }
    const [draftResponse, deploymentResponse] = await Promise.all([
      fetch(`/tenant/flowbot/bots/${botId}/draft`, { cache: "no-store" }),
      fetch(`/tenant/flowbot/bots/${botId}/deployments`, { cache: "no-store" }),
    ]);
    if (!draftResponse.ok || !deploymentResponse.ok) throw new Error("setup_bot_unavailable");
    setDraft((await draftResponse.json()).draft);
    setDeployments((await deploymentResponse.json()).deployments || []);
  }

  async function bootstrap() {
    try {
      await loadEvidence();
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }

  useEffect(() => {
    if (session.selectedTenantId) void bootstrap();
  }, [session.selectedTenantId]);

  useEffect(() => {
    if (selectedBotId) void loadBotDetail(selectedBotId).catch(() => setLoadError(true));
  }, [selectedBotId]);

  useEffect(() => {
    setManualStep(null);
  }, [derivedStep]);

  async function refreshEvidence() {
    if (!canRefresh) return;
    setRefreshing(true);
    setMessage("");
    setTone(null);
    const response = await safeMutationFetch("/tenant/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "refresh" }),
    });
    if (response.ok) {
      const result = await response.json();
      setOnboarding(result.onboarding);
      setTone("success");
      setMessage("Evidence refreshed from the server.");
      if (selectedBotId) await loadBotDetail(selectedBotId).catch(() => undefined);
    } else {
      setTone("error");
      setMessage("Evidence could not be refreshed.");
    }
    setRefreshing(false);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdateProfile || !profile) return;
    const form = new FormData(event.currentTarget);
    setWorking(true);
    setMessage("");
    setTone(null);
    const locale = String(form.get("locale") || "th");
    const timezone = String(form.get("timezone") || "Asia/Bangkok");
    const businessName = String(form.get("businessName") || "").trim();
    const response = await safeMutationFetch("/tenant/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ businessName, locale, timezone }),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.status === "updated") {
      setProfile({
        businessName: result.onboarding.business_name,
        locale: result.onboarding.locale,
        timezone: result.onboarding.timezone,
        slug: result.onboarding.slug,
      });
      setChromeLocale(resolveChromeLocale(result.onboarding.locale));
      setOnboarding((current) => current ? {
        ...current,
        business_name: result.onboarding.business_name,
        locale: result.onboarding.locale,
        timezone: result.onboarding.timezone,
        readiness: { ...current.readiness, businessProfile: true },
      } : current);
      const scheduleKey = "default_hours";
      await safeMutationFetch("/tenant/flowbot/schedules", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduleKey,
          name: "Default business hours",
          timezone,
          weeklyWindows: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
            dayOfWeek, startMinute: 540, endMinute: 1020,
          })),
          closedDates: [],
        }),
      }).catch(() => null);
      setTone("success");
      setMessage("Business profile saved. Default weekday hours (09:00–17:00) were applied when Flow Bot schedules are available.");
    } else {
      setTone("error");
      setMessage(result?.status === "invalid_timezone"
        ? "Choose a valid timezone."
        : "Profile could not be saved.");
    }
    setWorking(false);
  }

  async function createBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canAuthor) return;
    const form = new FormData(event.currentTarget);
    setWorking(true);
    setMessage("");
    setTone(null);
    const response = await safeMutationFetch("/tenant/flowbot/bots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        defaultLanguage: form.get("defaultLanguage"),
      }),
    });
    setWorking(false);
    if (!response.ok) {
      setTone("error");
      setMessage("Bot could not be created. Confirm Flow Bot access is active.");
      return;
    }
    const result = await response.json();
    setTone("success");
    setMessage("Bot created. Apply a template and publish next.");
    await loadEvidence().catch(() => undefined);
    if (result.botId) setSelectedBotId(result.botId);
  }

  async function applyTemplateAndPublish() {
    if (!canAuthor || !canPublish || !selectedBotId || !draft) return;
    setWorking(true);
    setMessage("");
    setTone(null);
    const definition = templateKind === "lead" ? leadCaptureTemplate() : greetingTemplate();
    const saveResponse = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/draft`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ revision: draft.revision, definition }),
    });
    if (!saveResponse.ok) {
      setWorking(false);
      setTone("error");
      setMessage(saveResponse.status === 409
        ? "Draft changed in another session. Refresh and try again."
        : "Template could not be saved.");
      return;
    }
    const publishResponse = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/publish`, {
      method: "POST",
    });
    const publishResult = await publishResponse.json().catch(() => null);
    setWorking(false);
    if (!publishResponse.ok) {
      setTone("error");
      setMessage(publishResult?.issues?.map((issue: { code: string }) => issue.code).join(", ") || "Publish failed.");
      return;
    }
    setTone("success");
    setMessage(uiCopy(`เผยแพร่เวอร์ชัน ${publishResult.version} แล้ว`, `Version ${publishResult.version} published.`));
    await loadEvidence().catch(() => undefined);
    await loadBotDetail(selectedBotId).catch(() => undefined);
  }

  async function publishOnly() {
    if (!canPublish || !selectedBotId) return;
    setWorking(true);
    setMessage("");
    setTone(null);
    const response = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/publish`, {
      method: "POST",
    });
    const result = await response.json().catch(() => null);
    setWorking(false);
    if (!response.ok) {
      setTone("error");
      setMessage(result?.issues?.map((issue: { code: string }) => issue.code).join(", ") || "Publish failed.");
      return;
    }
    setTone("success");
    setMessage(uiCopy(`เผยแพร่เวอร์ชัน ${result.version} แล้ว`, `Version ${result.version} published.`));
    await loadEvidence().catch(() => undefined);
    await loadBotDetail(selectedBotId).catch(() => undefined);
  }

  async function createDeployment(
    input: Readonly<{ name: string; allowedOrigins: readonly [string] }>,
    form: HTMLFormElement,
  ) {
    if (!canDeploy || !selectedBotId) return;
    setWorking(true);
    setNewDeploymentKey("");
    setMessage("");
    setTone(null);
    const response = await safeMutationFetch(`/tenant/flowbot/bots/${selectedBotId}/deployments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const result = await response.json().catch(() => null);
    setWorking(false);
    if (!response.ok) {
      setTone("error");
      setMessage("Deployment could not be created.");
      return;
    }
    setNewDeploymentKey(result.deploymentKey);
    setTone("success");
    setMessage("Deployment key created. It is shown once — copy the snippet before leaving this step.");
    form.reset();
    await loadEvidence().catch(() => undefined);
    await loadBotDetail(selectedBotId).catch(() => undefined);
  }

  async function requestInstallCheck(deployment: Deployment) {
    const targetOrigin = deployment.allowedOrigins[0];
    if (!targetOrigin || !canDeploy) return;
    setWorking(true);
    setMessage("");
    setTone(null);
    const response = await safeMutationFetch("/tenant/flowbot/install-checks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deploymentId: deployment.id, targetOrigin }),
    });
    setWorking(false);
    setTone(response.ok ? "success" : "error");
    setMessage(response.ok
      ? "Install check requested. Reload the website with the snippet, then refresh evidence after a completed journey."
      : "Install check could not be requested.");
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) {
    return <main className="workspace-loading">Loading setup…</main>;
  }
  if (loadError) {
    return (
      <WorkspacePageLoadError
        active="setup"
        title={activeWorkspace?.businessName || "Workspace"}
        resource="setup wizard"
        workspaces={session.workspaces}
        selectedTenantId={session.selectedTenantId}
        onSelect={(tenantId) => void session.selectWorkspace(tenantId)}
        onLogout={() => void session.logout()}
        onRetry={() => void bootstrap()}
      />
    );
  }

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="setup"
        workspaces={session.workspaces}
        selectedTenantId={session.selectedTenantId}
        onSelect={(tenantId) => void session.selectWorkspace(tenantId)}
        onLogout={() => void session.logout()}
        chromeLocale={chromeLocale}
      />
      <section className="workspace-main">
        <header className="workspace-header">
          <div>
            <p>FlowBot Basic</p>
            <h1>{chrome.title}</h1>
          </div>
          <div className="setup-header-actions">
            <label className="setup-locale-toggle">
              {chrome.localeToggle}
              <select
                value={chromeLocale}
                onChange={(event) => setChromeLocale(resolveChromeLocale(event.target.value))}
              >
                <option value="en">English</option>
                <option value="th">ไทย</option>
              </select>
            </label>
            <a className="secondary-link" href="/workspace">{chrome.saveExit}</a>
          </div>
        </header>

        <p className="setup-subtitle">{chrome.subtitle}</p>
        {!canMutateSetup ? <WorkspaceViewOnly>{chrome.readOnly}</WorkspaceViewOnly> : null}

        <nav className="setup-stepper" aria-label="Setup steps">
          {steps.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={[
                "setup-step",
                step.complete ? "complete" : "",
                activeStep === step.id ? "current" : "",
              ].filter(Boolean).join(" ")}
              onClick={() => setManualStep(step.id)}
              aria-current={activeStep === step.id ? "step" : undefined}
            >
              <span>{index + 1}</span>
              <strong>{step.label}</strong>
            </button>
          ))}
        </nav>

        {message ? (
          <p className={`inline-message ${tone || "error"}`} role={tone === "success" ? "status" : "alert"}>
            {message}
          </p>
        ) : null}

        {activeStep === "profile" ? (
          <section className="tool-band setup-panel" aria-labelledby="setup-profile">
            <div className="band-heading">
              <div><p>Step A</p><h2 id="setup-profile">{chrome.stepProfile}</h2></div>
            </div>
            <p className="control-copy">{chrome.profileHelp}</p>
            {profile ? (
              <form className="record-form profile-form" onSubmit={(event) => void saveProfile(event)}>
                <label>
                  Business name
                  <input name="businessName" defaultValue={profile.businessName} minLength={2} maxLength={200} required disabled={!canUpdateProfile} />
                </label>
                <label>
                  Language
                  <select name="locale" defaultValue={profile.locale === "en" ? "en" : "th"} disabled={!canUpdateProfile}>
                    <option value="en">English</option>
                    <option value="th">Thai</option>
                  </select>
                </label>
                <label>
                  Timezone
                  <select
                    name="timezone"
                    defaultValue={commonTimezones.includes(profile.timezone as typeof commonTimezones[number]) ? profile.timezone : "Asia/Bangkok"}
                    disabled={!canUpdateProfile}
                  >
                    {commonTimezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                  </select>
                </label>
                <p className="field-help">
                  Default weekday hours Mon–Fri 09:00–17:00 are saved with the profile when Flow Bot schedules are available. Inbox handover teams can be refined in the full studio later.
                </p>
                {canUpdateProfile ? (
                  <button type="submit" disabled={working}>{working ? chrome.working : "Save profile"}</button>
                ) : null}
              </form>
            ) : null}
          </section>
        ) : null}

        {activeStep === "access" ? (
          <section className="tool-band setup-panel" aria-labelledby="setup-access">
            <div className="band-heading">
              <div><p>Step</p><h2 id="setup-access">{chrome.stepAccess}</h2></div>
              <a className="primary-link" href="/workspace/usage">{chrome.accessCta}</a>
            </div>
            <p className="control-copy">{chrome.accessHelp}</p>
          </section>
        ) : null}

        {activeStep === "configure" ? (
          <section className="tool-band setup-panel" aria-labelledby="setup-configure">
            <div className="band-heading">
              <div><p>Steps B–C</p><h2 id="setup-configure">{chrome.stepConfigure}</h2></div>
              <a className="secondary-link" href="/workspace/flowbot">{chrome.openStudio}</a>
            </div>
            <p className="control-copy">{chrome.configureHelp}</p>
            {bots.length === 0 ? (
              <form className="record-form" onSubmit={(event) => void createBot(event)}>
                <label>
                  {chrome.botName}
                  <input name="name" required minLength={2} maxLength={120} disabled={!canAuthor} defaultValue="Main Flow Bot" />
                </label>
                <label>
                  {chrome.defaultLanguage}
                  <select name="defaultLanguage" defaultValue={chromeLocale} disabled={!canAuthor}>
                    <option value="en">English</option>
                    <option value="th">Thai</option>
                  </select>
                </label>
                {canAuthor ? (
                  <button type="submit" disabled={working}>{working ? chrome.working : chrome.createBot}</button>
                ) : null}
              </form>
            ) : (
              <div className="setup-configure-grid">
                <label>
                  Bot
                  <select value={selectedBotId} onChange={(event) => setSelectedBotId(event.target.value)}>
                    {bots.map((bot) => (
                      <option key={bot.id} value={bot.id}>
                        {bot.name}{bot.currentPublishedVersionId ? " · published" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset className="setup-template-fieldset">
                  <legend>Template</legend>
                  <label>
                    <input
                      type="radio"
                      name="template"
                      checked={templateKind === "greeting"}
                      onChange={() => setTemplateKind("greeting")}
                      disabled={!canAuthor}
                    />
                    {chrome.templateGreeting}
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="template"
                      checked={templateKind === "lead"}
                      onChange={() => setTemplateKind("lead")}
                      disabled={!canAuthor}
                    />
                    {chrome.templateLead}
                  </label>
                </fieldset>
                <div className="setup-action-row">
                  {canAuthor && canPublish ? (
                    <button type="button" disabled={working || !draft} onClick={() => void applyTemplateAndPublish()}>
                      {working ? chrome.working : chrome.applyPublish}
                    </button>
                  ) : null}
                  {canPublish && selectedBot?.currentPublishedVersionId === null ? (
                    <button type="button" className="quiet-command" disabled={working} onClick={() => void publishOnly()}>
                      {chrome.publishOnly}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </section>
        ) : null}

        {activeStep === "deploy" ? (
          <section className="tool-band setup-panel" aria-labelledby="setup-deploy">
            <div className="band-heading">
              <div><p>Step D</p><h2 id="setup-deploy">{chrome.stepDeploy}</h2></div>
            </div>
            <p className="control-copy">{chrome.deployHelp}</p>
            {!selectedBotId ? (
              <p className="control-copy">Create and publish a bot before deploying.</p>
            ) : (
              <>
                {canDeploy ? (
                  <WebsiteDeploymentForm
                    className="record-form"
                    working={working}
                    submitLabel="Create deployment"
                    onCreate={createDeployment}
                  />
                ) : null}
                {installSnippet ? (
                  <div className="setup-snippet">
                    <strong>{chrome.installSnippet}</strong>
                    <pre><code>{installSnippet}</code></pre>
                  </div>
                ) : null}
                <ul className="setup-deployment-list">
                  {deployments.filter((item) => item.status === "active").map((deployment) => (
                    <li key={deployment.id}>
                      <div>
                        <strong>{deployment.name}</strong>
                        <span>{deployment.allowedOrigins[0] || "No origin"}</span>
                      </div>
                      {canDeploy ? (
                        <button type="button" disabled={working} onClick={() => void requestInstallCheck(deployment)}>
                          {chrome.installCheck}
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        ) : null}

        {activeStep === "test" ? (
          <section className="tool-band setup-panel" aria-labelledby="setup-test">
            <div className="band-heading">
              <div><p>Step E</p><h2 id="setup-test">{chrome.stepTest}</h2></div>
              {canRefresh ? (
                <button type="button" disabled={refreshing} onClick={() => void refreshEvidence()}>
                  {refreshing ? chrome.refreshing : chrome.refresh}
                </button>
              ) : null}
            </div>
            <p className="control-copy">{chrome.testHelp}</p>
            <ol className="setup-test-list">
              <li>Confirm the snippet is on the exact allowed origin.</li>
              <li>Open that site, start the widget, and finish one greeting or lead journey on the current published version.</li>
              <li>Return here and refresh evidence. Install checks alone do not set launch ready.</li>
            </ol>
          </section>
        ) : null}

        {activeStep === "celebrate" ? (
          <section className="tool-band setup-panel setup-celebrate" aria-labelledby="setup-celebrate">
            <div className="band-heading">
              <div><p>Step F</p><h2 id="setup-celebrate">{chrome.celebrateTitle}</h2></div>
            </div>
            <p className="control-copy">{chrome.celebrateBody}</p>
            <div className="setup-action-row">
              <a className="primary-link" href="/workspace">{chrome.navOverview}</a>
              <a className="secondary-link" href="/workspace/team">{chrome.inviteTeam}</a>
              <a className="secondary-link" href="/workspace/flowbot">{chrome.openStudio}</a>
            </div>
          </section>
        ) : null}

        <footer className="setup-footer">
          {canRefresh && activeStep !== "test" ? (
            <button type="button" className="quiet-command" disabled={refreshing} onClick={() => void refreshEvidence()}>
              {refreshing ? chrome.refreshing : chrome.refresh}
            </button>
          ) : null}
          <a className="secondary-link" href="/workspace/flowbot">{chrome.openStudio}</a>
        </footer>
      </section>
    </main>
  );
}
