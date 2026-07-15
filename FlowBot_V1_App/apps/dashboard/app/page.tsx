import { getOverview, getDashboardConversation, listCustomers, listDashboardConversations, listLeads } from "../lib/admin-crm";
import { requireAdmin } from "../lib/require-admin";
import { AdminDashboard } from "./admin-dashboard";
import { LoginForm } from "./login-form";

export default function HomePage() {
  return <DashboardLoader />;
}

async function DashboardLoader() {
  const admin = await requireAdmin();
  if (!admin) return <LoginForm />;

  const [overview, conversations, customers, leads] = await Promise.all([
    getOverview(admin),
    listDashboardConversations(admin),
    listCustomers(admin),
    listLeads(admin)
  ]);
  const selected = conversations[0] ? await getDashboardConversation(admin, String(conversations[0].id)) : null;

  return (
    <AdminDashboard
      admin={admin}
      initialOverview={overview}
      initialConversations={conversations as never}
      initialSelected={selected as never}
      initialCustomers={customers as never}
      initialLeads={leads as never}
    />
  );
}
