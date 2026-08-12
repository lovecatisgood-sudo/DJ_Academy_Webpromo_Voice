export type DeliveryMode = "required" | "configurable" | "not_sent";

export type NotificationDeliveryRule = Readonly<{
  eventFamily: string;
  audience: "account_user" | "workspace_member" | "configured_recipient";
  inApp: DeliveryMode;
  email: DeliveryMode;
  reason: string;
}>;

// This registry describes implemented transport behavior. Product/legal approval is an
// external release decision; do not relabel this as approved without recorded evidence.
export const notificationDeliveryPolicyStatus = "proposed" as const;

export const notificationDeliveryPolicy: readonly NotificationDeliveryRule[] = Object.freeze([
  { eventFamily: "auth.verify_email", audience: "account_user", inApp: "not_sent", email: "required", reason: "Email ownership must be verified before an account is provisioned." },
  { eventFamily: "auth.recover_password", audience: "account_user", inApp: "not_sent", email: "required", reason: "Recovery must reach the verified account address without an active session." },
  { eventFamily: "team.invitation_", audience: "account_user", inApp: "required", email: "required", reason: "The recipient needs the signed acceptance link; workspace operators need lifecycle visibility." },
  { eventFamily: "team.ownership_", audience: "account_user", inApp: "required", email: "required", reason: "Ownership transfer requires a signed email continuation and durable workspace evidence." },
  { eventFamily: "billing.", audience: "workspace_member", inApp: "required", email: "configurable", reason: "Billing state remains visible in-app; authorized billing recipients may opt into fixed transactional templates." },
  { eventFamily: "usage.", audience: "configured_recipient", inApp: "required", email: "configurable", reason: "Allowance and anomaly alerts remain durable in-app and may be emailed through an enabled notification profile." },
  { eventFamily: "lead.flowbot_captured", audience: "configured_recipient", inApp: "not_sent", email: "configurable", reason: "Flow Bot lead email is sent only through an enabled allow-listed notification profile." },
  { eventFamily: "lead.ai_chat_qualified", audience: "configured_recipient", inApp: "not_sent", email: "configurable", reason: "AI Text lead email is sent only through an enabled allow-listed notification profile." },
  { eventFamily: "appointment.", audience: "workspace_member", inApp: "required", email: "not_sent", reason: "Appointment operations are shared workspace work; no merchant email transport is implemented." },
  { eventFamily: "callback.", audience: "workspace_member", inApp: "required", email: "not_sent", reason: "Callback operations are shared workspace work; no merchant email transport is implemented." },
  { eventFamily: "deal_value.", audience: "workspace_member", inApp: "required", email: "not_sent", reason: "Merchant-confirmed value is durable operational evidence and is not emailed." },
  { eventFamily: "support.", audience: "workspace_member", inApp: "required", email: "not_sent", reason: "Support responses and scan outcomes are durable in-app; email is not yet implemented." },
  { eventFamily: "onboarding.", audience: "workspace_member", inApp: "required", email: "not_sent", reason: "Setup progress is actionable inside the workspace." },
  { eventFamily: "deployment.", audience: "workspace_member", inApp: "required", email: "not_sent", reason: "Deployment state is visible with an authoritative product deep link." },
  { eventFamily: "privacy.", audience: "workspace_member", inApp: "required", email: "not_sent", reason: "Privacy-job state is restricted to authorized workspace members." },
  { eventFamily: "support_access.", audience: "workspace_member", inApp: "required", email: "not_sent", reason: "Platform support access is surfaced as a security event without expanding recipient data." },
  { eventFamily: "test.", audience: "workspace_member", inApp: "required", email: "not_sent", reason: "Current-version bot test evidence is reviewed in the Test Center." },
]);

export function deliveryPolicyFor(eventKind: string): NotificationDeliveryRule | null {
  const matches = notificationDeliveryPolicy.filter((rule) => eventKind.startsWith(rule.eventFamily));
  return matches.sort((left, right) => right.eventFamily.length - left.eventFamily.length)[0] ?? null;
}
