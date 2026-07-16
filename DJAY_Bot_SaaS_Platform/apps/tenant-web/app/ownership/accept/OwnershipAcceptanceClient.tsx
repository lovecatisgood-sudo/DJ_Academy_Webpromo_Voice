"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { clearBrowserOneTimeValues, retainBrowserOneTimeValues, safeMutationFetch } from "@djay/shared";

const ownershipStorage = "djay.ownership";

export function OwnershipAcceptanceClient({ transferId: initialTransferId, token: initialToken }: Readonly<{ transferId: string; token: string }>) {
  const [transferId, setTransferId] = useState(initialTransferId);
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
      initialValues: { transferId: initialTransferId, token: initialToken },
      storagePrefix: ownershipStorage,
      cleanPath: "/ownership/accept",
    });
    setTransferId(retained.transferId || "");
    setToken(retained.token || "");
    void loadSession();
  }, [initialToken, initialTransferId]);

  async function accept() {
    setStatus("working");
    const response = await safeMutationFetch(`/tenant/ownership-transfers/${transferId}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      clearBrowserOneTimeValues(ownershipStorage, ["transferId", "token"]);
      setTransferId("");
      setToken("");
      setStatus("accepted");
      setMessage("Ownership transferred. Sign in again to start a new secure session.");
    } else {
      if (response.status < 500 && result.status !== "reauthentication_required") {
        clearBrowserOneTimeValues(ownershipStorage, ["transferId", "token"]);
        setTransferId("");
        setToken("");
      }
      setStatus("error");
      setMessage(response.status >= 500
        ? "Ownership acceptance is temporarily unavailable. No ownership state changed."
        : result.status === "reauthentication_required"
        ? "Sign in again before accepting this transfer."
        : "This ownership transfer is invalid or has expired.");
      if (result.status === "reauthentication_required") setAuthenticated(false);
    }
  }

  const returnPath = "/ownership/accept";
  const signInUrl = `/?next=${encodeURIComponent(returnPath)}`;
  function replaceWithSignIn(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    window.location.replace(signInUrl);
  }
  return (
    <main>
      <header><span className="mark">D</span><strong>DJAY BOT</strong><span className="realm">Ownership</span></header>
      <section className="acceptance-panel" aria-labelledby="acceptance-title">
        <span className="mark">D</span>
        <p>Workspace ownership</p>
        <h1 id="acceptance-title">Confirm ownership transfer</h1>
        {sessionError ? (
          <><p role="alert">Your account session could not be checked. No ownership state changed.</p><button type="button" onClick={() => void loadSession()}>Try again</button></>
        ) : authenticated === false ? (
          <><p>{message || "Sign in with the invited account to continue."}</p><a className="primary-link" href={signInUrl} onClick={replaceWithSignIn}>Sign in to continue</a></>
        ) : status === "accepted" ? (
          <><p role="status">{message}</p><a className="primary-link" href="/">Sign in</a></>
        ) : (
          <>
            <p role={status === "error" ? "alert" : undefined}>{message || "Accepting makes you the Tenant Master Admin for this workspace."}</p>
            <button type="button" disabled={authenticated !== true || !transferId || !token || status === "working"} onClick={() => void accept()}>
              {status === "working" ? "Confirming..." : "Accept ownership"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
