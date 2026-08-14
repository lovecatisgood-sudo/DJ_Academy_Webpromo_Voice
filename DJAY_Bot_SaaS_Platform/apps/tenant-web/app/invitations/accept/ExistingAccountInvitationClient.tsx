"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { clearBrowserOneTimeValues, retainBrowserOneTimeValues, safeMutationFetch } from "@djay/shared";
import { BrandLockup, LocaleSwitch } from "../../BrandChrome";

const invitationStorage = "djay.invitation";
const invitationPath = "/invitations/accept";
const signInUrl = `/?next=${encodeURIComponent(invitationPath)}`;

export function ExistingAccountInvitationClient({ token: initialToken }: Readonly<{ token: string }>) {
  const [token, setToken] = useState(initialToken);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [sessionError, setSessionError] = useState(false);
  const [status, setStatus] = useState<"idle" | "working" | "accepted" | "error">("idle");
  const [message, setMessage] = useState("");

  async function loadSession() {
    setAuthenticated(null);
    setSessionError(false);
    try {
      const response = await fetch("/tenant/session", { cache: "no-store" });
      if ([401, 403].includes(response.status)) { setAuthenticated(false); return; }
      if (!response.ok) throw new Error("session_unavailable");
      setAuthenticated(true);
    } catch { setSessionError(true); }
  }

  useEffect(() => {
    const retained = retainBrowserOneTimeValues({
      initialValues: { token: initialToken }, storagePrefix: invitationStorage, cleanPath: invitationPath,
    });
    setToken(retained.token || "");
    void loadSession();
  }, [initialToken]);

  function replaceWithSignIn(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    window.location.replace(signInUrl);
  }

  async function accept() {
    setStatus("working");
    setMessage("");
    const response = await safeMutationFetch("/public/invitations/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok && ["accepted", "already_accepted"].includes(result.status)) {
      clearBrowserOneTimeValues(invitationStorage, ["token"]);
      setToken("");
      setStatus("accepted");
      setMessage("Invitation accepted. Sign in again to start a session with your updated workspace access.");
      return;
    }
    if (result.status === "sign_in_required") {
      setStatus("idle");
      setAuthenticated(false);
      setMessage("Your sign-in expired before the invitation was accepted. Sign in again to continue.");
      return;
    }
    if (response.status < 500) {
      clearBrowserOneTimeValues(invitationStorage, ["token"]);
      setToken("");
    }
    setStatus("error");
    setMessage(response.status >= 500
      ? "Invitation acceptance is temporarily unavailable. No workspace access changed."
      : "This invitation is invalid, expired, or belongs to a different account.");
  }

  return (
    <main>
      <header><BrandLockup /><LocaleSwitch /><span className="realm">Invitation</span></header>
      <section className="acceptance-panel" aria-labelledby="existing-invitation-title">
        <BrandLockup />
        <p>Workspace invitation</p>
        <h1 id="existing-invitation-title">Accept with your existing account</h1>
        {sessionError ? (
          <><p role="alert">Your account session could not be checked. No workspace access changed.</p><button type="button" onClick={() => void loadSession()}>Try again</button></>
        ) : status === "accepted" ? (
          <><p role="status">{message}</p><a className="primary-link" href="/">Sign in</a></>
        ) : authenticated === false ? (
          <><p>{message || "Sign in with the email address that received this invitation."}</p><a className="primary-link" href={signInUrl} onClick={replaceWithSignIn}>Sign in to continue</a></>
        ) : (
          <>
            <p role={status === "error" ? "alert" : undefined}>{message || (token
              ? "Confirm to add this workspace to your existing DJAY Bot account."
              : "This invitation link is missing its secure acceptance token.")}</p>
            <button type="button" disabled={authenticated !== true || !token || status === "working"} onClick={() => void accept()}>
              {status === "working" ? "Accepting..." : "Accept invitation"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
