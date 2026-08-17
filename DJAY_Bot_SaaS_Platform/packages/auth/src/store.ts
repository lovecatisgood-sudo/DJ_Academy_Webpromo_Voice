export type CreateSignupIntentCommand = Readonly<{
  intentId: string;
  tokenId: string;
  idempotencyKey: string;
  requestHash: Buffer;
  email: string;
  emailNormalized: string;
  displayName: string;
  businessName: string;
  passwordHash: string;
  locale: "en" | "th";
  timezone: string;
  selectedPlanKey?: import("@djay/shared").PublicPlanKey;
  termsVersion: string;
  privacyVersion: string;
  tokenHash: Buffer;
  tokenExpiresAt: Date;
  outboxPayloadCiphertext: string;
  builderSessionId?: string;
}>;

export type CreateSignupIntentResult =
  | Readonly<{ status: "created" | "replayed"; intentId: string }>
  | Readonly<{ status: "email_already_pending" | "idempotency_conflict" | "builder_draft_unavailable" }>;

export type ProvisionSignupCommand = Readonly<{
  tokenHash: Buffer;
  now: Date;
  userId: string;
  emailId: string;
  tenantId: string;
  membershipId: string;
  subscriptionId: string;
  entitlementSnapshotId: string;
  quotaAccountId: string;
  requestId: string;
}>;

export type ProvisionSignupResult =
  | Readonly<{ status: "provisioned" | "already_provisioned"; tenantId: string; userId: string }>
  | Readonly<{ status: "invalid_or_expired" }>
  | Readonly<{ status: "builder_draft_expired" }>;

export interface AuthStore {
  createSignupIntent(command: CreateSignupIntentCommand): Promise<CreateSignupIntentResult>;
  provisionSignup(command: ProvisionSignupCommand): Promise<ProvisionSignupResult>;
  findLoginIdentity(emailNormalized: string): Promise<LoginIdentity | null>;
  createSession(command: CreateSessionCommand): Promise<void>;
  createRecoveryIntent(command: CreateRecoveryIntentCommand): Promise<void>;
  completeRecovery(command: CompleteRecoveryCommand): Promise<"completed" | "invalid_or_expired">;
  consumeRateLimit(command: ConsumeRateLimitCommand): Promise<ConsumeRateLimitResult>;
  resolveSession(tokenHash: Buffer, now: Date): Promise<ResolvedSession | null>;
  listUserSessions(userId: string, now: Date): Promise<readonly SessionSummary[]>;
  revokeUserSession(command: RevokeUserSessionCommand): Promise<boolean>;
  rotateWorkspaceSession(command: RotateWorkspaceSessionCommand): Promise<boolean>;
  revokeSession(tokenHash: Buffer, now: Date, reason: string): Promise<void>;
  createTenantInvitation(command: CreateTenantInvitationCommand): Promise<CreateTenantInvitationResult>;
  acceptTenantInvitation(command: AcceptTenantInvitationCommand): Promise<AcceptTenantInvitationResult>;
  createOwnershipTransfer(command: CreateOwnershipTransferCommand): Promise<CreateOwnershipTransferResult>;
  acceptOwnershipTransfer(command: AcceptOwnershipTransferCommand): Promise<OwnershipTransferResult>;
  cancelOwnershipTransfer(command: CancelOwnershipTransferCommand): Promise<OwnershipTransferResult>;
  createTenantLoginChallenge(command: CreateTenantLoginChallengeCommand): Promise<void>;
  resolveTenantLoginChallenge(tokenHash: Buffer, now: Date): Promise<TenantLoginChallenge | null>;
  completeTenantMfaLogin(command: CompleteTenantMfaLoginCommand): Promise<boolean>;
  createMfaEnrollment(command: CreateMfaEnrollmentCommand): Promise<void>;
  getMfaEnrollment(userId: string, factorId: string): Promise<MfaEnrollment | null>;
  completeMfaEnrollment(command: CompleteMfaEnrollmentCommand): Promise<boolean>;
  resendVerification(command: ResendVerificationCommand): Promise<void>;
}

export type LoginIdentity = Readonly<{
  userId: string;
  passwordHash: string;
  workspaces: readonly import("./contracts").WorkspaceSummary[];
  mfaEnabled: boolean;
}>;

export type CreateSessionCommand = Readonly<{
  sessionId: string;
  userId: string;
  tokenHash: Buffer;
  familyId: string;
  selectedTenantId: string | null;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  reauthenticatedAt: Date;
  mfaVerifiedAt?: Date;
  requestId: string;
}>;

export type CreateRecoveryIntentCommand = Readonly<{
  emailNormalized: string;
  tokenId: string;
  tokenHash: Buffer;
  tokenExpiresAt: Date;
  outboxPayloadCiphertext: string;
  requestId: string;
}>;

export type CompleteRecoveryCommand = Readonly<{
  tokenHash: Buffer;
  passwordHash: string;
  now: Date;
  requestId: string;
}>;

export type ConsumeRateLimitCommand = Readonly<{
  scope: string;
  keyHash: Buffer;
  limit: number;
  windowMs: number;
  now: Date;
}>;

export type ConsumeRateLimitResult = Readonly<{
  allowed: boolean;
  retryAfterSeconds: number;
}>;

export type ResolvedSession = Readonly<{
  sessionId: string;
  familyId: string;
  userId: string;
  selectedTenantId: string | null;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  reauthenticatedAt: Date;
  mfaVerifiedAt: Date | null;
  workspaces: readonly import("./contracts").WorkspaceSummary[];
}>;

export type SessionSummary = Readonly<{
  sessionId: string;
  current: boolean;
  createdAt: Date;
  lastSeenAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  selectedTenantId: string | null;
}>;

export type RevokeUserSessionCommand = Readonly<{
  userId: string;
  sessionId: string;
  now: Date;
  requestId: string;
}>;

export type RotateWorkspaceSessionCommand = Readonly<{
  currentTokenHash: Buffer;
  replacementTokenHash: Buffer;
  tenantId: string;
  now: Date;
  idleExpiresAt: Date;
  requestId: string;
}>;

export type InvitationRole =
  | "tenant_admin"
  | "tenant_operator"
  | "tenant_conversation_manager"
  | "tenant_human_agent"
  | "tenant_analyst"
  | "tenant_billing_manager";

export type CreateTenantInvitationCommand = Readonly<{
  context: TenantContext;
  invitationId: string;
  tokenId: string;
  tokenHash: Buffer;
  emailNormalized: string;
  role: InvitationRole;
  expiresAt: Date;
  outboxPayloadCiphertext: string;
}>;

export type CreateTenantInvitationResult =
  | Readonly<{ status: "created"; invitationId: string }>
  | Readonly<{ status: "already_pending" | "seat_limit_reached" | "not_found" }>;

export type AcceptTenantInvitationCommand = Readonly<{
  tokenHash: Buffer;
  authenticatedUserId?: string;
  newUserId: string;
  newEmailId: string;
  newMembershipId: string;
  displayName?: string;
  passwordHash?: string;
  now: Date;
  requestId: string;
}>;

export type AcceptTenantInvitationResult =
  | Readonly<{
      status: "accepted" | "already_accepted";
      tenantId: string;
      userId: string;
      membershipId: string;
      emailNormalized: string;
      createdUser: boolean;
    }>
  | Readonly<{ status: "invalid_or_expired" | "sign_in_required" | "account_details_required" | "seat_limit_reached" }>;

export type CreateOwnershipTransferCommand = Readonly<{
  context: TenantContext;
  transferId: string;
  tokenId: string;
  tokenHash: Buffer;
  targetMembershipId: string;
  expiresAt: Date;
  outboxPayloadCiphertext: (targetEmail: string) => string;
}>;

export type CreateOwnershipTransferResult =
  | Readonly<{ status: "created"; transferId: string }>
  | Readonly<{ status: "already_pending" | "not_found" | "reauthentication_required" }>;

export type AcceptOwnershipTransferCommand = Readonly<{
  context: TenantContext;
  transferId: string;
  tokenHash: Buffer;
  now: Date;
}>;

export type CancelOwnershipTransferCommand = Readonly<{
  context: TenantContext;
  transferId: string;
  now: Date;
}>;

export type OwnershipTransferResult =
  | Readonly<{ status: "accepted" | "cancelled"; transferId: string }>
  | Readonly<{ status: "not_found" | "invalid_or_expired" | "reauthentication_required" }>;

export type CreateTenantLoginChallengeCommand = Readonly<{
  challengeId: string;
  userId: string;
  tokenHash: Buffer;
  now: Date;
  expiresAt: Date;
  requestId: string;
}>;

export type TenantLoginChallenge = Readonly<{
  challengeId: string;
  userId: string;
  secretEnvelope: string;
  passwordVerifiedAt: Date;
  expiresAt: Date;
  workspaces: readonly import("./contracts").WorkspaceSummary[];
}>;

export type CompleteTenantMfaLoginCommand = Readonly<{
  challengeTokenHash: Buffer;
  sessionId: string;
  sessionTokenHash: Buffer;
  familyId: string;
  selectedTenantId: string | null;
  now: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  requestId: string;
}>;

export type CreateMfaEnrollmentCommand = Readonly<{
  userId: string;
  factorId: string;
  secretEnvelope: string;
  now: Date;
  requestId: string;
}>;

export type MfaEnrollment = Readonly<{
  factorId: string;
  secretEnvelope: string;
  verifiedAt: Date | null;
}>;

export type CompleteMfaEnrollmentCommand = Readonly<{
  userId: string;
  factorId: string;
  sessionId: string;
  recoveryCodeHashes: readonly Buffer[];
  now: Date;
  requestId: string;
}>;

export type ResendVerificationCommand = Readonly<{
  emailNormalized: string;
  tokenId: string;
  tokenHash: Buffer;
  expiresAt: Date;
  outboxPayloadCiphertext: string;
  requestId: string;
}>;
import type { TenantContext } from "@djay/tenancy";
