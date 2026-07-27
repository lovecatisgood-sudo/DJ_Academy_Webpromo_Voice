"use server";

import { redirect } from "next/navigation";
import {
  clearAdminCookie,
  hashAdminPassword,
  requireAdmin,
  requireMasterAdmin,
  setAdminCookie,
  validateAdminCredentials,
} from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import { invalidateSettingsCache } from "@/lib/settings-cache";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeSettingsInput } from "@/lib/settings-validation";
import { analyzeAndPersistConversation } from "@/lib/conversation-post-analysis";
import type { LeadStatus } from "@/lib/types";
import { headers } from "next/headers";
import type { AdminRole } from "@/lib/types";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(formData: FormData, key: string, fallback: number) {
  const value = Number(text(formData, key));
  return Number.isFinite(value) ? value : fallback;
}

function nullableText(formData: FormData, key: string) {
  const value = text(formData, key);
  return value || null;
}

function redirectTo(formData: FormData, fallback: string) {
  const value = text(formData, "redirect_to");
  return value.startsWith("/admin") ? value : fallback;
}

const leadStatuses = new Set<LeadStatus>([
  "pending_follow_up",
  "appointment_set",
  "follow_up_later",
  "deal_closed",
  "no_deal",
]);

function leadStatusValue(value: string): LeadStatus {
  return leadStatuses.has(value as LeadStatus) ? (value as LeadStatus) : "pending_follow_up";
}

function adminRoleValue(value: string): AdminRole {
  return value === "master_admin" ? "master_admin" : "admin";
}

function activeValue(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function bookingSlug(value: string) {
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

  return clean || `admin-${Date.now()}`;
}

function appointmentRedirect(formData: FormData) {
  return redirectTo(formData, "/admin/calendar");
}

function availabilityRedirect(formData: FormData, targetAdminId?: string, saved?: string) {
  const destination = redirectTo(formData, "/admin/calendar/availability");
  const separator = destination.includes("?") ? "&" : "?";
  const params = [
    targetAdminId ? `admin=${encodeURIComponent(targetAdminId)}` : "",
    saved ? `saved=${encodeURIComponent(saved)}` : "",
  ].filter(Boolean).join("&");

  return params ? `${destination}${separator}${params}` : destination;
}

function appendAdminQuery(destination: string, params: Record<string, string>) {
  const query = new URLSearchParams(params).toString();
  return `${destination}${destination.includes("?") ? "&" : "?"}${query}`;
}

function parseAppointmentStart(value: string) {
  if (!value) return null;
  const iso = value.includes("T") && !/[zZ]|[+-]\d\d:\d\d$/.test(value) ? `${value}:00+07:00` : value;
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function parseDateTimeLocal(value: string) {
  return parseAppointmentStart(value);
}

async function appointmentIsAccessible(appointmentId: string, adminId: string, isMaster: boolean) {
  const sql = getSql();
  const rows = (await sql`
    select id
    from appointments
    where id = ${appointmentId}
      and deleted_at is null
      and (
        ${isMaster}::boolean
        or assigned_admin_id = ${adminId}
      )
    limit 1
  `) as { id: string }[];

  return Boolean(rows[0]);
}

async function hasAppointmentConflict({
  appointmentId,
  assignedAdminId,
  startAt,
  endAt,
}: {
  appointmentId: string;
  assignedAdminId: string;
  startAt: string;
  endAt: string;
}) {
  const sql = getSql();
  const [row] = (await sql`
    select count(*)::int as count
    from appointments
    where assigned_admin_id = ${assignedAdminId}
      and id <> ${appointmentId}
      and deleted_at is null
      and status in ('pending_confirmation', 'confirmed', 'completed', 'no_show')
      and start_at < ${endAt}
      and end_at > ${startAt}
  `) as { count: number }[];

  return (row?.count ?? 0) > 0;
}

async function canEditAvailability(targetAdminId: string, adminId: string, isMaster: boolean) {
  if (isMaster) return true;
  if (targetAdminId !== adminId) return false;

  const sql = getSql();
  const rows = (await sql`
    select allow_admin_self_edit
    from admin_calendar_profiles
    where admin_user_id = ${adminId}
    limit 1
  `) as { allow_admin_self_edit: boolean }[];

  return rows[0]?.allow_admin_self_edit !== false;
}

function bookingLinkRedirect(formData: FormData) {
  return redirectTo(formData, "/admin/calendar/links");
}

async function adminLoginKeys(username: string) {
  const headerStore = await headers();
  const realIp = headerStore.get("x-real-ip")?.trim();
  const forwardedFor = headerStore.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = realIp || forwardedFor || "unknown";
  const client = /^[A-Za-z0-9.:_-]{1,80}$/.test(candidate) ? candidate : "unknown";
  return [`admin-login-ip:${client}`, `admin-login-user:${client}:${username || "empty"}`];
}

export async function loginAction(formData: FormData) {
  const username = text(formData, "username");
  const password = text(formData, "password");
  const [ipKey, userKey] = await adminLoginKeys(username);
  const ipRateLimit = checkRateLimit(ipKey, 20, 15 * 60 * 1000);
  const userRateLimit = checkRateLimit(userKey, 8, 15 * 60 * 1000);

  if (!ipRateLimit.allowed || !userRateLimit.allowed) {
    redirect("/admin/login?error=rate");
  }

  const admin = await validateAdminCredentials(username, password);

  if (!admin) {
    redirect("/admin/login?error=1");
  }

  await setAdminCookie(admin);
  redirect("/admin");
}

export async function logoutAction() {
  await clearAdminCookie();
  redirect("/admin/login");
}

export async function saveSettingsAction(formData: FormData) {
  await requireMasterAdmin();
  const sql = getSql();
  const settings = normalizeSettingsInput({
    agent_enabled: formData.get("agent_enabled") === "on" ? "on" : "",
    greeting: text(formData, "greeting"),
    voice: text(formData, "voice"),
    voice_provider: text(formData, "voice_provider"),
    language_mode: text(formData, "language_mode"),
    knowledge_md: text(formData, "knowledge_md"),
    max_call_seconds: numberValue(formData, "max_call_seconds", 600),
    daily_session_cap: numberValue(formData, "daily_session_cap", 100),
    model_id: text(formData, "model_id"),
    transcription_model: text(formData, "transcription_model"),
    analysis_enabled: formData.get("analysis_enabled") === "on" ? "on" : "",
    analysis_model_id: text(formData, "analysis_model_id"),
    text_chat_enabled: formData.get("text_chat_enabled") === "on" ? "on" : "",
    text_chat_model_id: text(formData, "text_chat_model_id"),
    text_chat_greeting: text(formData, "text_chat_greeting"),
    text_chat_max_messages: numberValue(formData, "text_chat_max_messages", 40),
    text_chat_daily_session_cap: numberValue(formData, "text_chat_daily_session_cap", 200),
    booking_enabled: formData.get("booking_enabled") === "on" ? "on" : "",
    active_booking_admin_id: text(formData, "active_booking_admin_id"),
    default_timezone: text(formData, "default_timezone"),
    require_booking_confirmation: formData.get("require_booking_confirmation") === "on" ? "on" : "",
    default_booking_window_days: numberValue(formData, "default_booking_window_days", 30),
  }, "form");

  await sql`
    update settings set
      agent_enabled = ${settings.agent_enabled ?? false},
      greeting = ${settings.greeting ?? ""},
      voice = ${settings.voice ?? ""},
      voice_provider = ${settings.voice_provider ?? "openai"},
      language_mode = ${settings.language_mode ?? ""},
      knowledge_md = ${settings.knowledge_md ?? ""},
      knowledge_version = knowledge_version + 1,
      max_call_seconds = ${settings.max_call_seconds ?? 600},
      daily_session_cap = ${settings.daily_session_cap ?? 100},
      model_id = ${settings.model_id ?? ""},
      transcription_model = ${settings.transcription_model ?? ""},
      analysis_enabled = ${settings.analysis_enabled ?? true},
      analysis_model_id = ${settings.analysis_model_id ?? "gpt-4o-mini"},
      text_chat_enabled = ${settings.text_chat_enabled ?? true},
      text_chat_model_id = ${settings.text_chat_model_id ?? "gpt-5-mini"},
      text_chat_greeting = ${settings.text_chat_greeting ?? ""},
      text_chat_max_messages = ${settings.text_chat_max_messages ?? 40},
      text_chat_daily_session_cap = ${settings.text_chat_daily_session_cap ?? 200},
      booking_enabled = ${settings.booking_enabled ?? true},
      active_booking_admin_id = ${settings.active_booking_admin_id},
      default_timezone = ${settings.default_timezone ?? "Asia/Bangkok"},
      require_booking_confirmation = ${settings.require_booking_confirmation ?? true},
      default_booking_window_days = ${settings.default_booking_window_days ?? 30},
      updated_at = now()
    where id = 1
  `;

  invalidateSettingsCache();
  redirect("/admin/settings?saved=1");
}

export async function cycleLeadStatusAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");
  const current = text(formData, "status");
  const next = current === "pending_follow_up"
    ? "appointment_set"
    : current === "appointment_set"
      ? "follow_up_later"
      : current === "follow_up_later"
        ? "deal_closed"
        : current === "deal_closed"
          ? "no_deal"
          : "pending_follow_up";
  const sql = getSql();

  await sql`
    update leads
    set status = ${next}, updated_at = now()
    where id = ${id}
      and (
        ${admin.role === "master_admin"}::boolean
        or assigned_admin_id = ${admin.id}
      )
  `;
  redirect("/admin/leads");
}

export async function updateLeadAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");
  const status = leadStatusValue(text(formData, "status"));
  const sql = getSql();

  await sql`
    update leads set
      status = ${status},
      client_name = ${nullableText(formData, "client_name")},
      company_name = ${nullableText(formData, "company_name")},
      phone = ${nullableText(formData, "phone")},
      email = ${nullableText(formData, "email")},
      line_id = ${nullableText(formData, "line_id")},
      whatsapp = ${nullableText(formData, "whatsapp")},
      other_contact = ${nullableText(formData, "other_contact")},
      preferred_contact_method = ${nullableText(formData, "preferred_contact_method")},
      preferred_meeting_day = ${nullableText(formData, "preferred_meeting_day")},
      preferred_meeting_time = ${nullableText(formData, "preferred_meeting_time")},
      admin_notes = ${nullableText(formData, "admin_notes")},
      name = coalesce(${nullableText(formData, "client_name")}, name),
      updated_at = now()
    where id = ${id}
      and (
        ${admin.role === "master_admin"}::boolean
        or assigned_admin_id = ${admin.id}
      )
  `;
  redirect(redirectTo(formData, "/admin/leads"));
}

export async function updateConversationIntelligenceAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");
  const interest = text(formData, "interest_level");
  const interestLevel = interest === "low" || interest === "medium" || interest === "high" || interest === "unknown"
    ? interest
    : "unknown";
  const sql = getSql();

  await sql`
    update conversations set
      summary = ${nullableText(formData, "summary")},
      business_type = ${nullableText(formData, "business_type")},
      main_problem = ${nullableText(formData, "main_problem")},
      business_goal = ${nullableText(formData, "business_goal")},
      interest_level = ${interestLevel},
      concern_or_objection = ${nullableText(formData, "concern_or_objection")},
      recommended_service = ${nullableText(formData, "recommended_service")},
      next_action = ${nullableText(formData, "next_action")},
      analysis_updated_at = now()
    where id = ${id}
      and deleted_at is null
      and (
        ${admin.role === "master_admin"}::boolean
        or assigned_admin_id = ${admin.id}
        or exists (
          select 1 from leads
          where leads.conversation_id = conversations.id
            and leads.assigned_admin_id = ${admin.id}
        )
      )
  `;
  redirect(redirectTo(formData, `/admin/conversations/${id}`));
}

export async function toggleConversationStarAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");
  const sql = getSql();

  await sql`
    update conversations
    set starred = not coalesce(starred, false)
    where id = ${id}
      and (
        ${admin.role === "master_admin"}::boolean
        or assigned_admin_id = ${admin.id}
        or exists (
          select 1 from leads
          where leads.conversation_id = conversations.id
            and leads.assigned_admin_id = ${admin.id}
        )
      )
  `;
  redirect(redirectTo(formData, "/admin/conversations"));
}

export async function deleteConversationAction(formData: FormData) {
  await requireMasterAdmin();
  const id = text(formData, "id");
  const sql = getSql();

  await sql`
    update conversations
    set deleted_at = now()
    where id = ${id}
  `;
  redirect(redirectTo(formData, "/admin/inbox/voice?deleted=1"));
}

export async function bulkDeleteConversationsAction(formData: FormData) {
  await requireMasterAdmin();
  const ids = [...new Set(
    formData
      .getAll("conversation_id")
      .filter((value): value is string => typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value)),
  )];

  if (!ids.length) {
    redirect(redirectTo(formData, "/admin/inbox/voice"));
  }

  const sql = getSql();
  for (const id of ids) {
    await sql`
      update conversations
      set deleted_at = now()
      where id = ${id}
        and deleted_at is null
    `;
  }

  redirect(redirectTo(formData, "/admin/inbox/voice?deleted=1"));
}

export async function regenerateConversationAnalysisAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");

  if (admin.role !== "master_admin") {
    const sql = getSql();
    const rows = (await sql`
      select c.id
      from conversations c
      where c.id = ${id}
        and c.deleted_at is null
        and (
          c.assigned_admin_id = ${admin.id}
          or exists (
            select 1 from leads l
            where l.conversation_id = c.id
              and l.assigned_admin_id = ${admin.id}
          )
        )
      limit 1
    `) as { id: string }[];

    if (!rows[0]) {
      redirect("/admin/conversations");
    }
  }

  await analyzeAndPersistConversation(id, { force: true });
  redirect(redirectTo(formData, `/admin/conversations/${id}?analysis=updated`));
}

export async function changeOwnPasswordAction(formData: FormData) {
  const admin = await requireAdmin();
  const currentPassword = text(formData, "current_password");
  const newPassword = text(formData, "new_password");
  const confirmPassword = text(formData, "confirm_password");

  if (newPassword.length < 10 || newPassword !== confirmPassword) {
    redirect("/admin/settings?password=invalid");
  }

  const verified = await validateAdminCredentials(admin.username, currentPassword);

  if (!verified || verified.id !== admin.id) {
    redirect("/admin/settings?password=invalid");
  }

  const sql = getSql();
  await sql`
    update admin_users
    set password_hash = ${hashAdminPassword(newPassword)}, updated_at = now()
    where id = ${admin.id}
  `;

  redirect("/admin/settings?password=updated");
}

export async function createAdminUserAction(formData: FormData) {
  await requireMasterAdmin();
  const name = text(formData, "name");
  const username = text(formData, "username").toLowerCase();
  const email = nullableText(formData, "email");
  const password = text(formData, "password");
  const role = adminRoleValue(text(formData, "role"));
  const isActive = activeValue(formData, "is_active");

  if (!name || !/^[A-Za-z0-9._@-]{3,120}$/.test(username) || password.length < 10) {
    redirect("/admin/team?error=invalid_create");
  }

  const sql = getSql();
  const rows = (await sql`
    insert into admin_users (name, username, email, password_hash, role, is_active)
    values (${name}, ${username}, ${email}, ${hashAdminPassword(password)}, ${role}, ${isActive})
    returning id, name, username
  `) as { id: string; name: string; username: string }[];
  const created = rows[0];

  if (created) {
    await sql`
      insert into admin_calendar_profiles (
        admin_user_id,
        display_name,
        booking_slug,
        timezone,
        meeting_title,
        default_duration_minutes
      )
      values (
        ${created.id},
        ${created.name},
        ${bookingSlug(created.username)},
        'Asia/Bangkok',
        'ปรึกษากับ DJAI',
        30
      )
      on conflict (booking_slug) do nothing
    `;
  }

  redirect("/admin/team?created=1");
}

export async function updateAdminUserAction(formData: FormData) {
  const currentAdmin = await requireMasterAdmin();
  const id = text(formData, "id");
  const name = text(formData, "name");
  const username = text(formData, "username").toLowerCase();
  const email = nullableText(formData, "email");
  const role = adminRoleValue(text(formData, "role"));
  const isActive = activeValue(formData, "is_active");
  const sql = getSql();

  if (!id || !name || !/^[A-Za-z0-9._@-]{3,120}$/.test(username)) {
    redirect("/admin/team?error=invalid_update");
  }

  if (role !== "master_admin") {
    const [masterCount] = (await sql`
      select count(*)::int as count
      from admin_users
      where role = 'master_admin'
        and is_active = true
        and deleted_at is null
        and id <> ${id}
    `) as { count: number }[];

    if (!masterCount || masterCount.count < 1) {
      redirect("/admin/team?error=last_master");
    }
  }

  if (currentAdmin.id === id && !isActive) {
    redirect("/admin/team?error=self_deactivate");
  }

  await sql`
    update admin_users
    set
      name = ${name},
      username = ${username},
      email = ${email},
      role = ${role},
      is_active = ${isActive},
      updated_at = now()
    where id = ${id}
      and deleted_at is null
  `;

  await sql`
    update admin_calendar_profiles
    set display_name = coalesce(nullif(display_name, ''), ${name}), updated_at = now()
    where admin_user_id = ${id}
  `;

  redirect("/admin/team?updated=1");
}

export async function resetAdminPasswordAction(formData: FormData) {
  await requireMasterAdmin();
  const id = text(formData, "id");
  const password = text(formData, "password");

  if (!id || password.length < 10) {
    redirect("/admin/team?error=invalid_password");
  }

  const sql = getSql();
  await sql`
    update admin_users
    set password_hash = ${hashAdminPassword(password)}, updated_at = now()
    where id = ${id}
      and deleted_at is null
  `;

  redirect("/admin/team?password=updated");
}

export async function deactivateAdminUserAction(formData: FormData) {
  const currentAdmin = await requireMasterAdmin();
  const id = text(formData, "id");

  if (!id || currentAdmin.id === id) {
    redirect("/admin/team?error=self_deactivate");
  }

  const sql = getSql();
  const [target] = (await sql`
    select role from admin_users where id = ${id} and deleted_at is null limit 1
  `) as { role: string }[];

  if (target?.role === "master_admin") {
    const [masterCount] = (await sql`
      select count(*)::int as count
      from admin_users
      where role = 'master_admin'
        and is_active = true
        and deleted_at is null
        and id <> ${id}
    `) as { count: number }[];

    if (!masterCount || masterCount.count < 1) {
      redirect("/admin/team?error=last_master");
    }
  }

  await sql`
    update admin_users
    set is_active = false, updated_at = now()
    where id = ${id}
      and deleted_at is null
  `;

  await sql`
    update settings
    set
      active_booking_admin_id = null,
      active_booking_link_id = null,
      booking_enabled = false,
      updated_at = now()
    where active_booking_admin_id = ${id}
      or active_booking_link_id in (
        select booking_links.id
        from booking_links
        where booking_links.owner_admin_id = ${id}
      )
  `;

  await sql`
    update booking_links
    set is_ai_active = false, updated_at = now()
    where owner_admin_id = ${id}
      and is_ai_active = true
  `;

  invalidateSettingsCache();
  redirect("/admin/team?deactivated=1");
}

export async function setActiveBookingAdminAction(formData: FormData) {
  await requireMasterAdmin();
  const id = nullableText(formData, "admin_user_id");
  const sql = getSql();

  if (id) {
    const rows = (await sql`
      select id from admin_users
      where id = ${id}
        and is_active = true
        and deleted_at is null
      limit 1
    `) as { id: string }[];

    if (!rows[0]) {
      redirect("/admin/team?error=active_booking_admin");
    }
  }

  await sql`
    update settings
    set active_booking_admin_id = ${id}, booking_enabled = ${Boolean(id)}, updated_at = now()
    where id = 1
  `;

  invalidateSettingsCache();
  redirect("/admin/team?active=updated");
}

export async function setActiveAiBookingLinkAction(formData: FormData) {
  await requireMasterAdmin();
  const id = nullableText(formData, "booking_link_id");
  const sql = getSql();

  if (id) {
    const rows = (await sql`
      select bl.id
      from booking_links bl
      join admin_users au on au.id = bl.owner_admin_id
      left join admin_calendar_profiles acp on acp.admin_user_id = bl.owner_admin_id
      where bl.id = ${id}
        and bl.is_active = true
        and bl.deleted_at is null
        and au.is_active = true
        and au.deleted_at is null
        and coalesce(acp.is_active, false) = true
      limit 1
    `) as { id: string }[];

    if (!rows[0]) {
      redirect(`${bookingLinkRedirect(formData)}?error=invalid_ai_link`);
    }
  }

  await sql`update booking_links set is_ai_active = false where is_ai_active = true`;
  await sql`
    update settings
    set active_booking_link_id = ${id}, booking_enabled = ${Boolean(id)}, updated_at = now()
    where id = 1
  `;

  if (id) {
    await sql`
      update booking_links
      set is_ai_active = true, updated_at = now()
      where id = ${id}
    `;
  }

  invalidateSettingsCache();
  redirect(`${bookingLinkRedirect(formData)}?active=updated`);
}

export async function createBookingLinkAction(formData: FormData) {
  const admin = await requireAdmin();
  const ownerAdminId = admin.role === "master_admin" ? text(formData, "owner_admin_id") || admin.id : admin.id;
  const name = text(formData, "name") || "ปรึกษาเบื้องต้นฟรี";
  const slug = bookingSlug(text(formData, "slug") || name);
  const title = text(formData, "title") || name;
  const description = nullableText(formData, "description");
  const meetingLocation = nullableText(formData, "meeting_location");
  const duration = Math.min(240, Math.max(10, numberValue(formData, "duration_minutes", 30)));
  const bufferBefore = Math.min(120, Math.max(0, numberValue(formData, "buffer_before_minutes", 0)));
  const bufferAfter = Math.min(120, Math.max(0, numberValue(formData, "buffer_after_minutes", 0)));
  const minimumNotice = Math.min(10080, Math.max(0, numberValue(formData, "minimum_notice_minutes", 240)));
  const maxPerDayRaw = text(formData, "max_bookings_per_day");
  const maxPerDay = maxPerDayRaw ? Math.min(50, Math.max(1, Number(maxPerDayRaw))) : null;
  const bookingWindow = Math.min(365, Math.max(1, numberValue(formData, "booking_window_days", 30)));
  const requireConfirmation = formData.get("require_confirmation") !== "off";
  const setAiActive = admin.role === "master_admin" && formData.get("set_ai_active") === "on";
  const sql = getSql();

  const [owner] = (await sql`
    select au.id, coalesce(acp.is_active, false) as calendar_active
    from admin_users au
    left join admin_calendar_profiles acp on acp.admin_user_id = au.id
    where au.id = ${ownerAdminId}
      and au.is_active = true
      and au.deleted_at is null
    limit 1
  `) as { id: string; calendar_active: boolean }[];

  if (!owner) {
    redirect(`${bookingLinkRedirect(formData)}?error=invalid_owner`);
  }

  if (setAiActive && !owner.calendar_active) {
    redirect(`${bookingLinkRedirect(formData)}?error=calendar_profile_required`);
  }

  const [existing] = (await sql`
    select id
    from booking_links
    where slug = ${slug}
      and deleted_at is null
    limit 1
  `) as { id: string }[];

  if (existing) {
    redirect(`${bookingLinkRedirect(formData)}?error=slug_taken`);
  }

  const rows = (await sql`
    insert into booking_links (
      owner_admin_id,
      name,
      slug,
      title,
      description,
      meeting_location,
      duration_minutes,
      buffer_before_minutes,
      buffer_after_minutes,
      minimum_notice_minutes,
      max_bookings_per_day,
      booking_window_days,
      require_confirmation,
      is_active,
      is_ai_active
    )
    values (
      ${ownerAdminId},
      ${name},
      ${slug},
      ${title},
      ${description},
      ${meetingLocation},
      ${duration},
      ${bufferBefore},
      ${bufferAfter},
      ${minimumNotice},
      ${maxPerDay},
      ${bookingWindow},
      ${requireConfirmation},
      true,
      false
    )
    returning id
  `) as { id: string }[];

  if (setAiActive && rows[0]) {
    await sql`update booking_links set is_ai_active = false where is_ai_active = true`;
    await sql`
      update booking_links
      set is_ai_active = true, updated_at = now()
      where id = ${rows[0].id}
    `;
    await sql`
      update settings
      set active_booking_link_id = ${rows[0].id}, booking_enabled = true, updated_at = now()
      where id = 1
    `;
    invalidateSettingsCache();
  }

  redirect(`${bookingLinkRedirect(formData)}?created=1`);
}

export async function updateBookingLinkAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");
  const name = text(formData, "name") || "ปรึกษาเบื้องต้นฟรี";
  const slug = bookingSlug(text(formData, "slug") || name);
  const title = text(formData, "title") || name;
  const description = nullableText(formData, "description");
  const meetingLocation = nullableText(formData, "meeting_location");
  const duration = Math.min(240, Math.max(10, numberValue(formData, "duration_minutes", 30)));
  const bufferBefore = Math.min(120, Math.max(0, numberValue(formData, "buffer_before_minutes", 0)));
  const bufferAfter = Math.min(120, Math.max(0, numberValue(formData, "buffer_after_minutes", 0)));
  const minimumNotice = Math.min(10080, Math.max(0, numberValue(formData, "minimum_notice_minutes", 240)));
  const maxPerDayRaw = text(formData, "max_bookings_per_day");
  const maxPerDay = maxPerDayRaw ? Math.min(50, Math.max(1, Number(maxPerDayRaw))) : null;
  const bookingWindow = Math.min(365, Math.max(1, numberValue(formData, "booking_window_days", 30)));
  const requireConfirmation = formData.get("require_confirmation") !== "off";
  const isActive = activeValue(formData, "is_active");
  const sql = getSql();

  const [link] = (await sql`
    select owner_admin_id
    from booking_links
    where id = ${id}
      and deleted_at is null
    limit 1
  `) as { owner_admin_id: string }[];

  if (!link || (admin.role !== "master_admin" && link.owner_admin_id !== admin.id)) {
    redirect(`${bookingLinkRedirect(formData)}?error=not_allowed`);
  }

  const [existing] = (await sql`
    select id
    from booking_links
    where slug = ${slug}
      and id <> ${id}
      and deleted_at is null
    limit 1
  `) as { id: string }[];

  if (existing) {
    redirect(`${bookingLinkRedirect(formData)}?error=slug_taken`);
  }

  await sql`
    update booking_links
    set
      name = ${name},
      slug = ${slug},
      title = ${title},
      description = ${description},
      meeting_location = ${meetingLocation},
      duration_minutes = ${duration},
      buffer_before_minutes = ${bufferBefore},
      buffer_after_minutes = ${bufferAfter},
      minimum_notice_minutes = ${minimumNotice},
      max_bookings_per_day = ${maxPerDay},
      booking_window_days = ${bookingWindow},
      require_confirmation = ${requireConfirmation},
      is_active = ${isActive},
      updated_at = now()
    where id = ${id}
      and deleted_at is null
  `;

  if (!isActive) {
    await sql`
      update settings
      set active_booking_link_id = null, booking_enabled = false, updated_at = now()
      where active_booking_link_id = ${id}
    `;
    await sql`update booking_links set is_ai_active = false where id = ${id}`;
    invalidateSettingsCache();
  }

  redirect(`${bookingLinkRedirect(formData)}?updated=1`);
}

export async function deleteBookingLinkAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");
  const sql = getSql();
  const [link] = (await sql`
    select owner_admin_id
    from booking_links
    where id = ${id}
      and deleted_at is null
    limit 1
  `) as { owner_admin_id: string }[];

  if (!link || (admin.role !== "master_admin" && link.owner_admin_id !== admin.id)) {
    redirect(`${bookingLinkRedirect(formData)}?error=not_allowed`);
  }

  await sql`
    update booking_links
    set deleted_at = now(), is_active = false, is_ai_active = false, updated_at = now()
    where id = ${id}
      and deleted_at is null
  `;
  await sql`
    update settings
    set active_booking_link_id = null, booking_enabled = false, updated_at = now()
    where active_booking_link_id = ${id}
  `;
  invalidateSettingsCache();

  redirect(`${bookingLinkRedirect(formData)}?deleted=1`);
}

export async function deleteAdminUserAction(formData: FormData) {
  const currentAdmin = await requireMasterAdmin();
  const id = text(formData, "id");
  const futureAction = text(formData, "future_action") || "unassign";
  const reassignmentAdminId = nullableText(formData, "reassignment_admin_id");
  const activeReplacementId = nullableText(formData, "active_booking_replacement_id");
  const disableBooking = activeValue(formData, "disable_booking");
  const sql = getSql();

  if (!id || currentAdmin.id === id) {
    redirect("/admin/team?error=self_delete");
  }

  const [target] = (await sql`
    select id, role
    from admin_users
    where id = ${id}
      and deleted_at is null
    limit 1
  `) as { id: string; role: string }[];

  if (!target) {
    redirect("/admin/team?error=missing_admin");
  }

  if (target.role === "master_admin") {
    const [masterCount] = (await sql`
      select count(*)::int as count
      from admin_users
      where role = 'master_admin'
        and is_active = true
        and deleted_at is null
        and id <> ${id}
    `) as { count: number }[];

    if (!masterCount || masterCount.count < 1) {
      redirect("/admin/team?error=last_master");
    }
  }

  const [settings] = (await sql`
    select active_booking_admin_id, active_booking_link_id from settings where id = 1 limit 1
  `) as { active_booking_admin_id: string | null; active_booking_link_id: string | null }[];
  const isActiveBookingAdmin = settings?.active_booking_admin_id === id;
  const [activeBookingLink] = settings?.active_booking_link_id
    ? (await sql`
        select id
        from booking_links
        where id = ${settings.active_booking_link_id}
          and owner_admin_id = ${id}
        limit 1
      `) as { id: string }[]
    : [];
  const isActiveBookingLinkOwner = Boolean(activeBookingLink);

  if ((isActiveBookingAdmin || isActiveBookingLinkOwner) && !activeReplacementId && !disableBooking) {
    redirect("/admin/team?error=active_booking_admin");
  }

  if (futureAction === "reassign") {
    if (!reassignmentAdminId) {
      redirect("/admin/team?error=reassignment_required");
    }

    await sql`
      update appointments
      set assigned_admin_id = ${reassignmentAdminId}, updated_at = now()
      where assigned_admin_id = ${id}
        and start_at >= now()
        and status in ('pending_confirmation', 'confirmed')
        and deleted_at is null
    `;
  } else if (futureAction === "cancel") {
    await sql`
      update appointments
      set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
      where assigned_admin_id = ${id}
        and start_at >= now()
        and status in ('pending_confirmation', 'confirmed')
        and deleted_at is null
    `;
  } else {
    await sql`
      update appointments
      set assigned_admin_id = null, updated_at = now()
      where assigned_admin_id = ${id}
        and start_at >= now()
        and status in ('pending_confirmation', 'confirmed')
        and deleted_at is null
    `;
  }

  if (isActiveBookingAdmin || isActiveBookingLinkOwner) {
    const [replacementLink] = activeReplacementId
      ? (await sql`
          select id
          from booking_links
          where owner_admin_id = ${activeReplacementId}
            and is_active = true
            and deleted_at is null
          order by created_at asc
          limit 1
        `) as { id: string }[]
      : [];

    await sql`update booking_links set is_ai_active = false where is_ai_active = true`;

    if (replacementLink?.id && !disableBooking) {
      await sql`
        update booking_links
        set is_ai_active = true, updated_at = now()
        where id = ${replacementLink.id}
      `;
    }

    await sql`
      update settings
      set
        active_booking_admin_id = ${activeReplacementId},
        active_booking_link_id = ${replacementLink?.id ?? null},
        booking_enabled = ${Boolean(replacementLink?.id) && !disableBooking},
        updated_at = now()
      where id = 1
    `;
    invalidateSettingsCache();
  }

  await sql`
    update booking_links
    set is_active = false, is_ai_active = false, updated_at = now()
    where owner_admin_id = ${id}
      and deleted_at is null
  `;

  await sql`
    update admin_users
    set is_active = false, deleted_at = now(), updated_at = now()
    where id = ${id}
  `;

  redirect("/admin/team?deleted=1");
}

export async function confirmAppointmentAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");

  if (!(await appointmentIsAccessible(id, admin.id, admin.role === "master_admin"))) {
    redirect("/admin/calendar?error=not_allowed");
  }

  const sql = getSql();
  await sql`
    update appointments
    set status = 'confirmed', confirmed_at = coalesce(confirmed_at, now()), updated_at = now()
    where id = ${id}
      and status = 'pending_confirmation'
      and deleted_at is null
  `;
  await sql`
    update leads
    set status = 'appointment_set', updated_at = now()
    where id = (select lead_id from appointments where id = ${id})
  `;

  redirect(appointmentRedirect(formData));
}

export async function rejectAppointmentAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");

  if (!(await appointmentIsAccessible(id, admin.id, admin.role === "master_admin"))) {
    redirect("/admin/calendar?error=not_allowed");
  }

  const sql = getSql();
  await sql`
    update appointments
    set status = 'rejected', rejected_at = coalesce(rejected_at, now()), updated_at = now()
    where id = ${id}
      and status = 'pending_confirmation'
      and deleted_at is null
  `;

  redirect(appointmentRedirect(formData));
}

export async function cancelAppointmentAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");

  if (!(await appointmentIsAccessible(id, admin.id, admin.role === "master_admin"))) {
    redirect("/admin/calendar?error=not_allowed");
  }

  const sql = getSql();
  await sql`
    update appointments
    set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()), updated_at = now()
    where id = ${id}
      and status in ('pending_confirmation', 'confirmed')
      and deleted_at is null
  `;

  redirect(appointmentRedirect(formData));
}

export async function markAppointmentCompletedAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");

  if (!(await appointmentIsAccessible(id, admin.id, admin.role === "master_admin"))) {
    redirect("/admin/calendar?error=not_allowed");
  }

  const sql = getSql();
  await sql`
    update appointments
    set status = 'completed', completed_at = coalesce(completed_at, now()), updated_at = now()
    where id = ${id}
      and status = 'confirmed'
      and deleted_at is null
  `;

  redirect(appointmentRedirect(formData));
}

export async function markAppointmentNoShowAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");

  if (!(await appointmentIsAccessible(id, admin.id, admin.role === "master_admin"))) {
    redirect("/admin/calendar?error=not_allowed");
  }

  const sql = getSql();
  await sql`
    update appointments
    set status = 'no_show', no_show_at = coalesce(no_show_at, now()), updated_at = now()
    where id = ${id}
      and status = 'confirmed'
      and deleted_at is null
  `;

  redirect(appointmentRedirect(formData));
}

export async function updateAppointmentNotesAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");

  if (!(await appointmentIsAccessible(id, admin.id, admin.role === "master_admin"))) {
    redirect("/admin/calendar?error=not_allowed");
  }

  const sql = getSql();
  await sql`
    update appointments
    set admin_notes = ${nullableText(formData, "admin_notes")}, updated_at = now()
    where id = ${id}
      and deleted_at is null
  `;

  redirect(appointmentRedirect(formData));
}

export async function reassignAppointmentAction(formData: FormData) {
  await requireMasterAdmin();
  const id = text(formData, "id");
  const assignedAdminId = nullableText(formData, "assigned_admin_id");
  const sql = getSql();

  if (assignedAdminId) {
    const admins = (await sql`
      select id, name
      from admin_users
      where id = ${assignedAdminId}
        and is_active = true
        and deleted_at is null
      limit 1
    `) as { id: string; name: string }[];

    if (!admins[0]) {
      redirect("/admin/calendar?error=invalid_admin");
    }

    await sql`
      update appointments
      set assigned_admin_id = ${assignedAdminId}, assigned_admin_name_snapshot = ${admins[0].name}, updated_at = now()
      where id = ${id}
        and deleted_at is null
    `;
  } else {
    await sql`
      update appointments
      set assigned_admin_id = null, updated_at = now()
      where id = ${id}
        and deleted_at is null
    `;
  }

  redirect(appointmentRedirect(formData));
}

export async function rescheduleAppointmentAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");
  const startAt = parseAppointmentStart(text(formData, "start_at"));
  const duration = Math.min(240, Math.max(10, numberValue(formData, "duration_minutes", 30)));

  if (!startAt || !(await appointmentIsAccessible(id, admin.id, admin.role === "master_admin"))) {
    redirect("/admin/calendar?error=invalid_reschedule");
  }

  const startDate = new Date(startAt);
  const endAt = new Date(startDate.getTime() + duration * 60 * 1000).toISOString();
  const sql = getSql();
  const [appointment] = (await sql`
    select assigned_admin_id
    from appointments
    where id = ${id}
      and deleted_at is null
    limit 1
  `) as { assigned_admin_id: string | null }[];
  const assignedAdminId = appointment?.assigned_admin_id;

  if (assignedAdminId && await hasAppointmentConflict({ appointmentId: id, assignedAdminId, startAt, endAt })) {
    redirect("/admin/calendar?error=conflict");
  }

  await sql`
    update appointments
    set start_at = ${startAt}, end_at = ${endAt}, duration_minutes = ${duration}, updated_at = now()
    where id = ${id}
      and deleted_at is null
  `;

  redirect(appointmentRedirect(formData));
}

export async function updateCalendarProfileAction(formData: FormData) {
  const admin = await requireAdmin();
  const targetAdminId = text(formData, "admin_user_id") || admin.id;
  const sql = getSql();

  if (admin.role !== "master_admin" && targetAdminId !== admin.id) {
    redirect(appendAdminQuery(redirectTo(formData, "/admin/calendar/availability"), { error: "not_allowed" }));
  }

  if (admin.role !== "master_admin") {
    const rows = (await sql`
      select allow_admin_self_edit
      from admin_calendar_profiles
      where admin_user_id = ${admin.id}
      limit 1
    `) as { allow_admin_self_edit: boolean }[];

    if (rows[0] && !rows[0].allow_admin_self_edit) {
      redirect(appendAdminQuery(redirectTo(formData, "/admin/calendar/availability"), { error: "locked" }));
    }
  }

  const displayName = text(formData, "display_name");
  const timezone = text(formData, "timezone") || "Asia/Bangkok";
  const meetingTitle = text(formData, "meeting_title") || "ปรึกษากับ DJAI";
  const meetingLocation = nullableText(formData, "meeting_location");
  const slug = bookingSlug(text(formData, "booking_slug"));
  const duration = Math.min(240, Math.max(10, numberValue(formData, "default_duration_minutes", 30)));
  const bufferBefore = Math.min(120, Math.max(0, numberValue(formData, "buffer_before_minutes", 0)));
  const bufferAfter = Math.min(120, Math.max(0, numberValue(formData, "buffer_after_minutes", 0)));
  const minimumNotice = Math.min(10080, Math.max(0, numberValue(formData, "minimum_notice_minutes", 240)));
  const maxPerDayRaw = text(formData, "max_bookings_per_day");
  const maxPerDay = maxPerDayRaw ? Math.min(50, Math.max(1, Number(maxPerDayRaw))) : null;
  const bookingWindow = Math.min(365, Math.max(1, numberValue(formData, "booking_window_days", 30)));
  const isActive = activeValue(formData, "is_active");
  const allowSelfEdit = admin.role === "master_admin" ? activeValue(formData, "allow_admin_self_edit") : true;

  if (!displayName || !/^[A-Za-z0-9_+\-./]+$/.test(timezone)) {
    redirect(appendAdminQuery(redirectTo(formData, "/admin/calendar/availability"), { error: "invalid_profile" }));
  }

  await sql`
    insert into admin_calendar_profiles (
      admin_user_id,
      display_name,
      booking_slug,
      timezone,
      meeting_title,
      meeting_location,
      default_duration_minutes,
      buffer_before_minutes,
      buffer_after_minutes,
      minimum_notice_minutes,
      max_bookings_per_day,
      booking_window_days,
      is_active,
      allow_admin_self_edit
    )
    values (
      ${targetAdminId},
      ${displayName},
      ${slug},
      ${timezone},
      ${meetingTitle},
      ${meetingLocation},
      ${duration},
      ${bufferBefore},
      ${bufferAfter},
      ${minimumNotice},
      ${maxPerDay},
      ${bookingWindow},
      ${isActive},
      ${allowSelfEdit}
    )
    on conflict (admin_user_id) do update set
      display_name = excluded.display_name,
      booking_slug = excluded.booking_slug,
      timezone = excluded.timezone,
      meeting_title = excluded.meeting_title,
      meeting_location = excluded.meeting_location,
      default_duration_minutes = excluded.default_duration_minutes,
      buffer_before_minutes = excluded.buffer_before_minutes,
      buffer_after_minutes = excluded.buffer_after_minutes,
      minimum_notice_minutes = excluded.minimum_notice_minutes,
      max_bookings_per_day = excluded.max_bookings_per_day,
      booking_window_days = excluded.booking_window_days,
      is_active = excluded.is_active,
      allow_admin_self_edit = excluded.allow_admin_self_edit,
      updated_at = now()
  `;

  redirect(availabilityRedirect(formData, targetAdminId, "profile"));
}

export async function updateWeeklyAvailabilityAction(formData: FormData) {
  const admin = await requireAdmin();
  const targetAdminId = text(formData, "admin_user_id") || admin.id;

  if (!(await canEditAvailability(targetAdminId, admin.id, admin.role === "master_admin"))) {
    redirect(appendAdminQuery(redirectTo(formData, "/admin/calendar/availability"), { error: "not_allowed" }));
  }

  const sql = getSql();
  await sql`delete from availability_rules where admin_user_id = ${targetAdminId}`;

  for (let weekday = 0; weekday <= 6; weekday += 1) {
    for (let slot = 1; slot <= 2; slot += 1) {
      const start = text(formData, `day_${weekday}_start_${slot}`);
      const end = text(formData, `day_${weekday}_end_${slot}`);

      if (!start || !end || start >= end) continue;

      await sql`
        insert into availability_rules (admin_user_id, weekday, start_time, end_time, timezone, is_active)
        values (${targetAdminId}, ${weekday}, ${start}, ${end}, 'Asia/Bangkok', true)
      `;
    }
  }

  redirect(availabilityRedirect(formData, targetAdminId, "weekly"));
}

export async function createAvailabilityOverrideAction(formData: FormData) {
  const admin = await requireAdmin();
  const targetAdminId = text(formData, "admin_user_id") || admin.id;
  const overrideType = text(formData, "override_type") === "extra_available" ? "extra_available" : "blocked";
  const startsAt = parseDateTimeLocal(text(formData, "starts_at"));
  const endsAt = parseDateTimeLocal(text(formData, "ends_at"));
  const reason = nullableText(formData, "reason");

  if (!(await canEditAvailability(targetAdminId, admin.id, admin.role === "master_admin"))) {
    redirect(appendAdminQuery(redirectTo(formData, "/admin/calendar/availability"), { error: "not_allowed" }));
  }

  if (!startsAt || !endsAt || startsAt >= endsAt) {
    redirect(appendAdminQuery(availabilityRedirect(formData, targetAdminId), { error: "invalid_override" }));
  }

  const sql = getSql();
  await sql`
    insert into availability_overrides (admin_user_id, override_type, starts_at, ends_at, reason, created_by_admin_id)
    values (${targetAdminId}, ${overrideType}, ${startsAt}, ${endsAt}, ${reason}, ${admin.id})
  `;

  redirect(availabilityRedirect(formData, targetAdminId, "override"));
}

export async function deleteAvailabilityOverrideAction(formData: FormData) {
  const admin = await requireAdmin();
  const id = text(formData, "id");
  const targetAdminId = text(formData, "admin_user_id") || admin.id;
  const sql = getSql();

  if (!(await canEditAvailability(targetAdminId, admin.id, admin.role === "master_admin"))) {
    redirect(appendAdminQuery(redirectTo(formData, "/admin/calendar/availability"), { error: "not_allowed" }));
  }

  await sql`
    delete from availability_overrides
    where id = ${id}
      and (
        ${admin.role === "master_admin"}::boolean
        or admin_user_id = ${admin.id}
      )
  `;

  redirect(availabilityRedirect(formData, targetAdminId, "override_deleted"));
}
