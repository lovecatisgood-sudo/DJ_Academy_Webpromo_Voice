"use client";

import { useEffect, useState } from "react";
import { currentIntlLocale, uiCopy } from "@djay/shared";

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

  if (error) return <div className="support-access-banner error" role="alert"><strong>โหลดสถานะสิทธิ์ช่วยเหลือไม่สำเร็จ</strong><span>รีเฟรชก่อนจัดการข้อมูลลูกค้าหรือเปลี่ยนแปลงเวิร์กสเปซ</span></div>;
  if (!grants.length) return null;
  return (
    <div className="support-access-banner" role="status">
      <strong>สิทธิ์ช่วยเหลือจากทีมแพลตฟอร์มกำลังใช้งาน</strong>
      <span>{grants[0]!.reason} {uiCopy("สิทธิ์จะหมดอายุ", "Access expires")} {new Date(grants[0]!.expiresAt).toLocaleString(currentIntlLocale())}</span>
    </div>
  );
}
