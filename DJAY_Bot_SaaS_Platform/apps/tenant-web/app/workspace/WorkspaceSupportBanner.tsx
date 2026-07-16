"use client";

import { useEffect, useState } from "react";

type SupportGrant = { id: string; reason: string; expiresAt: string };

export function WorkspaceSupportBanner({ tenantId }: Readonly<{ tenantId: string }>) {
  const [grants, setGrants] = useState<SupportGrant[]>([]);
  const [error, setError] = useState(false);

  useEffect(() => {
    void fetch("/tenant/support-access", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("support_access_unavailable");
      setGrants((await response.json()).grants || []);
      setError(false);
    }).catch(() => { setGrants([]); setError(true); });
  }, [tenantId]);

  if (error) return <div className="support-access-banner error" role="alert"><strong>Support access status unavailable</strong><span>Refresh before handling customer data or making workspace changes.</span></div>;
  if (!grants.length) return null;
  return (
    <div className="support-access-banner" role="status">
      <strong>Platform support access is active</strong>
      <span>{grants[0]!.reason} Access expires {new Date(grants[0]!.expiresAt).toLocaleString()}.</span>
    </div>
  );
}
