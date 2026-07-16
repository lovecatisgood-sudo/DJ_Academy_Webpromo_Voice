"use client";

import {
  normalizeExactWebsiteOrigin,
  websiteDeploymentFieldConstraints,
  websiteDeploymentFormError,
  type WebsiteDeploymentFormInput,
} from "@djay/shared";
import { useId, useState, type FormEvent } from "react";

export function WebsiteDeploymentForm({
  className,
  onCreate,
  submitLabel,
  working,
}: Readonly<{
  className: string;
  onCreate: (input: Readonly<{ name: string; allowedOrigins: readonly [string] }>, form: HTMLFormElement) => void | Promise<void>;
  submitLabel: string;
  working: boolean;
}>) {
  const errorId = useId();
  const [error, setError] = useState<ReturnType<typeof websiteDeploymentFormError>>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input: WebsiteDeploymentFormInput = {
      name: String(data.get("name") || ""),
      origin: String(data.get("origin") || ""),
    };
    const nextError = websiteDeploymentFormError(input);
    if (nextError) {
      setError(nextError);
      requestAnimationFrame(() => {
        const field = form.elements.namedItem(nextError.field);
        if (field instanceof HTMLElement) field.focus();
      });
      return;
    }
    const origin = normalizeExactWebsiteOrigin(input.origin);
    if (!origin) return;
    setError(null);
    await onCreate({ name: input.name.trim(), allowedOrigins: [origin] }, form);
  }

  const describedBy = (field: keyof WebsiteDeploymentFormInput) => error?.field === field ? errorId : undefined;
  return (
    <form className={className} onSubmit={submit} noValidate>
      <label>Deployment name<input name="name" {...websiteDeploymentFieldConstraints.name} required aria-invalid={error?.field === "name" || undefined} aria-describedby={describedBy("name")} onInput={() => setError(null)} /></label>
      <label>Exact allowed website origin<input name="origin" type="url" placeholder="https://www.example.com" {...websiteDeploymentFieldConstraints.origin} required aria-invalid={error?.field === "origin" || undefined} aria-describedby={describedBy("origin")} onInput={() => setError(null)} /></label>
      {error ? <p id={errorId} className="inline-message error" role="alert">{error.message}</p> : null}
      <button type="submit" disabled={working}>{working ? "Creating…" : submitLabel}</button>
    </form>
  );
}
