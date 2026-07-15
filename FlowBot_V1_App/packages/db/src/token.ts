import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export function createSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

export function sessionTokenMatches(token: string, storedHash: Buffer): boolean {
  const tokenHash = hashSessionToken(token);
  return tokenHash.length === storedHash.length && timingSafeEqual(tokenHash, storedHash);
}
