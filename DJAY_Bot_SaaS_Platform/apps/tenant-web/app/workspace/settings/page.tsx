"use client";

import { useEffect, useState, type FormEvent } from "react";
import { tenantRoleAllows, type TenantRole } from "@djay/authorization";
import { safeMutationFetch } from "@djay/shared";
import { WorkspacePageLoadError, WorkspaceSessionLoadError, WorkspaceViewOnly } from "../WorkspaceAccess";
import { WorkspaceSidebar } from "../WorkspaceSidebar";
import { useWorkspaceSession } from "../useWorkspaceSession";

type Profile = {
  businessName: string;
  locale: string;
  timezone: string;
  slug: string;
};

const commonTimezones = [
  "Asia/Bangkok",
  "Asia/Singapore",
  "Asia/Jakarta",
  "Asia/Ho_Chi_Minh",
  "Asia/Tokyo",
  "UTC",
] as const;

export default function SettingsPage() {
  const session = useWorkspaceSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"success" | "error" | null>(null);
  const activeWorkspace = session.workspaces.find((workspace) => workspace.tenantId === session.selectedTenantId);
  const canUpdate = activeWorkspace
    ? tenantRoleAllows(activeWorkspace.role as TenantRole, "tenant.update")
    : false;

  async function load() {
    setLoadError(false);
    const response = await fetch("/tenant/profile", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) {
      setProfile(null);
      setLoadError(true);
      return;
    }
    const result = await response.json();
    setProfile(result.profile);
  }

  useEffect(() => {
    if (session.selectedTenantId) void load();
  }, [session.selectedTenantId]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canUpdate || !profile) return;
    const form = new FormData(event.currentTarget);
    setSaving(true);
    setMessage("");
    setTone(null);
    const response = await safeMutationFetch("/tenant/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        businessName: String(form.get("businessName") || "").trim(),
        locale: String(form.get("locale") || "th"),
        timezone: String(form.get("timezone") || "Asia/Bangkok"),
      }),
    });
    const result = await response.json().catch(() => null);
    if (response.ok && result?.status === "updated") {
      setProfile({
        businessName: result.onboarding.business_name,
        locale: result.onboarding.locale,
        timezone: result.onboarding.timezone,
        slug: result.onboarding.slug,
      });
      setTone("success");
      setMessage("Business profile saved. Return to Overview to continue the launch checklist.");
    } else {
      setTone("error");
      setMessage(result?.status === "invalid_timezone"
        ? "Choose a valid timezone."
        : result?.status === "validation_failed"
          ? "Check the business name and try again."
          : "Profile could not be saved.");
    }
    setSaving(false);
  }

  if (session.error) return <WorkspaceSessionLoadError onRetry={() => window.location.reload()} />;
  if (session.loading || !session.selectedTenantId) {
    return <main className="workspace-loading">Loading settings…</main>;
  }
  if (loadError) {
    return (
      <WorkspacePageLoadError
        active="settings"
        title={activeWorkspace?.businessName || "Workspace"}
        resource="business profile"
        workspaces={session.workspaces}
        selectedTenantId={session.selectedTenantId}
        onSelect={(tenantId) => void session.selectWorkspace(tenantId)}
        onLogout={() => void session.logout()}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <main className="workspace-shell">
      <WorkspaceSidebar
        active="settings"
        workspaces={session.workspaces}
        selectedTenantId={session.selectedTenantId}
        onSelect={(tenantId) => void session.selectWorkspace(tenantId)}
        onLogout={() => void session.logout()}
      />
      <section className="workspace-main">
        <header className="workspace-header">
          <div><p>Workspace</p><h1>Business profile</h1></div>
          <span className="role-label">{activeWorkspace?.businessName}</span>
        </header>
        {!canUpdate ? (
          <WorkspaceViewOnly>You can review the business profile. An administrator can update it.</WorkspaceViewOnly>
        ) : null}
        <section className="tool-band" aria-labelledby="profile-title">
          <div className="band-heading">
            <div><p>Launch checklist</p><h2 id="profile-title">Name, language, and timezone</h2></div>
            <a className="secondary-link" href="/workspace">Back to Overview</a>
          </div>
          <p className="control-copy">
            These details are required before technical launch readiness can complete. Changes are saved on the server and reflected after the checklist refreshes.
          </p>
          {profile ? (
            <form className="record-form profile-form" onSubmit={(event) => void save(event)}>
              <label>
                Business name
                <input name="businessName" defaultValue={profile.businessName} minLength={2} maxLength={200} required disabled={!canUpdate} />
              </label>
              <label>
                Language
                <select name="locale" defaultValue={profile.locale === "en" ? "en" : "th"} disabled={!canUpdate}>
                  <option value="en">English</option>
                  <option value="th">Thai</option>
                </select>
              </label>
              <label>
                Timezone
                <select name="timezone" defaultValue={commonTimezones.includes(profile.timezone as typeof commonTimezones[number]) ? profile.timezone : "Asia/Bangkok"} disabled={!canUpdate}>
                  {commonTimezones.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
                  {!commonTimezones.includes(profile.timezone as typeof commonTimezones[number]) ? (
                    <option value={profile.timezone}>{profile.timezone}</option>
                  ) : null}
                </select>
              </label>
              <p className="field-help">Workspace slug: {profile.slug}</p>
              {canUpdate ? <button type="submit" disabled={saving}>{saving ? "Saving…" : "Save profile"}</button> : null}
              {message ? <p className={`inline-message ${tone || "error"}`} role={tone === "success" ? "status" : "alert"}>{message}</p> : null}
            </form>
          ) : null}
        </section>
      </section>
    </main>
  );
}
