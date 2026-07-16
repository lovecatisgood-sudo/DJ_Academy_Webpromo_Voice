import { describe, expect, it } from "vitest";
import { privacyJobRequestSchema, privacyJobSelectionError } from "./privacy-jobs";

const contactId = "50000000-0000-4000-8000-000000000001";

describe("privacy job scope", () => {
  it("allows a workspace export but requires one exact contact for erasure", () => {
    expect(privacyJobRequestSchema.safeParse({ jobType: "export", idempotencyKey: "export-request" }).success).toBe(true);
    expect(privacyJobRequestSchema.safeParse({ jobType: "erasure", idempotencyKey: "erase-request" }).success).toBe(false);
    expect(privacyJobRequestSchema.safeParse({ jobType: "erasure", contactId, idempotencyKey: "erase-request" }).success).toBe(true);
  });

  it("returns browser-safe correction guidance", () => {
    expect(privacyJobSelectionError({ jobType: "erasure", contactId: "" })).toBe(
      "Select the specific contact whose personal data should be erased.",
    );
    expect(privacyJobSelectionError({ jobType: "export", contactId: "" })).toBeNull();
  });
});
