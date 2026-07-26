import type postgres from "postgres";

/**
 * CHN-004 / CHN-005 — one included social channel per subscription, extras paid.
 *
 * Migration 0082 shipped "channel.social OR an add-on", which grants unlimited social
 * channels once `channel.social` is set. The commercial model is one included channel
 * plus paid extras, with a cooldown on moving the included slot.
 *
 * Enforcement is defence in depth:
 *  - The database refuses the write (trigger in migration `0084`). That is the invariant
 *    no code path can bypass.
 *  - These helpers ask first, so the merchant gets a specific, actionable reason instead
 *    of a constraint violation.
 */

export const socialChannelAdmissions = [
  "included", "add_on", "cooldown_elapsed", "operator_approved",
  "not_entitled", "cooldown_active",
] as const;
export type SocialChannelAdmission = (typeof socialChannelAdmissions)[number];

const admittedDecisions: readonly SocialChannelAdmission[] = [
  "included", "add_on", "cooldown_elapsed", "operator_approved",
];

export function isAdmitted(decision: SocialChannelAdmission) {
  return admittedDecisions.includes(decision);
}

type ScopedSql = postgres.TransactionSql;

/**
 * Whether the admission functions exist yet.
 *
 * Migration `0084` is written but deliberately not applied — all three systems share one
 * live production database. Until it lands the helpers below report `unenforced`, so
 * behaviour is exactly today's rather than every connect attempt failing on a missing
 * function. Enforcement switches on with the migration, and the trigger makes it
 * unbypassable at that point.
 */
async function admissionAvailable(sql: ScopedSql): Promise<boolean> {
  const rows = await sql<{ present: boolean }[]>`
    SELECT to_regprocedure('tenancy.social_channel_admission(uuid, text, text)') IS NOT NULL AS present
  `;
  return rows[0]?.present === true;
}

export type AdmissionCheck =
  | Readonly<{ status: "admitted"; decision: SocialChannelAdmission }>
  | Readonly<{ status: "refused"; decision: SocialChannelAdmission }>
  | Readonly<{ status: "unenforced" }>;

export async function checkSocialChannelAdmission(
  sql: ScopedSql,
  tenantId: string,
  productKey: "flowbot" | "ai_chat",
  channel: string,
): Promise<AdmissionCheck> {
  if (!(await admissionAvailable(sql))) return { status: "unenforced" };
  const rows = await sql<{ decision: SocialChannelAdmission }[]>`
    SELECT tenancy.social_channel_admission(${tenantId}::uuid, ${productKey}, ${channel}) AS decision
  `;
  const decision = rows[0]?.decision ?? "not_entitled";
  return isAdmitted(decision) ? { status: "admitted", decision } : { status: "refused", decision };
}

/**
 * Record which channel the included slot is spent on, consuming an operator approval if
 * one authorised the move. Called after the connection row exists so a failed create
 * never burns the slot.
 */
export async function claimIncludedSocialChannel(
  sql: ScopedSql,
  tenantId: string,
  productKey: "flowbot" | "ai_chat",
  channel: string,
  membershipId: string,
): Promise<"claimed" | "moved" | "unchanged" | "no_subscription" | "unenforced"> {
  if (!(await admissionAvailable(sql))) return "unenforced";
  const rows = await sql<{ outcome: "claimed" | "moved" | "unchanged" | "no_subscription" }[]>`
    SELECT tenancy.claim_included_social_channel(
      ${tenantId}::uuid, ${productKey}, ${channel}, ${membershipId}::uuid
    ) AS outcome
  `;
  return rows[0]?.outcome ?? "no_subscription";
}
