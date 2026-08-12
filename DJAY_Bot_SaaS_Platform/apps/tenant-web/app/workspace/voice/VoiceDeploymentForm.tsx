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
      <label>ชื่อการติดตั้ง<input name="name" {...voiceDeploymentFieldConstraints.name} required /></label>
      <label>ชื่อธุรกิจ<input name="businessName" {...voiceDeploymentFieldConstraints.businessName} required /></label>
      <label>ชื่อ Voice Agent<input name="agentName" {...voiceDeploymentFieldConstraints.agentName} required /></label>
      <label>ต้นทางเว็บไซต์ที่อนุญาต<input name="origin" type="url" placeholder="https://www.example.com" {...voiceDeploymentFieldConstraints.origin} required /></label>
      <label>ภาษาเริ่มต้น<select name="defaultLocale" defaultValue="th"><option value="th">ไทย</option><option value="en">English</option></select></label>
      <label>คำทักทายภาษาอังกฤษ<input name="greetingEn" defaultValue="Hello, how can I help?" {...voiceDeploymentFieldConstraints.greeting} required /></label>
      <label>คำทักทายภาษาไทย<input name="greetingTh" defaultValue="สวัสดีครับ มีอะไรให้ช่วยได้บ้าง?" {...voiceDeploymentFieldConstraints.greeting} required /></label>
      <label>ข้อความแจ้งผู้ใช้ภาษาอังกฤษ<input name="automatedDisclosureEn" defaultValue="This is our automated voice assistant." {...voiceDeploymentFieldConstraints.disclosure} required /></label>
      <label>ข้อความแจ้งผู้ใช้ภาษาไทย<input name="automatedDisclosureTh" defaultValue="นี่คือผู้ช่วยเสียงอัตโนมัติของเรา" {...voiceDeploymentFieldConstraints.disclosure} required /></label>
      <label>ระยะเวลาสายสูงสุด (วินาที)<input name="maxCallSeconds" type="number" defaultValue={900} {...voiceDeploymentFieldConstraints.maxCallSeconds} required /></label>
      <label>ช่วงเวลาเชื่อมต่อใหม่ (วินาที)<input name="reconnectWindowSeconds" type="number" defaultValue={30} {...voiceDeploymentFieldConstraints.reconnectWindowSeconds} required /></label>
      <button disabled={working}>{working ? "Creating…" : "Create deployment"}</button>
    </form>
  );
}
