"use client";

import { voiceDeploymentFieldConstraints } from "@djay/shared";
import type { FormEvent } from "react";

export function VoiceDeploymentForm({
  className,
  onSubmit,
  working,
}: Readonly<{
  className: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  working: boolean;
}>) {
  return (
    <form className={className} onSubmit={onSubmit}>
      <label>Deployment name<input name="name" {...voiceDeploymentFieldConstraints.name} required /></label>
      <label>Business name<input name="businessName" {...voiceDeploymentFieldConstraints.businessName} required /></label>
      <label>Voice agent name<input name="agentName" {...voiceDeploymentFieldConstraints.agentName} required /></label>
      <label>Allowed website origin<input name="origin" type="url" placeholder="https://www.example.com" {...voiceDeploymentFieldConstraints.origin} required /></label>
      <label>Default language<select name="defaultLocale" defaultValue="th"><option value="th">ไทย</option><option value="en">English</option></select></label>
      <label>English greeting<input name="greetingEn" defaultValue="Hello, how can I help?" {...voiceDeploymentFieldConstraints.greeting} required /></label>
      <label>Thai greeting<input name="greetingTh" defaultValue="สวัสดีครับ มีอะไรให้ช่วยได้บ้าง?" {...voiceDeploymentFieldConstraints.greeting} required /></label>
      <label>English disclosure<input name="automatedDisclosureEn" defaultValue="This is our automated voice assistant." {...voiceDeploymentFieldConstraints.disclosure} required /></label>
      <label>Thai disclosure<input name="automatedDisclosureTh" defaultValue="นี่คือผู้ช่วยเสียงอัตโนมัติของเรา" {...voiceDeploymentFieldConstraints.disclosure} required /></label>
      <label>Maximum call seconds<input name="maxCallSeconds" type="number" defaultValue={900} {...voiceDeploymentFieldConstraints.maxCallSeconds} required /></label>
      <label>Reconnect window seconds<input name="reconnectWindowSeconds" type="number" defaultValue={30} {...voiceDeploymentFieldConstraints.reconnectWindowSeconds} required /></label>
      <button disabled={working}>{working ? "Creating…" : "Create deployment"}</button>
    </form>
  );
}
