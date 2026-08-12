import TenantIncidentBoard from "../../TenantIncidentBoard";

export default function TenantIncidentPage({ searchParams }: Readonly<{
  searchParams: Promise<{ tenantId?: string; status?: string }>;
}>) {
  return <TenantIncidentBoard searchParams={searchParams} />;
}
