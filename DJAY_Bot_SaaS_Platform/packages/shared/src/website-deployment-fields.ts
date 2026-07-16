export const websiteDeploymentFieldLimits = Object.freeze({
  name: Object.freeze({ minLength: 2, maxLength: 160 }),
  origin: Object.freeze({ maxLength: 2048, maximumCount: 20 }),
});

export const websiteDeploymentFieldConstraints = Object.freeze({
  name: Object.freeze({
    minLength: websiteDeploymentFieldLimits.name.minLength,
    maxLength: websiteDeploymentFieldLimits.name.maxLength,
  }),
  origin: Object.freeze({ maxLength: websiteDeploymentFieldLimits.origin.maxLength }),
});

export type WebsiteDeploymentFormInput = Readonly<{
  name: string;
  origin: string;
}>;

export type WebsiteDeploymentFormError = Readonly<{
  field: keyof WebsiteDeploymentFormInput;
  message: string;
}>;

export function normalizeExactWebsiteOrigin(value: string): string | null {
  const normalized = value.trim();
  if (!normalized || normalized.length > websiteDeploymentFieldLimits.origin.maxLength) return null;
  try {
    const parsed = new URL(normalized);
    const secure = parsed.protocol === "https:";
    const localDevelopment = parsed.protocol === "http:"
      && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
    return (secure || localDevelopment) && parsed.origin === normalized ? normalized : null;
  } catch {
    return null;
  }
}

export function isExactWebsiteOrigin(value: string): boolean {
  return normalizeExactWebsiteOrigin(value) !== null;
}

export function websiteDeploymentFormError(input: WebsiteDeploymentFormInput): WebsiteDeploymentFormError | null {
  const nameLength = input.name.trim().length;
  if (nameLength < websiteDeploymentFieldLimits.name.minLength
    || nameLength > websiteDeploymentFieldLimits.name.maxLength) {
    return { field: "name", message: "Deployment name must be 2–160 characters." };
  }
  if (!isExactWebsiteOrigin(input.origin)) {
    return {
      field: "origin",
      message: "Enter an exact HTTPS origin without a path, query, or fragment. Local HTTP is accepted only for localhost development.",
    };
  }
  return null;
}
