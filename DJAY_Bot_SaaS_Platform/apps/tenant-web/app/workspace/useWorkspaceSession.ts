"use client";

import { useEffect, useState } from "react";
import { tenantRoleAllows, tenantRoles, type TenantPermission, type TenantRole } from "@djay/authorization";
import type { WorkspaceSummary } from "./WorkspaceSidebar";

export function useWorkspaceSession() {
  const [loading, setLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [mfaVerifiedAt, setMfaVerifiedAt] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/tenant/session", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) {
        window.location.replace("/");
        return;
      }
      const result = await response.json();
      setWorkspaces(result.workspaces || []);
      setSelectedTenantId(result.selectedTenantId || null);
      setMfaVerifiedAt(result.mfaVerifiedAt || null);
      setLoading(false);
    });
  }, []);

  async function selectWorkspace(tenantId: string) {
    const response = await fetch("/tenant/workspace/select", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenantId }),
    });
    if (response.ok) window.location.reload();
  }

  async function logout() {
    await fetch("/tenant/auth/logout", { method: "POST" });
    window.location.replace("/");
  }

  const activeWorkspace = workspaces.find((workspace) => workspace.tenantId === selectedTenantId) || null;
  function allows(permission: TenantPermission) {
    const role = activeWorkspace?.role || "";
    return tenantRoles.includes(role as TenantRole) && tenantRoleAllows(role as TenantRole, permission);
  }

  return { loading, workspaces, selectedTenantId, activeWorkspace, mfaVerifiedAt, allows, selectWorkspace, logout };
}
