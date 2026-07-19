CREATE TABLE tenancy.contact_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  tag_key text NOT NULL CHECK (tag_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  color text NOT NULL DEFAULT '#236b4e' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, tag_key),
  FOREIGN KEY (tenant_id, created_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.contact_tag_assignments (
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  tag_id uuid NOT NULL,
  assigned_by_membership_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, contact_id, tag_id),
  FOREIGN KEY (tenant_id, contact_id) REFERENCES tenancy.contacts(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, tag_id) REFERENCES tenancy.contact_tags(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, assigned_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.contact_attributes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  contact_id uuid NOT NULL,
  attribute_key text NOT NULL CHECK (attribute_key ~ '^[a-z][a-z0-9_]{0,63}$'),
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  value_type text NOT NULL CHECK (value_type IN ('text', 'number', 'boolean', 'date')),
  value_text text NOT NULL CHECK (char_length(value_text) BETWEEN 1 AND 2000),
  updated_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, contact_id, attribute_key),
  FOREIGN KEY (tenant_id, contact_id) REFERENCES tenancy.contacts(tenant_id, id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, updated_by_membership_id)
    REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK (value_type <> 'number' OR value_text ~ '^-?[0-9]+(\.[0-9]+)?$'),
  CHECK (value_type <> 'boolean' OR value_text IN ('true', 'false')),
  CHECK (value_type <> 'date' OR value_text ~ '^\d{4}-\d{2}-\d{2}$')
);

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['contact_tags', 'contact_tag_assignments', 'contact_attributes'] LOOP
    EXECUTE format('ALTER TABLE tenancy.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE tenancy.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON tenancy.%I USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id())',
      table_name
    );
  END LOOP;
END
$$;

CREATE POLICY worker_privacy_tag_access ON tenancy.contact_tags TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_privacy_tag_assignment_access ON tenancy.contact_tag_assignments TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());
CREATE POLICY worker_privacy_attribute_access ON tenancy.contact_attributes TO djay_worker
  USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id());

CREATE OR REPLACE FUNCTION tenancy.erase_contact_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, tenancy
AS $$
DECLARE target_job_id uuid;
BEGIN
  IF NEW.status <> 'erased' OR OLD.status = 'erased' THEN RETURN NEW; END IF;
  target_job_id := nullif(current_setting('app.privacy_erasure_job_id', true), '')::uuid;
  IF session_user <> 'djay_worker' OR target_job_id IS NULL THEN
    RAISE EXCEPTION 'contact metadata erasure requires privacy worker context';
  END IF;
  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT OLD.tenant_id, target_job_id, 'contact_attribute', attribute.id::text, 'erased'
    FROM tenancy.contact_attributes attribute
    WHERE attribute.tenant_id = OLD.tenant_id AND attribute.contact_id = OLD.id
    ON CONFLICT DO NOTHING;
  INSERT INTO tenancy.privacy_lineage (tenant_id, privacy_job_id, entity_type, entity_id, disposition)
    SELECT OLD.tenant_id, target_job_id, 'contact_tag_assignment', assignment.tag_id::text, 'erased'
    FROM tenancy.contact_tag_assignments assignment
    WHERE assignment.tenant_id = OLD.tenant_id AND assignment.contact_id = OLD.id
    ON CONFLICT DO NOTHING;
  DELETE FROM tenancy.contact_tag_assignments WHERE tenant_id = OLD.tenant_id AND contact_id = OLD.id;
  DELETE FROM tenancy.contact_attributes WHERE tenant_id = OLD.tenant_id AND contact_id = OLD.id;
  RETURN NEW;
END
$$;

CREATE TRIGGER tenancy_contact_metadata_erasure
BEFORE UPDATE OF status ON tenancy.contacts
FOR EACH ROW EXECUTE FUNCTION tenancy.erase_contact_metadata();

REVOKE ALL ON tenancy.contact_tags, tenancy.contact_tag_assignments, tenancy.contact_attributes FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON tenancy.contact_tags, tenancy.contact_tag_assignments, tenancy.contact_attributes TO djay_runtime;
GRANT SELECT ON tenancy.contact_tags, tenancy.contact_tag_assignments, tenancy.contact_attributes TO djay_worker;
REVOKE ALL ON FUNCTION tenancy.erase_contact_metadata() FROM PUBLIC;
