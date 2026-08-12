import {
  tenantRoleAllows,
  type TenantPermission,
} from "@djay/authorization";
import type { TenantContext } from "@djay/tenancy";
import type { ResolvedSession } from "@djay/auth";
import type { NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import { enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "./http";
import { hasSensitiveTenantAssurance } from "./tenant-assurance";
import { resolveTenantRequest } from "./tenant-context";
import type { Services } from "./container";

export type TenantMutationAssurance = "none" | "recent_auth";

export type TenantMutationRateLimit = Readonly<{
  scope: string;
  limit: number;
  windowMs: number;
}>;

export type ResolvedTenantMutation<TBody> = Readonly<{
  services: Services;
  context: TenantContext;
  session: ResolvedSession;
  body: TBody;
}>;

export type TenantMutationDeps = Readonly<{
  resolve?: typeof resolveTenantRequest;
  trustedOrigin?: typeof hasTrustedOrigin;
  rateLimit?: typeof enforceRateLimit;
  assurance?: typeof hasSensitiveTenantAssurance;
  readBody?: typeof readJson;
}>;

/**
 * Shared guard stack for tenant browser mutations:
 * trusted Origin → authz → optional reauth/MFA assurance → rate limit → Zod body.
 * Failures use non-revealing 404 for authz/origin, 403 for assurance, 429 for rate limits.
 */
export async function withTenantMutation<TBody = undefined>(
  request: NextRequest,
  options: Readonly<{
    permission: TenantPermission;
    assurance?: TenantMutationAssurance;
    rateLimit: TenantMutationRateLimit;
    bodySchema?: ZodType<TBody>;
    /** When true, skip JSON body parse (for bodyless POST). */
    emptyBody?: boolean;
  }>,
  handler: (resolved: ResolvedTenantMutation<TBody>) => Promise<Response>,
  deps: TenantMutationDeps = {},
): Promise<Response> {
  const resolve = deps.resolve ?? resolveTenantRequest;
  const trustedOrigin = deps.trustedOrigin ?? hasTrustedOrigin;
  const rateLimitFn = deps.rateLimit ?? enforceRateLimit;
  const assurance = deps.assurance ?? hasSensitiveTenantAssurance;
  const readBody = deps.readBody ?? readJson;

  if (!(await trustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  const resolved = await resolve(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, options.permission)) {
    return safeJson({ status: "not_found" }, 404);
  }
  if ((options.assurance ?? "none") !== "none" && !assurance(resolved.session)) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  const limit = await rateLimitFn(
    options.rateLimit.scope,
    `${resolved.context.tenantId}:${resolved.context.userId}`,
    options.rateLimit.limit,
    options.rateLimit.windowMs,
  );
  if (!limit.allowed) {
    return safeJson({ status: "rate_limited" }, 429);
  }

  try {
    let body: TBody;
    if (options.emptyBody || !options.bodySchema) {
      body = undefined as TBody;
    } else {
      body = options.bodySchema.parse(await readBody(request));
    }
    return await handler({
      services: resolved.services,
      context: resolved.context,
      session: resolved.session,
      body,
    });
  } catch (error) {
    if (
      error instanceof ZodError
      || error instanceof SyntaxError
      || (error instanceof Error && error.message === "request_too_large")
    ) {
      return safeJson({ status: "validation_failed" }, 400);
    }
    throw error;
  }
}
