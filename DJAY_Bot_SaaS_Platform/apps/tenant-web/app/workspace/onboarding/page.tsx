"use client";

import { useEffect, useState, type FormEvent } from "react";
import { safeMutationFetch } from "@djay/shared";
import { BrandLockup, LocaleSwitch } from "../../BrandChrome";

type ProductKey = "flowbot" | "ai_chat" | "voice";
type OnboardingPayload = {
  accountOnboarding: {
    version: number; currentVersion: number; complete: boolean; claimedProduct: ProductKey | null;
  };
};

const productNames: Record<ProductKey, string> = {
  flowbot: "Flow Bot", ai_chat: "AI Text Bot", voice: "AI Voice Bot",
};
const productDestinations: Record<ProductKey, string> = {
  flowbot: "/workspace/flowbot", ai_chat: "/workspace/ai-chat", voice: "/workspace/voice",
};

export default function MerchantOnboardingPage() {
  const [payload, setPayload] = useState<OnboardingPayload | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    void fetch("/tenant/onboarding", { cache: "no-store" }).then(async (response) => {
      if ([401, 403].includes(response.status)) { window.location.replace("/"); return; }
      if (!response.ok) throw new Error("onboarding_unavailable");
      const result = (await response.json()).onboarding as OnboardingPayload;
      if (result.accountOnboarding.complete || !result.accountOnboarding.claimedProduct) {
        window.location.replace(result.accountOnboarding.claimedProduct
          ? productDestinations[result.accountOnboarding.claimedProduct] : "/workspace");
        return;
      }
      setPayload(result); setStatus("ready");
    }).catch(() => { setStatus("error"); setMessage("We couldn’t load this step. Your saved Bot is safe."); });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!payload) return;
    const data = new FormData(event.currentTarget);
    setStatus("saving"); setMessage("");
    const response = await safeMutationFetch("/tenant/onboarding", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "complete_merchant_onboarding",
        version: payload.accountOnboarding.currentVersion,
        acceptedGuidelines: data.get("acceptedGuidelines") === "yes",
        businessGoal: data.get("businessGoal"), industry: data.get("industry"),
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !["completed", "already_completed"].includes(result.status)) {
      setStatus("error");
      setMessage(response.status === 409
        ? "Your saved Bot is no longer available for this workspace. Return to Builder and deploy it again."
        : "We couldn’t save your answers. Nothing was marked complete; please try again.");
      return;
    }
    const product = result.onboarding?.accountOnboarding?.claimedProduct ?? payload.accountOnboarding.claimedProduct;
    window.location.replace(productDestinations[product as ProductKey] ?? "/workspace");
  }

  if (status === "loading") return <main className="merchant-onboarding-state"><BrandLockup /><p>Loading your saved Bot…</p></main>;
  if (!payload) return <main className="merchant-onboarding-state"><BrandLockup /><h1>We couldn’t open onboarding</h1><p>{message}</p><button type="button" onClick={() => location.reload()}>Try again</button></main>;
  const productName = productNames[payload.accountOnboarding.claimedProduct ?? "flowbot"];

  return <main className="merchant-onboarding-shell">
    <header><BrandLockup /><LocaleSwitch /><a href="/workspace">Dashboard</a></header>
    <section aria-labelledby="merchant-onboarding-title">
      <p className="merchant-onboarding-kicker">One-time account setup</p>
      <h1 id="merchant-onboarding-title">Before you continue with {productName}</h1>
      <p className="merchant-onboarding-intro">Confirm the operating guidelines and tell us the main outcome your business needs. Your saved Bot and package will not change.</p>
      <form onSubmit={submit}>
        <div className="merchant-guidelines" aria-labelledby="merchant-guidelines-title">
          <h2 id="merchant-guidelines-title">Responsible use guidelines</h2>
          <ul><li>Review your Bot before publishing and keep business information accurate.</li><li>Do not use the Bot for unlawful, deceptive, or unsafe activity.</li><li>Keep human support available for sensitive or unresolved customer needs.</li><li>Protect customer data and collect only what your business genuinely needs.</li></ul>
        </div>
        <label>Primary customer outcome<select name="businessGoal" defaultValue="capture_leads" required><option value="capture_leads">Capture interested customers</option><option value="answer_questions">Answer common questions</option><option value="recommend_products">Recommend products or services</option><option value="book_appointments">Book appointments</option><option value="customer_support">Handle customer support</option></select></label>
        <label>Business type<select name="industry" defaultValue="services" required><option value="services">Services</option><option value="retail">Retail</option><option value="restaurant">Restaurant</option><option value="education">Education</option><option value="property">Property</option><option value="health">Health and beauty</option><option value="other">Other</option></select></label>
        <label className="merchant-guidelines-accept"><input type="checkbox" name="acceptedGuidelines" value="yes" required /><span>I have read and agree to follow these guidelines.</span></label>
        <button type="submit" disabled={status === "saving"}>{status === "saving" ? "Saving…" : `Continue to ${productName}`}</button>
        {message ? <p className="merchant-onboarding-error" role="alert">{message}</p> : null}
      </form>
    </section>
  </main>;
}
