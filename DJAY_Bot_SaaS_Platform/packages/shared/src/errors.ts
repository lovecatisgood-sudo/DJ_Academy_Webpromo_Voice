export const errorCodes = [
  "authentication_required",
  "authorization_denied",
  "not_found",
  "validation_failed",
  "conflict",
  "rate_limited",
  "temporarily_unavailable",
] as const;

export type ErrorCode = (typeof errorCodes)[number];

export type PublicError = Readonly<{
  code: ErrorCode;
  message: string;
  requestId: string;
}>;

export function publicError(code: ErrorCode, message: string, requestId: string): PublicError {
  return Object.freeze({ code, message, requestId });
}

