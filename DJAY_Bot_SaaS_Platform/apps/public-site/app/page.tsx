"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { safeMutationFetch } from "@djay/shared";
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
    setStatus("submitting");
    setMessage("");
    idempotencyKey.current ??= crypto.randomUUID();
    const data = new FormData(event.currentTarget);
    try {
      const response = await safeMutationFetch("/public/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKey.current,
          name: data.get("name"),
          email: data.get("email"),
          businessName: data.get("businessName"),
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
    <main className="auth-layout">
      <section className="brand-panel" aria-labelledby="brand-title">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">D</span>
          <span>DJAY BOT</span>
        </div>
        <div>
          <p className="eyebrow">Business workspace</p>
          <h1 id="brand-title">Run every customer conversation from one account.</h1>
          <p className="supporting-copy">Set up the owner account for your company. Team access is invited after verification.</p>
        </div>
        <p className="legal-note">One verified owner account is created for each new workspace. <a href="/status">Service status</a></p>
      </section>

      <section className="form-panel" aria-labelledby="register-title">
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
              <input className={fieldClass} name="name" autoComplete="name" minLength={2} required />
            </label>
            <label>
              Work email
              <input className={fieldClass} type="email" name="email" autoComplete="email" required />
            </label>
            <label>
              Business name
              <input className={fieldClass} name="businessName" autoComplete="organization" minLength={2} required />
            </label>
            <label>
              Password
              <input className={fieldClass} type="password" name="password" autoComplete="new-password" minLength={12} required />
            </label>
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
              <p>Your selected plan is confirmed after email verification.</p>
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
