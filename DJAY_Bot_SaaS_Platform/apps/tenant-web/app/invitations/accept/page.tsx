import { ExistingAccountInvitationClient } from "./ExistingAccountInvitationClient";

export default async function ExistingAccountInvitationPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ token?: string }> }>) {
  const { token = "" } = await searchParams;
  return <ExistingAccountInvitationClient token={token} />;
}
