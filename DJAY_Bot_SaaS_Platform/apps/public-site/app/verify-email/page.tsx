import { VerifyEmailClient } from "./VerifyEmailClient";
import { publicApplicationEnvironment } from "../../lib/application-environment";

export default async function VerifyEmailPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string }> }>) {
  const { token = "" } = await searchParams;
  return (
    <main className="verification-layout">
      <VerifyEmailClient
        token={token}
        tenantLoginUrl={publicApplicationEnvironment.tenantAppUrl}
      />
    </main>
  );
}
