CREATE TABLE tenancy.knowledge_catalog_item_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  item_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  item_kind text NOT NULL CHECK (item_kind IN ('product', 'service')),
  category_key text CHECK (category_key IS NULL OR category_key ~ '^[a-zA-Z0-9_.-]{1,100}$'),
  localized_name jsonb NOT NULL CHECK (
    jsonb_typeof(localized_name) = 'object'
    AND jsonb_typeof(localized_name->'th') = 'string'
    AND jsonb_typeof(localized_name->'en') = 'string'
    AND char_length(localized_name->>'th') BETWEEN 2 AND 200
    AND char_length(localized_name->>'en') BETWEEN 2 AND 200
  ),
  localized_description jsonb NOT NULL CHECK (
    jsonb_typeof(localized_description) = 'object'
    AND jsonb_typeof(localized_description->'th') = 'string'
    AND jsonb_typeof(localized_description->'en') = 'string'
    AND char_length(localized_description->>'th') BETWEEN 1 AND 10000
    AND char_length(localized_description->>'en') BETWEEN 1 AND 10000
  ),
  price_minor bigint CHECK (price_minor IS NULL OR price_minor >= 0),
  currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  localized_price_text jsonb NOT NULL DEFAULT '{"th":"","en":""}'::jsonb CHECK (
    jsonb_typeof(localized_price_text) = 'object'
    AND jsonb_typeof(localized_price_text->'th') = 'string'
    AND jsonb_typeof(localized_price_text->'en') = 'string'
    AND char_length(localized_price_text->>'th') <= 300
    AND char_length(localized_price_text->>'en') <= 300
  ),
  availability text NOT NULL DEFAULT 'available' CHECK (availability IN ('available', 'unavailable', 'seasonal', 'contact')),
  options jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(options) = 'array' AND octet_length(options::text) <= 32768),
  action_reference jsonb CHECK (action_reference IS NULL OR (
    jsonb_typeof(action_reference) = 'object'
    AND action_reference->>'kind' IN ('booking', 'quotation', 'checkout', 'contact', 'link')
    AND jsonb_typeof(action_reference->'value') = 'string'
    AND char_length(action_reference->>'value') BETWEEN 1 AND 2000
    AND (CASE WHEN action_reference->>'kind' = 'link'
      THEN action_reference->>'value' ~ '^https://[^[:space:]]+$'
      ELSE char_length(action_reference->>'value') <= 300
        AND action_reference->>'value' ~ '^[a-zA-Z0-9_.:@+-]+$' END)
  )),
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(attributes) = 'object' AND octet_length(attributes::text) <= 32768),
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, item_id, id),
  UNIQUE (tenant_id, item_id, version),
  FOREIGN KEY (tenant_id, item_id) REFERENCES tenancy.knowledge_catalog_items(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((price_minor IS NULL) = (currency IS NULL))
);

ALTER TABLE tenancy.knowledge_catalog_items
  ADD COLUMN latest_version_id uuid,
  ADD COLUMN published_version_id uuid,
  ADD COLUMN archived_at timestamptz;

INSERT INTO tenancy.knowledge_catalog_item_versions (
  tenant_id, item_id, version, item_kind, localized_name, localized_description,
  price_minor, currency, attributes, created_by_membership_id, created_at
)
SELECT item.tenant_id, item.id, 1, item.item_kind,
  jsonb_build_object('th', item.name, 'en', item.name),
  jsonb_build_object('th', item.description, 'en', item.description),
  item.price_minor, item.currency, item.attributes, collection.created_by_membership_id, item.created_at
FROM tenancy.knowledge_catalog_items item
JOIN tenancy.knowledge_collections collection
  ON collection.tenant_id = item.tenant_id AND collection.id = item.collection_id;

UPDATE tenancy.knowledge_catalog_items item SET
  latest_version_id = version.id,
  published_version_id = CASE WHEN item.status = 'active' THEN version.id ELSE NULL END,
  archived_at = CASE WHEN item.status = 'archived' THEN item.updated_at ELSE NULL END
FROM tenancy.knowledge_catalog_item_versions version
WHERE version.tenant_id = item.tenant_id AND version.item_id = item.id AND version.version = 1;

ALTER TABLE tenancy.knowledge_catalog_items
  ALTER COLUMN latest_version_id SET NOT NULL,
  ADD CONSTRAINT knowledge_catalog_latest_version_fk FOREIGN KEY (tenant_id, id, latest_version_id)
    REFERENCES tenancy.knowledge_catalog_item_versions(tenant_id, item_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT knowledge_catalog_published_version_fk FOREIGN KEY (tenant_id, id, published_version_id)
    REFERENCES tenancy.knowledge_catalog_item_versions(tenant_id, item_id, id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE tenancy.knowledge_catalog_agent_bindings (
  tenant_id uuid NOT NULL,
  collection_id uuid NOT NULL,
  agent_id uuid NOT NULL,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, collection_id, agent_id),
  FOREIGN KEY (tenant_id, collection_id) REFERENCES tenancy.knowledge_collections(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, agent_id) REFERENCES tenancy.ai_agents(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT
);

CREATE OR REPLACE FUNCTION tenancy.protect_knowledge_catalog_item_version()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, tenancy AS $$
BEGIN
  RAISE EXCEPTION 'knowledge catalogue item versions are immutable';
END
$$;
CREATE TRIGGER knowledge_catalog_item_version_immutable
BEFORE UPDATE OR DELETE ON tenancy.knowledge_catalog_item_versions
FOR EACH ROW EXECUTE FUNCTION tenancy.protect_knowledge_catalog_item_version();

ALTER TABLE tenancy.knowledge_catalog_item_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.knowledge_catalog_item_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.knowledge_catalog_item_versions
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());
ALTER TABLE tenancy.knowledge_catalog_agent_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.knowledge_catalog_agent_bindings FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON tenancy.knowledge_catalog_agent_bindings
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON tenancy.knowledge_catalog_item_versions, tenancy.knowledge_catalog_agent_bindings FROM PUBLIC;
GRANT SELECT, INSERT ON tenancy.knowledge_catalog_item_versions TO djay_runtime;
GRANT SELECT, INSERT, DELETE ON tenancy.knowledge_catalog_agent_bindings TO djay_runtime;
