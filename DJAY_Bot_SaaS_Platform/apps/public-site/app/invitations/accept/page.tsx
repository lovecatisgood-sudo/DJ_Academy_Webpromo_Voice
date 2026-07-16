import { InvitationAcceptanceClient } from "./InvitationAcceptanceClient";

export default async function InvitationAcceptancePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string }> }>) {
  const { token = "" } = await searchParams;
  return (
    <main className="verification-layout">
      <InvitationAcceptanceClient
        token={token}
        tenantLoginUrl={process.env.TENANT_APP_URL || "https://app.djaybot.com"}
      />
    </main>
  );
}
