CREATE TABLE platform.voice_carrier_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), provider_key text NOT NULL CHECK (provider_key ~ '^[a-z0-9][a-z0-9._-]{1,79}$'),
  environment text NOT NULL CHECK (environment IN ('sandbox','production')), secret_reference text NOT NULL CHECK (char_length(secret_reference) BETWEEN 3 AND 500),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','qualified','active','paused','revoked')),
  supports_inbound boolean NOT NULL DEFAULT false, supports_transfer boolean NOT NULL DEFAULT false, supports_media_stream boolean NOT NULL DEFAULT false,
  qualification_evidence_sha256 bytea CHECK (qualification_evidence_sha256 IS NULL OR octet_length(qualification_evidence_sha256) = 32),
  proposed_by_platform_user_id uuid NOT NULL REFERENCES platform.users(id) ON DELETE RESTRICT,
  reviewed_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT, created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz,
  UNIQUE (provider_key, environment), CHECK ((status = 'proposed') = (reviewed_by_platform_user_id IS NULL)),
  CHECK (reviewed_by_platform_user_id IS NULL OR reviewed_by_platform_user_id <> proposed_by_platform_user_id)
);

CREATE TABLE tenancy.voice_telephony_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  deployment_id uuid NOT NULL, carrier_profile_id uuid NOT NULL REFERENCES platform.voice_carrier_profiles(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160), timezone text NOT NULL DEFAULT 'Asia/Bangkok',
  status text NOT NULL DEFAULT 'pending_number' CHECK (status IN ('pending_number','active','paused','revoked')),
  fallback_mode text NOT NULL DEFAULT 'callback' CHECK (fallback_mode IN ('callback','voicemail','disconnect')),
  created_by_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, deployment_id),
  FOREIGN KEY (tenant_id, deployment_id) REFERENCES tenancy.voice_deployments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.voice_phone_numbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, telephony_profile_id uuid NOT NULL,
  provider_number_ref text NOT NULL CHECK (char_length(provider_number_ref) BETWEEN 3 AND 300),
  display_number_ciphertext text NOT NULL CHECK (char_length(display_number_ciphertext) BETWEEN 20 AND 2000), country_code text NOT NULL CHECK (country_code ~ '^[A-Z]{2}$'),
  capabilities text[] NOT NULL DEFAULT ARRAY['voice']::text[] CHECK (capabilities <@ ARRAY['voice','sms']::text[]),
  monthly_rental_minor bigint CHECK (monthly_rental_minor IS NULL OR monthly_rental_minor >= 0), currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'provisioning' CHECK (status IN ('provisioning','active','suspended','released')),
  activated_at timestamptz, released_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), UNIQUE (provider_number_ref),
  FOREIGN KEY (tenant_id, telephony_profile_id) REFERENCES tenancy.voice_telephony_profiles(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((monthly_rental_minor IS NULL) = (currency IS NULL))
);

CREATE TABLE tenancy.voice_recording_policies (
  tenant_id uuid NOT NULL, deployment_id uuid NOT NULL, version integer NOT NULL CHECK (version > 0),
  recording_mode text NOT NULL DEFAULT 'disabled' CHECK (recording_mode IN ('disabled','consent_required')),
  retention_days integer CHECK (retention_days IS NULL OR retention_days BETWEEN 1 AND 365),
  disclosure_th text, disclosure_en text, legal_approval_reference text,
  created_by_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, deployment_id, version),
  FOREIGN KEY (tenant_id, deployment_id) REFERENCES tenancy.voice_deployments(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((recording_mode = 'disabled' AND retention_days IS NULL AND legal_approval_reference IS NULL)
    OR (recording_mode = 'consent_required' AND retention_days IS NOT NULL AND char_length(disclosure_th) BETWEEN 8 AND 500
      AND char_length(disclosure_en) BETWEEN 8 AND 500 AND char_length(legal_approval_reference) BETWEEN 3 AND 500))
);

CREATE TABLE operations.voice_carrier_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), carrier_profile_id uuid NOT NULL REFERENCES platform.voice_carrier_profiles(id) ON DELETE RESTRICT,
  provider_event_id text NOT NULL CHECK (char_length(provider_event_id) BETWEEN 2 AND 300), event_type text NOT NULL CHECK (char_length(event_type) BETWEEN 2 AND 100),
  payload_sha256 bytea NOT NULL CHECK (octet_length(payload_sha256) = 32), signature_key_version integer NOT NULL CHECK (signature_key_version > 0),
  occurred_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'received' CHECK (status IN ('received','processed','rejected','dead_letter')),
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_]{2,100}$'), UNIQUE (carrier_profile_id, provider_event_id)
);

CREATE TABLE tenancy.voice_call_legs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, telephony_profile_id uuid NOT NULL, session_id uuid,
  provider_call_ref text NOT NULL CHECK (char_length(provider_call_ref) BETWEEN 2 AND 300), direction text NOT NULL CHECK (direction IN ('inbound','transfer_out')),
  caller_hash bytea NOT NULL CHECK (octet_length(caller_hash) = 32), caller_ciphertext text,
  status text NOT NULL DEFAULT 'ringing' CHECK (status IN ('ringing','connected','transferring','completed','failed')),
  started_at timestamptz NOT NULL, connected_at timestamptz, ended_at timestamptz, terminal_reason text,
  UNIQUE (tenant_id, id), UNIQUE (provider_call_ref),
  FOREIGN KEY (tenant_id, telephony_profile_id) REFERENCES tenancy.voice_telephony_profiles(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, session_id) REFERENCES tenancy.voice_sessions(tenant_id, id) ON DELETE RESTRICT,
  CHECK (connected_at IS NULL OR connected_at >= started_at), CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE TABLE tenancy.voice_recording_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, call_leg_id uuid NOT NULL, deployment_id uuid NOT NULL, policy_version integer NOT NULL,
  consent_status text NOT NULL CHECK (consent_status IN ('granted','denied','withdrawn')), evidence_kind text NOT NULL CHECK (evidence_kind IN ('spoken','dtmf','web_control')),
  evidence_sha256 bytea NOT NULL CHECK (octet_length(evidence_sha256) = 32), occurred_at timestamptz NOT NULL,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, call_leg_id, policy_version),
  FOREIGN KEY (tenant_id, call_leg_id) REFERENCES tenancy.voice_call_legs(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, deployment_id, policy_version) REFERENCES tenancy.voice_recording_policies(tenant_id, deployment_id, version) ON DELETE RESTRICT
);

CREATE TABLE tenancy.voice_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, call_leg_id uuid NOT NULL,
  destination_kind text NOT NULL CHECK (destination_kind IN ('human','department')), destination_ciphertext text NOT NULL,
  context_summary text NOT NULL CHECK (char_length(context_summary) BETWEEN 2 AND 2000),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','dialing','connected','failed','timed_out','fallback')),
  provider_transfer_ref text, idempotency_key text NOT NULL, requested_at timestamptz NOT NULL DEFAULT now(), connected_at timestamptz, completed_at timestamptz,
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z0-9_]{2,100}$'),
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, call_leg_id) REFERENCES tenancy.voice_call_legs(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE operations.voice_carrier_cdrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  call_leg_id uuid NOT NULL, provider_cdr_ref text NOT NULL, connected_seconds integer NOT NULL CHECK (connected_seconds >= 0),
  charge_minor bigint NOT NULL CHECK (charge_minor >= 0), currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz NOT NULL, imported_at timestamptz NOT NULL DEFAULT now(), raw_evidence_sha256 bytea NOT NULL CHECK (octet_length(raw_evidence_sha256) = 32),
  reconciliation_status text NOT NULL DEFAULT 'pending' CHECK (reconciliation_status IN ('pending','matched','quantity_mismatch','missing_session','reviewed')),
  UNIQUE (provider_cdr_ref), FOREIGN KEY (tenant_id, call_leg_id) REFERENCES tenancy.voice_call_legs(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.voice_scheduling_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160), provider_kind text NOT NULL CHECK (provider_kind IN ('google_calendar','webhook')),
  config_ciphertext text NOT NULL CHECK (char_length(config_ciphertext) BETWEEN 20 AND 20000), status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','revoked')),
  created_by_membership_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id), FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.voice_scheduling_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL, scheduling_profile_id uuid NOT NULL, appointment_request_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','confirmed','failed','dead_letter','cancelled')),
  idempotency_key text NOT NULL, external_event_ref text, attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 10),
  available_at timestamptz NOT NULL DEFAULT now(), safe_error_code text, created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
  UNIQUE (tenant_id, id), UNIQUE (tenant_id, idempotency_key),
  FOREIGN KEY (tenant_id, scheduling_profile_id) REFERENCES tenancy.voice_scheduling_profiles(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, appointment_request_id) REFERENCES tenancy.appointment_requests(tenant_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION tenancy.reject_voice_evidence_change() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN RAISE EXCEPTION '% is immutable', TG_TABLE_NAME; END $$;
CREATE TRIGGER tenancy_voice_recording_policy_immutable BEFORE UPDATE OR DELETE ON tenancy.voice_recording_policies FOR EACH ROW EXECUTE FUNCTION tenancy.reject_voice_evidence_change();
CREATE TRIGGER tenancy_voice_recording_consent_immutable BEFORE UPDATE OR DELETE ON tenancy.voice_recording_consents FOR EACH ROW EXECUTE FUNCTION tenancy.reject_voice_evidence_change();
CREATE TRIGGER operations_voice_carrier_receipt_immutable BEFORE UPDATE OR DELETE ON operations.voice_carrier_receipts FOR EACH ROW
  WHEN (OLD.status IN ('processed','rejected','dead_letter')) EXECUTE FUNCTION tenancy.reject_voice_evidence_change();

DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['voice_telephony_profiles','voice_phone_numbers','voice_recording_policies','voice_call_legs','voice_recording_consents','voice_transfers','voice_scheduling_profiles','voice_scheduling_jobs']
LOOP EXECUTE format('ALTER TABLE tenancy.%I ENABLE ROW LEVEL SECURITY', table_name); EXECUTE format('ALTER TABLE tenancy.%I FORCE ROW LEVEL SECURITY', table_name);
  EXECUTE format('CREATE POLICY tenant_isolation ON tenancy.%I USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id())', table_name); END LOOP; END $$;
CREATE POLICY platform_voice_telephony_profiles ON tenancy.voice_telephony_profiles TO djay_platform USING (true) WITH CHECK (true);
CREATE POLICY platform_voice_phone_numbers ON tenancy.voice_phone_numbers TO djay_platform USING (true) WITH CHECK (true);

REVOKE ALL ON tenancy.voice_telephony_profiles, tenancy.voice_phone_numbers, tenancy.voice_recording_policies, tenancy.voice_call_legs,
  tenancy.voice_recording_consents, tenancy.voice_transfers, tenancy.voice_scheduling_profiles, tenancy.voice_scheduling_jobs FROM PUBLIC;
GRANT SELECT ON tenancy.voice_telephony_profiles, tenancy.voice_phone_numbers, tenancy.voice_recording_policies, tenancy.voice_call_legs,
  tenancy.voice_recording_consents, tenancy.voice_transfers, tenancy.voice_scheduling_profiles, tenancy.voice_scheduling_jobs TO djay_runtime;
GRANT INSERT, UPDATE ON tenancy.voice_telephony_profiles, tenancy.voice_recording_policies, tenancy.voice_scheduling_profiles TO djay_runtime;
GRANT SELECT, INSERT, UPDATE ON tenancy.voice_telephony_profiles, tenancy.voice_phone_numbers TO djay_platform;
REVOKE ALL ON platform.voice_carrier_profiles, operations.voice_carrier_receipts, operations.voice_carrier_cdrs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON platform.voice_carrier_profiles TO djay_platform;
GRANT SELECT ON operations.voice_carrier_receipts, operations.voice_carrier_cdrs TO djay_platform;
