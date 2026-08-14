"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { safeMutationFetch } from "@djay/shared";
import { BrandLockup, LocaleSwitch } from "../../BrandChrome";
import { useTenantLocale } from "../../LocaleBoundary";
import { FlowSimulator } from "../flowbot/FlowSimulator";
import { greetingTemplate, leadCaptureTemplate } from "./flowbot-templates";

type ProductState = {
  productKey: "flowbot" | "ai_chat" | "voice";
  activeAccess: boolean;
  configured: boolean;
  tested: boolean;
};
type Onboarding = {
  business_name: string;
  locale: string;
  preferences: {
    businessGoal: "answer_questions" | "capture_leads" | "recommend_products" | "book_appointments" | "customer_support" | null;
    industry: "retail" | "services" | "restaurant" | "education" | "property" | "health" | "other" | null;
    complete: boolean;
    conversationExamplesReviewed: boolean;
  };
  readiness: { productStates: ProductState[] };
};
type Bot = { id: string; name: string; currentPublishedVersionId: string | null };
type Draft = { revision: number; definition: unknown };
type SetupPayload = {
  selectedTenantId: string;
  workspaces: Array<{ tenantId: string; businessName: string; role: string }>;
  onboarding: Onboarding;
  bots: Bot[];
  selectedBotId: string | null;
  draft: Draft | null;
};
type SetupStep = "goal" | "conversations" | "configure" | "test" | "complete";

function previewPayload(): SetupPayload {
  return {
    selectedTenantId: "preview-tenant",
    workspaces: [{ tenantId: "preview-tenant", businessName: "Sample Business", role: "tenant_master_admin" }],
    onboarding: {
      business_name: "Sample Business",
      locale: "en",
      preferences: { businessGoal: null, industry: null, complete: false, conversationExamplesReviewed: false },
      readiness: {
        productStates: [
          { productKey: "flowbot", activeAccess: true, configured: false, tested: false },
          { productKey: "ai_chat", activeAccess: false, configured: false, tested: false },
          { productKey: "voice", activeAccess: false, configured: false, tested: false },
        ],
      },
    },
    bots: [],
    selectedBotId: null,
    draft: null,
  };
}

function localPreviewRequested() {
  return process.env.NODE_ENV !== "production"
    && new URLSearchParams(window.location.search).get("preview") === "1";
}

const goalOptions = [
  { value: "capture_leads", title: "Capture interested customers", detail: "Ask for contact details and give your team a clear follow-up." },
  { value: "answer_questions", title: "Answer common questions", detail: "Give customers fast, consistent answers before a person steps in." },
  { value: "recommend_products", title: "Recommend products or services", detail: "Guide customers toward the right choice with a few simple questions." },
  { value: "book_appointments", title: "Book appointments", detail: "Collect the information your team needs to confirm a suitable time." },
  { value: "customer_support", title: "Route support requests", detail: "Understand the issue and pass it to the right person with context." },
] as const;

const industries = [
  ["services", "Services"], ["retail", "Retail"], ["restaurant", "Restaurant"],
  ["education", "Education"], ["property", "Property"], ["health", "Health & beauty"], ["other", "Other"],
] as const;

function currentStep(onboarding: Onboarding | null): SetupStep {
  if (!onboarding?.preferences.complete) return "goal";
  if (!onboarding.preferences.conversationExamplesReviewed) return "conversations";
  const flowbot = onboarding.readiness.productStates.find((item) => item.productKey === "flowbot");
  if (!flowbot?.configured) return "configure";
  if (!flowbot.tested) return "test";
  return "complete";
}

function conversationExamples(goal: Onboarding["preferences"]["businessGoal"]) {
  const finalReply = goal === "book_appointments"
    ? "Certainly. What day works best, and what phone number should we use to confirm?"
    : goal === "answer_questions"
      ? "Yes. I can answer that now, or connect you with the team if you need more help."
      : goal === "recommend_products"
        ? "I can help. What matters most to you: budget, speed, or the most complete option?"
        : goal === "customer_support"
          ? "I’ll collect the details and send them to the right person. What happened?"
          : "Of course. May I get your name and contact details so the team can follow up?";
  return [
    { customer: "Hi, I’m interested but I’m not sure where to start.", bot: "Welcome. I’ll ask one or two simple questions and help you take the next step." },
    { customer: "Can someone help me today?", bot: finalReply },
    { customer: "I need to speak with a person.", bot: "No problem. I’ll pass this conversation to your team with the information already shared." },
  ];
}

export default function GuidedSetupPage() {
  const { locale } = useTenantLocale();
  const [payload, setPayload] = useState<SetupPayload | null>(null);
  const [selectedBotId, setSelectedBotId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [templateKind, setTemplateKind] = useState<"greeting" | "lead">("lead");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [previewMode, setPreviewMode] = useState(false);

  const onboarding = payload?.onboarding ?? null;
  const step = currentStep(onboarding);
  const activeWorkspace = payload?.workspaces.find((item) => item.tenantId === payload.selectedTenantId) ?? null;
  const flowbot = onboarding?.readiness.productStates.find((item) => item.productKey === "flowbot");
  const examples = useMemo(() => conversationExamples(onboarding?.preferences.businessGoal ?? null), [onboarding?.preferences.businessGoal]);
  const stepIndex = step === "complete" ? 4 : ["goal", "conversations", "configure", "test"].indexOf(step);

  async function load() {
    setLoading(true);
    setError("");
    try {
      if (localPreviewRequested()) {
        const result = previewPayload();
        setPreviewMode(true);
        setPayload(result);
        setSelectedBotId("");
        setDraft(null);
        setTemplateKind("lead");
        return;
      }
      const response = await fetch("/tenant/setup", { cache: "no-store" });
      if (!response.ok) throw new Error("setup_unavailable");
      const result = await response.json() as SetupPayload;
      setPayload(result);
      setSelectedBotId(result.selectedBotId ?? "");
      setDraft(result.draft);
      const goal = result.onboarding.preferences.businessGoal;
      setTemplateKind(goal === "capture_leads" || goal === "book_appointments" ? "lead" : "greeting");
    } catch {
      setError("We couldn’t load your setup. Your saved progress is safe.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  async function logout() {
    const response = await safeMutationFetch("/tenant/auth/logout", { method: "POST" });
    if (response.ok) window.location.replace("/");
    else setError("We couldn’t confirm sign out. Please try again.");
  }

  async function saveGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (previewMode) {
      const businessGoal = String(form.get("businessGoal")) as Onboarding["preferences"]["businessGoal"];
      const industry = String(form.get("industry")) as Onboarding["preferences"]["industry"];
      setPayload((current) => current ? {
        ...current,
        onboarding: { ...current.onboarding, preferences: { ...current.onboarding.preferences, businessGoal, industry, complete: true } },
      } : current);
      setTemplateKind(businessGoal === "capture_leads" || businessGoal === "book_appointments" ? "lead" : "greeting");
      return;
    }
    setWorking(true); setError("");
    const businessGoal = String(form.get("businessGoal"));
    const response = await safeMutationFetch("/tenant/onboarding", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "save_preferences", businessGoal, industry: String(form.get("industry")), firstProduct: "flowbot" }),
    });
    setWorking(false);
    if (!response.ok) { setError("We couldn’t save that choice. Please try again."); return; }
    await load();
  }

  async function confirmConversations() {
    if (previewMode) {
      setPayload((current) => current ? {
        ...current,
        onboarding: { ...current.onboarding, preferences: { ...current.onboarding.preferences, conversationExamplesReviewed: true } },
      } : current);
      return;
    }
    setWorking(true); setError("");
    const response = await safeMutationFetch("/tenant/onboarding", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "review_conversations" }),
    });
    setWorking(false);
    if (!response.ok) { setError("We couldn’t save this step. Please try again."); return; }
    await load();
  }

  async function configureBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (previewMode) {
      const botId = "preview-flowbot";
      setSelectedBotId(botId);
      setPayload((current) => current ? {
        ...current,
        selectedBotId: botId,
        bots: [{ id: botId, name: "Main customer assistant", currentPublishedVersionId: "preview-version" }],
        onboarding: {
          ...current.onboarding,
          readiness: {
            productStates: current.onboarding.readiness.productStates.map((product) => product.productKey === "flowbot" ? { ...product, configured: true } : product),
          },
        },
      } : current);
      return;
    }
    setWorking(true); setError("");
    try {
      const form = new FormData(event.currentTarget);
      let botId = selectedBotId;
      let revision = draft?.revision ?? null;
      if (!botId) {
        const createResponse = await safeMutationFetch("/tenant/flowbot/bots", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: String(form.get("name") || "Main customer assistant"), defaultLanguage: locale }),
        });
        const created = await createResponse.json().catch(() => ({}));
        if (!createResponse.ok || !created.botId) throw new Error("create_failed");
        botId = created.botId;
        const draftResponse = await fetch(`/tenant/flowbot/bots/${botId}/draft`, { cache: "no-store" });
        const draftResult = await draftResponse.json();
        if (!draftResponse.ok || typeof draftResult.draft?.revision !== "number") throw new Error("draft_failed");
        revision = draftResult.draft.revision;
      }
      if (revision === null) throw new Error("draft_missing");
      const definition = templateKind === "lead" ? leadCaptureTemplate() : greetingTemplate();
      const saveResponse = await safeMutationFetch(`/tenant/flowbot/bots/${botId}/draft`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revision, definition }),
      });
      if (!saveResponse.ok) throw new Error("save_failed");
      const publishResponse = await safeMutationFetch(`/tenant/flowbot/bots/${botId}/publish`, { method: "POST" });
      if (!publishResponse.ok) throw new Error("publish_failed");
      await load();
    } catch {
      setError("We couldn’t prepare the chatbot. Your previous version was not changed.");
    } finally {
      setWorking(false);
    }
  }

  function completePreviewTest() {
    setPayload((current) => current ? {
      ...current,
      onboarding: {
        ...current.onboarding,
        readiness: {
          productStates: current.onboarding.readiness.productStates.map((product) => product.productKey === "flowbot" ? { ...product, tested: true } : product),
        },
      },
    } : current);
  }

  function resetPreview() {
    const result = previewPayload();
    setPayload(result);
    setSelectedBotId("");
    setDraft(null);
    setTemplateKind("lead");
    setError("");
  }

  if (loading) return <main className="guided-setup-loading"><BrandLockup /><div className="setup-skeleton" /><div className="setup-skeleton short" /></main>;
  if (!activeWorkspace) return <main className="guided-setup-loading"><BrandLockup /><p>We couldn’t open this workspace.</p><button onClick={() => location.reload()}>Try again</button></main>;

  return <main className="guided-setup-shell">
    <header className="guided-setup-header">
      <BrandLockup />
      <div className="guided-header-actions"><LocaleSwitch />{previewMode ? <><span className="guided-preview-badge">Preview — no data is saved</span><button type="button" onClick={resetPreview}>Restart preview</button></> : <><a href="/workspace/support?from=/workspace/setup">Get help</a><button type="button" onClick={() => void logout()}>Sign out</button></>}</div>
    </header>
    <div className="guided-progress" aria-label={`Setup step ${Math.min(stepIndex + 1, 4)} of 4`}>
      {["Goal", "Conversations", "Chatbot", "Test"].map((label, index) => <div className={index < stepIndex || step === "complete" ? "done" : index === stepIndex ? "current" : ""} key={label}><span>{index < stepIndex || step === "complete" ? "✓" : index + 1}</span><strong>{label}</strong></div>)}
    </div>
    <section className="guided-setup-stage" aria-live="polite">
      {error ? <p className="guided-error" role="alert">{error}</p> : null}

      {step === "goal" ? <div className="guided-step-content">
        <p className="guided-kicker">Let’s start with your customer</p>
        <h1>What should your chatbot help with first?</h1>
        <p className="guided-intro">Choose one outcome. You can change it later.</p>
        <form onSubmit={saveGoal}>
          <fieldset className="goal-choice-list"><legend className="visually-hidden">Business goal</legend>{goalOptions.map((goal) => <label key={goal.value}><input type="radio" name="businessGoal" value={goal.value} defaultChecked={goal.value === "capture_leads"} /><span><strong>{goal.title}</strong><small>{goal.detail}</small></span></label>)}</fieldset>
          <label className="simple-select">What kind of business do you run?<select name="industry" defaultValue="services">{industries.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
          <button className="guided-primary" disabled={working}>{working ? "Saving…" : "Continue"}</button>
        </form>
      </div> : null}

      {step === "conversations" ? <div className="guided-step-content">
        <p className="guided-kicker">See what customers will experience</p>
        <h1>Here are the conversations your chatbot should handle</h1>
        <p className="guided-intro">These examples shape the starter conversation we’ll prepare next.</p>
        <div className="conversation-example-list">{examples.map((example, index) => <article key={index}><p className="customer-message"><span>Customer</span>{example.customer}</p><p className="bot-message"><span>DJbot</span>{example.bot}</p></article>)}</div>
        <button className="guided-primary" disabled={working} onClick={() => void confirmConversations()}>{working ? "Saving…" : "This looks right"}</button>
      </div> : null}

      {step === "configure" ? <div className="guided-step-content">
        <p className="guided-kicker">Prepare your first chatbot</p>
        <h1>Choose how the conversation should begin</h1>
        <p className="guided-intro">We’ll build and publish the starter conversation for you.</p>
        {!flowbot?.activeAccess ? <div className="guided-notice"><strong>Flow Bot access is not active yet.</strong><a href="/workspace/usage">Review your plan</a></div> : <form onSubmit={configureBot}>
          {!selectedBotId ? <label className="simple-select">Chatbot name<input name="name" defaultValue="Main customer assistant" minLength={2} maxLength={120} required /></label> : null}
          <fieldset className="template-choice-list"><legend>Starter conversation</legend><label><input type="radio" name="template" checked={templateKind === "lead"} onChange={() => setTemplateKind("lead")} /><span><strong>Collect customer details</strong><small>Welcome the customer, ask for contact details, then confirm the team will follow up.</small></span></label><label><input type="radio" name="template" checked={templateKind === "greeting"} onChange={() => setTemplateKind("greeting")} /><span><strong>Simple welcome</strong><small>Welcome the customer and finish with a short confirmation.</small></span></label></fieldset>
          <button className="guided-primary" disabled={working || !flowbot?.activeAccess}>{working ? "Preparing your chatbot…" : "Create my chatbot"}</button>
        </form>}
      </div> : null}

      {step === "test" && selectedBotId ? <div className="guided-step-content guided-test-step">
        <p className="guided-kicker">Try it before customers do</p>
        <h1>Test your chatbot</h1>
        <p className="guided-intro">Start the conversation below. Nothing here is sent to a real customer.</p>
        {previewMode ? <div className="guided-preview-test"><div className="conversation-example-list"><article><p className="customer-message"><span>Customer</span>Hi, I’m interested. Where should I start?</p><p className="bot-message"><span>DJbot</span>Welcome. May I get your name and contact details so the team can follow up?</p></article></div><p>This preview uses sample messages and does not contact a real service.</p><button className="guided-primary" type="button" onClick={completePreviewTest}>Finish test</button></div> : <FlowSimulator botId={selectedBotId} locale={locale} startNodeId={null} startNodeTitle={null} onTrace={() => undefined} onPreviewComplete={() => void load()} />}
      </div> : null}

      {step === "complete" ? <div className="guided-step-content guided-complete">
        <span className="guided-complete-mark" aria-hidden="true">✓</span>
        <p className="guided-kicker">Setup complete</p>
        <h1>Your chatbot is ready for the next step</h1>
        <p className="guided-intro">Your goal is saved, the conversation is published, and the test passed.</p>
        {previewMode ? <button className="guided-primary" type="button" onClick={resetPreview}>Test onboarding again</button> : <a className="guided-primary" href="/workspace">Go to my workspace</a>}
      </div> : null}
    </section>
    {previewMode ? <div className="guided-help guided-help-preview"><strong>Preview mode</strong><span>No login or saved data</span></div> : <a className="guided-help" href="/workspace/support?from=/workspace/setup"><strong>Need help?</strong><span>Talk to a person</span></a>}
  </main>;
}
