import {
  platformRoleAllows,
  platformRoles,
  type PlatformPermission,
  type PlatformRole,
} from "@djay/authorization";

type PlatformArea = {
  key: PlatformAreaKey;
  href: `/operations/${PlatformAreaKey}`;
  label: string;
  permission: PlatformPermission;
};

export const platformAreaKeys = ["overview", "release", "usage", "voice", "incidents", "recovery", "commerce", "fulfillment", "support-tickets", "support-access"] as const;
export type PlatformAreaKey = (typeof platformAreaKeys)[number];

const platformNavigation: readonly PlatformArea[] = [
  { key: "overview", href: "/operations/overview", label: "ภาพรวม", permission: "platform.health.read" },
  { key: "release", href: "/operations/release", label: "การเปิดใช้", permission: "platform.health.read" },
  { key: "usage", href: "/operations/usage", label: "การใช้งาน", permission: "platform.billing.read" },
  { key: "voice", href: "/operations/voice", label: "ระบบเสียง", permission: "platform.routing.read" },
  { key: "incidents", href: "/operations/incidents", label: "เหตุขัดข้อง", permission: "platform.incidents.read" },
  { key: "recovery", href: "/operations/recovery", label: "กู้คืนคิว", permission: "platform.recovery.read" },
  { key: "commerce", href: "/operations/commerce", label: "การค้า", permission: "platform.billing.read" },
  { key: "fulfillment", href: "/operations/fulfillment", label: "ส่งมอบบริการ", permission: "platform.fulfillment.read" },
  { key: "support-tickets", href: "/operations/support-tickets", label: "คำขอช่วยเหลือ", permission: "platform.support_tickets.read" },
  { key: "support-access", href: "/operations/support-access", label: "สนับสนุน", permission: "platform.audit.read" },
];

const platformRoleLabels: Readonly<Record<PlatformRole, string>> = {
  platform_owner: "สิทธิ์เจ้าของแพลตฟอร์ม",
  platform_ai_operations: "สิทธิ์ปฏิบัติการ AI",
  platform_support: "สิทธิ์ทีมสนับสนุน",
  platform_finance: "สิทธิ์ฝ่ายการเงิน",
};

export function platformNavigationForRole(role: string): readonly PlatformArea[] {
  if (!platformRoles.includes(role as PlatformRole)) return [];
  return platformNavigation.filter((item) => platformRoleAllows(role as PlatformRole, item.permission));
}

export function PlatformNavigation({ role, activeArea }: { role: string; activeArea: PlatformAreaKey }) {
  const areas = platformNavigationForRole(role);
  const roleLabel = platformRoles.includes(role as PlatformRole)
    ? platformRoleLabels[role as PlatformRole]
    : "สิทธิ์จำกัด";

  return (
    <>
      <span className="platform-role">{roleLabel}</span>
      <nav aria-label="การดำเนินงานแพลตฟอร์ม">
        {areas.map((item) => <a href={item.href} aria-current={item.key === activeArea ? "page" : undefined} key={item.href}>{item.label}</a>)}
      </nav>
    </>
  );
}
