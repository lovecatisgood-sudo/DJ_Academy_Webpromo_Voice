import { hasRecentTenantAssurance } from "@djay/authorization";

export type TenantAssuranceSession = Readonly<{
  reauthenticatedAt: Date;
  mfaVerifiedAt?: Date | null;
}>;

export function hasSensitiveTenantAssurance(
  session: TenantAssuranceSession,
  now = new Date(),
  maxAgeMs = 10 * 60 * 1000,
): boolean {
  return hasRecentTenantAssurance({
    reauthenticatedAt: session.reauthenticatedAt,
    mfaVerifiedAt: session.mfaVerifiedAt,
    now,
    maxAgeMs,
  });
}
