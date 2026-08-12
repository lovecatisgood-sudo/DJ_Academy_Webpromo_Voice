-- Goal-first setup preferences. These fields contain product configuration choices, not survey profiling.
ALTER TABLE tenancy.tenant_onboarding
  ADD COLUMN business_goal text CHECK (business_goal IN ('answer_questions','capture_leads','recommend_products','book_appointments','customer_support')),
  ADD COLUMN industry text CHECK (industry IN ('retail','services','restaurant','education','property','health','other')),
  ADD COLUMN first_product text CHECK (first_product IN ('flowbot','ai_chat','voice')),
  ADD COLUMN launch_channel text CHECK (launch_channel = 'website'),
  ADD COLUMN preferences_completed_at timestamptz;

ALTER TABLE tenancy.tenant_onboarding
  ADD CONSTRAINT tenant_onboarding_preferences_complete CHECK (
    (preferences_completed_at IS NULL AND (business_goal IS NULL OR industry IS NULL OR first_product IS NULL OR launch_channel IS NULL))
    OR (preferences_completed_at IS NOT NULL AND business_goal IS NOT NULL AND industry IS NOT NULL AND first_product IS NOT NULL AND launch_channel = 'website')
  );
