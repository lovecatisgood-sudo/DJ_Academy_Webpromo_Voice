import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/inbox/voice?id=${encodeURIComponent(id)}`);
}
