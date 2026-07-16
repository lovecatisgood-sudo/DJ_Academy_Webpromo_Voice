"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

const fieldClass = "field";
type CatalogPlan = {
  planKey: string; productKey: string; publicName: string; tierName: string;
  summary: string; sellable: boolean; publicHighlights: string[];
};

export default function RegistrationPage() {
  const idempotencyKey = useRef<string | null>(null);
  const [status, setStatus] = useState<"idle" | "submitting" | "accepted" | "error">("idle");
  const [message, setMessage] = useState("");
  const [plans, setPlans] = useState<CatalogPlan[]>([]);
  const [selectedPlanKey, setSelectedPlanKey] = useState("");

  useEffect(() => {
    void fetch("/public/catalog").then(async (response) => {
      if (!response.ok) return;
      setPlans((await response.json()).plans || []);
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    setMessage("");
    idempotencyKey.current ??= crypto.randomUUID();
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/public/auth/register", {
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
          acceptTerms: data.get("acceptTerms") === "yes",
          acceptPrivacy: data.get("acceptTerms") === "yes",
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || "Registration could not be completed.");
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
          <h2 id="register-title">Create your account</h2>
          <form onSubmit={submit}>
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
              </div>
              <p>Your selected plan is confirmed after email verification.</p>
            </fieldset>
            <label className="check-row">
              <input type="checkbox" name="acceptTerms" value="yes" required />
              <span>I accept the service terms and privacy notice.</span>
            </label>
            <button type="submit" disabled={status === "submitting"}>
              {status === "submitting" ? "Creating..." : "Create workspace"}
            </button>
          </form>
          {message ? <p className={`form-message ${status}`} role="status">{message}</p> : null}
          <p className="sign-in">Already registered? <a href="/login">Sign in</a></p>
        </div>
      </section>
    </main>
  );
}
