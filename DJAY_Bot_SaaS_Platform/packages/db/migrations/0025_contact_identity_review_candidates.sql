CREATE TABLE tenancy.contact_identity_review_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  source_contact_id uuid NOT NULL,
  source_identity_id uuid NOT NULL,
  candidate_contact_id uuid NOT NULL,
  observed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, source_identity_id, candidate_contact_id),
  FOREIGN KEY (tenant_id, source_contact_id)
    REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, source_identity_id)
    REFERENCES tenancy.contact_identities(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, candidate_contact_id)
    REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  CHECK (source_contact_id <> candidate_contact_id)
);

CREATE INDEX tenancy_contact_identity_reviews_pending
  ON tenancy.contact_identity_review_candidates(tenant_id, observed_at DESC, id DESC);

ALTER TABLE tenancy.contact_identity_review_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.contact_identity_review_candidates FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.contact_identity_review_candidates
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

CREATE OR REPLACE FUNCTION tenancy.capture_contact_identity_review_candidates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  IF NEW.identity_kind NOT IN ('email', 'phone') OR NEW.revoked_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO tenancy.contact_identity_review_candidates (
    tenant_id, source_contact_id, source_identity_id, candidate_contact_id
  )
  SELECT NEW.tenant_id, NEW.contact_id, NEW.id, candidate_identity.contact_id
  FROM tenancy.contact_identities candidate_identity
  JOIN tenancy.contacts source_contact
    ON source_contact.tenant_id = NEW.tenant_id AND source_contact.id = NEW.contact_id
   AND source_contact.status = 'active'
  JOIN tenancy.contacts candidate_contact
    ON candidate_contact.tenant_id = candidate_identity.tenant_id
   AND candidate_contact.id = candidate_identity.contact_id
   AND candidate_contact.status = 'active'
  WHERE candidate_identity.tenant_id = NEW.tenant_id
    AND candidate_identity.identity_kind = NEW.identity_kind
    AND candidate_identity.normalized_value = NEW.normalized_value
    AND candidate_identity.revoked_at IS NULL
    AND candidate_identity.contact_id <> NEW.contact_id
  GROUP BY candidate_identity.contact_id
  ON CONFLICT (tenant_id, source_identity_id, candidate_contact_id) DO NOTHING;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_contact_identity_review_capture
  AFTER INSERT OR UPDATE OF normalized_value, revoked_at ON tenancy.contact_identities
  FOR EACH ROW EXECUTE FUNCTION tenancy.capture_contact_identity_review_candidates();

REVOKE ALL ON tenancy.contact_identity_review_candidates FROM PUBLIC;
GRANT SELECT ON tenancy.contact_identity_review_candidates TO djay_runtime;
REVOKE ALL ON FUNCTION tenancy.capture_contact_identity_review_candidates() FROM PUBLIC;
