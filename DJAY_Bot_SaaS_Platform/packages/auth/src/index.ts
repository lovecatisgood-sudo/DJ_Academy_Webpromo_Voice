export const authRealm = {
  tenant: "tenant",
  platform: "platform",
} as const;

export type AuthRealm = (typeof authRealm)[keyof typeof authRealm];

export * from "./contracts";
export * from "./crypto";
export * from "./login";
export * from "./mfa";
export * from "./invitations";
export * from "./ownership";
export * from "./recovery";
export * from "./session";
export * from "./registration";
export * from "./store";
export * from "./totp";
