import type { PlatformRole } from "@djay/authorization";

export type PlatformPasswordIdentity = Readonly<{
  userId: string;
  emailNormalized: string;
  displayName: string;
  passwordHash: string;
  status: "pending_mfa" | "active";
  role: PlatformRole;
}>;

export type PlatformChallenge = Readonly<{
  challengeId: string;
  userId: string;
  displayName: string;
  role: PlatformRole;
  status: "pending_mfa" | "active";
  secretEnvelope: string;
  expiresAt: Date;
}>;

export type PlatformSession = Readonly<{
  sessionId: string;
  userId: string;
  displayName: string;
  role: PlatformRole;
  mfaVerifiedAt: Date;
  reauthenticatedAt: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
}>;

export interface PlatformAuthStore {
  bootstrap(command: BootstrapPlatformOwnerCommand): Promise<"created" | "already_completed">;
  findPasswordIdentity(emailNormalized: string): Promise<PlatformPasswordIdentity | null>;
  createLoginChallenge(command: CreatePlatformChallengeCommand): Promise<void>;
  resolveLoginChallenge(tokenHash: Buffer, now: Date): Promise<PlatformChallenge | null>;
  completeMfa(command: CompletePlatformMfaCommand): Promise<boolean>;
  resolveSession(tokenHash: Buffer, now: Date): Promise<PlatformSession | null>;
  revokeSession(tokenHash: Buffer, now: Date): Promise<void>;
  healthSummary(): Promise<Readonly<{ platformUsers: number; activeSessions: number }>>;
}

export type BootstrapPlatformOwnerCommand = Readonly<{
  userId: string;
  roleAssignmentId: string;
  factorId: string;
  emailNormalized: string;
  displayName: string;
  passwordHash: string;
  secretEnvelope: string;
  recoveryCodeHashes: readonly Buffer[];
  requestId: string;
}>;

export type CreatePlatformChallengeCommand = Readonly<{
  challengeId: string;
  userId: string;
  tokenHash: Buffer;
  now: Date;
  expiresAt: Date;
  requestId: string;
}>;

export type CompletePlatformMfaCommand = Readonly<{
  challengeTokenHash: Buffer;
  sessionId: string;
  sessionTokenHash: Buffer;
  familyId: string;
  now: Date;
  idleExpiresAt: Date;
  absoluteExpiresAt: Date;
  requestId: string;
}>;
