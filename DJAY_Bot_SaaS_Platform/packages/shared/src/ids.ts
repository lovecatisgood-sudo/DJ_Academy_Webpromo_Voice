import { z } from "zod";

export const uuidSchema = z.uuid();
export const requestIdSchema = z.string().trim().min(8).max(128);

declare const brand: unique symbol;
export type Brand<T, Name extends string> = T & { readonly [brand]: Name };

export type TenantId = Brand<string, "TenantId">;
export type UserId = Brand<string, "UserId">;
export type MembershipId = Brand<string, "MembershipId">;
export type SessionId = Brand<string, "SessionId">;

export const asTenantId = (value: string) => uuidSchema.parse(value) as TenantId;
export const asUserId = (value: string) => uuidSchema.parse(value) as UserId;
export const asMembershipId = (value: string) => uuidSchema.parse(value) as MembershipId;
export const asSessionId = (value: string) => uuidSchema.parse(value) as SessionId;

