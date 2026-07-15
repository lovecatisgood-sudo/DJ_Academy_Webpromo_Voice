"use client";

import { useEffect, useState } from "react";

type SupportGrant = { id: string; reason: string; expiresAt: string };

export function WorkspaceSupportBanner({ tenantId }: Readonly<{ tenantId: string }>) {
  const [grants, setGrants] = useState<SupportGrant[]>([]);

  useEffect(() => {
    void fetch("/tenant/support-access", { cache: "no-store" }).then(async (response) => {
      if (response.ok) setGrants((await response.json()).grants || []);
    });
  }, [tenantId]);

  if (!grants.length) return null;
  return (
    <div className="support-access-banner" role="status">
      <strong>Platform support access is active</strong>
      <span>{grants[0]!.reason} Access expires {new Date(grants[0]!.expiresAt).toLocaleString()}.</span>
    </div>
  );
}
