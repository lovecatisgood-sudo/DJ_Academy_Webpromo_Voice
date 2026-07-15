import { OwnershipAcceptanceClient } from "./OwnershipAcceptanceClient";

export default async function OwnershipAcceptancePage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ transferId?: string; token?: string }> }>) {
  const { transferId = "", token = "" } = await searchParams;
  return <OwnershipAcceptanceClient transferId={transferId} token={token} />;
}
