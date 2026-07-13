"use server";

import { redirect } from "next/navigation";
import { clearAdminCookie, requireAdmin, setAdminCookie, validateAdminCredentials } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import { invalidateSettingsCache } from "@/lib/settings-cache";
import { checkRateLimit } from "@/lib/rate-limit";
import { normalizeSettingsInput } from "@/lib/settings-validation";
import { headers } from "next/headers";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(formData: FormData, key: string, fallback: number) {
  const value = Number(text(formData, key));
  return Number.isFinite(value) ? value : fallback;
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

  if (!validateAdminCredentials(username, password)) {
    redirect("/admin/login?error=1");
  }

  await setAdminCookie(username);
  redirect("/admin");
}

export async function logoutAction() {
  await clearAdminCookie();
  redirect("/admin/login");
}

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
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
      updated_at = now()
    where id = 1
  `;

  invalidateSettingsCache();
  redirect("/admin/settings?saved=1");
}

export async function cycleLeadStatusAction(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  const current = text(formData, "status");
  const next = current === "new" ? "contacted" : current === "contacted" ? "closed" : "new";
  const sql = getSql();

  await sql`update leads set status = ${next} where id = ${id}`;
  redirect("/admin/leads");
}
