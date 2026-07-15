import { z } from "zod";
import { publicPlanKeySchema } from "@djay/shared";

export const registrationInputSchema = z.object({
  idempotencyKey: z.uuid(),
  name: z.string().trim().min(2).max(160),
  email: z.email().max(320),
  businessName: z.string().trim().min(2).max(200),
  password: z.string().min(12).max(128),
  locale: z.enum(["en", "th"]).default("en"),
  timezone: z.string().trim().min(3).max(64).default("Asia/Bangkok"),
  selectedPlanKey: publicPlanKeySchema.optional(),
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
}).strict();

export type RegistrationInput = z.input<typeof registrationInputSchema>;

export const verificationInputSchema = z.object({
  token: z.string().min(32).max(256),
  requestId: z.string().trim().min(8).max(128),
}).strict();

export type VerificationInput = z.input<typeof verificationInputSchema>;

export type RegistrationResponse = Readonly<{
  accepted: true;
  message: string;
}>;

export type VerificationResponse =
  | Readonly<{ status: "verified"; tenantId: string }>
  | Readonly<{ status: "already_verified"; tenantId: string }>
  | Readonly<{ status: "invalid_or_expired" }>;

export const loginInputSchema = z.object({
  email: z.email().max(320),
  password: z.string().min(1).max(128),
  requestId: z.string().trim().min(8).max(128),
}).strict();

export type LoginInput = z.input<typeof loginInputSchema>;

export type LoginResponse =
  | Readonly<{
      status: "authenticated";
      sessionToken: string;
      idleExpiresAt: Date;
      absoluteExpiresAt: Date;
      selectedTenantId: string | null;
      workspaces: readonly WorkspaceSummary[];
    }>
  | Readonly<{
      status: "mfa_required";
      challengeToken: string;
      challengeExpiresAt: Date;
    }>
  | Readonly<{ status: "invalid_credentials" }>;

export type WorkspaceSummary = Readonly<{
  tenantId: string;
  slug: string;
  businessName: string;
  membershipId: string;
  role: "tenant_master_admin" | "tenant_admin" | "tenant_operator" | "tenant_analyst";
}>;

export const recoveryRequestInputSchema = z.object({
  email: z.email().max(320),
  requestId: z.string().trim().min(8).max(128),
}).strict();

export const recoveryCompleteInputSchema = z.object({
  token: z.string().min(32).max(256),
  newPassword: z.string().min(12).max(128),
  requestId: z.string().trim().min(8).max(128),
}).strict();
