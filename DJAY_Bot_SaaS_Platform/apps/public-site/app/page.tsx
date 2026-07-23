"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  businessNameFieldConstraints,
  displayNameFieldConstraints,
  emailFieldConstraints,
  identityTextError,
  newPasswordConstraints,
  normalizeIdentityText,
  passwordConfirmationError,
  safeMutationFetch,
} from "@djay/shared";
import { VerificationResendForm } from "./VerificationResendForm";

const fieldClass = "field";
type CatalogPlan = {
  planKey: string; productKey: string; publicName: string; tierName: string;
  summary: string; sellable: boolean; publicHighlights: string[];
};
type LegalMetadata = {
  terms: { version: string; title: string; effectiveDate: string };
  privacy: { version: string; title: string; effectiveDate: string };
};

const productPillars = [
  {
    title: "AI Chat",
    copy: "Answers buyer questions instantly, captures intent, qualifies leads, and keeps every conversation moving while your team is busy.",
  },
  {
    title: "FlowBot",
    copy: "Turns repeatable sales and support playbooks into automated message flows for follow-up, booking, FAQs, reminders, and handoff.",
  },
  {
    title: "Voice",
    copy: "Gives businesses an always-on voice layer for call intake, lead capture, routing, and post-call summaries.",
  },
  {
    title: "Social Inbox",
    copy: "Connects Messenger, WhatsApp, LINE, and website chat into one workspace so no lead disappears between platforms.",
  },
];

const outcomes = [
  "Increase lead conversion by up to 50%",
  "Stop hot leads from going cold overnight",
  "Reply instantly across chat, social, and voice",
  "Save hours every week for owners and sales teams",
];

export default function RegistrationPage() {
  const idempotencyKey = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "accepted" | "error">("idle");
  const [message, setMessage] = useState("");
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [selectedPlanKey, setSelectedPlanKey] = useState("");
  const [catalogStage, setCatalogStage] = useState<"loading" | "ready" | "error">("loading");
  const [legalStage, setLegalStage] = useState<"loading" | "ready" | "error">("loading");
  const [legal, setLegal] = useState<LegalMetadata | null>(null);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState("");

  async function loadCatalog() {
    setCatalogStage("loading");
    try {
      const response = await fetch("/public/catalog", { cache: "no-store" });
      if (!response.ok) throw new Error("catalog_unavailable");
      const nextPlans = (await response.json()).plans;
      if (!Array.isArray(nextPlans)) throw new Error("catalog_unavailable");
      setPlans(nextPlans);
      setCatalogStage("ready");
    } catch {
      setPlans([]);
      setSelectedPlanKey("");
      setCatalogStage("error");
    }
  }

  async function loadLegal() {
    setLegalStage("loading");
    setAcceptedLegal(false);
    try {
      const response = await fetch("/public/legal", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok || body.status !== "available"
        || typeof body.terms?.version !== "string" || typeof body.privacy?.version !== "string") {
        throw new Error("legal_unavailable");
      }
      setLegal({ terms: body.terms, privacy: body.privacy });
      setLegalStage("ready");
    } catch {
      setLegal(null);
      setLegalStage("error");
    }
  }

  useEffect(() => { void loadCatalog(); void loadLegal(); }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!legal || legalStage !== "ready" || !acceptedLegal) {
      setStatus("error");
      setMessage("Review and accept the current service terms and privacy notice before registering.");
      return;
    }
    const data = new FormData(event.currentTarget);
    const nameError = identityTextError(data.get("name"), "displayName");
    const businessNameError = identityTextError(data.get("businessName"), "businessName");
    const identityError = nameError
      ? { field: "name", message: nameError }
      : businessNameError
        ? { field: "businessName", message: businessNameError }
        : null;
    if (identityError) {
      const input = event.currentTarget.elements.namedItem(identityError.field);
      if (input instanceof HTMLInputElement) {
        input.setCustomValidity(identityError.message);
        input.reportValidity();
      }
      setStatus("error");
      setMessage(identityError.message);
      return;
    }
    const confirmationError = passwordConfirmationError(data.get("password"), data.get("passwordConfirmation"));
    if (confirmationError) {
      const confirmation = event.currentTarget.elements.namedItem("passwordConfirmation");
      if (confirmation instanceof HTMLInputElement) {
        confirmation.setCustomValidity(confirmationError);
        confirmation.reportValidity();
      }
      setStatus("error");
      setMessage(confirmationError);
      return;
    }
    setStatus("submitting");
    setMessage("");
    idempotencyKey.current ??= crypto.randomUUID();
    try {
      const response = await safeMutationFetch("/public/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          name: normalizeIdentityText(data.get("name")),
          email: data.get("email"),
          businessName: normalizeIdentityText(data.get("businessName")),
          password: data.get("password"),
          locale: "en",
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Bangkok",
          ...(selectedPlanKey ? { selectedPlanKey } : {}),
          termsVersion: legal.terms.version,
          privacyVersion: legal.privacy.version,
          acceptTerms: acceptedLegal,
          acceptPrivacy: acceptedLegal,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 409 && result.status === "legal_version_changed") {
        void loadLegal();
      }
      if (!response.ok) throw new Error(result.message || "Registration could not be completed.");
      setRegisteredEmail(String(data.get("email") || ""));
      setStatus("accepted");
      setMessage(result.message || "Check your email to continue.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Registration could not be completed.");
    }
  }

  return (
    <main className="landing-page">
      <header className="landing-nav" aria-label="Main navigation">
        <a className="brand-lockup public-brand" href="/">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span>DJBOT</span>
        </a>
        <nav>
          <a href="#features">Features</a>
          <a href="#benefits">Benefits</a>
          <a href="/login">Sign in</a>
          <a className="nav-cta" href="#start">Start</a>
        </nav>
      </header>

      <section className="landing-hero" aria-labelledby="brand-title">
        <div className="hero-copy">
          <p className="eyebrow">AI sales automation for modern merchants</p>
          <h1 id="brand-title">Convert more leads before they go cold.</h1>
          <p className="supporting-copy">
            DJBOT combines AI chat, FlowBot automation, social messaging, and voice into one SaaS workspace built to answer faster, follow up harder, and turn more conversations into customers.
          </p>
          <div className="hero-actions">
            <a className="primary-link" href="#start">Create workspace</a>
            <a className="secondary-link" href="#features">See features</a>
          </div>
        </div>
        <div className="hero-product" aria-label="DJBOT lead conversion workspace preview">
          <div className="product-topbar">
            <span>Lead command center</span>
            <strong>Live</strong>
          </div>
          <div className="conversation-card priority">
            <small>WhatsApp lead</small>
            <strong>Interested in the annual FlowBot plan</strong>
            <p>AI qualified budget, timeline, and product fit in 38 seconds.</p>
          </div>
          <div className="conversation-grid">
            <div><span>Response time</span><strong>Instant</strong></div>
            <div><span>Warm leads</span><strong>+50%</strong></div>
            <div><span>Manual follow-up</span><strong>-70%</strong></div>
            <div><span>Channels</span><strong>4</strong></div>
          </div>
          <div className="flow-preview">
            <span>New lead</span>
            <span>Qualify</span>
            <span>Book</span>
            <span>Close</span>
          </div>
        </div>
      </section>

      <section className="outcome-band" id="benefits" aria-label="Business outcomes">
        {outcomes.map((outcome) => <div key={outcome}>{outcome}</div>)}
      </section>

      <section className="feature-section" id="features" aria-labelledby="features-title">
        <div className="section-heading">
          <p className="step-label">What merchants get</p>
          <h2 id="features-title">One platform for chat, flows, voice, and sales follow-up.</h2>
        </div>
        <div className="feature-grid">
          {productPillars.map((feature) => (
            <article className="feature-card" key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="conversion-section" aria-labelledby="conversion-title">
        <div>
          <p className="step-label">Why it works</p>
          <h2 id="conversion-title">Speed closes the gap between interest and purchase.</h2>
        </div>
        <div className="conversion-copy">
          <p>Most leads do not disappear because they were bad. They disappear because nobody replied fast enough, followed up clearly enough, or remembered the context when the buyer came back.</p>
          <p>DJBOT keeps the conversation alive from first message to handoff: instant replies, structured qualification, automated reminders, human takeover, and a unified customer timeline.</p>
        </div>
      </section>

      <section className="signup-section" id="start" aria-labelledby="register-title">
        <div className="form-wrap">
          <p className="step-label">Workspace registration</p>
          <h2 id="register-title">{status === "accepted" ? "Check your email" : "Create your account"}</h2>
          {status === "accepted" ? (
            <div className="registration-complete">
              <p className="form-message accepted" role="status">{message}</p>
              <p>Open the verification link to create the workspace and owner access. You can safely request another link below if the first email does not arrive.</p>
              <VerificationResendForm initialEmail={registeredEmail} />
            </div>
          ) : <form onSubmit={submit}>
            <label>
              Your name
              <input className={fieldClass} name="name" autoComplete="name" {...displayNameFieldConstraints} required onInput={(event) => event.currentTarget.setCustomValidity("")} />
            </label>
            <label>
              Work email
              <input className={fieldClass} type="email" name="email" autoComplete="email" {...emailFieldConstraints} required />
            </label>
            <label>
              Business name
              <input className={fieldClass} name="businessName" autoComplete="organization" {...businessNameFieldConstraints} required onInput={(event) => event.currentTarget.setCustomValidity("")} />
            </label>
            <label>
              Password
              <input className={fieldClass} type="password" name="password" autoComplete="new-password" aria-describedby="registration-password-help" {...newPasswordConstraints} required />
            </label>
            <label>
              Confirm password
              <input className={fieldClass} type="password" name="passwordConfirmation" autoComplete="new-password" aria-describedby="registration-password-help" {...newPasswordConstraints} required onInput={(event) => event.currentTarget.setCustomValidity("")} />
            </label>
            <p className="field-help" id="registration-password-help">Use 12–128 characters. A long, unique passphrase is recommended.</p>
            <fieldset className="plan-selection">
              <legend>Start with a product</legend>
              <div className="plan-options">
                {catalogStage === "loading" ? <div className="plan-load-state" aria-live="polite" aria-busy="true">Loading available products…</div> : null}
                {plans.map((plan) => (
                  <label className={selectedPlanKey === plan.planKey ? "plan-option selected" : "plan-option"} key={plan.planKey}>
                    <input
                      type="radio"
                      name="selectedPlanKey"
                      value={plan.planKey}
                      checked={selectedPlanKey === plan.planKey}
                      onChange={() => setSelectedPlanKey(plan.planKey)}
                    />
                    <span><strong>{plan.publicName}</strong><small>{plan.publicHighlights[0]}</small></span>
                  </label>
                ))}
                {catalogStage === "ready" && !plans.length ? <div className="plan-load-state" role="status">New product selection is temporarily closed. You can still create your owner account.</div> : null}
                {catalogStage === "error" ? <div className="plan-load-state error" role="alert"><span>Products could not be loaded. You can continue without selecting one.</span><button type="button" onClick={() => void loadCatalog()}>Try again</button></div> : null}
              </div>
              <p>Saved as your setup preference. We’ll activate this plan after payment.</p>
            </fieldset>
            {legalStage === "loading" ? <div className="legal-load-state" role="status" aria-live="polite">Loading current service terms and privacy notice…</div> : null}
            {legalStage === "error" ? <div className="legal-load-state error" role="alert"><span>Registration is paused because the approved service terms or privacy notice could not be loaded.</span><button type="button" onClick={() => void loadLegal()}>Try again</button></div> : null}
            <label className="check-row">
              <input type="checkbox" name="acceptTerms" value="yes" required disabled={legalStage !== "ready"} checked={acceptedLegal} onChange={(event) => setAcceptedLegal(event.currentTarget.checked)} />
              <span>I accept the <a href="/terms" target="_blank" rel="noreferrer">Service Terms</a> and <a href="/privacy" target="_blank" rel="noreferrer">Privacy Notice</a>.{legal ? <small> Versions {legal.terms.version} and {legal.privacy.version}, effective {legal.terms.effectiveDate} and {legal.privacy.effectiveDate}.</small> : null}</span>
            </label>
            <button type="submit" disabled={status === "submitting" || legalStage !== "ready"}>
              {status === "submitting" ? "Creating..." : "Create workspace"}
            </button>
          </form>}
          {message && status !== "accepted" ? <p className={`form-message ${status}`} role={status === "error" ? "alert" : "status"}>{message}</p> : null}
          <p className="sign-in">Already registered? <a href="/login">Sign in</a></p>
        </div>
      </section>
    </main>
  );
}
