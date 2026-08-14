"use client";

import { useEffect } from "react";
import { BrandLockup } from "../../BrandChrome";

type SetupResponse = {
  onboarding?: {
    preferences: { complete: boolean; conversationExamplesReviewed: boolean };
    readiness: { productStates: Array<{ productKey: string; configured: boolean; tested: boolean }> };
  };
};

export default function WorkspaceStartPage() {
  useEffect(() => {
    void fetch("/tenant/setup", { cache: "no-store" }).then(async (response) => {
      if ([401, 403, 404].includes(response.status)) { window.location.replace("/"); return; }
      if (!response.ok) throw new Error("setup_unavailable");
      const result = await response.json() as SetupResponse;
      const flowbot = result.onboarding?.readiness.productStates.find((item) => item.productKey === "flowbot");
      const setupComplete = Boolean(
        result.onboarding?.preferences.complete
        && result.onboarding.preferences.conversationExamplesReviewed
        && flowbot?.configured
        && flowbot.tested
      );
      window.location.replace(setupComplete ? "/workspace" : "/workspace/setup");
    }).catch(() => window.location.replace("/workspace/setup"));
  }, []);

  return <main className="setup-entry-loading" aria-live="polite">
    <BrandLockup />
    <div className="setup-loading-copy"><strong>Preparing your next step</strong><span>Loading only what you need.</span></div>
  </main>;
}
