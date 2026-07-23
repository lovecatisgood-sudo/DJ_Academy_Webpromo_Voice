export type CommerceEnvSlice = Readonly<{
  BILLING_DATABASE_URL?: string | undefined;
  STRIPE_SECRET_KEY?: string | undefined;
  BILLING_CHECKOUT_ENVELOPE_KEY?: string | undefined;
  STRIPE_WEBHOOK_SECRET?: string | undefined;
  BILLING_WEBHOOK_ENVELOPE_KEY?: string | undefined;
}>;

/**
 * Commerce is enabled only when BILLING_DATABASE_URL is set.
 * When enabled, Stripe + checkout/webhook envelopes are required at boot.
 * When disabled, Stripe secrets must not be required for API startup.
 */
export function commerceEnabled(env: CommerceEnvSlice): boolean {
  return Boolean(env.BILLING_DATABASE_URL?.trim());
}

export function assertCommerceCapabilityProfile(env: CommerceEnvSlice): void {
  if (!commerceEnabled(env)) return;
  if (
    !env.STRIPE_SECRET_KEY
    || !env.BILLING_CHECKOUT_ENVELOPE_KEY
    || !env.STRIPE_WEBHOOK_SECRET
    || !env.BILLING_WEBHOOK_ENVELOPE_KEY
  ) {
    throw new Error("Stripe billing configuration is incomplete.");
  }
}
