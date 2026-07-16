"use client";

import { useState, type FormEvent } from "react";
import { safeMutationFetch, safeSameOriginPath } from "@djay/shared";
import { tenantApplicationEnvironment } from "../lib/application-environment";

export default function TenantLoginPage() {
  const [status, setStatus] = useState<"idle" | "working" | "mfa_required" | "authenticated" | "error">("idle");
  const [mfaStage, setMfaStage] = useState(false);
  const [message, setMessage] = useState("");

  function continuationDestination() {
    return safeSameOriginPath(new URLSearchParams(window.location.search).get("next"), "/workspace");
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
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      const result = await response.json().catch(() => ({}));
      if (response.ok && result.status === "mfa_required") {
        setMfaStage(true);
        setStatus("mfa_required");
        return;
      }
      if (!response.ok || result.status !== "authenticated") throw new Error(response.status >= 500 ? "Sign in is temporarily unavailable. Try again." : "Email or password is incorrect.");
      setStatus("authenticated");
      setMessage(result.selectedTenantId ? "Signed in. Opening your workspace..." : "Signed in. Choose a workspace to continue.");
      window.setTimeout(() => window.location.assign(continuationDestination()), 350);
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
    setStatus("authenticated");
    window.location.assign(continuationDestination());
  }

  return (
    <main>
      <header><span className="mark">D</span><strong>DJAY BOT</strong><span className="realm">Workspace</span></header>
      <section aria-labelledby="tenant-login-title">
        <p>Business account</p>
        <h1 id="tenant-login-title">{mfaStage ? "Verify your identity" : "Sign in to your workspace"}</h1>
        {mfaStage ? (
          <form onSubmit={verifyMfa}>
            <label>Authenticator code<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} name="code" autoComplete="one-time-code" required /></label>
            <button type="submit" disabled={status === "working"}>{status === "working" ? "Verifying..." : "Verify"}</button>
          </form>
        ) : (
          <form onSubmit={submit}>
            <label>Email<input type="email" name="email" autoComplete="email" required /></label>
            <label>Password<input type="password" name="password" autoComplete="current-password" required /></label>
            <button type="submit" disabled={status === "working"}>
              {status === "working" ? "Signing in..." : "Sign in"}
            </button>
          </form>
        )}
        {message ? <p className={`message ${status}`} role="status">{message}</p> : null}
        <nav><a href="/recovery">Forgot password?</a><a href={tenantApplicationEnvironment.publicAppUrl}>Create workspace</a></nav>
      </section>
    </main>
  );
}
