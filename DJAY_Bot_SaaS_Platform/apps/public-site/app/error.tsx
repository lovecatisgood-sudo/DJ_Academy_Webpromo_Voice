"use client";

import { BrandLockup } from "./PublicHeader";

export default function ErrorPage({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return (
    <main className="recovery-page">
      <header className="recovery-header"><BrandLockup /><span className="recovery-realm">เว็บไซต์</span></header>
      <section className="recovery-content" aria-labelledby="error-title" role="alert">
        <p className="recovery-kicker">หน้านี้ไม่พร้อมใช้งาน</p>
        <h1 id="error-title">โหลดหน้านี้ไม่สำเร็จ</h1>
        <p className="recovery-copy">โปรดลองโหลดหน้าอีกครั้ง หากยังไม่สำเร็จ ให้กลับไปหน้าเว็บไซต์หรือตรวจสถานะบริการปัจจุบัน</p>
        <div className="recovery-actions"><button type="button" onClick={reset}>ลองอีกครั้ง</button><a className="recovery-secondary" href="/">กลับหน้าแรก</a><a className="recovery-secondary" href="/status">สถานะบริการ</a></div>
      </section>
    </main>
  );
}
