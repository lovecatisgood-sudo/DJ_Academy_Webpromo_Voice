export const voiceDeploymentFieldLimits = Object.freeze({
  name: Object.freeze({ minLength: 2, maxLength: 160 }),
  agentName: Object.freeze({ minLength: 2, maxLength: 100 }),
  businessName: Object.freeze({ minLength: 2, maxLength: 200 }),
  origin: Object.freeze({ maxLength: 2048, maximumCount: 20 }),
  greeting: Object.freeze({ minLength: 1, maxLength: 500 }),
  disclosure: Object.freeze({ minLength: 8, maxLength: 500 }),
  maxCallSeconds: Object.freeze({ min: 30, max: 14_400 }),
  reconnectWindowSeconds: Object.freeze({ min: 0, max: 300 }),
});

export const voiceDeploymentFieldConstraints = Object.freeze({
  name: Object.freeze({ minLength: voiceDeploymentFieldLimits.name.minLength, maxLength: voiceDeploymentFieldLimits.name.maxLength }),
  agentName: Object.freeze({ minLength: voiceDeploymentFieldLimits.agentName.minLength, maxLength: voiceDeploymentFieldLimits.agentName.maxLength }),
  businessName: Object.freeze({ minLength: voiceDeploymentFieldLimits.businessName.minLength, maxLength: voiceDeploymentFieldLimits.businessName.maxLength }),
  origin: Object.freeze({ maxLength: voiceDeploymentFieldLimits.origin.maxLength }),
  greeting: Object.freeze({ minLength: voiceDeploymentFieldLimits.greeting.minLength, maxLength: voiceDeploymentFieldLimits.greeting.maxLength }),
  disclosure: Object.freeze({ minLength: voiceDeploymentFieldLimits.disclosure.minLength, maxLength: voiceDeploymentFieldLimits.disclosure.maxLength }),
  maxCallSeconds: Object.freeze({ min: voiceDeploymentFieldLimits.maxCallSeconds.min, max: voiceDeploymentFieldLimits.maxCallSeconds.max }),
  reconnectWindowSeconds: Object.freeze({ min: voiceDeploymentFieldLimits.reconnectWindowSeconds.min, max: voiceDeploymentFieldLimits.reconnectWindowSeconds.max }),
});

export type VoiceDeploymentValidationInput = Readonly<{
  name: string;
  agentName: string;
  businessName: string;
  allowedOrigins: readonly string[];
  greetingTh: string;
  greetingEn: string;
  automatedDisclosureTh: string;
  automatedDisclosureEn: string;
  maxCallSeconds: number;
  reconnectWindowSeconds: number;
}>;

export type VoiceDeploymentValidationError = Readonly<{
  tab: "voice" | "playbook" | "entry" | "disclosure";
  message: string;
}>;

function outside(value: string, limits: Readonly<{ minLength: number; maxLength: number }>) {
  const length = value.trim().length;
  return length < limits.minLength || length > limits.maxLength;
}

export function voiceDeploymentValidationError(input: VoiceDeploymentValidationInput): VoiceDeploymentValidationError | null {
  if (outside(input.name, voiceDeploymentFieldLimits.name)) return { tab: "entry", message: "Deployment name must be 2–160 characters." };
  if (outside(input.agentName, voiceDeploymentFieldLimits.agentName)) return { tab: "voice", message: "Public agent name must be 2–100 characters." };
  if (outside(input.businessName, voiceDeploymentFieldLimits.businessName)) return { tab: "playbook", message: "Business name must be 2–200 characters." };
  if (outside(input.greetingEn, voiceDeploymentFieldLimits.greeting) || outside(input.greetingTh, voiceDeploymentFieldLimits.greeting)) {
    return { tab: "voice", message: "Each greeting must be 1–500 characters." };
  }
  if (outside(input.automatedDisclosureEn, voiceDeploymentFieldLimits.disclosure)
    || outside(input.automatedDisclosureTh, voiceDeploymentFieldLimits.disclosure)) {
    return { tab: "disclosure", message: "Each automated-agent disclosure must be 8–500 characters." };
  }
  if (!input.allowedOrigins.length || input.allowedOrigins.length > voiceDeploymentFieldLimits.origin.maximumCount
    || input.allowedOrigins.some((origin) => origin.length > voiceDeploymentFieldLimits.origin.maxLength)) {
    return { tab: "entry", message: "Enter 1–20 website origins, each no longer than 2,048 characters." };
  }
  if (!Number.isInteger(input.maxCallSeconds)
    || input.maxCallSeconds < voiceDeploymentFieldLimits.maxCallSeconds.min
    || input.maxCallSeconds > voiceDeploymentFieldLimits.maxCallSeconds.max) {
    return { tab: "entry", message: "Maximum call seconds must be a whole number from 30 to 14,400." };
  }
  if (!Number.isInteger(input.reconnectWindowSeconds)
    || input.reconnectWindowSeconds < voiceDeploymentFieldLimits.reconnectWindowSeconds.min
    || input.reconnectWindowSeconds > voiceDeploymentFieldLimits.reconnectWindowSeconds.max) {
    return { tab: "entry", message: "Reconnect window seconds must be a whole number from 0 to 300." };
  }
  return null;
}
