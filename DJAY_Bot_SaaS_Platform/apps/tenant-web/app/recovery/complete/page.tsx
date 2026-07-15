import { RecoveryCompleteClient } from "./RecoveryCompleteClient";

export default async function RecoveryCompletePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string }> }>) {
  const { token = "" } = await searchParams;
  return (
    <main>
      <header><span className="mark">D</span><strong>DJAY BOT</strong><span className="realm">Account recovery</span></header>
      <section aria-labelledby="recovery-complete-title">
        <p>Account security</p>
        <h1 id="recovery-complete-title">Choose a new password</h1>
        <RecoveryCompleteClient token={token} />
      </section>
    </main>
  );
}

