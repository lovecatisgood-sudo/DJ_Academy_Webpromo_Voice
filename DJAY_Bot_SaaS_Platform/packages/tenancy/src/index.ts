import { tenantRoles, type PlatformRole, type TenantRole } from "@djay/authorization";
import {
  asMembershipId,
  asSessionId,
  asTenantId,
  asUserId,
  requestIdSchema,
  type MembershipId,
  type SessionId,
  type TenantId,
  type UserId,
} from "@djay/shared";
import { z } from "zod";

export type { TenantRole } from "@djay/authorization";

declare const contextBrand: unique symbol;

export type TenantContext = Readonly<{
  kind: "tenant";
  tenantId: TenantId;
  userId: UserId;
  membershipId: MembershipId;
  sessionId: SessionId;
  role: TenantRole;
  requestId: string;
  readonly [contextBrand]: "TenantContext";
}>;

export type PlatformContext = Readonly<{
  kind: "platform";
  platformUserId: UserId;
  sessionId: SessionId;
  role: PlatformRole;
  requestId: string;
  reauthenticatedAt?: Date;
  readonly [contextBrand]: "PlatformContext";
}>;

export type SystemContext = Readonly<{
  kind: "system";
  service: "migration" | "catalog" | "auth" | "worker";
  requestId: string;
  readonly [contextBrand]: "SystemContext";
}>;

const tenantContextInput = z.object({
  tenantId: z.uuid(),
  userId: z.uuid(),
  membershipId: z.uuid(),
  sessionId: z.uuid(),
  role: z.enum(tenantRoles),
  requestId: requestIdSchema,
}).strict();

export function createTenantContext(input: z.input<typeof tenantContextInput>): TenantContext {
  const parsed = tenantContextInput.parse(input);
  return Object.freeze({
    kind: "tenant" as const,
    tenantId: asTenantId(parsed.tenantId),
    userId: asUserId(parsed.userId),
    membershipId: asMembershipId(parsed.membershipId),
    sessionId: asSessionId(parsed.sessionId),
    role: parsed.role,
    requestId: parsed.requestId,
  }) as TenantContext;
}

const platformContextInput = z.object({
  platformUserId: z.uuid(),
  sessionId: z.uuid(),
  role: z.enum(["platform_owner", "platform_ai_operations", "platform_support", "platform_finance"]),
  requestId: requestIdSchema,
  reauthenticatedAt: z.date().optional(),
}).strict();

export function createPlatformContext(input: z.input<typeof platformContextInput>): PlatformContext {
  const parsed = platformContextInput.parse(input);
  return Object.freeze({
    kind: "platform" as const,
    platformUserId: asUserId(parsed.platformUserId),
    sessionId: asSessionId(parsed.sessionId),
    role: parsed.role,
    requestId: parsed.requestId,
    ...(parsed.reauthenticatedAt ? { reauthenticatedAt: parsed.reauthenticatedAt } : {}),
  }) as PlatformContext;
}

export function createSystemContext(service: SystemContext["service"], requestId: string): SystemContext {
  return Object.freeze({
    kind: "system" as const,
    service,
    requestId: requestIdSchema.parse(requestId),
  }) as SystemContext;
}
