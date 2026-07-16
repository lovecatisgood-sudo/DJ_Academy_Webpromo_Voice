"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import { clearBrowserOneTimeValues, displayNameFieldConstraints, identityTextError, newPasswordConstraints, normalizeIdentityText, passwordConfirmationError, retainBrowserOneTimeValues, safeMutationFetch } from "@djay/shared";

const invitationStorage = "djay.invitation";

export function InvitationAcceptanceClient({
  token: initialToken,
  tenantLoginUrl,
}: Readonly<{ token: string; tenantLoginUrl: string }>) {
  const [token, setToken] = useState(initialToken);
  const [status, setStatus] = useState<"idle" | "submitting" | "accepted" | "error" | "sign_in">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const retained = retainBrowserOneTimeValues({
      initialValues: { token: initialToken }, storagePrefix: invitationStorage, cleanPath: "/invitations/accept",
    });
    setToken(retained.token || "");
  }, [initialToken]);

  const tenantInvitationUrl = new URL("/invitations/accept", tenantLoginUrl);
  if (token) tenantInvitationUrl.hash = new URLSearchParams({ token }).toString();
  const existingAccountUrl = tenantInvitationUrl.toString();

  function continueExistingAccount(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    window.location.replace(existingAccountUrl);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const nameError = identityTextError(data.get("name"), "displayName");
    if (nameError) {
      const name = event.currentTarget.elements.namedItem("name");
      if (name instanceof HTMLInputElement) {
        name.setCustomValidity(nameError);
        name.reportValidity();
      }
      setStatus("error");
      setMessage(nameError);
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
    try {
      const response = await safeMutationFetch("/public/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: normalizeIdentityText(data.get("name")) || undefined,
          password: data.get("password") || undefined,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (result.status === "sign_in_required") {
        setStatus("sign_in");
        setMessage("This email already has an account. Continue to the secure sign-in journey to accept it.");
        return;
      }
      if (!response.ok) {
        if (response.status < 500) {
          clearBrowserOneTimeValues(invitationStorage, ["token"]);
          setToken("");
        }
        throw new Error(response.status >= 500 ? "Invitation acceptance is temporarily unavailable. Try again." : "This invitation is invalid or has expired.");
      }
      clearBrowserOneTimeValues(invitationStorage, ["token"]);
      setToken("");
      setStatus("accepted");
      setMessage("Your team access is ready. Sign in to continue.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "This invitation could not be accepted.");
    }
  }

  return (
    <section className="verification-panel" aria-labelledby="invitation-title">
      <div className="brand-lockup verification-brand"><span className="brand-mark">D</span><span>DJAY BOT</span></div>
      <p className="step-label">Team invitation</p>
      <h1 id="invitation-title">Join your workspace</h1>
      {status === "accepted" || status === "sign_in" ? (
        <>
          <p className="verification-copy" role="status">{message}</p>
          {status === "sign_in"
            ? <a className="primary-link" href={existingAccountUrl} onClick={continueExistingAccount}>Continue to sign in</a>
            : <a className="primary-link" href={tenantLoginUrl}>Sign in</a>}
        </>
      ) : (
        <>
          <p className="verification-copy">Set your account details to accept this invitation.</p>
          <form onSubmit={submit}>
            <label>Your name<input className="field" name="name" autoComplete="name" {...displayNameFieldConstraints} required onInput={(event) => event.currentTarget.setCustomValidity("")} /></label>
            <label>Password<input className="field" type="password" name="password" autoComplete="new-password" aria-describedby="invitation-password-help" {...newPasswordConstraints} required /></label>
            <label>Confirm password<input className="field" type="password" name="passwordConfirmation" autoComplete="new-password" aria-describedby="invitation-password-help" {...newPasswordConstraints} required onInput={(event) => event.currentTarget.setCustomValidity("")} /></label>
            <p className="field-help" id="invitation-password-help">Use 12–128 characters. A long, unique passphrase is recommended.</p>
            <button type="submit" disabled={!token || status === "submitting"}>
              {status === "submitting" ? "Joining..." : "Accept invitation"}
            </button>
          </form>
          {message ? <p className="form-message error" role="alert">{message}</p> : null}
          <p className="sign-in">Already registered? {token
            ? <a href={existingAccountUrl} onClick={continueExistingAccount}>Sign in first</a>
            : <span>Secure link loading...</span>}</p>
        </>
      )}
    </section>
  );
}
