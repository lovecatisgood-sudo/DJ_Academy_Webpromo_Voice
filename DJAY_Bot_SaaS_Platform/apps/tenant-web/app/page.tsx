"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { clearBrowserOneTimeValues, emailFieldConstraints, retainBrowserOneTimeValues, safeMutationFetch, safeSameOriginPath } from "@djay/shared";
import { tenantApplicationEnvironment } from "../lib/application-environment";
import { defaultWorkspaceHome } from "../lib/workspace-labels";
import { BrandLockup, LocaleSwitch } from "./BrandChrome";

export default function TenantLoginPage() {
  const [status, setStatus] = useState<"idle" | "working" | "mfa_required" | "workspace_required" | "claiming" | "authenticated" | "error">("idle");
  const [mfaStage, setMfaStage] = useState(false);
  const [message, setMessage] = useState("");
  const authenticatedResult = useRef<Readonly<{
    selectedTenantId?: string | null;
    workspaces?: ReadonlyArray<{ tenantId: string; role: string; businessName?: string }>;
  }> | null>(null);
  const [builderClaimToken, setBuilderClaimToken] = useState("");
  const builderClaimStorage = "djay.builder-claim";

  useEffect(() => {
    const retained = retainBrowserOneTimeValues({
      initialValues: { builder_claim: "" }, storagePrefix: builderClaimStorage, cleanPath: "/",
    });
    setBuilderClaimToken(retained.builder_claim || "");
  }, []);

  function continuationDestination() {
    const rawNext = new URLSearchParams(window.location.search).get("next");
    const explicitNext = rawNext
      ? safeSameOriginPath(rawNext, "")
      : "";
    const result = authenticatedResult.current;
    const selected = result?.workspaces?.find((workspace) => workspace.tenantId === result.selectedTenantId)
      ?? result?.workspaces?.[0];
    return defaultWorkspaceHome({
      role: selected?.role,
      explicitNext: explicitNext || null,
    });
  }

  async function claimAndContinue() {
    if (!builderClaimToken) {
      setStatus("authenticated");
      window.location.replace(continuationDestination());
      return;
    }
    setStatus("claiming");
    const response = await safeMutationFetch("/public/builder/claim", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: builderClaimToken }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !["claimed", "replayed"].includes(result.status)) {
      setStatus("error");
      setMessage(response.status >= 500
        ? "The saved Bot could not be attached temporarily. Try again without leaving this tab."
        : "This Builder continuation is invalid, expired, or no longer matches the saved draft. Return to Builder and retry Deploy Bot.");
      if (response.status < 500) {
        clearBrowserOneTimeValues(builderClaimStorage, ["builder_claim"]);
        setBuilderClaimToken("");
      }
      return;
    }
    clearBrowserOneTimeValues(builderClaimStorage, ["builder_claim"]);
    setBuilderClaimToken("");
    setStatus("authenticated");
    setMessage("Bot attached. Opening your workspace...");
    window.setTimeout(() => window.location.replace("/workspace/onboarding"), 250);
  }

  async function chooseWorkspace(tenantId: string) {
    setStatus("working");
    const response = await safeMutationFetch("/tenant/workspace/select", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId }),
    });
    if (!response.ok) {
      setStatus("workspace_required");
      setMessage("That workspace could not be selected. Try again.");
      return;
    }
    authenticatedResult.current = { ...authenticatedResult.current, selectedTenantId: tenantId };
    await claimAndContinue();
  }

  async function continueAuthenticated(result: Readonly<{ selectedTenantId?: string | null; workspaces?: ReadonlyArray<{ tenantId: string; role: string; businessName?: string }> }>) {
    setMfaStage(false);
    authenticatedResult.current = result;
    if (!result.selectedTenantId && (result.workspaces?.length ?? 0) > 1) {
      setStatus("workspace_required");
      setMessage(builderClaimToken ? "Choose the workspace that should own this saved Bot." : "Choose a workspace to continue.");
      return;
    }
    await claimAndContinue();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("working");
    setMessage("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await safeMutationFetch("/public/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), password: data.get("password"), locale: /(?:^|;\s*)djay-locale=en(?:;|$)/.test(document.cookie) ? "en" : "th" }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.status === "mfa_required") {
        setMfaStage(true);
        setStatus("mfa_required");
        return;
      }
      if (!response.ok || result.status !== "authenticated") throw new Error(response.status >= 500 ? "Sign in is temporarily unavailable. Try again." : "Email or password is incorrect.");
      await continueAuthenticated(result);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Sign in is unavailable.");
    }
  }

  async function verifyMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("working");
    setMessage("");
    const data = new FormData(event.currentTarget);
    const response = await safeMutationFetch("/public/auth/mfa/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: data.get("code") }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.status !== "authenticated") {
      setStatus("mfa_required");
      setMessage(response.status >= 500 ? "Identity verification is temporarily unavailable. Try again." : "The verification code is invalid or expired.");
      return;
    }
    await continueAuthenticated(result);
  }

  return (
    <main>
      <header><BrandLockup /><LocaleSwitch /><span className="realm">Workspace</span></header>
      <section aria-labelledby="tenant-login-title">
        <p>Business account</p>
        <h1 id="tenant-login-title">{mfaStage ? "Verify your identity" : "Sign in to your workspace"}</h1>
        {status === "workspace_required" ? (
          <div className="workspace-choice" role="group" aria-label="Choose workspace">
            {(authenticatedResult.current?.workspaces ?? []).map((workspace) => (
              <button type="button" key={workspace.tenantId} onClick={() => void chooseWorkspace(workspace.tenantId)}>
                {workspace.businessName || "Open workspace"}
              </button>
            ))}
          </div>
        ) : mfaStage ? (
          <form onSubmit={verifyMfa}>
            <label>Authenticator code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} name="code" autoComplete="one-time-code" required /></label>
            <button type="submit" disabled={status === "working"}>{status === "working" ? "Verifying..." : "Verify"}</button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <label>Email<input type="email" name="email" autoComplete="email" {...emailFieldConstraints} required /></label>
            <label>Password<input type="password" name="password" autoComplete="current-password" maxLength={128} required /></label>
            <button type="submit" disabled={status === "working" || status === "claiming"}>
              {status === "working" ? "Signing in..." : status === "claiming" ? "Attaching saved Bot..." : "Sign in"}
            </button>
          </form>
        )}
        {message ? <p className={`message ${status}`} role="status">{message}</p> : null}
        <nav><a href="/recovery">Forgot password?</a><a href={`${tenantApplicationEnvironment.publicAppUrl}/build`}>Configure a new Bot</a></nav>
      </section>
    </main>
  );
}
