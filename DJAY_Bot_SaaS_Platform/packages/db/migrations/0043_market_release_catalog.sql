CREATE TABLE catalog.catalog_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version_key text NOT NULL UNIQUE,
  status text NOT NULL CHECK (status IN ('draft', 'approved', 'active', 'retired')),
  currency text NOT NULL CHECK (currency = 'THB'),
  content_sha256 bytea NOT NULL CHECK (octet_length(content_sha256) = 32),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  created_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  approved_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  approved_at timestamptz,
  activated_at timestamptz,
  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_to IS NULL OR effective_to > effective_from),
  CHECK ((status IN ('approved', 'active', 'retired') AND approved_at IS NOT NULL)
    OR status = 'draft'),
  CHECK ((status IN ('active', 'retired') AND activated_at IS NOT NULL)
    OR status IN ('draft', 'approved')),
  CHECK ((status = 'retired' AND retired_at IS NOT NULL) OR status <> 'retired')
);

CREATE UNIQUE INDEX catalog_one_active_catalog_version
  ON catalog.catalog_versions((status)) WHERE status = 'active';

CREATE TABLE catalog.promotions (
  catalog_version_id uuid NOT NULL REFERENCES catalog.catalog_versions(id) ON DELETE RESTRICT,
  promotion_key text NOT NULL,
  public_name text NOT NULL,
  eligibility text NOT NULL CHECK (eligibility = 'new_annual_subscription'),
  application_method text NOT NULL CHECK (application_method = 'server_side'),
  term_count smallint NOT NULL CHECK (term_count = 1),
  effective_from timestamptz NOT NULL,
  effective_to timestamptz,
  PRIMARY KEY (catalog_version_id, promotion_key),
  CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE TABLE catalog.plan_commercial_terms (
  catalog_version_id uuid NOT NULL REFERENCES catalog.catalog_versions(id) ON DELETE RESTRICT,
  plan_version_id uuid NOT NULL REFERENCES catalog.plan_versions(id) ON DELETE RESTRICT,
  promotion_key text NOT NULL,
  first_term_amount_minor bigint NOT NULL CHECK (first_term_amount_minor >= 0),
  renewal_amount_minor bigint NOT NULL CHECK (renewal_amount_minor >= first_term_amount_minor),
  first_term_discount_minor bigint NOT NULL CHECK (first_term_discount_minor >= 0),
  billing_interval text NOT NULL CHECK (billing_interval = 'year'),
  billing_interval_count smallint NOT NULL CHECK (billing_interval_count = 1),
  allowance_period_timezone text NOT NULL CHECK (allowance_period_timezone = 'Asia/Bangkok'),
  allowance_period_interval text NOT NULL CHECK (allowance_period_interval = 'month'),
  allowance_rollover boolean NOT NULL DEFAULT false CHECK (allowance_rollover = false),
  sellable boolean NOT NULL DEFAULT false,
  PRIMARY KEY (catalog_version_id, plan_version_id),
  FOREIGN KEY (catalog_version_id, promotion_key)
    REFERENCES catalog.promotions(catalog_version_id, promotion_key) ON DELETE RESTRICT,
  CHECK (renewal_amount_minor - first_term_discount_minor = first_term_amount_minor)
);

CREATE TABLE catalog.add_on_versions (
  catalog_version_id uuid NOT NULL REFERENCES catalog.catalog_versions(id) ON DELETE RESTRICT,
  add_on_key text NOT NULL,
  public_name text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  billing_interval text NOT NULL CHECK (billing_interval = 'month'),
  billing_unit text NOT NULL,
  price_qualifier text NOT NULL DEFAULT 'exact' CHECK (price_qualifier IN ('exact', 'from')),
  sellable boolean NOT NULL DEFAULT false,
  PRIMARY KEY (catalog_version_id, add_on_key)
);

CREATE TABLE catalog.usage_pack_versions (
  catalog_version_id uuid NOT NULL REFERENCES catalog.catalog_versions(id) ON DELETE RESTRICT,
  pack_key text NOT NULL,
  plan_id uuid NOT NULL REFERENCES catalog.plans(id) ON DELETE RESTRICT,
  customer_unit text NOT NULL CHECK (customer_unit = 'ai_response'),
  quantity bigint NOT NULL CHECK (quantity > 0),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  consumption_policy text NOT NULL DEFAULT 'decision_pending'
    CHECK (consumption_policy IN ('decision_pending', 'oldest_expiring_first')),
  expiry_policy text NOT NULL DEFAULT 'decision_pending'
    CHECK (expiry_policy IN ('decision_pending', 'contract_term_end', 'fixed_duration')),
  sellable boolean NOT NULL DEFAULT false,
  PRIMARY KEY (catalog_version_id, pack_key)
);

CREATE TABLE catalog.professional_service_versions (
  catalog_version_id uuid NOT NULL REFERENCES catalog.catalog_versions(id) ON DELETE RESTRICT,
  service_key text NOT NULL,
  public_name text NOT NULL,
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  price_qualifier text NOT NULL CHECK (price_qualifier = 'from'),
  sellable boolean NOT NULL DEFAULT false,
  PRIMARY KEY (catalog_version_id, service_key)
);

CREATE TABLE catalog.provider_price_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_version_id uuid NOT NULL REFERENCES catalog.catalog_versions(id) ON DELETE RESTRICT,
  item_kind text NOT NULL CHECK (item_kind IN ('plan', 'add_on', 'pack')),
  item_key text NOT NULL,
  provider_key text NOT NULL CHECK (provider_key = 'stripe'),
  provider_mode text NOT NULL CHECK (provider_mode IN ('test', 'live')),
  external_product_ref text NOT NULL,
  external_price_ref text NOT NULL,
  external_coupon_ref text,
  verified_amount_minor bigint NOT NULL CHECK (verified_amount_minor >= 0),
  verified_currency text NOT NULL CHECK (verified_currency = 'THB'),
  status text NOT NULL CHECK (status IN ('pending_verification', 'ready', 'disabled')),
  verified_at timestamptz,
  verified_by_platform_user_id uuid REFERENCES platform.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (catalog_version_id, item_kind, item_key, provider_key, provider_mode),
  CHECK ((status = 'ready' AND verified_at IS NOT NULL
    AND verified_by_platform_user_id IS NOT NULL) OR status <> 'ready')
);

CREATE TABLE tenancy.subscription_contract_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenancy.tenants(id) ON DELETE RESTRICT,
  subscription_id uuid NOT NULL REFERENCES tenancy.product_subscriptions(id) ON DELETE RESTRICT,
  catalog_version_id uuid NOT NULL REFERENCES catalog.catalog_versions(id) ON DELETE RESTRICT,
  plan_version_id uuid NOT NULL REFERENCES catalog.plan_versions(id) ON DELETE RESTRICT,
  contract_json jsonb NOT NULL,
  contract_sha256 bytea NOT NULL CHECK (octet_length(contract_sha256) = 32),
  accepted_by_user_id uuid REFERENCES identity.users(id) ON DELETE RESTRICT,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, subscription_id),
  UNIQUE (tenant_id, id)
);

CREATE OR REPLACE FUNCTION catalog.protect_locked_catalog_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, catalog
AS $$
DECLARE
  parent_id uuid;
  parent_status text;
BEGIN
  parent_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.catalog_version_id ELSE NEW.catalog_version_id END;
  SELECT status INTO parent_status FROM catalog.catalog_versions WHERE id = parent_id;
  IF parent_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'locked catalog content is immutable';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END
$$;

CREATE TRIGGER catalog_promotions_locked
BEFORE INSERT OR UPDATE OR DELETE ON catalog.promotions
FOR EACH ROW EXECUTE FUNCTION catalog.protect_locked_catalog_content();
CREATE TRIGGER catalog_plan_terms_locked
BEFORE INSERT OR UPDATE OR DELETE ON catalog.plan_commercial_terms
FOR EACH ROW EXECUTE FUNCTION catalog.protect_locked_catalog_content();
CREATE TRIGGER catalog_add_ons_locked
BEFORE INSERT OR UPDATE OR DELETE ON catalog.add_on_versions
FOR EACH ROW EXECUTE FUNCTION catalog.protect_locked_catalog_content();
CREATE TRIGGER catalog_packs_locked
BEFORE INSERT OR UPDATE OR DELETE ON catalog.usage_pack_versions
FOR EACH ROW EXECUTE FUNCTION catalog.protect_locked_catalog_content();
CREATE TRIGGER catalog_services_locked
BEFORE INSERT OR UPDATE OR DELETE ON catalog.professional_service_versions
FOR EACH ROW EXECUTE FUNCTION catalog.protect_locked_catalog_content();

CREATE OR REPLACE FUNCTION tenancy.reject_contract_snapshot_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, tenancy
AS $$
BEGIN
  RAISE EXCEPTION 'subscription contract snapshots are immutable';
END
$$;

CREATE TRIGGER tenancy_subscription_contract_immutable
BEFORE UPDATE OR DELETE ON tenancy.subscription_contract_snapshots
FOR EACH ROW EXECUTE FUNCTION tenancy.reject_contract_snapshot_change();

CREATE OR REPLACE FUNCTION catalog.catalog_content_sha256(target_catalog_version_id uuid)
RETURNS bytea
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, catalog
AS $$
  SELECT public.digest(convert_to(jsonb_build_object(
    'promotions', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.promotion_key)
      FROM catalog.promotions item WHERE item.catalog_version_id = target_catalog_version_id), '[]'::jsonb),
    'plans', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.plan_version_id)
      FROM catalog.plan_commercial_terms item WHERE item.catalog_version_id = target_catalog_version_id), '[]'::jsonb),
    'addOns', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.add_on_key)
      FROM catalog.add_on_versions item WHERE item.catalog_version_id = target_catalog_version_id), '[]'::jsonb),
    'packs', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.pack_key)
      FROM catalog.usage_pack_versions item WHERE item.catalog_version_id = target_catalog_version_id), '[]'::jsonb),
    'services', COALESCE((SELECT jsonb_agg(to_jsonb(item) ORDER BY item.service_key)
      FROM catalog.professional_service_versions item WHERE item.catalog_version_id = target_catalog_version_id), '[]'::jsonb)
  )::text, 'UTF8'), 'sha256')
$$;

CREATE OR REPLACE FUNCTION catalog.approve_catalog_version(
  target_catalog_version_id uuid,
  expected_content_sha256 bytea,
  approved_at_value timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, catalog
AS $$
DECLARE
  actor_role text;
  actor_id uuid;
  actual_content_sha256 bytea;
  target_status text;
BEGIN
  IF session_user <> 'djay_platform' THEN RAISE EXCEPTION 'platform_role_required'; END IF;
  actor_role := NULLIF(current_setting('app.platform_role', true), '');
  actor_id := NULLIF(current_setting('app.platform_user_id', true), '')::uuid;
  IF actor_role <> 'platform_owner' OR actor_id IS NULL THEN RAISE EXCEPTION 'platform_owner_required'; END IF;
  SELECT status INTO target_status FROM catalog.catalog_versions
    WHERE id = target_catalog_version_id FOR UPDATE;
  IF target_status <> 'draft' THEN RAISE EXCEPTION 'catalog_must_be_draft'; END IF;
  IF NOT EXISTS (SELECT 1 FROM catalog.plan_commercial_terms
    WHERE catalog_version_id = target_catalog_version_id
    GROUP BY catalog_version_id HAVING count(*) = 6) THEN
    RAISE EXCEPTION 'catalog_requires_six_plan_terms';
  END IF;
  actual_content_sha256 := catalog.catalog_content_sha256(target_catalog_version_id);
  IF actual_content_sha256 <> expected_content_sha256 THEN RAISE EXCEPTION 'catalog_checksum_mismatch'; END IF;
  UPDATE catalog.catalog_versions SET status = 'approved', content_sha256 = actual_content_sha256,
    approved_by_platform_user_id = actor_id, approved_at = approved_at_value
    WHERE id = target_catalog_version_id;
END
$$;

CREATE OR REPLACE FUNCTION catalog.activate_catalog_version(
  target_catalog_version_id uuid,
  expected_content_sha256 bytea,
  activated_at_value timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, catalog
AS $$
DECLARE
  actor_role text;
  target catalog.catalog_versions%ROWTYPE;
BEGIN
  IF session_user <> 'djay_platform' THEN RAISE EXCEPTION 'platform_role_required'; END IF;
  actor_role := NULLIF(current_setting('app.platform_role', true), '');
  IF actor_role <> 'platform_owner' THEN RAISE EXCEPTION 'platform_owner_required'; END IF;

  SELECT * INTO target FROM catalog.catalog_versions
  WHERE id = target_catalog_version_id FOR UPDATE;
  IF target.status <> 'approved' THEN RAISE EXCEPTION 'catalog_must_be_approved'; END IF;
  IF target.content_sha256 <> expected_content_sha256 THEN RAISE EXCEPTION 'catalog_checksum_mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM catalog.plan_commercial_terms
    WHERE catalog_version_id = target.id GROUP BY catalog_version_id HAVING count(*) = 6) THEN
    RAISE EXCEPTION 'catalog_requires_six_plan_terms';
  END IF;

  UPDATE catalog.catalog_versions SET status = 'retired', effective_to = activated_at_value,
    retired_at = activated_at_value WHERE status = 'active';
  UPDATE catalog.catalog_versions SET status = 'active', effective_from = activated_at_value,
    activated_at = activated_at_value WHERE id = target.id;
END
$$;

INSERT INTO catalog.catalog_versions (
  id, version_key, status, currency, content_sha256, effective_from
) VALUES (
  '63000000-0000-4000-8000-000000000001', 'djay-bots-th-2026-01', 'draft', 'THB',
  digest(convert_to('djay-bots-th-2026-01:commercial-contract-v1', 'UTF8'), 'sha256'),
  '2026-07-18T00:00:00Z'
);

INSERT INTO catalog.promotions (
  catalog_version_id, promotion_key, public_name, eligibility,
  application_method, term_count, effective_from
) VALUES (
  '63000000-0000-4000-8000-000000000001', 'first-year-launch-2026-01',
  '50% Off Your First Year', 'new_annual_subscription', 'server_side', 1,
  '2026-07-18T00:00:00Z'
);

INSERT INTO catalog.plan_versions (
  id, plan_id, version, status, currency, recurring_amount_minor, billing_interval,
  sellable, entitlements, allowances, overage_rates_minor, limits, public_copy,
  effective_from, published_at
)
SELECT seed.id::uuid, plan.id, 2, 'published', 'THB', seed.renewal_amount_minor, 'year', false,
  seed.entitlements::jsonb, seed.allowances::jsonb, seed.overages::jsonb,
  seed.limits::jsonb, seed.public_copy::jsonb, '2026-07-18T00:00:00Z', '2026-07-18T00:00:00Z'
FROM (VALUES
  ('62000000-0000-4000-8000-000000000101','flowbot_basic',499900,
   '{"channel.web":true,"channel.social":false,"ai.enabled":false,"flow.nodes.core":true,"flow.nodes.advanced":false,"flow.forms":true,"flow.versioning":true,"flow.lead_capture":true,"flow.email_notification":true,"flow.team_routing":"limited","flow.webhook":false,"branding.remove":false,"analytics.level":"basic","support.level":"standard"}',
   '{"flow_execution":50000}','{"flow_execution":null}','{"active_bots":1,"workspaces":1,"topics":150,"seats":1,"social_channels":0}',
   '{"summary":"Structured website automation for common questions, lead capture, and guided customer actions.","highlights":["Website chat widget","50,000 monthly conversations","150 conversation topics","Lead capture and handover"]}'),
  ('62000000-0000-4000-8000-000000000102','flowbot_premium',890000,
   '{"channel.web":true,"channel.social":true,"ai.enabled":false,"flow.nodes.core":true,"flow.nodes.advanced":true,"flow.forms":true,"flow.versioning":true,"flow.lead_capture":true,"flow.email_notification":true,"flow.variables":true,"flow.delays":true,"flow.subflows":true,"flow.business_hours":true,"flow.team_routing":true,"flow.webhook":"approved","integration.google_sheets":true,"integration.external_api":"basic","branding.remove":true,"analytics.level":"advanced","support.level":"priority"}',
   '{"flow_execution":100000}','{"flow_execution":null}','{"active_bots":3,"workspaces":1,"topics":500,"seats":3,"social_channels":1}',
   '{"summary":"Multi-channel structured automation with advanced logic, routing, integrations, and analytics.","highlights":["Up to 3 Flow Bots","100,000 monthly conversations","Website plus one social channel","Advanced logic and integrations"]}'),
  ('62000000-0000-4000-8000-000000000103','ai_chat_basic',1190000,
   '{"ai.enabled":true,"sales_core.enabled":true,"knowledge.enabled":true,"lead_capture.enabled":true,"appointment_request.enabled":true,"sales_email_action.enabled":true,"human_handover.enabled":true,"ai.text":true,"channel.web":true,"channel.line":false,"channel.whatsapp":false,"channel.messenger":false,"languages.th":true,"languages.en":true,"routing.level":"core","analytics.level":"basic","branding.remove":false,"support.level":"standard"}',
   '{"ai_response":2000}','{"ai_response":35}','{"active_bots":1,"workspaces":1,"knowledge_collections":1,"seats":1,"social_channels":0}',
   '{"summary":"A Thai and English website AI sales assistant grounded in approved business knowledge.","highlights":["2,000 AI replies monthly","Thai and English","Website and document knowledge","Lead capture and handover"]}'),
  ('62000000-0000-4000-8000-000000000104','ai_chat_premium',2490000,
   '{"ai.enabled":true,"sales_core.enabled":true,"knowledge.enabled":true,"lead_capture.enabled":true,"appointment_request.enabled":true,"sales_email_action.enabled":true,"human_handover.enabled":true,"ai.text":true,"channel.web":true,"channel.line":true,"channel.whatsapp":true,"channel.messenger":true,"languages.th":true,"languages.en":true,"languages.additional":true,"routing.level":"advanced","analytics.level":"advanced","branding.remove":true,"integration.google_sheets":true,"integration.webhook":true,"integration.crm":"basic","support.level":"priority"}',
   '{"ai_response":10000}','{"ai_response":25}','{"active_bots":3,"workspaces":1,"knowledge_collections":null,"seats":5,"social_channels":1}',
   '{"summary":"Multi-channel AI sales conversations with advanced qualification, routing, integrations, and analytics.","highlights":["Up to 3 AI Text Bots","10,000 AI replies monthly","Website plus one social channel","Advanced sales intelligence"]}'),
  ('62000000-0000-4000-8000-000000000105','voice_basic_gen1',2990000,
   '{"ai.enabled":true,"sales_core.enabled":true,"knowledge.enabled":true,"lead_capture.enabled":true,"appointment_request.enabled":true,"sales_email_action.enabled":true,"human_handover.enabled":true,"voice.enabled":true,"voice.capability_profile":"voice_gen1","voice.public_label":"AI Voice Agent","channel.web":true,"telephone.inbound":"optional","languages.th":true,"languages.en":true,"analytics.level":"basic","support.level":"standard"}',
   '{"voice_minute":150}','{"voice_minute":600}','{"active_bots":1,"workspaces":1,"knowledge_collections":1,"concurrent_calls":1,"seats":1}',
   '{"summary":"A Thai and English web voice agent for enquiries, lead qualification, and callback requests.","highlights":["150 connected minutes monthly","Thai and English","Web voice widget","Transcripts and summaries"]}'),
  ('62000000-0000-4000-8000-000000000106','voice_advanced_gen2',5990000,
   '{"ai.enabled":true,"sales_core.enabled":true,"knowledge.enabled":true,"lead_capture.enabled":true,"appointment_request.enabled":true,"sales_email_action.enabled":true,"human_handover.enabled":true,"voice.enabled":true,"voice.capability_profile":"voice_gen2","voice.public_label":"AI Voice Agent","voice.advanced_quality":true,"voice.gen1_fallback":false,"channel.web":true,"telephone.inbound":true,"languages.th":true,"languages.en":true,"languages.additional":true,"integration.google_sheets":true,"integration.webhook":true,"integration.crm":"basic","analytics.level":"advanced","branding.remove":true,"support.level":"priority"}',
   '{"voice_minute":500}','{"voice_minute":500}','{"active_bots":3,"workspaces":1,"knowledge_collections":null,"concurrent_calls":2,"seats":5}',
   '{"summary":"Multi-agent web and telephone voice automation with routing, transfers, integrations, and analytics.","highlights":["Up to 3 AI Voice Agents","500 connected minutes monthly","Inbound telephone integration","Routing, transfer, and advanced analytics"]}')
) AS seed(id, plan_key, renewal_amount_minor, entitlements, allowances, overages, limits, public_copy)
JOIN catalog.plans plan ON plan.plan_key = seed.plan_key;

UPDATE catalog.plans SET
  public_name = CASE plan_key
    WHEN 'flowbot_basic' THEN 'Flow Bot Starter' WHEN 'flowbot_premium' THEN 'Flow Bot Advanced'
    WHEN 'ai_chat_basic' THEN 'AI Text Bot Starter' WHEN 'ai_chat_premium' THEN 'AI Text Bot Advanced'
    WHEN 'voice_basic_gen1' THEN 'AI Voice Bot Starter' WHEN 'voice_advanced_gen2' THEN 'AI Voice Bot Advanced' END,
  tier_name = CASE WHEN tier_rank = 1 THEN 'Starter' ELSE 'Advanced' END;

INSERT INTO catalog.plan_commercial_terms (
  catalog_version_id, plan_version_id, promotion_key, first_term_amount_minor,
  renewal_amount_minor, first_term_discount_minor, billing_interval,
  billing_interval_count, allowance_period_timezone, allowance_period_interval,
  allowance_rollover, sellable
)
SELECT '63000000-0000-4000-8000-000000000001', version.id, 'first-year-launch-2026-01',
  terms.first_amount, terms.renewal_amount, terms.discount_amount, 'year', 1,
  'Asia/Bangkok', 'month', false, false
FROM (VALUES
  ('flowbot_basic',249900,499900,250000), ('flowbot_premium',445000,890000,445000),
  ('ai_chat_basic',595000,1190000,595000), ('ai_chat_premium',1245000,2490000,1245000),
  ('voice_basic_gen1',1495000,2990000,1495000), ('voice_advanced_gen2',2995000,5990000,2995000)
) AS terms(plan_key, first_amount, renewal_amount, discount_amount)
JOIN catalog.plans plan ON plan.plan_key = terms.plan_key
JOIN catalog.plan_versions version ON version.plan_id = plan.id AND version.version = 2;

INSERT INTO catalog.add_on_versions (
  catalog_version_id, add_on_key, public_name, amount_minor, billing_interval,
  billing_unit, price_qualifier, sellable
) VALUES
  ('63000000-0000-4000-8000-000000000001','additional_social_channel','Additional Social Channel',29900,'month','channel','exact',false),
  ('63000000-0000-4000-8000-000000000001','additional_administrator','Additional Administrator',9900,'month','administrator','exact',false),
  ('63000000-0000-4000-8000-000000000001','additional_workspace','Additional Business Workspace',29900,'month','workspace','from',false),
  ('63000000-0000-4000-8000-000000000001','starter_branding_removal','Remove DJay Bots Branding',19900,'month','workspace','exact',false);

INSERT INTO catalog.usage_pack_versions (
  catalog_version_id, pack_key, plan_id, customer_unit, quantity, amount_minor, sellable
)
SELECT '63000000-0000-4000-8000-000000000001', seed.pack_key, plan.id,
  'ai_response', seed.quantity, seed.amount_minor, false
FROM (VALUES ('ai_starter_1000','ai_chat_basic',1000,29900),
             ('ai_advanced_5000','ai_chat_premium',5000,99900))
  AS seed(pack_key, plan_key, quantity, amount_minor)
JOIN catalog.plans plan ON plan.plan_key = seed.plan_key;

INSERT INTO catalog.professional_service_versions (
  catalog_version_id, service_key, public_name, amount_minor, price_qualifier, sellable
) VALUES
  ('63000000-0000-4000-8000-000000000001','flow_starter_setup','Starter Flow Setup',390000,'from',false),
  ('63000000-0000-4000-8000-000000000001','flow_advanced_design','Advanced Flow Design',790000,'from',false),
  ('63000000-0000-4000-8000-000000000001','flow_complex_automation','Complex Flow Automation',1990000,'from',false),
  ('63000000-0000-4000-8000-000000000001','ai_knowledge_setup','Knowledge-Base Setup',490000,'from',false),
  ('63000000-0000-4000-8000-000000000001','ai_sales_configuration','AI Sales Configuration',490000,'from',false),
  ('63000000-0000-4000-8000-000000000001','ai_advanced_sales_system','Advanced AI Sales System',990000,'from',false),
  ('63000000-0000-4000-8000-000000000001','voice_agent_setup','Voice Agent Setup',990000,'from',false),
  ('63000000-0000-4000-8000-000000000001','telephone_integration','Telephone Integration',490000,'from',false),
  ('63000000-0000-4000-8000-000000000001','voice_custom_automation','Custom Voice Automation',1990000,'from',false);

UPDATE catalog.catalog_versions SET status = 'active',
  content_sha256 = catalog.catalog_content_sha256(id),
  approved_at = '2026-07-18T00:00:00Z', activated_at = '2026-07-18T00:00:00Z'
WHERE id = '63000000-0000-4000-8000-000000000001';

ALTER TABLE tenancy.subscription_contract_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenancy.subscription_contract_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_contract_tenant_isolation ON tenancy.subscription_contract_snapshots
  USING (tenant_id = tenancy.current_tenant_id())
  WITH CHECK (tenant_id = tenancy.current_tenant_id());

REVOKE ALL ON catalog.catalog_versions, catalog.promotions, catalog.plan_commercial_terms,
  catalog.add_on_versions, catalog.usage_pack_versions, catalog.professional_service_versions,
  catalog.provider_price_mappings, tenancy.subscription_contract_snapshots FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog.protect_locked_catalog_content() FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog.catalog_content_sha256(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog.approve_catalog_version(uuid, bytea, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION catalog.activate_catalog_version(uuid, bytea, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.reject_contract_snapshot_change() FROM PUBLIC;

GRANT SELECT ON catalog.catalog_versions, catalog.promotions, catalog.plan_commercial_terms,
  catalog.add_on_versions, catalog.usage_pack_versions, catalog.professional_service_versions,
  catalog.provider_price_mappings TO djay_auth_runtime, djay_runtime, djay_platform,
  djay_worker, djay_readonly_ops;
GRANT INSERT, DELETE ON catalog.catalog_versions TO djay_platform;
GRANT INSERT, UPDATE, DELETE ON catalog.promotions,
  catalog.plan_commercial_terms, catalog.add_on_versions, catalog.usage_pack_versions,
  catalog.professional_service_versions TO djay_platform;
GRANT SELECT, INSERT, UPDATE ON catalog.provider_price_mappings TO djay_platform;
GRANT EXECUTE ON FUNCTION catalog.catalog_content_sha256(uuid) TO djay_platform;
GRANT EXECUTE ON FUNCTION catalog.approve_catalog_version(uuid, bytea, timestamptz) TO djay_platform;
GRANT EXECUTE ON FUNCTION catalog.activate_catalog_version(uuid, bytea, timestamptz) TO djay_platform;
GRANT SELECT, INSERT ON tenancy.subscription_contract_snapshots TO djay_runtime;
GRANT SELECT ON tenancy.subscription_contract_snapshots TO djay_platform, djay_readonly_ops;
