export default function ApiRoot() {
  return (
    <main className="api-page">
      <header className="api-header"><span className="api-mark" aria-hidden="true">D</span><strong>DJAY BOT</strong><span>จุดให้บริการระบบ</span></header>
      <section className="api-content" aria-labelledby="api-title">
        <p>บริการสำหรับนักพัฒนา</p>
        <h1 id="api-title">DJAY Bot API</h1>
        <p className="api-copy">โดเมนนี้ให้บริการแอปพลิเคชัน DJAY Bot ที่ผ่านการยืนยันตัวตนและวิดเจ็ตที่ลูกค้าติดตั้ง โปรดเข้าสู่บัญชีและดูข้อมูลบริการผ่านเว็บไซต์หลัก</p>
        <a className="api-link" href={process.env.PUBLIC_APP_URL || "https://djaybot.com"}>ไปที่ DJAY Bot</a>
      </section>
    </main>
  );
}
