import { InvitationAcceptanceClient } from "./InvitationAcceptanceClient";
import { publicApplicationEnvironment } from "../../../lib/application-environment";

export default async function InvitationAcceptancePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string }> }>) {
  const { token = "" } = await searchParams;
  return (
    <main className="verification-layout">
      <InvitationAcceptanceClient
        token={token}
        tenantLoginUrl={publicApplicationEnvironment.tenantAppUrl}
      />
    </main>
  );
}
