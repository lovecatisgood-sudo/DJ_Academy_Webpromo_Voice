import { createSqlClient, hashPassword, type AdminUser } from "@flowbot/db";

type Sql = any;

export const channelTypes = ["line", "whatsapp", "messenger", "phone", "email", "url"] as const;
export const userRoles = ["owner", "admin"] as const;

export type WidgetSettingsPatch = {
  enabled?: boolean | undefined;
  themeColor?: string | undefined;
  color?: string | undefined;
  position?: "bl" | "br" | undefined;
  logoUrl?: string | null | undefined;
  openOnLoad?: boolean | undefined;
  greetingTh?: string | undefined;
  greetingEn?: string | undefined;
  langToggle?: boolean | undefined;
  defaultLang?: "th" | "en" | undefined;
  allowedOrigins?: string[] | undefined;
};

export type TenantPrivacyPatch = {
  transcriptRetentionDays?: number | undefined;
  privacyPolicyUrl?: string | undefined;
  leadNoticeTh?: string | undefined;
  leadNoticeEn?: string | undefined;
  alertEmail?: string | undefined;
};

function requireOwner(admin: AdminUser) {
  if (admin.role !== "owner") {
    throw Object.assign(new Error("Owner role required."), { statusCode: 403 });
  }
}

export async function getWidgetSettings(admin: AdminUser, botId: string, sql: Sql = createSqlClient()) {
  const rows = await sql`
    SELECT id, name, public_key, default_lang, widget_settings, allowed_origins
    FROM flowbot_bots
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${botId}
    LIMIT 1
  `;
  const bot = rows[0] as Record<string, unknown> | undefined;
  if (!bot) return null;
  const widgetSettings = (bot.widget_settings ?? {}) as Record<string, unknown>;
  return {
    bot: {
      id: bot.id,
      name: bot.name,
      publicKey: bot.public_key,
      defaultLang: bot.default_lang,
      allowedOrigins: bot.allowed_origins,
      widgetSettings
    },
    settings: {
      enabled: widgetSettings.enabled !== false,
      themeColor: widgetSettings.themeColor ?? widgetSettings.color ?? "#0E7C6B",
      position: widgetSettings.position ?? "br",
      logoUrl: widgetSettings.logoUrl ?? "",
      openOnLoad: Boolean(widgetSettings.openOnLoad),
      langToggle: widgetSettings.langToggle !== false,
      greetingTh: widgetSettings.greetingTh ?? "สวัสดีครับ ต้องการให้ช่วยเรื่องไหน?",
      greetingEn: widgetSettings.greetingEn ?? "Hi, what would you like help with?",
      defaultLang: bot.default_lang,
      allowedOrigins: bot.allowed_origins ?? []
    }
  };
}

export async function updateWidgetSettings(admin: AdminUser, botId: string, patch: WidgetSettingsPatch, sql: Sql = createSqlClient()) {
  const current = await getWidgetSettings(admin, botId, sql);
  if (!current) return null;
  const previous = current.bot.widgetSettings as Record<string, unknown>;
  const nextSettings = {
    ...previous,
    ...(patch.enabled === undefined ? {} : { enabled: patch.enabled }),
    ...(patch.themeColor === undefined ? {} : { themeColor: patch.themeColor }),
    ...(patch.color === undefined ? {} : { color: patch.color }),
    ...(patch.position === undefined ? {} : { position: patch.position }),
    ...(patch.logoUrl === undefined ? {} : { logoUrl: patch.logoUrl ?? "" }),
    ...(patch.openOnLoad === undefined ? {} : { openOnLoad: patch.openOnLoad }),
    ...(patch.langToggle === undefined ? {} : { langToggle: patch.langToggle }),
    ...(patch.greetingTh === undefined ? {} : { greetingTh: patch.greetingTh }),
    ...(patch.greetingEn === undefined ? {} : { greetingEn: patch.greetingEn })
  };
  const rows = await sql`
    UPDATE flowbot_bots
    SET default_lang = COALESCE(${patch.defaultLang ?? null}, default_lang),
        widget_settings = ${JSON.stringify(nextSettings)}::jsonb,
        allowed_origins = COALESCE(${patch.allowedOrigins ?? null}, allowed_origins),
        updated_at = now()
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${botId}
    RETURNING id
  `;
  if (!rows[0]) return null;
  return getWidgetSettings(admin, botId, sql);
}

export async function listContactChannels(admin: AdminUser, botId: string, sql: Sql = createSqlClient()) {
  await requireBot(admin, botId, sql);
  return sql`
    SELECT id, type, label, value, sort_order, created_at, updated_at
    FROM flowbot_contact_channels
    WHERE tenant_id = ${admin.tenantId}
      AND bot_id = ${botId}
    ORDER BY sort_order ASC, created_at ASC
  `;
}

export async function upsertContactChannels(
  admin: AdminUser,
  botId: string,
  channels: { id?: string | undefined; type: string; label: string; value: string; sortOrder?: number | undefined }[],
  sql: Sql = createSqlClient()
) {
  await requireBot(admin, botId, sql);
  await sql`
    DELETE FROM flowbot_contact_channels
    WHERE tenant_id = ${admin.tenantId}
      AND bot_id = ${botId}
  `;
  const inserted = [];
  for (const [index, channel] of channels.entries()) {
    const rows = await sql`
      INSERT INTO flowbot_contact_channels (tenant_id, bot_id, type, label, value, sort_order)
      VALUES (${admin.tenantId}, ${botId}, ${channel.type}, ${channel.label}, ${channel.value}, ${channel.sortOrder ?? index + 1})
      RETURNING id, type, label, value, sort_order, created_at, updated_at
    `;
    inserted.push(rows[0]);
  }
  return inserted;
}

export async function listTeamMembers(admin: AdminUser, sql: Sql = createSqlClient()) {
  requireOwner(admin);
  return sql`
    SELECT id, email, name, role, last_active_at, created_at, updated_at
    FROM flowbot_users
    WHERE tenant_id = ${admin.tenantId}
      AND deleted_at IS NULL
    ORDER BY role DESC, created_at ASC
  `;
}

export async function createTeamMember(
  admin: AdminUser,
  input: { email: string; name: string; role: "owner" | "admin"; password: string },
  sql: Sql = createSqlClient()
) {
  requireOwner(admin);
  const passwordHash = await hashPassword(input.password);
  const rows = await sql`
    INSERT INTO flowbot_users (tenant_id, email, name, role, password_hash)
    VALUES (${admin.tenantId}, ${input.email.trim().toLowerCase()}, ${input.name.trim()}, ${input.role}, ${passwordHash})
    ON CONFLICT (tenant_id, email) DO UPDATE SET
      name = EXCLUDED.name,
      role = EXCLUDED.role,
      password_hash = EXCLUDED.password_hash,
      deleted_at = NULL,
      updated_at = now()
    RETURNING id, email, name, role, created_at, updated_at
  `;
  return rows[0];
}

export async function deleteTeamMember(admin: AdminUser, userId: string, sql: Sql = createSqlClient()) {
  requireOwner(admin);
  const rows = await sql`
    SELECT id, role
    FROM flowbot_users
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${userId}
      AND deleted_at IS NULL
    LIMIT 1
  `;
  const user = rows[0] as { id: string; role: "owner" | "admin" } | undefined;
  if (!user) return null;
  if (user.id === admin.id) throw Object.assign(new Error("You cannot delete your own active account."), { statusCode: 409 });
  if (user.role === "owner") {
    const owners = await sql`
      SELECT COUNT(*)::int AS count
      FROM flowbot_users
      WHERE tenant_id = ${admin.tenantId}
        AND role = 'owner'
        AND deleted_at IS NULL
    `;
    if (Number(owners[0]?.count ?? 0) <= 1) {
      throw Object.assign(new Error("Cannot remove the final owner."), { statusCode: 409 });
    }
  }
  await sql`
    UPDATE flowbot_users
    SET deleted_at = now(), updated_at = now()
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${userId}
  `;
  await sql`
    UPDATE flowbot_user_sessions
    SET revoked_at = now()
    WHERE tenant_id = ${admin.tenantId}
      AND user_id = ${userId}
      AND revoked_at IS NULL
  `;
  return { deleted: true };
}

export async function getTenantPrivacySettings(admin: AdminUser, sql: Sql = createSqlClient()) {
  requireOwner(admin);
  const rows = await sql`
    SELECT settings
    FROM flowbot_tenants
    WHERE id = ${admin.tenantId}
    LIMIT 1
  `;
  const settings = (rows[0]?.settings ?? {}) as Record<string, unknown>;
  return {
    transcriptRetentionDays: Number(settings.transcriptRetentionDays ?? 365),
    privacyPolicyUrl: String(settings.privacyPolicyUrl ?? ""),
    leadNoticeTh: String(settings.leadNoticeTh ?? "ระบบจะใช้ข้อมูลนี้เพื่อติดต่อกลับเกี่ยวกับคำขอของคุณ"),
    leadNoticeEn: String(settings.leadNoticeEn ?? "We will use these details to follow up about your request."),
    alertEmail: String(settings.alertEmail ?? "")
  };
}

export async function updateTenantPrivacySettings(admin: AdminUser, patch: TenantPrivacyPatch, sql: Sql = createSqlClient()) {
  requireOwner(admin);
  const current = await getTenantPrivacySettings(admin, sql);
  const next = {
    ...current,
    ...(patch.transcriptRetentionDays === undefined ? {} : { transcriptRetentionDays: patch.transcriptRetentionDays }),
    ...(patch.privacyPolicyUrl === undefined ? {} : { privacyPolicyUrl: patch.privacyPolicyUrl }),
    ...(patch.leadNoticeTh === undefined ? {} : { leadNoticeTh: patch.leadNoticeTh }),
    ...(patch.leadNoticeEn === undefined ? {} : { leadNoticeEn: patch.leadNoticeEn }),
    ...(patch.alertEmail === undefined ? {} : { alertEmail: patch.alertEmail })
  };
  await sql`
    UPDATE flowbot_tenants
    SET settings = ${JSON.stringify(next)}::jsonb,
        updated_at = now()
    WHERE id = ${admin.tenantId}
  `;
  return next;
}

async function requireBot(admin: AdminUser, botId: string, sql: Sql) {
  const rows = await sql`
    SELECT id
    FROM flowbot_bots
    WHERE tenant_id = ${admin.tenantId}
      AND id = ${botId}
    LIMIT 1
  `;
  if (!rows[0]) throw Object.assign(new Error("Bot not found."), { statusCode: 404 });
}
