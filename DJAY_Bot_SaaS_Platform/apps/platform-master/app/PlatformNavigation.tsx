import {
  platformRoleAllows,
  platformRoles,
  type PlatformPermission,
  type PlatformRole,
} from "@djay/authorization";

type PlatformArea = {
  href: `#${string}`;
  label: string;
  permission: PlatformPermission;
};

const platformNavigation: readonly PlatformArea[] = [
  { href: "#overview", label: "Overview", permission: "platform.health.read" },
  { href: "#release-operations", label: "Release", permission: "platform.health.read" },
  { href: "#usage-reconciliation", label: "Usage", permission: "platform.billing.read" },
  { href: "#voice-operations", label: "Voice", permission: "platform.routing.read" },
  { href: "#queue-recovery", label: "Recovery", permission: "platform.recovery.read" },
  { href: "#commerce", label: "Commerce", permission: "platform.billing.read" },
  { href: "#fulfillment", label: "Fulfillment", permission: "platform.fulfillment.read" },
  { href: "#support-access", label: "Support", permission: "platform.audit.read" },
];

const platformRoleLabels: Readonly<Record<PlatformRole, string>> = {
  platform_owner: "Platform owner access",
  platform_ai_operations: "AI operations access",
  platform_support: "Support access",
  platform_finance: "Finance access",
};

export function platformNavigationForRole(role: string): readonly PlatformArea[] {
  if (!platformRoles.includes(role as PlatformRole)) return [];
  return platformNavigation.filter((item) => platformRoleAllows(role as PlatformRole, item.permission));
}

export function PlatformNavigation({ role }: { role: string }) {
  const areas = platformNavigationForRole(role);
  const roleLabel = platformRoles.includes(role as PlatformRole)
    ? platformRoleLabels[role as PlatformRole]
    : "Restricted access";

  return (
    <>
      <span className="platform-role">{roleLabel}</span>
      <nav aria-label="Platform operations">
        {areas.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}
      </nav>
    </>
  );
}
