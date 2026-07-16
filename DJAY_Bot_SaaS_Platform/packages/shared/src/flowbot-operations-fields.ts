export const flowbotOperationKeyPattern = /^[a-z][a-z0-9_-]{0,99}$/;

export const flowbotOperationsFieldLimits = Object.freeze({
  key: Object.freeze({ minLength: 1, maxLength: 100 }),
  name: Object.freeze({ minLength: 2, maxLength: 160 }),
  timezone: Object.freeze({ minLength: 3, maxLength: 64 }),
  members: Object.freeze({ min: 1, max: 100 }),
});

export const flowbotOperationsFieldConstraints = Object.freeze({
  key: Object.freeze({
    minLength: flowbotOperationsFieldLimits.key.minLength,
    maxLength: flowbotOperationsFieldLimits.key.maxLength,
    pattern: "[a-z][a-z0-9_-]{0,99}",
  }),
  name: Object.freeze({
    minLength: flowbotOperationsFieldLimits.name.minLength,
    maxLength: flowbotOperationsFieldLimits.name.maxLength,
  }),
  timezone: Object.freeze({
    minLength: flowbotOperationsFieldLimits.timezone.minLength,
    maxLength: flowbotOperationsFieldLimits.timezone.maxLength,
  }),
});

export type FlowbotOperationsFormError<Field extends string> = Readonly<{
  field: Field;
  message: string;
}>;

function outside(value: string, limits: Readonly<{ minLength: number; maxLength: number }>) {
  const length = value.trim().length;
  return length < limits.minLength || length > limits.maxLength;
}

export function isSupportedIanaTimezone(value: string): boolean {
  const timezone = value.trim();
  if (outside(timezone, flowbotOperationsFieldLimits.timezone)) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(new Date(0));
    return true;
  } catch {
    return false;
  }
}

export function flowbotScheduleFormError(input: Readonly<{ scheduleKey: string; name: string; timezone: string }>)
  : FlowbotOperationsFormError<"scheduleKey" | "name" | "timezone"> | null {
  if (!flowbotOperationKeyPattern.test(input.scheduleKey.trim())) {
    return { field: "scheduleKey", message: "Schedule key must start with a lowercase letter and use only lowercase letters, numbers, underscores, or hyphens (maximum 100 characters)." };
  }
  if (outside(input.name, flowbotOperationsFieldLimits.name)) {
    return { field: "name", message: "Schedule name must be 2–160 characters." };
  }
  if (!isSupportedIanaTimezone(input.timezone)) {
    return { field: "timezone", message: "Enter a supported IANA timezone, such as Asia/Bangkok." };
  }
  return null;
}

export function flowbotRoutingTeamFormError(input: Readonly<{ teamKey: string; name: string; membershipIds: readonly string[] }>)
  : FlowbotOperationsFormError<"teamKey" | "name" | "membershipIds"> | null {
  if (!flowbotOperationKeyPattern.test(input.teamKey.trim())) {
    return { field: "teamKey", message: "Team key must start with a lowercase letter and use only lowercase letters, numbers, underscores, or hyphens (maximum 100 characters)." };
  }
  if (outside(input.name, flowbotOperationsFieldLimits.name)) {
    return { field: "name", message: "Team name must be 2–160 characters." };
  }
  const memberCount = new Set(input.membershipIds).size;
  if (memberCount < flowbotOperationsFieldLimits.members.min || memberCount > flowbotOperationsFieldLimits.members.max) {
    return { field: "membershipIds", message: "Select 1–100 active team members." };
  }
  return null;
}
