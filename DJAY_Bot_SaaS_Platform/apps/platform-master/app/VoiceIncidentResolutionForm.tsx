"use client";

import { useRef, useState, type FormEvent } from "react";
import {
  normalizeVoiceIncidentResolution,
  voiceIncidentResolutionError,
  voiceIncidentResolutionFieldConstraints,
} from "@djay/shared";

type VoiceIncidentResolutionFormProps = {
  incidentId: string;
  severity: string;
  working: boolean;
  onResolve: (resolution: string) => Promise<boolean>;
  onCancel: () => void;
};

export function VoiceIncidentResolutionForm({
  incidentId,
  severity,
  working,
  onResolve,
  onCancel,
}: VoiceIncidentResolutionFormProps) {
  const [resolution, setResolution] = useState("");
  const [error, setError] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const fieldId = `voice-incident-resolution-${incidentId}`;
  const helpId = `${fieldId}-help`;
  const errorId = `${fieldId}-error`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextError = voiceIncidentResolutionError(resolution);
    if (nextError) {
      setError(nextError);
      fieldRef.current?.setCustomValidity(nextError);
      fieldRef.current?.reportValidity();
      fieldRef.current?.focus();
      return;
    }
    setError("");
    fieldRef.current?.setCustomValidity("");
    await onResolve(normalizeVoiceIncidentResolution(resolution));
  }

  return (
    <form className="incident-resolution-form" noValidate onSubmit={(event) => void submit(event)}>
      <label htmlFor={fieldId}>Resolution for {severity} incident</label>
      <p id={helpId}>Describe verified recovery and remaining safeguards (12–2,000 characters).</p>
      <textarea
        {...voiceIncidentResolutionFieldConstraints}
        id={fieldId}
        ref={fieldRef}
        value={resolution}
        aria-describedby={`${helpId}${error ? ` ${errorId}` : ""}`}
        aria-invalid={Boolean(error)}
        disabled={working}
        onChange={(event) => {
          setResolution(event.target.value);
          if (error) setError("");
          event.currentTarget.setCustomValidity("");
        }}
      />
      {error ? <p className="incident-resolution-error" id={errorId} role="alert">{error}</p> : null}
      <div className="incident-resolution-actions">
        <button disabled={working} type="submit">Save resolution</button>
        <button className="outline-button" disabled={working} type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
