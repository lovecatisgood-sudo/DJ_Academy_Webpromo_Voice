import { getSql } from "./db";
import type { AdminRole } from "./types";

export type AdminShellCounts = {
  conversations: string;
  pending_leads: string;
  pending_appointments: string;
  agent_enabled: boolean;
  booking_enabled: boolean;
  voice_provider: string | null;
  model_id: string | null;
};

const ttlMs = 20_000;
const cache = new Map<string, { expiresAt: number; value: AdminShellCounts }>();

export async function getAdminShellCounts(admin: { id: string; role: AdminRole }): Promise<AdminShellCounts> {
  const key = `${admin.role}:${admin.id}`;
  const cached = cache.get(key);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const sql = getSql();
  const [counts] = (await sql`
    select
      (
        select count(*)::text
        from conversations
        where deleted_at is null
          and started_at >= now() - interval '7 days'
          and (
            ${admin.role === "master_admin"}::boolean
            or assigned_admin_id = ${admin.id}
            or exists (
              select 1 from leads
              where leads.conversation_id = conversations.id
                and leads.assigned_admin_id = ${admin.id}
            )
          )
      ) as conversations,
      (
        select count(*)::text
        from leads
        where status = 'pending_follow_up'
          and (
            ${admin.role === "master_admin"}::boolean
            or assigned_admin_id = ${admin.id}
          )
      ) as pending_leads,
      (
        select count(*)::text
        from appointments
        where status = 'pending_confirmation'
          and deleted_at is null
          and (
            ${admin.role === "master_admin"}::boolean
            or assigned_admin_id = ${admin.id}
          )
      ) as pending_appointments,
      coalesce(settings.agent_enabled, false) as agent_enabled,
      coalesce(settings.booking_enabled, false) as booking_enabled,
      settings.voice_provider,
      settings.model_id
    from settings
    where settings.id = 1
    limit 1
  `) as AdminShellCounts[];
  const value = counts ?? {
    conversations: "0",
    pending_leads: "0",
    pending_appointments: "0",
    agent_enabled: false,
    booking_enabled: false,
    voice_provider: null,
    model_id: null,
  };

  cache.set(key, { expiresAt: Date.now() + ttlMs, value });
  return value;
}
