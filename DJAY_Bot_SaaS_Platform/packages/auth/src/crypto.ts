import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { hash, verify, type Options } from "@node-rs/argon2";

const hashOptions = {
  algorithm: 2,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const satisfies Options;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, hashOptions);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return verify(passwordHash, password, hashOptions);
}

export function createOpaqueToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashOpaqueToken(token: string): Buffer {
  return createHash("sha256").update(token, "utf8").digest();
}

export function secureBufferEquals(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

export function keyedRequestHash(secret: Buffer, value: unknown): Buffer {
  return createHmac("sha256", secret).update(JSON.stringify(value)).digest();
}

export function parse32ByteSecret(value: string, name: string): Buffer {
  const secret = Buffer.from(value, "base64");
  if (secret.length !== 32) throw new Error(`${name} must be a base64-encoded 32-byte secret.`);
  return secret;
}

export function sealJson(value: unknown, key: Buffer): string {
  if (key.length !== 32) throw new Error("Encryption key must be 32 bytes.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function openJson<T>(envelope: string, key: Buffer): T {
  const [version, ivValue, tagValue, ciphertextValue] = envelope.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new Error("Invalid encrypted envelope.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

