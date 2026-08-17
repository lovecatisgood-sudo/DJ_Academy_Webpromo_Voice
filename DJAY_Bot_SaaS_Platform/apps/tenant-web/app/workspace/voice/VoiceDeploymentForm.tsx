"use client";

import { voiceDeploymentFieldConstraints } from "@djay/shared";
import type { FormEvent } from "react";

export function VoiceDeploymentForm({
  className,
  onSubmit,
  working,
  agentId,
  defaults,
}: Readonly<{
  className: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  working: boolean;
  agentId: string;
  defaults: Readonly<{
    agentName: string; businessName: string; defaultLocale: "th" | "en";
  }>;
}>) {
  return (
    <form className={className} onSubmit={onSubmit}>
      <input name="agentId" type="hidden" value={agentId} />
      <label>ชื่อการติดตั้ง<input name="name" {...voiceDeploymentFieldConstraints.name} required /></label>
      <div className="policy-callout"><strong>{defaults.agentName}</strong><span>{defaults.businessName} · {defaults.defaultLocale === "en" ? "English" : "ไทย"}</span><span>Identity, greetings and disclosure come from the selected immutable version.</span></div>
      <label>ต้นทางเว็บไซต์ที่อนุญาต<input name="origin" type="url" placeholder="https://www.example.com" {...voiceDeploymentFieldConstraints.origin} required /></label>
      <label>ระยะเวลาสายสูงสุด (วินาที)<input name="maxCallSeconds" type="number" defaultValue={900} {...voiceDeploymentFieldConstraints.maxCallSeconds} required /></label>
      <label>ช่วงเวลาเชื่อมต่อใหม่ (วินาที)<input name="reconnectWindowSeconds" type="number" defaultValue={30} {...voiceDeploymentFieldConstraints.reconnectWindowSeconds} required /></label>
      <button disabled={working}>{working ? "Creating…" : "Create deployment"}</button>
    </form>
  );
}
