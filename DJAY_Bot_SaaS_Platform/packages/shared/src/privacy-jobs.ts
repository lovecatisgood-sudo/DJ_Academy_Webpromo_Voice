import { z } from "zod";

const idempotencyKeySchema = z.string().min(8).max(200);

export const privacyJobRequestSchema = z.discriminatedUnion("jobType", [
  z.object({
    jobType: z.literal("export"),
    contactId: z.uuid().optional(),
    idempotencyKey: idempotencyKeySchema,
  }).strict(),
  z.object({
    jobType: z.literal("erasure"),
    contactId: z.uuid(),
    idempotencyKey: idempotencyKeySchema,
  }).strict(),
]);

export type PrivacyJobRequest = z.infer<typeof privacyJobRequestSchema>;
export type PrivacyJobType = PrivacyJobRequest["jobType"];

export function privacyJobSelectionError(input: Readonly<{
  jobType: PrivacyJobType;
  contactId: string;
}>): string | null {
  return input.jobType === "erasure" && !input.contactId
    ? "Select the specific contact whose personal data should be erased."
    : null;
}
