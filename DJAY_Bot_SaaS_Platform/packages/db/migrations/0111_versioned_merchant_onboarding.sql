ALTER TABLE tenancy.tenant_onboarding
  ADD COLUMN merchant_onboarding_version integer NOT NULL DEFAULT 0
    CHECK (merchant_onboarding_version >= 0),
  ADD COLUMN guidelines_version text,
  ADD COLUMN guidelines_accepted_at timestamptz;

ALTER TABLE tenancy.tenant_onboarding
  ADD CONSTRAINT tenant_onboarding_versioned_guidelines_check CHECK (
    (merchant_onboarding_version = 0
      AND guidelines_version IS NULL
      AND guidelines_accepted_at IS NULL)
    OR (merchant_onboarding_version > 0
      AND guidelines_version IS NOT NULL
      AND guidelines_accepted_at IS NOT NULL
      AND preferences_completed_at IS NOT NULL)
  );
