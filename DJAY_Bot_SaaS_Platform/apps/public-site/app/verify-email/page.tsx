import { VerifyEmailClient } from "./VerifyEmailClient";

export default async function VerifyEmailPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string }> }>) {
  const { token = "" } = await searchParams;
  return (
    <main className="verification-layout">
      <VerifyEmailClient
        token={token}
        tenantLoginUrl={process.env.TENANT_APP_URL || "http://127.0.0.1:3101"}
      />
    </main>
  );
}

