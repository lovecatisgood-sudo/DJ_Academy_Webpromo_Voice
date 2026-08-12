"use client";

import {
  lineConnectFailureMessage, lineConnectStepLabel, lineConnectSteps, lineProviderWarning,
  resolveOnboardingLocale, type LineConnectReason, type LineConnectStep, type OnboardingLocale,
} from "@djay/channel-onboarding/messages";
import { safeMutationFetch } from "@djay/shared";
import { useEffect, useState, type FormEvent } from "react";
import { lineConnectCopy } from "../../../../../lib/i18n/line-connect";

type Bot = { id: string; name: string; status: string; currentPublishedVersionId: string | null };
type ConnectedBot = { basicId: string; displayName: string; pictureUrl: string | null; chatMode: "chat" | "bot" };
type Failure = { step: LineConnectStep; reason: LineConnectReason; statusCode: number | null; rolledBack: boolean };
type Success = { connectionId: string; webhookUrl: string; bot: ConnectedBot };

const stepIndex = (step: LineConnectStep) => lineConnectSteps.indexOf(step);

export default function ConnectLinePage() {
  const [locale, setLocale] = useState<OnboardingLocale>("th");
  const [bots, setBots] = useState<Bot[]>([]);
  const [botsError, setBotsError] = useState(false);
  const [botId, setBotId] = useState("");
  const [name, setName] = useState("");
  const [channelId, setChannelId] = useState("");
  const [channelSecret, setChannelSecret] = useState("");
  const [preview, setPreview] = useState<ConnectedBot | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [notice, setNotice] = useState("");
  const [success, setSuccess] = useState<Success | null>(null);
  const [working, setWorking] = useState(false);

  const copy = lineConnectCopy(locale);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/tenant/flowbot/bots", { cache: "no-store" });
        if (!response.ok) throw new Error("unavailable");
        const result = await response.json() as { bots?: Bot[] };
        if (!active) return;
        const publishable = (result.bots ?? []).filter((bot) => bot.status === "active" && bot.currentPublishedVersionId);
        setBots(publishable);
        setBotId((current) => current || publishable[0]?.id || "");
      } catch {
        if (active) setBotsError(true);
      }
    })();
    return () => { active = false; };
  }, []);

  function reset() {
    setFailure(null); setNotice(""); setSuccess(null);
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); reset(); setWorking(true);
    try {
      const response = await safeMutationFetch("/tenant/flowbot/social-connections/line/preview", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId, channelSecret }),
      });
      const result = await response.json() as { status?: string; bot?: ConnectedBot; reason?: LineConnectReason };
      if (response.ok && result.bot) { setPreview(result.bot); return; }
      if (result.status === "reauthentication_required") { setNotice(copy.reauthenticate); return; }
      if (result.reason) { setFailure({ step: "mint", reason: result.reason, statusCode: null, rolledBack: false }); return; }
      setNotice(copy.unavailable);
    } catch {
      setNotice(copy.unavailable);
    } finally {
      setWorking(false);
    }
  }

  async function connect() {
    reset(); setWorking(true);
    try {
      const response = await safeMutationFetch("/tenant/flowbot/social-connections", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: "line", botId, name, channelId, channelSecret }),
      });
      const result = await response.json() as {
        status?: string; connectionId?: string; webhookUrl?: string; bot?: ConnectedBot;
        step?: LineConnectStep; reason?: LineConnectReason; statusCode?: number | null; rolledBack?: boolean;
      };
      if (response.ok && result.connectionId && result.webhookUrl && result.bot) {
        setSuccess({ connectionId: result.connectionId, webhookUrl: result.webhookUrl, bot: result.bot });
        return;
      }
      if (result.status === "reauthentication_required") { setNotice(copy.reauthenticate); return; }
      if (result.status === "connect_failed" && result.step && result.reason) {
        setFailure({
          step: result.step, reason: result.reason,
          statusCode: result.statusCode ?? null, rolledBack: result.rolledBack === true,
        });
        return;
      }
      setNotice(copy.unavailable);
    } catch {
      setNotice(copy.unavailable);
    } finally {
      setWorking(false);
    }
  }

  const failedIndex = failure ? stepIndex(failure.step) : -1;

  return (
    <div className="workspace-shell">
      <main className="workspace-main">
        <header className="band-heading">
          <div>
            <p>FlowBot</p>
            <h1>{copy.title}</h1>
            <span>{copy.subtitle}</span>
          </div>
          <label>{copy.localeToggle}
            <select value={locale} onChange={(event) => setLocale(resolveOnboardingLocale(event.target.value))}>
              <option value="th">ไทย</option>
              <option value="en">English</option>
            </select>
          </label>
        </header>

        {/* Permanent-Provider warning, shown before anything is asked for. */}
        <section className="tool-band" aria-labelledby="line-connect-warning">
          <h2 id="line-connect-warning">{copy.warningTitle}</h2>
          <p role="note">{lineProviderWarning[locale]}</p>
          <h3>{copy.prerequisiteTitle}</h3>
          <p>{copy.prerequisiteBody}</p>
        </section>

        {success ? (
          <section className="tool-band" aria-live="polite">
            <h2>{copy.successTitle}</h2>
            <p>{copy.successBody}</p>
            <div className="data-row">
              {success.bot.pictureUrl
                ? <img src={success.bot.pictureUrl} alt="" width={48} height={48} />
                : null}
              <div><strong>{success.bot.displayName}</strong><span>{success.bot.basicId}</span></div>
            </div>
            <div className="deployment-secret">
              <strong>{copy.webhookLabel}</strong>
              <code>{success.webhookUrl}</code>
            </div>
            <a href="/workspace/flowbot">{copy.back_to_studio}</a>
          </section>
        ) : preview ? (
          <section className="tool-band" aria-labelledby="line-connect-confirm">
            <h2 id="line-connect-confirm">{copy.confirmTitle}</h2>
            <p>{copy.confirmBody}</p>
            <div className="data-row">
              {preview.pictureUrl ? <img src={preview.pictureUrl} alt="" width={64} height={64} /> : null}
              <div><strong data-no-localize>{preview.displayName}</strong><span data-no-localize>{preview.basicId}</span></div>
            </div>
            <button type="button" disabled={working || !botId || name.trim().length < 2} onClick={() => void connect()}>
              {working ? copy.connecting : copy.confirm}
            </button>
            <button type="button" className="secondary-command" disabled={working} onClick={() => { setPreview(null); reset(); }}>
              {copy.back}
            </button>
          </section>
        ) : (
          <section className="tool-band">
            <form className="flowbot-deploy" onSubmit={verify}>
              <label>{copy.botLabel}
                <select value={botId} onChange={(event) => setBotId(event.target.value)} required>
                  {bots.map((bot) => <option key={bot.id} value={bot.id}>{bot.name}</option>)}
                </select>
              </label>
              {botsError ? <p className="inline-message error" role="alert">{copy.loadFailed}</p> : null}
              {!botsError && !bots.length ? <p className="pending-line">{copy.noBots}</p> : null}
              <label>{copy.nameLabel}
                <input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={160} required />
              </label>
              <label>{copy.channelIdLabel}
                <input value={channelId} onChange={(event) => setChannelId(event.target.value)}
                  inputMode="numeric" minLength={3} maxLength={200} autoComplete="off" required />
              </label>
              <label>{copy.channelSecretLabel}
                <input value={channelSecret} onChange={(event) => setChannelSecret(event.target.value)}
                  type="password" minLength={16} maxLength={4096} autoComplete="off" required />
              </label>
              <button type="submit" disabled={working || !bots.length}>{working ? copy.verifying : copy.verify}</button>
            </form>
            <a href="/workspace/flowbot#flowbot-panel-channels">{copy.advanced}</a>
          </section>
        )}

        {notice ? <p className="inline-message error" role="alert">{notice}</p> : null}

        {failure ? (
          <section className="tool-band" aria-live="assertive">
            <h2>{copy.progressTitle}</h2>
            <ol>
              {lineConnectSteps.map((step, index) => (
                <li key={step} data-state={index < failedIndex ? "done" : index === failedIndex ? "failed" : "pending"}>
                  {lineConnectStepLabel(step, locale)}
                  {index === failedIndex ? ` — ${copy.failedAt}` : ""}
                </li>
              ))}
            </ol>
            <p className="inline-message error" role="alert">{lineConnectFailureMessage(failure, locale)}</p>
            {failure.rolledBack ? <p>{copy.rolledBack}</p> : null}
          </section>
        ) : null}
      </main>
    </div>
  );
}
