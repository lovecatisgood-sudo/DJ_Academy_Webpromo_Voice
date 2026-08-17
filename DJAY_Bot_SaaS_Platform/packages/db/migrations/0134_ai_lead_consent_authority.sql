CREATE OR REPLACE FUNCTION tenancy.enforce_ai_lead_consent_authority()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE
  target_contact_id uuid;
  normalized_email text;
  normalized_phone text;
BEGIN
  IF NEW.action_type IN ('appointment.request', 'follow_up.create', 'merchant_email.send')
    AND NEW.idempotency_key LIKE 'ai:%' THEN
    SELECT conversation.contact_id INTO target_contact_id
    FROM tenancy.conversations conversation
    WHERE conversation.tenant_id = NEW.tenant_id AND conversation.id = NEW.conversation_id
    FOR UPDATE;
    IF NOT EXISTS (
      SELECT 1 FROM tenancy.contacts contact
      WHERE contact.tenant_id = NEW.tenant_id AND contact.id = target_contact_id
        AND contact.consent_status = 'granted'
    ) THEN RAISE EXCEPTION 'ai_follow_up_consent_required'; END IF;
    RETURN NEW;
  END IF;

  IF NEW.action_type <> 'lead.create'
    OR NEW.input_json->>'type' IS DISTINCT FROM 'lead.capture' THEN
    RETURN NEW;
  END IF;

  normalized_email := COALESCE(lower(btrim(NEW.input_json->>'email')), '');
  normalized_phone := COALESCE(regexp_replace(btrim(NEW.input_json->>'phone'), '[^0-9+]', '', 'g'), '');
  IF NULLIF(btrim(NEW.input_json->>'name'), '') IS NULL
    OR (normalized_email = '' AND normalized_phone = '')
    OR (normalized_email <> '' AND normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
    OR (normalized_phone <> '' AND normalized_phone !~ '^\+?[0-9]{7,20}$')
    OR NULLIF(btrim(NEW.input_json->>'need'), '') IS NULL
    OR NEW.input_json->>'consentStatus' IS NULL
    OR NEW.input_json->>'consentStatus' NOT IN ('granted', 'denied') THEN
    RAISE EXCEPTION 'ai_lead_consent_required';
  END IF;

  SELECT conversation.contact_id INTO target_contact_id
  FROM tenancy.conversations conversation
  WHERE conversation.tenant_id = NEW.tenant_id
    AND conversation.id = NEW.conversation_id
  FOR UPDATE;
  IF target_contact_id IS NULL THEN RAISE EXCEPTION 'ai_lead_contact_not_found'; END IF;

  UPDATE tenancy.contacts contact
  SET consent_status = NEW.input_json->>'consentStatus', updated_at = now()
  WHERE contact.tenant_id = NEW.tenant_id AND contact.id = target_contact_id;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS tenancy_ai_lead_consent_authority ON tenancy.action_requests;
CREATE TRIGGER tenancy_ai_lead_consent_authority
BEFORE INSERT ON tenancy.action_requests
FOR EACH ROW EXECUTE FUNCTION tenancy.enforce_ai_lead_consent_authority();

REVOKE ALL ON FUNCTION tenancy.enforce_ai_lead_consent_authority() FROM PUBLIC;
