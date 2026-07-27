export default function NotFound() {
  return (
    <main className="recovery-page">
      <header className="recovery-header"><span className="recovery-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span className="recovery-realm">เว็บไซต์</span></header>
      <section className="recovery-content" aria-labelledby="not-found-title">
        <p className="recovery-kicker">ไม่พบหน้า</p>
        <h1 id="not-found-title">ไม่มีหน้านี้</h1>
        <p className="recovery-copy">ที่อยู่อาจเปลี่ยนไปหรือลิงก์อาจไม่สมบูรณ์ ข้อมูลบัญชีและพื้นที่ทำงานของคุณไม่ได้ถูกเปลี่ยนแปลง</p>
        <div className="recovery-actions"><a className="recovery-primary" href="/">สร้างหรือดูบัญชี</a><a className="recovery-secondary" href="/status">ตรวจสถานะบริการ</a></div>
      </section>
    </main>
  );
}
