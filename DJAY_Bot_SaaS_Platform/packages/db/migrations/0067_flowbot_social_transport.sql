CREATE TABLE tenancy.flow_social_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  bot_id uuid NOT NULL,
  deployment_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('line', 'messenger')),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 160),
  external_account_ref text NOT NULL CHECK (char_length(external_account_ref) BETWEEN 3 AND 200),
  credential_ciphertext text NOT NULL CHECK (char_length(credential_ciphertext) BETWEEN 32 AND 16384),
  credential_key_version integer NOT NULL DEFAULT 1 CHECK (credential_key_version > 0),
  webhook_key_hash bytea NOT NULL UNIQUE CHECK (octet_length(webhook_key_hash) = 32),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reauthorization_required', 'revoked')),
  health_status text NOT NULL DEFAULT 'unchecked' CHECK (health_status IN ('unchecked', 'healthy', 'degraded', 'failed')),
  safe_error_code text,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_health_at timestamptz,
  revoked_at timestamptz,
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, id, channel),
  UNIQUE (tenant_id, channel, external_account_ref),
  FOREIGN KEY (tenant_id, bot_id) REFERENCES tenancy.flow_bots(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, deployment_id, bot_id) REFERENCES tenancy.flow_deployments(tenant_id, id, bot_id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, created_by_membership_id) REFERENCES tenancy.memberships(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((status = 'revoked' AND revoked_at IS NOT NULL) OR (status <> 'revoked' AND revoked_at IS NULL))
);

CREATE TABLE tenancy.flow_social_subject_offsets (
  tenant_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
  last_accepted_occurred_at timestamptz,
  last_accepted_external_event_id text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, connection_id, subject_hash),
  FOREIGN KEY (tenant_id, connection_id) REFERENCES tenancy.flow_social_connections(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.flow_social_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('line', 'messenger')),
  external_event_id text NOT NULL CHECK (char_length(external_event_id) BETWEEN 1 AND 500),
  external_message_id text,
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
  event_type text NOT NULL CHECK (event_type IN ('inbound.message', 'delivery.status', 'subject.opt_out')),
  occurred_at timestamptz NOT NULL,
  disposition text NOT NULL CHECK (disposition IN ('accepted', 'out_of_order')),
  normalized_json jsonb NOT NULL CHECK (octet_length(normalized_json::text) <= 65536),
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, connection_id, external_event_id),
  FOREIGN KEY (tenant_id, connection_id, channel) REFERENCES tenancy.flow_social_connections(tenant_id, id, channel) ON DELETE RESTRICT
);
CREATE INDEX tenancy_flow_social_receipts_recent ON tenancy.flow_social_receipts(tenant_id, connection_id, received_at DESC);

CREATE TABLE tenancy.flow_social_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  subject_hash bytea NOT NULL CHECK (octet_length(subject_hash) = 32),
  external_subject_ciphertext text NOT NULL CHECK (char_length(external_subject_ciphertext) BETWEEN 32 AND 16384),
  contact_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'opted_out', 'blocked')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, connection_id, subject_hash),
  FOREIGN KEY (tenant_id, connection_id) REFERENCES tenancy.flow_social_connections(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, contact_id) REFERENCES tenancy.contacts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, conversation_id) REFERENCES tenancy.conversations(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, execution_id) REFERENCES tenancy.flow_executions(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE tenancy.flow_social_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  connection_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  execution_id uuid NOT NULL,
  response_json jsonb NOT NULL CHECK (octet_length(response_json::text) <= 262144),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  delivered_part_count integer NOT NULL DEFAULT 0 CHECK (delivered_part_count >= 0),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  completed_at timestamptz,
  external_message_ids text[] NOT NULL DEFAULT '{}',
  safe_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, receipt_id),
  FOREIGN KEY (tenant_id, connection_id) REFERENCES tenancy.flow_social_connections(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, receipt_id) REFERENCES tenancy.flow_social_receipts(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, execution_id) REFERENCES tenancy.flow_executions(tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX tenancy_flow_social_delivery_due ON tenancy.flow_social_deliveries(status, available_at) WHERE status IN ('pending', 'failed', 'processing');

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'flow_social_connections', 'flow_social_subject_offsets', 'flow_social_receipts',
    'flow_social_subjects', 'flow_social_deliveries'
  ] LOOP
    EXECUTE format('ALTER TABLE tenancy.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE tenancy.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('CREATE POLICY tenant_isolation ON tenancy.%I USING (tenant_id = tenancy.current_tenant_id()) WITH CHECK (tenant_id = tenancy.current_tenant_id())', table_name);
  END LOOP;
END
$$;

CREATE TRIGGER tenancy_flow_social_receipt_immutable BEFORE UPDATE OR DELETE ON tenancy.flow_social_receipts
  FOR EACH ROW EXECUTE FUNCTION tenancy.reject_flow_immutable_change();

CREATE OR REPLACE FUNCTION tenancy.flow_social_runtime_connection(target_webhook_key_hash bytea, target_channel text)
RETURNS TABLE (connection_id uuid, tenant_id uuid, channel text, credential_ciphertext text, credential_key_version integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
  SELECT connection.id, connection.tenant_id, connection.channel,
         connection.credential_ciphertext, connection.credential_key_version
  FROM tenancy.flow_social_connections connection
  JOIN tenancy.flow_deployments deployment ON deployment.tenant_id = connection.tenant_id AND deployment.id = connection.deployment_id
  JOIN tenancy.flow_bots bot ON bot.tenant_id = connection.tenant_id AND bot.id = connection.bot_id
  WHERE octet_length(target_webhook_key_hash) = 32 AND target_channel IN ('line', 'messenger')
    AND connection.webhook_key_hash = target_webhook_key_hash AND connection.channel = target_channel
    AND connection.status = 'active' AND deployment.status = 'active' AND bot.status = 'active'
    AND bot.current_published_version_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM tenancy.entitlement_snapshots snapshot
      JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
        AND subscription.id = snapshot.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
      JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
      JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.plan_key = 'flowbot_premium'
      WHERE snapshot.tenant_id = connection.tenant_id AND snapshot.product_key = 'flowbot'
        AND snapshot.access_mode = 'active' AND snapshot.resolved_json->'entitlements'->>'channel.social' = 'true'
    )
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION tenancy.receive_flow_social_event(
  target_webhook_key_hash bytea, target_channel text, target_receipt_id uuid,
  target_external_event_id text, target_external_message_id text, target_subject_hash bytea,
  target_event_type text, target_occurred_at timestamptz, target_normalized_json jsonb
)
RETURNS TABLE (receipt_id uuid, disposition text, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, tenancy, catalog AS $$
DECLARE resolved record; existing record; offset_row record; selected_disposition text;
BEGIN
  IF octet_length(target_webhook_key_hash) <> 32 OR octet_length(target_subject_hash) <> 32
    OR target_channel NOT IN ('line', 'messenger')
    OR target_event_type NOT IN ('inbound.message', 'delivery.status', 'subject.opt_out')
    OR char_length(target_external_event_id) NOT BETWEEN 1 AND 500
    OR target_occurred_at > now() + interval '5 minutes'
    OR octet_length(target_normalized_json::text) > 65536 THEN RAISE EXCEPTION 'invalid_social_event'; END IF;
  SELECT * INTO resolved FROM tenancy.flow_social_runtime_connection(target_webhook_key_hash, target_channel);
  IF resolved IS NULL THEN RAISE EXCEPTION 'social_connection_not_available'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(resolved.connection_id::text || ':' || target_external_event_id, 0));
  SELECT receipt.id, receipt.disposition INTO existing FROM tenancy.flow_social_receipts receipt
    WHERE receipt.tenant_id = resolved.tenant_id AND receipt.connection_id = resolved.connection_id
      AND receipt.external_event_id = target_external_event_id;
  IF existing IS NOT NULL THEN RETURN QUERY SELECT existing.id, existing.disposition, true; RETURN; END IF;
  INSERT INTO tenancy.flow_social_subject_offsets (tenant_id, connection_id, subject_hash)
    VALUES (resolved.tenant_id, resolved.connection_id, target_subject_hash) ON CONFLICT DO NOTHING;
  SELECT offset_value.last_accepted_occurred_at INTO offset_row
    FROM tenancy.flow_social_subject_offsets offset_value
    WHERE offset_value.tenant_id = resolved.tenant_id AND offset_value.connection_id = resolved.connection_id
      AND offset_value.subject_hash = target_subject_hash FOR UPDATE;
  selected_disposition := CASE WHEN offset_row.last_accepted_occurred_at IS NULL OR target_occurred_at >= offset_row.last_accepted_occurred_at THEN 'accepted' ELSE 'out_of_order' END;
  INSERT INTO tenancy.flow_social_receipts (id, tenant_id, connection_id, channel, external_event_id,
    external_message_id, subject_hash, event_type, occurred_at, disposition, normalized_json)
  VALUES (target_receipt_id, resolved.tenant_id, resolved.connection_id, target_channel,
    target_external_event_id, target_external_message_id, target_subject_hash, target_event_type,
    target_occurred_at, selected_disposition, target_normalized_json);
  IF selected_disposition = 'accepted' THEN
    UPDATE tenancy.flow_social_subject_offsets SET last_accepted_occurred_at = target_occurred_at,
      last_accepted_external_event_id = target_external_event_id, updated_at = now()
    WHERE tenant_id = resolved.tenant_id AND connection_id = resolved.connection_id AND subject_hash = target_subject_hash;
    INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
    VALUES (resolved.tenant_id, 'flowbot.social.inbound.received',
      jsonb_build_object('connectionId', resolved.connection_id, 'receiptId', target_receipt_id, 'channel', target_channel),
      'flow-social:inbound:' || resolved.connection_id::text || ':' || target_external_event_id);
  END IF;
  RETURN QUERY SELECT target_receipt_id, selected_disposition, false;
END
$$;

REVOKE ALL ON tenancy.flow_social_connections, tenancy.flow_social_subject_offsets,
  tenancy.flow_social_receipts, tenancy.flow_social_subjects, tenancy.flow_social_deliveries FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON tenancy.flow_social_connections TO djay_runtime;
GRANT SELECT ON tenancy.flow_social_subject_offsets, tenancy.flow_social_receipts, tenancy.flow_social_subjects, tenancy.flow_social_deliveries TO djay_runtime;
REVOKE ALL ON FUNCTION tenancy.flow_social_runtime_connection(bytea, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION tenancy.receive_flow_social_event(bytea, text, uuid, text, text, bytea, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION tenancy.flow_social_runtime_connection(bytea, text) TO djay_flowbot_runtime;
GRANT EXECUTE ON FUNCTION tenancy.receive_flow_social_event(bytea, text, uuid, text, text, bytea, text, timestamptz, jsonb) TO djay_flowbot_runtime;
